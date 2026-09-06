import assert from "node:assert/strict";
import test from "node:test";
import { initialAppointments, initialRequests, providers } from "./demo-data";
import {
  beginCalendarOperationCommit,
  completeCalendarOperationCommit,
  createIdleCalendarOperationState,
  DEMO_CALENDAR_CLOCK,
  formatCalendarSelection,
  parseCalendarSelection,
  parseCalendarWorkspaceContext,
  resolveCalendarOperationPreview,
  resolveCalendarSelection,
  revertCalendarOperation,
  startCalendarOperationPreview,
  updateCalendarOperationNotification,
  updateCalendarWorkspaceSearchParams,
} from "./calendar-workspace-model";

const providerIds = providers.map((provider) => provider.id);

test("defaults the calendar to the Tuesday practice day", () => {
  const context = parseCalendarWorkspaceContext({}, providerIds);

  assert.equal(context.dateOffset, 0);
  assert.equal(context.view, "day");
  assert.equal(context.scope, "focus");
  assert.deepEqual(context.layers, { schedule: true, capacity: true, requests: true });
});

test("accepts only known calendar context values", () => {
  const context = parseCalendarWorkspaceContext({
    date: "2023-08-10",
    layers: "capacity,unknown",
    provider: "nguyen",
    providers: "nguyen,unknown,chen",
    scope: "team",
    view: "week",
  }, providerIds);

  assert.equal(context.dateOffset, 2);
  assert.equal(context.focusedProviderId, "nguyen");
  assert.deepEqual(context.visibleProviderIds, ["nguyen", "chen"]);
  assert.deepEqual(context.layers, { schedule: false, capacity: true, requests: false });
});

test("resolves an exact deep link and rejects an unknown ID", () => {
  assert.deepEqual(
    resolveCalendarSelection("appointment:noah-conflict", initialAppointments, initialRequests),
    { missing: false, selection: { kind: "appointment", id: "noah-conflict" } },
  );
  assert.deepEqual(
    resolveCalendarSelection("request:sofia-request", initialAppointments, initialRequests),
    { missing: false, selection: { kind: "request", id: "sofia-request" } },
  );
  assert.deepEqual(
    resolveCalendarSelection("appointment:does-not-exist", initialAppointments, initialRequests),
    { missing: true, selection: null },
  );
  assert.deepEqual(
    resolveCalendarSelection("noah-conflict", initialAppointments, initialRequests),
    { missing: true, selection: null },
  );
});

test("parses and formats only the typed calendar selection wire format", () => {
  assert.deepEqual(parseCalendarSelection("appointment:noah-conflict"), { kind: "appointment", id: "noah-conflict" });
  assert.deepEqual(parseCalendarSelection("request:sofia-request"), { kind: "request", id: "sofia-request" });
  assert.equal(parseCalendarSelection("appointment:"), null);
  assert.equal(parseCalendarSelection("APPOINTMENT:noah-conflict"), null);
  assert.equal(parseCalendarSelection("unknown:noah-conflict"), null);
  assert.equal(parseCalendarSelection("appointment:noah:conflict"), null);
  assert.equal(formatCalendarSelection({ kind: "request", id: "sofia-request" }), "request:sofia-request");
});

test("serializes validated calendar context without dropping unrelated parameters", () => {
  const search = updateCalendarWorkspaceSearchParams("queue=open&new=1", {
    dateOffset: 2,
    focusedProviderId: "chen",
    layers: { schedule: true, capacity: false, requests: true },
    scope: "team",
    view: "week",
    visibleProviderIds: ["chen", "nguyen"],
  }, { kind: "request", id: "sofia-request" });
  const params = new URLSearchParams(search);

  assert.equal(params.get("queue"), "open");
  assert.equal(params.get("new"), null);
  assert.equal(params.get("date"), "2023-08-10");
  assert.equal(params.get("layers"), "schedule,requests");
  assert.equal(params.get("selected"), "request:sofia-request");
});

