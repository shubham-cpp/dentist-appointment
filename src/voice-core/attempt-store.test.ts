import assert from "node:assert/strict";
import test from "node:test";
import { VoiceAttemptStore } from "./attempt-store";

const callSid = `CA${"1".repeat(32)}`;

test("binds a single call and Relay session to an attempt", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();

  store.bindProviderCallId(attempt.id, callSid);
  store.bindRelaySession(attempt.relayToken, callSid, "VXdemo");

  const view = store.getView(attempt.id);
  assert.equal(view?.sessionStatus, "connected");
});

test("rejects a callback for a different call", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  store.bindProviderCallId(attempt.id, callSid);

  assert.throws(
    () => store.bindProviderCallId(attempt.id, `CA${"2".repeat(32)}`),
    /does not match/,
  );
});

test("keeps terminal transport state immutable", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  store.updateStatus(attempt.id, callSid, "completed", 2);
  store.updateStatus(attempt.id, callSid, "ringing", 3);

  assert.equal(store.getView(attempt.id)?.transportStatus, "completed");
});

test("does not mark an active call as failed", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();

  store.markCreating(attempt.id);
  store.updateStatus(attempt.id, callSid, "ringing", 1);

  assert.equal(store.getView(attempt.id)?.outcome, "none");
});

test("marks a completed call without a conversation result as unknown", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();

  store.updateStatus(attempt.id, callSid, "completed", 1);

  assert.equal(store.getView(attempt.id)?.outcome, "unknown");
});

test("marks a failed Relay completion as failed", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  const sessionId = "VXdemo";

  store.bindProviderCallId(attempt.id, callSid);
  store.bindRelaySession(attempt.relayToken, callSid, sessionId);
  store.completeRelaySession(attempt.id, callSid, sessionId, "failed");

  assert.equal(store.getView(attempt.id)?.outcome, "failed");
});

test("keeps a concrete caller outcome when Relay later reports a failure", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  const sessionId = "VXdemo";

  store.bindProviderCallId(attempt.id, callSid);
  store.bindRelaySession(attempt.relayToken, callSid, sessionId);
  store.setOutcome(attempt.id, "slot_proposed");
  store.completeRelaySession(attempt.id, callSid, sessionId, "failed");

  assert.equal(store.getView(attempt.id)?.outcome, "slot_proposed");
});

test("rechecks the replacement against the attempt schedule before saving", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  const replacement = attempt.callContext.availableSlots[0]!;

  store.setResultByRelayToken(attempt.relayToken, {
    confirmedAt: "2026-08-16T16:00:00.000Z",
    kind: "rescheduled",
    previousAppointment: attempt.callContext.appointment,
    replacement,
  });

  assert.equal(store.getView(attempt.id)?.result?.kind, "rescheduled");
  assert.equal(store.getView(attempt.id)?.outcome, "rescheduled");
});

test("rejects a replacement that is not in the attempt schedule", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  const replacement = { ...attempt.callContext.availableSlots[0]!, id: "not-available" };

  assert.throws(() => store.setResultByRelayToken(attempt.relayToken, {
    confirmedAt: "2026-08-16T16:00:00.000Z",
    kind: "rescheduled",
    previousAppointment: attempt.callContext.appointment,
    replacement,
  }), /no longer available/);
});

test("revokes Relay authority when an attempt starts ending", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  store.bindProviderCallId(attempt.id, callSid);

  assert.equal(store.hasActiveRelayAuthority(attempt.id, attempt.relayToken), true);
  store.markCancelRequested(attempt.id);

  assert.equal(store.hasActiveRelayAuthority(attempt.id, attempt.relayToken), false);
  assert.throws(
    () => store.bindRelaySession(attempt.relayToken, callSid, "VXlate"),
    /not available/,
  );
});

test("marks an unconfirmed hangup as terminal and revokes Relay authority", () => {
  const store = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = store.createAttempt();
  store.bindProviderCallId(attempt.id, callSid);

  store.markTerminationUncertain(attempt.id);

  assert.equal(store.getView(attempt.id)?.transportStatus, "unknown");
  assert.equal(store.getView(attempt.id)?.outcome, "unknown");
  assert.equal(store.hasActiveRelayAuthority(attempt.id, attempt.relayToken), false);
});
