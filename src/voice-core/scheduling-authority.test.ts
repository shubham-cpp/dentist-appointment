import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext, type VoiceCallResult } from "@/lib/voice-call-context";
import {
  VoiceSchedulingError,
  createVoiceSchedulingAuthority,
  voiceSchedulingToolBodySchemas,
} from "./scheduling-authority";

test("accepts only bounded staff follow-up reason codes", async () => {
  const acceptedReasons = [
    "identity_problem",
    "clinical_question",
    "no_suitable_slot",
    "tool_failure",
    "caller_request",
  ] as const;

  for (const reason of acceptedReasons) {
    assert.equal(voiceSchedulingToolBodySchemas.request_staff_follow_up.safeParse({
      operationId: `follow-up-${reason}`,
      reason,
    }).success, true);
  }
  assert.equal(voiceSchedulingToolBodySchemas.request_staff_follow_up.safeParse({
    operationId: "follow-up-arbitrary",
    reason: "The scheduling service exposed arbitrary model text.",
  }).success, false);

  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  const result = await authority.execute({
    name: "request_staff_follow_up",
    operationId: "follow-up-bounded-result",
    reason: "tool_failure",
  });
  assert.deepEqual(result, { reason: "tool_failure", type: "staff_follow_up_recorded" });
});

test("records a confirmed callback once without changing the appointment", async () => {
  const context = createVoiceCallContext(new Date("2026-09-05T12:00:00Z"));
  const recorded: unknown[] = [];
  const applied: VoiceCallResult[] = [];
  const authority = createVoiceSchedulingAuthority({
    applyResult: (result) => { applied.push(result); },
    context,
    now: () => new Date("2026-09-05T12:00:00Z"),
    recordStaffFollowUp: (result) => { recorded.push(result); },
  });
  // A busy caller can request another time without disclosing appointment facts.
  const command = {
    callback: { confirmed: true, date: "2026-09-06", time: "15:00", timeZone: context.clinicTimeZone },
    name: "request_staff_follow_up" as const,
    operationId: "callback-confirmed",
    reason: "caller_request" as const,
  };
  const result = await authority.execute(command);
  assert.deepEqual(await authority.execute(command), result);
  await assert.rejects(authority.execute({ ...command, callback: { ...command.callback, time: "16:00" } }),
    (error: unknown) => error instanceof VoiceSchedulingError && error.code === "operation_conflict");
  assert.deepEqual(recorded, [{ callback: command.callback, reason: "caller_request", type: "staff_follow_up_recorded" }]);
  assert.equal(authority.outcome(), "staff_follow_up");
  assert.deepEqual(applied, []);
});

test("rejects unconfirmed, past, invalid, or misclassified callback requests", async () => {
  const context = createVoiceCallContext(new Date("2026-09-05T12:00:00Z"));
  const callback = { confirmed: true, date: "2026-09-06", time: "15:00", timeZone: context.clinicTimeZone };
  for (const invalid of [
    { callback: { ...callback, confirmed: false }, reason: "caller_request" as const, code: "confirmation_required" },
    { callback: { ...callback, date: "2026-09-04" }, reason: "caller_request" as const, code: "invalid_request" },
    { callback: { ...callback, date: "2026-09-05", time: "08:00" }, reason: "caller_request" as const, code: "invalid_request" },
    { callback: { ...callback, date: "2026-02-30" }, reason: "caller_request" as const, code: "invalid_request" },
    { callback, reason: "tool_failure" as const, code: "invalid_request" },
  ]) {
    const authority = createVoiceSchedulingAuthority({ context, now: () => new Date("2026-09-05T12:00:00Z") });
    await assert.rejects(authority.execute({
      callback: invalid.callback,
      name: "request_staff_follow_up",
      operationId: "invalid-callback",
      reason: invalid.reason,
    }), (error: unknown) => error instanceof VoiceSchedulingError && error.code === invalid.code);
    assert.equal(authority.outcome(), "pending");
  }
});

