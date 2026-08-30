import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext, type VoiceCallResult } from "@/lib/voice-call-context";
import {
  VoiceSchedulingError,
  createVoiceSchedulingAuthority,
} from "./scheduling-authority";

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
    provider: "current",
  });
  assert.equal(slots.type, "slots_found");
  if (slots.type !== "slots_found") throw new Error("Expected slots.");
  assert.equal(slots.slots.every((slot) => slot.provider.id === context.appointment.provider.id), true);

  const prepared = await authority.execute({
    kind: "reschedule",
    name: "prepare_change",
    operationId: "prepare-1",
    slotId: slots.slots[0]!.id,
  });
  assert.equal(prepared.type, "change_prepared");
  if (prepared.type !== "change_prepared") throw new Error("Expected a prepared change.");

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
    authority.execute({ name: "find_slots", operationId: "reused-operation", provider: "current" }),
    (error: unknown) => error instanceof VoiceSchedulingError && error.code === "operation_conflict",
  );
});

test("records safe identity failure and staff follow-up without changing an appointment", async () => {
  let applyCount = 0;
  const authority = createVoiceSchedulingAuthority({
    applyResult() {
      applyCount += 1;
    },
    context: createVoiceCallContext(),
  });

  const identity = await authority.execute({
    name: "verify_identity",
    operationId: "identity-wrong-person",
    result: "wrong_person",
  });
  const followUp = await authority.execute({
    name: "request_staff_follow_up",
    operationId: "follow-up-1",
    reason: "wrong_person",
  });

  assert.equal(identity.type, "identity_recorded");
  assert.equal(followUp.type, "staff_follow_up_recorded");
  assert.equal(authority.outcome(), "staff_follow_up");
  assert.equal(applyCount, 0);
});