test("commits one reviewed operation with real notification and audit state", () => {
  const idle = createIdleCalendarOperationState();
  const previewing = startCalendarOperationPreview(idle, {
    id: "move-noah-1",
    kind: "reschedule",
    appointmentId: "noah-conflict",
    fromProviderId: "chen",
    fromStartMinutes: 660,
    reason: "Resolve a schedule conflict",
    toProviderId: "nguyen",
    toStartMinutes: 720,
    notificationRequested: true,
    summary: "Noah Brown moved to Dr Nguyen at 12 PM.",
    reversalSummary: "Noah Brown restored to Dr Chen at 11 AM.",
  });
  assert.equal(previewing.status, "previewing");

  const ready = resolveCalendarOperationPreview(previewing, { ok: true, message: "Schedule clear." });
  assert.equal(ready.status, "ready");
  const committing = beginCalendarOperationCommit(ready);
  assert.equal(committing.status, "committing");
  const committed = completeCalendarOperationCommit(committing, DEMO_CALENDAR_CLOCK.nowMs);

  assert.equal(committed.status, "committed");
  assert.equal(committed.notification, "queued");
  assert.equal(committed.undoUntilMs, DEMO_CALENDAR_CLOCK.nowMs + DEMO_CALENDAR_CLOCK.undoWindowMs);
  assert.deepEqual(committed.auditEvents.map((event) => event.type), ["committed"]);

  const sent = updateCalendarOperationNotification(committed, "sent");
  assert.equal(sent.notification, "sent");
  const failed = updateCalendarOperationNotification(committed, "failed");
  assert.equal(failed.notification, "failed");
});

test("keeps invalid previews uncommitted and focuses recovery on the issue", () => {
  const previewing = startCalendarOperationPreview(createIdleCalendarOperationState(), {
    id: "move-noah-conflict",
    kind: "reschedule",
    appointmentId: "noah-conflict",
    fromProviderId: "chen",
    fromStartMinutes: 660,
    reason: "Resolve a schedule conflict",
    toProviderId: "chen",
    toStartMinutes: 690,
    notificationRequested: true,
    summary: "Noah Brown moved to 11:30 AM.",
    reversalSummary: "Noah Brown restored to 11 AM.",
  });
  const invalid = resolveCalendarOperationPreview(previewing, { ok: false, message: "Overlaps Michael Thompson." });

  assert.deepEqual(invalid, {
    status: "invalid",
    operation: previewing.operation,
    issue: "Overlaps Michael Thompson.",
    auditEvents: [],
  });
});

test("allows undo only inside the demo window and records a compensating event", () => {
  const operation = startCalendarOperationPreview(createIdleCalendarOperationState(), {
    id: "move-noah-2",
    kind: "reschedule",
    appointmentId: "noah-conflict",
    fromProviderId: "chen",
    fromStartMinutes: 660,
    reason: "Resolve a schedule conflict",
    toProviderId: "nguyen",
    toStartMinutes: 720,
    notificationRequested: false,
    summary: "Noah Brown moved.",
    reversalSummary: "Noah Brown restored.",
  });
  const ready = resolveCalendarOperationPreview(operation, { ok: true, message: "Schedule clear." });
  assert.equal(ready.status, "ready");
  const committed = completeCalendarOperationCommit(
    beginCalendarOperationCommit(ready),
    DEMO_CALENDAR_CLOCK.nowMs,
  );
  const reverted = revertCalendarOperation(committed, DEMO_CALENDAR_CLOCK.nowMs + 60_000);

  assert.equal(reverted.ok, true);
  assert.equal(reverted.state.status, "reverted");
  assert.deepEqual(reverted.state.auditEvents.map((event) => event.type), ["committed", "reverted"]);
  assert.equal(reverted.state.notification, "not_requested");

  const expired = revertCalendarOperation(
    committed,
    committed.undoUntilMs + 1,
  );
  assert.equal(expired.ok, false);
  assert.equal(expired.state.status, "committed");
  assert.match(expired.error ?? "", /expired/i);
});