test("does not report a callback as recorded if storage fails", async () => {
  const context = createVoiceCallContext(new Date("2026-09-05T12:00:00Z"));
  const authority = createVoiceSchedulingAuthority({
    context,
    now: () => new Date("2026-09-05T12:00:00Z"),
    recordStaffFollowUp() { throw new Error("Callback storage unavailable"); },
  });
  await assert.rejects(authority.execute({
    callback: { confirmed: true, date: "2026-09-06", time: "15:00", timeZone: context.clinicTimeZone },
    name: "request_staff_follow_up",
    operationId: "callback-storage-failure",
    reason: "caller_request",
  }), /Callback storage unavailable/);
  assert.equal(authority.outcome(), "uncertain");
});

test("caps slot batches at three even for direct callers bypassing the schema", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  assert.equal(voiceSchedulingToolBodySchemas.find_slots.safeParse({
    limit: 5, operationId: "oversized", provider: "any",
  }).success, false);
  await authority.execute({ name: "verify_identity", operationId: "identity-batch", result: "confirmed" });
  const result = await authority.execute({ name: "find_slots", operationId: "capped-batch", provider: "any", limit: 5 });
  assert.equal(result.type, "slots_found");
  if (result.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(result.slots.length, 3);
});

test("does not disclose appointment or slot facts before identity verification", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });

  await assert.rejects(
    authority.execute({ name: "find_slots", operationId: "slots-before-identity", provider: "any" }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "identity_required"
    ),
  );
});

test("commits only an offered server-side action after exact confirmation", async () => {
  const applied: VoiceCallResult[] = [];
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const authority = createVoiceSchedulingAuthority({
    applyResult(result) {
      applied.push(result);
    },
    context,
    now: () => new Date("2026-08-28T12:05:00.000Z"),
  });

  const identity = await authority.execute({
    name: "verify_identity",
    operationId: "identity-1",
    result: "confirmed",
  });
  assert.equal(identity.type, "identity_recorded");
  assert.equal(identity.result, "confirmed");
  if (identity.result !== "confirmed") throw new Error("Expected confirmed identity.");
  assert.deepEqual(identity.currentAppointment, context.appointment);
  const slots = await authority.execute({
    name: "find_slots",
    operationId: "slots-1",
    provider: "same",
  });
  assert.equal(slots.type, "slots_found");
  if (slots.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(slots.slots.every((slot) => (
    slot.providerName === context.appointment.provider.name
  )), true);

  const prepared = await authority.execute({
    kind: "reschedule",
    name: "prepare_change",
    operationId: "prepare-1",
    slotId: slots.slots[0]!.id,
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");
  assert.match(prepared.actionToken, /^action_[0-9a-f-]{36}$/);
  assert.doesNotMatch(prepared.actionToken, /prepare-1/);

  await assert.rejects(
    authority.execute({
      actionToken: prepared.actionToken,
      confirmed: false,
      name: "commit_change",
      operationId: "commit-unconfirmed",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "confirmation_required"
    ),
  );

  const commitInput = {
    actionToken: prepared.actionToken,
    appointmentId: "model-supplied-wrong-appointment",
    confirmed: true as const,
    name: "commit_change" as const,
    operationId: "commit-1",
  };
  const committed = await authority.execute(commitInput);
  const replayed = await authority.execute(commitInput);

  assert.deepEqual(replayed, committed);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]!.previousAppointment.id, "olivia");
  assert.equal(applied[0]!.kind, "rescheduled");
});

test("coalesces concurrent retries of one commit operation", async () => {
  let applyCount = 0;
  let releaseApply: (() => void) | undefined;
  const applyGate = new Promise<void>((resolve) => {
    releaseApply = resolve;
  });
  const authority = createVoiceSchedulingAuthority({
    async applyResult() {
      applyCount += 1;
      await applyGate;
    },
    context: createVoiceCallContext(),
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-concurrent-commit",
    result: "confirmed",
  });
  const slots = await authority.execute({
    name: "find_slots",
    operationId: "slots-concurrent-commit",
    provider: "any",
  });
  assert.equal(slots.type, "slots_found");
  if (slots.type !== "slots_found") throw new Error("Expected slots.");
  const prepared = await authority.execute({
    kind: "reschedule",
    name: "prepare_change",
    operationId: "prepare-concurrent-commit",
    slotId: slots.slots[0]!.id,
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");
  const command = {
    actionToken: prepared.actionToken,
    confirmed: true as const,
    name: "commit_change" as const,
    operationId: "commit-concurrent",
  };

  const first = authority.execute(command);
  const second = authority.execute(command);
  await Promise.resolve();

  assert.equal(applyCount, 1);
  releaseApply?.();
  assert.deepEqual(await second, await first);
});

test("replays one committed action token across different operation IDs", async () => {
  let applyCount = 0;
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(),
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-action-replay",
    result: "confirmed",
  });
  const prepared = await authority.execute({
    kind: "cancellation",
    name: "prepare_change",
    operationId: "prepare-action-replay",
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");

  const first = await authority.execute({
    actionToken: prepared.actionToken,
    confirmed: true,
    name: "commit_change",
    operationId: "commit-action-replay-1",
  });
  const replay = await authority.execute({
    actionToken: prepared.actionToken,
    confirmed: true,
    name: "commit_change",
    operationId: "commit-action-replay-2",
  });

  assert.deepEqual(replay, first);
  assert.equal(applyCount, 1);
});

test("rejects a prepared action after its two-minute lifetime", async () => {
  let applyCount = 0;
  let now = new Date("2026-08-28T12:00:00.000Z");
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(now),
    now: () => now,
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-expired-action",
    result: "confirmed",
  });
  const prepared = await authority.execute({
    kind: "cancellation",
    name: "prepare_change",
    operationId: "prepare-expired-action",
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");
  assert.equal(prepared.expiresAt, "2026-08-28T12:02:00.000Z");
  now = new Date("2026-08-28T12:02:00.001Z");

  await assert.rejects(
    authority.execute({
      actionToken: prepared.actionToken,
      confirmed: true,
      name: "commit_change",
      operationId: "commit-expired-action",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "action_expired"
    ),
  );
  assert.equal(applyCount, 0);
});

test("rejects a new change after the attempt reaches a terminal result", async () => {
  let applyCount = 0;
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(),
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-terminal-attempt",
    result: "confirmed",
  });
  const prepared = await authority.execute({
    kind: "cancellation",
    name: "prepare_change",
    operationId: "prepare-terminal-attempt",
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");
  await authority.execute({
    actionToken: prepared.actionToken,
    confirmed: true,
    name: "commit_change",
    operationId: "commit-terminal-attempt",
  });

  await assert.rejects(
    authority.execute({
      kind: "cancellation",
      name: "prepare_change",
      operationId: "prepare-after-terminal-attempt",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "attempt_terminal"
    ),
  );
  assert.equal(applyCount, 1);
});

test("replaces an unused prepared action with the latest change", async () => {
  let applyCount = 0;
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(),
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-distinct-commits",
    result: "confirmed",
  });
  const slots = await authority.execute({
    name: "find_slots",
    operationId: "slots-distinct-commits",
    provider: "any",
  });
  assert.equal(slots.type, "slots_found");
  if (slots.type !== "slots_found") throw new Error("Expected slots.");
  const reschedule = await authority.execute({
    kind: "reschedule",
    name: "prepare_change",
    operationId: "prepare-reschedule-distinct-commits",
    slotId: slots.slots[0]!.id,
  });
  const cancellation = await authority.execute({
    kind: "cancellation",
    name: "prepare_change",
    operationId: "prepare-cancellation-distinct-commits",
  });
  assert.equal(reschedule.type, "change_prepared");
  assert.equal(cancellation.type, "change_prepared");
  if (reschedule.type !== "change_prepared" || cancellation.type !== "change_prepared") {
    throw new Error("Expected prepared changes.");
  }

  await assert.rejects(
    authority.execute({
      actionToken: reschedule.actionToken,
      confirmed: true,
      name: "commit_change",
      operationId: "commit-replaced-reschedule",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "action_not_found"
    ),
  );
  await authority.execute({
    actionToken: cancellation.actionToken,
    confirmed: true,
    name: "commit_change",
    operationId: "commit-latest-cancellation",
  });

  assert.equal(applyCount, 1);
  assert.equal(authority.outcome(), "cancelled");
});

test("keeps a failed commit terminal because the result is uncertain", async () => {
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      throw new Error("The scheduling store did not acknowledge the write.");
    },
    context: createVoiceCallContext(),
  });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-uncertain-commit",
    result: "confirmed",
  });
  const prepared = await authority.execute({
    kind: "cancellation",
    name: "prepare_change",
    operationId: "prepare-uncertain-commit",
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");

  await assert.rejects(authority.execute({
    actionToken: prepared.actionToken,
    confirmed: true,
    name: "commit_change",
    operationId: "commit-uncertain",
  }));
  await assert.rejects(
    authority.execute({
      name: "request_staff_follow_up",
      operationId: "follow-up-after-uncertain-commit",
      reason: "tool_failure",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "attempt_terminal"
    ),
  );
  assert.equal(authority.outcome(), "uncertain");
});

test("applies provider, date, weekday, and time constraints as one search", async () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-compound-search",
    result: "confirmed",
  });

  const result = await authority.execute({
    dateFrom: "2026-09-01",
    dateTo: "2026-09-10",
    excludedWeekdays: ["tuesday"],
    limit: 5,
    name: "find_slots",
    operationId: "slots-compound-search",
    provider: "different",
    timeFrom: "14:00",
    timeTo: "16:00",
  });

  assert.equal(result.type, "slots_found");
  if (result.type !== "slots_found") throw new Error("Expected slots.");
  assert.deepEqual(result.constraints, {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-10",
    excludedWeekdays: ["tuesday"],
    provider: "different",
    timeFrom: "14:00",
    timeTo: "16:00",
  });
  assert.ok(result.slots.length > 0);
  assert.ok(result.slots.every((slot) => (
    slot.providerName !== context.appointment.provider.name
    && slot.timeLabel === "3:00 PM"
  )));
  assert.deepEqual(Object.keys(result.slots[0]!).sort(), [
    "dateLabel",
    "id",
    "providerName",
    "timeLabel",
  ]);
});

test("uses another provider only when the first slot is sufficiently earlier", async () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const sameProviderSlot = context.availableSlots.find((slot) => (
    slot.provider.id === context.appointment.provider.id
  ));
  const differentProviderSlot = context.availableSlots.find((slot) => (
    slot.provider.id !== context.appointment.provider.id
  ));
  assert.ok(sameProviderSlot);
  assert.ok(differentProviderSlot);
  context.availableSlots = [
    { ...differentProviderSlot, dateIso: "2026-09-03", id: "different-2026-09-03" },
    { ...sameProviderSlot, dateIso: "2026-09-10", id: "same-2026-09-10" },
  ];
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-conditional-provider",
    result: "confirmed",
  });
  const strict = await authority.execute({
    minimumDaysEarlier: 8,
    name: "find_slots",
    operationId: "slots-conditional-provider-strict",
    provider: "same_unless_earlier",
  });
  const permissive = await authority.execute({
    minimumDaysEarlier: 7,
    name: "find_slots",
    operationId: "slots-conditional-provider-permissive",
    provider: "same_unless_earlier",
  });

  assert.equal(strict.type, "slots_found");
  assert.equal(permissive.type, "slots_found");
  if (strict.type !== "slots_found" || permissive.type !== "slots_found") {
    throw new Error("Expected slots.");
  }
  assert.ok(strict.slots.every((slot) => (
    slot.providerName === context.appointment.provider.name
  )));
  assert.ok(permissive.slots.every((slot) => (
    slot.providerName !== context.appointment.provider.name
  )));
});

test("rejects inverted date and time ranges", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-invalid-ranges",
    result: "confirmed",
  });

  await assert.rejects(authority.execute({
    dateFrom: "2026-09-10",
    dateTo: "2026-09-01",
    name: "find_slots",
    operationId: "slots-inverted-dates",
    provider: "any",
  }), (error: unknown) => (
    error instanceof VoiceSchedulingError && error.code === "invalid_request"
  ));
  await assert.rejects(authority.execute({
    name: "find_slots",
    operationId: "slots-inverted-times",
    provider: "any",
    timeFrom: "16:00",
    timeTo: "09:00",
  }), (error: unknown) => (
    error instanceof VoiceSchedulingError && error.code === "invalid_request"
  ));
});

test("never returns slots outside the rolling 21-day clinic window", async () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const template = context.availableSlots[0]!;
  context.availableSlots.unshift(
    { ...template, dateIso: "2026-08-28", id: "slot-on-call-date" },
    { ...template, dateIso: "2026-09-19", id: "slot-after-horizon" },
  );
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-horizon",
    result: "confirmed",
  });

  const result = await authority.execute({
    limit: 5,
    name: "find_slots",
    operationId: "slots-horizon",
    provider: "any",
  });

  assert.equal(result.type, "slots_found");
  if (result.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(result.slots.some((slot) => slot.id === "slot-on-call-date"), false);
  assert.equal(result.slots.some((slot) => slot.id === "slot-after-horizon"), false);
});

test("does not disclose appointment data after wrong-person verification", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-wrong-person-disclosure",
    result: "wrong_person",
  });

  await assert.rejects(authority.execute({
    name: "find_slots",
    operationId: "slots-after-wrong-person",
    provider: "any",
  }), (error: unknown) => (
    error instanceof VoiceSchedulingError && error.code === "attempt_terminal"
  ));
});

test("returns only a different dentist when the caller asks to change dentists", async () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-other-provider",
    result: "confirmed",
  });

  const result = await authority.execute({
    name: "find_slots",
    operationId: "slots-other-provider",
    provider: "different",
  });

  assert.equal(result.type, "slots_found");
  if (result.type !== "slots_found") throw new Error("Expected slots.");
  assert.ok(result.slots.length > 0);
  assert.ok(result.slots.every((slot) => (
    slot.providerName !== context.appointment.provider.name
  )));
});

test("offers the next three unused slots when asked for more options", async () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-slot-pages",
    result: "confirmed",
  });

  const first = await authority.execute({
    name: "find_slots",
    operationId: "slots-page-1",
    provider: "same",
  });
  const second = await authority.execute({
    name: "find_slots",
    operationId: "slots-page-2",
    provider: "same",
  });

  assert.equal(first.type, "slots_found");
  assert.equal(second.type, "slots_found");
  if (first.type !== "slots_found" || second.type !== "slots_found") {
    throw new Error("Expected slots.");
  }
  assert.equal(first.slots.length, 3);
  assert.equal(second.slots.length, 3);
  const firstIds = first.slots.map((slot) => slot.id);
  const secondIds = second.slots.map((slot) => slot.id);
  assert.equal(new Set([...firstIds, ...secondIds]).size, 6);

  const prepared = await authority.execute({
    kind: "reschedule",
    name: "prepare_change",
    operationId: "prepare-first-page-slot",
    slotId: first.slots[0]!.id,
  });
  assert.equal(prepared.type, "change_prepared");
});

test("rejects an unoffered slot and an operation ID reused with different input", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  await authority.execute({ name: "verify_identity", operationId: "identity-2", result: "confirmed" });

  await assert.rejects(
    authority.execute({
      kind: "reschedule",
      name: "prepare_change",
      operationId: "prepare-unoffered",
      slotId: "fictional-slot-not-offered",
    }),
    (error: unknown) => error instanceof VoiceSchedulingError && error.code === "slot_not_offered",
  );

  await authority.execute({ name: "find_slots", operationId: "reused-operation", provider: "any" });
  await assert.rejects(
    authority.execute({ name: "find_slots", operationId: "reused-operation", provider: "same" }),
    (error: unknown) => error instanceof VoiceSchedulingError && error.code === "operation_conflict",
  );
});

test("records an unclear identity and staff follow-up without changing an appointment", async () => {
  let applyCount = 0;
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(),
  });

  const identity = await authority.execute({
    name: "verify_identity",
    operationId: "identity-unclear",
    result: "unclear",
  });
  const followUp = await authority.execute({
    name: "request_staff_follow_up",
    operationId: "follow-up-1",
    reason: "identity_problem",
  });

  assert.equal(identity.type, "identity_recorded");
  assert.equal(followUp.type, "staff_follow_up_recorded");
  assert.equal(authority.outcome(), "staff_follow_up");
  assert.equal(applyCount, 0);
});

test("keeps a wrong-person identity result terminal", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  await authority.execute({
    name: "verify_identity",
    operationId: "identity-wrong-person",
    result: "wrong_person",
  });

  await assert.rejects(
    authority.execute({
      name: "verify_identity",
      operationId: "identity-after-wrong-person",
      result: "confirmed",
    }),
    (error: unknown) => (
      error instanceof VoiceSchedulingError && error.code === "attempt_terminal"
    ),
  );
  assert.equal(authority.outcome(), "identity_failed");
});


test("records a confirmed callback window and rejects reversed bounds", async () => {
  const context = createVoiceCallContext(new Date("2026-09-05T12:00:00Z"));
  const callback = { confirmed: true, date: "2026-09-05", time: "17:00", timeEnd: "20:00", timeZone: context.clinicTimeZone };
  assert.equal(voiceSchedulingToolBodySchemas.request_staff_follow_up.safeParse({ callback, reason: "caller_request", operationId: "window" }).success, true);
  const authority = createVoiceSchedulingAuthority({ context, now: () => new Date(context.callStartedAt) });
  const result = await authority.execute({ name: "request_staff_follow_up", callback, reason: "caller_request", operationId: "window" });
  assert.equal(result.type, "staff_follow_up_recorded");
  if (result.type !== "staff_follow_up_recorded") throw new Error("Expected callback.");
  assert.deepEqual(result.callback, callback);
  for (const timeEnd of ["16:00", "17:00"]) {
    const other = createVoiceSchedulingAuthority({ context, now: () => new Date(context.callStartedAt) });
    await assert.rejects(other.execute({ name: "request_staff_follow_up", callback: { ...callback, timeEnd }, reason: "caller_request", operationId: "bad-window" }),
      (error: unknown) => error instanceof VoiceSchedulingError && error.code === "invalid_request");
  }
});

test("keeps search preferences, repeats the batch, and clears constraints explicitly", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext(new Date("2026-08-28T12:00:00Z")) });
  await authority.execute({ name: "verify_identity", operationId: "id-context", result: "confirmed" });
  const first = await authority.execute({ name: "find_slots", operationId: "first-context", provider: "any", timeFrom: "14:00" });
  const repeat = await authority.execute({ name: "find_slots", operationId: "repeat-context", provider: "any", mode: "repeat" });
  assert.deepEqual(repeat, first);
  const more = await authority.execute({ name: "find_slots", operationId: "more-context", provider: "any", mode: "more" });
  if (first.type !== "slots_found" || more.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(more.constraints.timeFrom, "14:00");
  assert.ok(more.slots.every((slot) => !first.slots.some((previous) => previous.id === slot.id)));
  const cleared = await authority.execute({ name: "find_slots", operationId: "clear-context", provider: "any", mode: "search", clearConstraints: ["timeFrom"] });
  if (cleared.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(cleared.constraints.timeFrom, undefined);
  assert.ok(cleared.slots.some((slot) => slot.timeLabel.includes("AM")));
});

test("returns authoritative readback and invalidates a pending change on a new search", async () => {
  const context = createVoiceCallContext();
  const authority = createVoiceSchedulingAuthority({ context });
  await authority.execute({ name: "verify_identity", operationId: "id-readback", result: "confirmed" });
  const found = await authority.execute({ name: "find_slots", operationId: "search-readback", provider: "any" });
  if (found.type !== "slots_found") throw new Error("Expected slots.");
  const prepared = await authority.execute({ name: "prepare_change", operationId: "prepare-readback", kind: "reschedule", slotId: found.slots[0]!.id });
  if (prepared.type !== "change_prepared") throw new Error("Expected preparation.");
  assert.deepEqual(prepared.currentAppointment, context.appointment);
  assert.equal(prepared.replacement?.id, found.slots[0]!.id);
  assert.equal(prepared.timeZone, context.clinicTimeZone);
  await authority.execute({ name: "find_slots", operationId: "correct-readback", provider: "same", mode: "search" });
  await assert.rejects(authority.execute({ name: "commit_change", operationId: "stale-readback", actionToken: prepared.actionToken, confirmed: true }),
    (error: unknown) => error instanceof VoiceSchedulingError && error.code === "action_not_found");
});
