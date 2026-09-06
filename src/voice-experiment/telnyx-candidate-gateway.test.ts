import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addVoiceCalendarDays, createVoiceCallContext, voiceLocalDateIso } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { MemoryControlledCallLease } from "@/voice-core/controlled-call-lease";
import {
  openVoiceEvidenceRecorder,
  type VoiceEvidenceEvent,
  type VoiceEvidenceRecorder,
} from "@/voice-core/evidence-recorder";
import { createTelnyxCandidateCallController } from "./telnyx-call-controller";
import { createTelnyxCandidateGateway, isTelnyxTerminalAssistantClosing } from "./telnyx-candidate-gateway";

test("exposes dashboard, signed event, and deterministic tool routes", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "telnyx-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const speaks: string[] = [];
  const assistantStarts: string[] = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return { callControlId: "v3:test-call", callLegId: "leg-test", callSessionId: "session-test" };
      },
      async hangup() {},
      async speak(callControlId) {
        speaks.push(callControlId);
      },
      async startAiAssistant(callControlId) {
        assistantStarts.push(callControlId);
      },
    },
    config: {
      artifactsRoot,
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const signedBodies: string[] = [];
  const terminalHangupDelays: number[] = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller,
    async preflight() {},
    scheduleHangup(delayMs) {
      terminalHangupDelays.push(delayMs);
      return () => undefined;
    },
    validateRequest(rawBody) {
      signedBodies.push(rawBody);
      return true;
    },
  });

  const start = await gateway.inject({
    headers: {
      "x-voice-gateway-secret": "candidate-internal-secret-1234",
      "x-voice-request-id": "33333333-3333-4333-8333-333333333333",
    },
    method: "POST",
    payload: { callContext: createVoiceCallContext() },
    url: "/internal/controlled-attempt",
  });
  assert.equal(start.statusCode, 201);
  const attemptId = start.json().attempt.id as string;
  const relayToken = attempts.getAttempt(attemptId)!.relayToken;

  const eventBody = {
    data: {
      event_type: "call.answered",
      id: "event-11111111-1111-4111-8111-111111111111",
      occurred_at: "2026-08-28T12:00:00.000Z",
      payload: {
        call_control_id: "v3:test-call",
        call_leg_id: "leg-test",
        call_session_id: "session-test",
      },
      record_type: "event",
    },
  };
  const event = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: eventBody,
    query: { attempt: attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(event.statusCode, 200);
  assert.match(signedBodies[0]!, /call\.answered/);
  assert.equal(attempts.getAttempt(attemptId)?.transportStatus, "answered");
  assert.deepEqual(speaks, ["v3:test-call"]);
  assert.deepEqual(assistantStarts, []);

  const spoken = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.speak.ended",
        id: "event-speak-ended",
        occurred_at: "2026-08-28T12:00:01.000Z",
        payload: { call_control_id: "v3:test-call" },
        record_type: "event",
      },
    },
    query: { attempt: attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(spoken.statusCode, 200);
  assert.deepEqual(assistantStarts, ["v3:test-call"]);

  const tool = await gateway.inject({
    headers: {
      authorization: `Bearer ${relayToken}`,
      "x-telnyx-call-control-id": "v3:test-call",
    },
    method: "POST",
    payload: { operationId: "identity-1", result: "confirmed" },
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(tool.statusCode, 200);
  assert.equal(tool.json().result, "confirmed");
  assert.equal(tool.json().type, "identity_recorded");
  assert.equal(tool.json().currentAppointment.id, "olivia");

  const alternateProviderSlots = await gateway.inject({
    headers: {
      authorization: `Bearer ${relayToken}`,
      "x-telnyx-call-control-id": "v3:test-call",
    },
    method: "POST",
    payload: { operationId: "slots-other-provider", provider: "different" },
    url: "/voice-experiment/telnyx/tools/find_slots",
  });
  assert.equal(alternateProviderSlots.statusCode, 200);
  assert.equal(alternateProviderSlots.json().type, "slots_found");
  assert.ok(alternateProviderSlots.json().slots.every((slot: { providerName: string }) => (
    slot.providerName !== "Dr Aisha Patel"
  )));

  const arbitraryReason = "The model supplied private free text.";
  const invalidFollowUp = await gateway.inject({
    headers: {
      authorization: `Bearer ${relayToken}`,
      "x-telnyx-call-control-id": "v3:test-call",
    },
    method: "POST",
    payload: { operationId: "follow-up-invalid", reason: arbitraryReason },
    url: "/voice-experiment/telnyx/tools/request_staff_follow_up",
  });
  assert.equal(invalidFollowUp.statusCode, 400);
  assert.equal(invalidFollowUp.json().error, "invalid_tool_request");
  assert.equal(invalidFollowUp.json().terminal, false);
  assert.deepEqual(invalidFollowUp.json().fields, ["reason"]);
  assert.doesNotMatch(invalidFollowUp.body, new RegExp(arbitraryReason));

  const terminalTool = await gateway.inject({
    headers: {
      authorization: `Bearer ${relayToken}`,
      "x-telnyx-call-control-id": "v3:test-call",
    },
    method: "POST",
    payload: {
      callback: {
        confirmed: true,
        date: addVoiceCalendarDays(voiceLocalDateIso(new Date()), 1),
        time: "15:00",
        timeZone: "America/New_York",
      },
      operationId: "follow-up-1",
      reason: "caller_request",
    },
    url: "/voice-experiment/telnyx/tools/request_staff_follow_up",
  });
  assert.equal(terminalTool.statusCode, 200);
  assert.equal(terminalTool.json().type, "staff_follow_up_recorded");
  assert.equal(terminalTool.json().callback.time, "15:00");
  assert.ok(attempts.getView(attemptId)?.events.some((event) =>
    /Demo callback requested for .* around 15:00 America\/New_York/.test(event.label)));
  assert.equal(attempts.getView(attemptId)?.result, undefined);
  assert.deepEqual(terminalHangupDelays, [12_000]);

  const dashboardBeforeHangup = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: `/internal/controlled-attempt/${attemptId}`,
  });
  assert.equal(dashboardBeforeHangup.json().attempt.outcome, "staff_follow_up");

  const hangup = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.hangup",
        id: "event-terminal-staff-follow-up",
        occurred_at: "2026-08-28T12:01:00.000Z",
        payload: { call_control_id: "v3:test-call", hangup_cause: "normal_clearing" },
        record_type: "event",
      },
    },
    query: { attempt: attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(hangup.statusCode, 200);

  const dashboardAfterHangup = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: `/internal/controlled-attempt/${attemptId}`,
  });
  assert.equal(dashboardAfterHangup.json().attempt.outcome, "staff_follow_up");
  assert.equal(dashboardAfterHangup.json().attempt.transportStatus, "completed");

  const events = await readFile(join(artifactsRoot, attemptId, "events.jsonl"), "utf8");
  const tools = await readFile(join(artifactsRoot, attemptId, "tools.jsonl"), "utf8");
  assert.match(events, /call\.answered/);
  assert.match(tools, /tool\.started/);
  assert.match(tools, /tool\.completed/);
  await gateway.close();
});

test("rejects unsigned events and tools for the wrong active call", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => undefined,
      async finalize() {},
      async start() { throw new Error("private provider failure"); },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => false,
  });

  const event = await gateway.inject({
    method: "POST",
    payload: {},
    url: "/voice-experiment/telnyx/events?attempt=voice_unknown",
  });
  assert.equal(event.statusCode, 403);
  const tool = await gateway.inject({
    headers: { authorization: "Bearer wrong", "x-telnyx-call-control-id": "v3:wrong" },
    method: "POST",
    payload: {},
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(tool.statusCode, 401);
  const start = await gateway.inject({
    headers: {
      "x-voice-gateway-secret": "candidate-internal-secret-1234",
      "x-voice-request-id": "11111111-1111-4111-8111-111111111111",
    },
    method: "POST",
    payload: { callContext: createVoiceCallContext() },
    url: "/internal/controlled-attempt",
  });
  assert.equal(start.statusCode, 503);
  assert.deepEqual(start.json(), { error: "telnyx_candidate_unavailable" });
  await gateway.close();
});

test("keeps a wrong-person tool outcome through signed termination and dashboard reads", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const attempt = attempts.createAttempt();
  attempts.bindProviderCallId(attempt.id, "v3:wrong-person");
  attempts.updateStatus(attempt.id, "v3:wrong-person", "answered");
  let recorder: VoiceEvidenceRecorder | undefined = await openVoiceEvidenceRecorder({
    artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-wrong-person-")),
    manifest: {
      attemptId: attempt.id,
      configuration: {},
      correlation: { providerCallId: "v3:wrong-person" },
      greeting: "Hello.",
      model: "openai/gpt-5.6-luna",
      requestId: attempt.requestId,
      route: "call-control-embedded-assistant",
      runtime: "telnyx-candidate",
      startedAt: attempt.createdAt,
      voice: "Maeve",
    },
  });
  const hangupDelays: number[] = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => recorder,
      async finalize(attemptId) {
        await recorder?.finalize({
          dashboardOutcome: attempts.getView(attemptId)?.outcome ?? "unknown",
          finishedAt: "2026-08-28T12:01:00.000Z",
          schedulingOutcome: "identity_failed",
        });
        recorder = undefined;
      },
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    async preflight() {},
    scheduleHangup(delayMs) {
      hangupDelays.push(delayMs);
      return () => undefined;
    },
    validateRequest: () => true,
  });

  const tool = await gateway.inject({
    headers: {
      authorization: `Bearer ${attempt.relayToken}`,
      "x-telnyx-call-control-id": "v3:wrong-person",
    },
    method: "POST",
    payload: { operationId: "identity-wrong-person", result: "wrong_person" },
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(tool.statusCode, 200);
  assert.equal(attempts.getView(attempt.id)?.outcome, "identity_failed");
  assert.deepEqual(hangupDelays, [12_000]);

  const hangup = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.hangup",
        id: "event-terminal-wrong-person",
        occurred_at: "2026-08-28T12:01:00.000Z",
        payload: { call_control_id: "v3:wrong-person", hangup_cause: "normal_clearing" },
        record_type: "event",
      },
    },
    query: { attempt: attempt.id },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(hangup.statusCode, 200);

  const dashboard = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: `/internal/controlled-attempt/${attempt.id}`,
  });
  assert.equal(dashboard.json().attempt.outcome, "identity_failed");
  assert.equal(dashboard.json().attempt.transportStatus, "completed");
  assert.equal(recorder, undefined);
  await gateway.close();
});

test("isolates managed web-chat tools behind explicit test mode and reset", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: {
      internalSecret: "candidate-internal-secret-1234",
      testMode: true,
      testToolToken: "managed-test-token-1234",
    },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => undefined,
      async finalize() {},
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => false,
  });

  const beforeReset = await gateway.inject({
    headers: { authorization: "Bearer managed-test-token-1234" },
    method: "POST",
    payload: { operationId: "identity-before-reset", result: "confirmed" },
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(beforeReset.statusCode, 409);

  const reset = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "POST",
    payload: {
      callContext: createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z")),
      scenarioId: "standard-current-provider-reschedule",
    },
    url: "/internal/qualification-session",
  });
  assert.equal(reset.statusCode, 204);

  const failedTool = await gateway.inject({
    headers: { authorization: "Bearer managed-test-token-1234" },
    method: "POST",
    payload: { kind: "reschedule", operationId: "prepare-before-identity", slotId: "missing-slot" },
    url: "/voice-experiment/telnyx/tools/prepare_change",
  });
  assert.equal(failedTool.statusCode, 409);
  assert.deepEqual(failedTool.json(), { error: "tool_failed" });

  const tool = await gateway.inject({
    headers: { authorization: "Bearer managed-test-token-1234" },
    method: "POST",
    payload: { operationId: "identity-test", result: "confirmed" },
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(tool.statusCode, 200);

  const session = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: "/internal/qualification-session",
  });
  assert.equal(session.statusCode, 200);
  assert.equal(session.json().scenarioId, "standard-current-provider-reschedule");
  assert.deepEqual(session.json().toolCalls, [
    {
      name: "prepare_change",
      operationId: "prepare-before-identity",
      status: "failed",
    },
    {
      name: "verify_identity",
      operationId: "identity-test",
      status: "completed",
    },
  ]);
  await gateway.close();
});

test("does not infer hangup intent from cumulative transcript history", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "telnyx-gateway-hangup-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const hangups: Array<{ callControlId: string; commandId: string }> = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return { callControlId: "v3:hangup-call", callLegId: "leg-test", callSessionId: "session-test" };
      },
      async hangup(callControlId, commandId) {
        hangups.push({ callControlId, commandId });
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot,
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "55555555-5555-4555-8555-555555555555",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "answered");

  const scheduled: Array<{
    canceled: boolean;
    delayMs: number;
    task: () => Promise<void>;
  }> = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller,
    async preflight() {},
    scheduleHangup(delayMs, task) {
      const entry = { canceled: false, delayMs, task };
      scheduled.push(entry);
      return () => {
        entry.canceled = true;
      };
    },
    validateRequest: () => true,
  });
  const sendHistory = async (id: string, messageHistory: Array<{ content: string; role: "assistant" | "user" }>) => gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.ai_gather.message_history_updated",
        id,
        occurred_at: "2026-08-28T12:00:00.000Z",
        payload: {
          call_control_id: started.callControlId,
          message_history: messageHistory,
        },
        record_type: "event",
      },
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/telnyx/events",
  });

  const question = await sendHistory("event-question", [
    { content: "So you are going to end the call now", role: "user" },
  ]);
  assert.equal(question.statusCode, 200);
  assert.equal(scheduled.length, 0);

  const request = await sendHistory("event-request", [
    { content: "So you are going to end the call now", role: "user" },
    { content: "I can stay with you.", role: "assistant" },
    { content: "Yeah. And end the call.", role: "user" },
  ]);
  assert.equal(request.statusCode, 200);
  assert.equal(scheduled.length, 0);

  const closingReply = await sendHistory("event-closing-reply", [
    { content: "So you are going to end the call now", role: "user" },
    { content: "I can stay with you.", role: "assistant" },
    { content: "Yeah. And end the call.", role: "user" },
    { content: "Understood. I’m ending the call now. Goodbye.", role: "assistant" },
  ]);
  assert.equal(closingReply.statusCode, 200);
  assert.deepEqual(scheduled.map((entry) => entry.delayMs).sort((left, right) => left - right), [3_000, 12_000]);
  assert.deepEqual(hangups, []);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "answered");
  assert.ok(controller.evidence(started.attemptId));

  const activeTool = await gateway.inject({
    headers: {
      authorization: `Bearer ${attempts.getAttempt(started.attemptId)!.relayToken}`,
      "x-telnyx-call-control-id": started.callControlId,
    },
    method: "POST",
    payload: { operationId: "ending-identity", result: "confirmed" },
    url: "/voice-experiment/telnyx/tools/verify_identity",
  });
  assert.equal(activeTool.statusCode, 409);
  assert.equal(activeTool.json().error, "attempt_ending");

  const terminalEvent = {
    data: {
      event_type: "call.hangup",
      id: "event-terminal-hangup",
      occurred_at: "2026-08-28T12:00:01.000Z",
      payload: {
        call_control_id: started.callControlId,
        hangup_cause: "normal_clearing",
      },
      record_type: "event",
    },
  };
  const terminal = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: terminalEvent,
    query: { attempt: started.attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(terminal.statusCode, 200);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "completed");
  assert.equal(controller.evidence(started.attemptId), undefined);

  const lateDuplicate = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: { ...terminalEvent.data, id: "event-late-terminal-hangup" },
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(lateDuplicate.statusCode, 200);
  await gateway.close();
});

test("hangs up after a spoken close when no terminal scheduling tool ran", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "telnyx-gateway-spoken-close-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const hangups: string[] = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return { callControlId: "v3:spoken-close", callLegId: "leg-test", callSessionId: "session-test" };
      },
      async hangup(callControlId) {
        hangups.push(callControlId);
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot,
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "66666666-6666-4666-8666-666666666666",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "answered");

  const scheduled: Array<{ delayMs: number; task: () => Promise<void> }> = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller,
    async preflight() {},
    scheduleHangup(delayMs, task) {
      scheduled.push({ delayMs, task });
      return () => undefined;
    },
    validateRequest: () => true,
  });

  const rescheduleQuestion = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.ai_gather.message_history_updated",
        id: "event-reschedule-question",
        occurred_at: "2026-08-28T12:00:00.000Z",
        payload: {
          call_control_id: started.callControlId,
          message_history: [
            { content: "Yes, this is Olivia.", role: "user" },
            { content: "Would you like to reschedule your appointment?", role: "assistant" },
          ],
        },
        record_type: "event",
      },
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(rescheduleQuestion.statusCode, 200);
  assert.equal(scheduled.length, 0);

  const spokenClose = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.ai_gather.message_history_updated",
        id: "event-spoken-close",
        occurred_at: "2026-08-28T12:00:01.000Z",
        payload: {
          call_control_id: started.callControlId,
          message_history: [
            { content: "Yes, this is Olivia.", role: "user" },
            { content: "Would you like to reschedule your appointment?", role: "assistant" },
            { content: "No.", role: "user" },
            { content: "I could not process that. Our team will contact you.", role: "assistant" },
          ],
        },
        record_type: "event",
      },
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/telnyx/events",
  });
  assert.equal(spokenClose.statusCode, 200);
  assert.deepEqual(scheduled.map((entry) => entry.delayMs).sort((left, right) => left - right), [3_000, 12_000]);

  await scheduled.find((entry) => entry.delayMs === 3_000)?.task();
  assert.deepEqual(hangups, [started.callControlId]);
  await gateway.close();
});

test("retries an event that failed required processing before deduplicating it", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const attempt = attempts.createAttempt();
  attempts.bindProviderCallId(attempt.id, "v3:event-retry");
  attempts.updateStatus(attempt.id, "v3:event-retry", "answered");
  let recordCalls = 0;
  const recordedPayloads: Record<string, unknown>[] = [];
  const recorder: VoiceEvidenceRecorder = {
    async correlate() {},
    directory: "/tmp/not-used",
    async finalize() {
      return {
        directory: "/tmp/not-used",
        metrics: {
          greetingLatencyMs: [],
          interruptionLatencyMs: [],
          summary: {
            greetingLatencyMs: { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null },
            interruptionLatencyMs: { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null },
            toolLatencyMs: { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null },
            turnLatencyMs: { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null },
          },
          toolLatencyMs: [],
          turnLatencyMs: [],
        },
      };
    },
    async flush() {},
    async record() {},
    async recordAndWait(event: VoiceEvidenceEvent) {
      recordCalls += 1;
      if (recordCalls === 1) throw new Error("temporary evidence failure");
      recordedPayloads.push(event.payload);
    },
    async writeAudio() {},
  };
  let now = 1_000;
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => recorder,
      async finalize() {},
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    now: () => now,
    async preflight() {},
    validateRequest: () => true,
  });
  const payload = {
    data: {
      event_type: "call.ai_gather.message_history_updated",
      id: "event-retry-after-processing-error",
      occurred_at: "2026-08-28T12:00:00.000Z",
      payload: {
        call_control_id: "v3:event-retry",
        message_history: [{ content: "Please end the call.", role: "user" }],
      },
      record_type: "event",
    },
  };
  const send = () => gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload,
    query: { attempt: attempt.id },
    url: "/voice-experiment/telnyx/events",
  });

  assert.equal((await send()).statusCode, 500);
  assert.equal((await send()).statusCode, 200);
  assert.equal((await send()).statusCode, 200);
  assert.equal(recordCalls, 2);
  assert.deepEqual(
    (recordedPayloads[0]!.payload as { message_history: unknown[] }).message_history,
    [{ content: "Please end the call.", role: "user" }],
  );
  now += 10 * 60 * 1_000 + 1;
  assert.equal((await send()).statusCode, 200);
  assert.equal(recordCalls, 3);
  assert.deepEqual(
    (recordedPayloads[1]!.payload as { message_history: unknown[] }).message_history,
    [],
  );
  await gateway.close();
});

test("coalesces concurrent deliveries of one signed event", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const attempt = attempts.createAttempt();
  attempts.bindProviderCallId(attempt.id, "v3:concurrent-event");
  attempts.updateStatus(attempt.id, "v3:concurrent-event", "answered");
  let appendStarted!: () => void;
  let releaseAppend!: () => void;
  const started = new Promise<void>((resolve) => {
    appendStarted = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    releaseAppend = resolve;
  });
  let secondValidated!: () => void;
  const bothValidated = new Promise<void>((resolve) => {
    secondValidated = resolve;
  });
  let appendCount = 0;
  let validationCount = 0;
  const recorder = {
    async correlate() {},
    directory: "/tmp/not-used",
    async finalize() { throw new Error("not used"); },
    async flush() {},
    async record() {},
    async recordAndWait() {
      appendCount += 1;
      appendStarted();
      await blocked;
    },
    async writeAudio() {},
  } as VoiceEvidenceRecorder;
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => recorder,
      async finalize() {},
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    async preflight() {},
    validateRequest() {
      validationCount += 1;
      if (validationCount === 2) secondValidated();
      return true;
    },
  });
  const request = () => gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.ai_gather.message_history_updated",
        id: "event-concurrent-delivery",
        occurred_at: "2026-08-28T12:00:00.000Z",
        payload: {
          call_control_id: "v3:concurrent-event",
          message_history: [{ content: "Tuesday works.", role: "user" }],
        },
        record_type: "event",
      },
    },
    query: { attempt: attempt.id },
    url: "/voice-experiment/telnyx/events",
  });

  const first = request();
  await started;
  const duplicate = request();
  await bothValidated;
  const appendCountWhileFirstBlocked = appendCount;
  releaseAppend();
  assert.deepEqual((await Promise.all([first, duplicate])).map((reply) => reply.statusCode), [200, 200]);
  assert.equal(appendCountWhileFirstBlocked, 1);
  assert.equal(appendCount, 1);
  await gateway.close();
});

test("hangs up late signed calls after creation uncertainty or an early stop", async () => {
  for (const [index, stopBeforeEvent] of [false, true].entries()) {
    const attempts = new VoiceAttemptStore(() => Date.now(), 0);
    const hangups: Array<{ callControlId: string; commandId: string }> = [];
    const controller = createTelnyxCandidateCallController({
      attempts,
      client: {
        async dial() {
          throw new Error("Dial result timed out.");
        },
        async hangup(callControlId, commandId) {
          hangups.push({ callControlId, commandId });
        },
        async speak() {},
        async startAiAssistant() {},
      },
      config: {
        artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-late-call-")),
        assistantId: "assistant-test",
        assistantVersionId: "version-test",
        callToNumber: "+12025550111",
        callsEnabled: true,
        connectionId: "connection-test",
        demoMode: true,
        publicBaseUrl: "https://voice.example.test",
        telnyxPhoneNumber: "+12025550112",
      },
      lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
      async preflight() {},
    });
    const requestId = index === 0
      ? "91919191-9191-4191-8191-919191919191"
      : "92929292-9292-4292-8292-929292929292";
    const gateway = createTelnyxCandidateGateway({
      attempts,
      config: { internalSecret: "candidate-internal-secret-1234" },
      controller,
      async preflight() {},
      validateRequest: () => true,
    });
    const start = await gateway.inject({
      headers: {
        "x-voice-gateway-secret": "candidate-internal-secret-1234",
        "x-voice-request-id": requestId,
      },
      method: "POST",
      payload: { callContext: createVoiceCallContext() },
      url: "/internal/controlled-attempt",
    });
    assert.equal(start.statusCode, 202);
    assert.equal(start.json().attempt.transportStatus, "creation_uncertain");
    const attempt = attempts.getAttempt(start.json().attempt.id)!;
    if (stopBeforeEvent) await controller.stop(attempt.id);
    const callControlId = `v3:late-call-${index}`;

    const lateEvent = await gateway.inject({
      headers: {
        "content-type": "application/json",
        "telnyx-signature-ed25519": "test-signature",
        "telnyx-timestamp": "1787918400",
      },
      method: "POST",
      payload: {
        data: {
          event_type: "call.initiated",
          id: `event-late-call-${index}`,
          occurred_at: "2026-08-28T12:00:00.000Z",
          payload: { call_control_id: callControlId },
          record_type: "event",
        },
      },
      query: { attempt: attempt.id },
      url: "/voice-experiment/telnyx/events",
    });

    assert.equal(lateEvent.statusCode, 200);
    assert.equal(attempts.getAttempt(attempt.id)?.providerCallId, callControlId);
    assert.equal(attempts.getAttempt(attempt.id)?.transportStatus, "cancel_requested");
    assert.deepEqual(hangups, [{
      callControlId,
      commandId: `${requestId}-automatic-hangup`,
    }]);
    const inactiveTool = await gateway.inject({
      headers: {
        authorization: `Bearer ${attempt.relayToken}`,
        "x-telnyx-call-control-id": callControlId,
      },
      method: "POST",
      payload: { operationId: `identity-late-${index}`, result: "confirmed" },
      url: "/voice-experiment/telnyx/tools/verify_identity",
    });
    assert.equal(inactiveTool.statusCode, 409);
    assert.equal(inactiveTool.json().error, "attempt_inactive");
    await gateway.close();
  }
});

test("finalizes terminal resources while surfacing an evidence correlation failure", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const attempt = attempts.createAttempt();
  attempts.bindProviderCallId(attempt.id, "v3:terminal-evidence-failure");
  attempts.updateStatus(attempt.id, "v3:terminal-evidence-failure", "answered");
  let finalized = false;
  const recorder = {
    async correlate() { throw new Error("evidence correlation failed"); },
    directory: "/tmp/not-used",
    async finalize() { throw new Error("not used"); },
    async flush() {},
    async record() {},
    async recordAndWait() {},
    async writeAudio() {},
  } as VoiceEvidenceRecorder;
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => recorder,
      async finalize() { finalized = true; },
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => true,
  });

  const response = await gateway.inject({
    headers: {
      "content-type": "application/json",
      "telnyx-signature-ed25519": "test-signature",
      "telnyx-timestamp": "1787918400",
    },
    method: "POST",
    payload: {
      data: {
        event_type: "call.hangup",
        id: "event-terminal-evidence-failure",
        occurred_at: "2026-08-28T12:00:00.000Z",
        payload: {
          call_control_id: "v3:terminal-evidence-failure",
          hangup_cause: "normal_clearing",
        },
        record_type: "event",
      },
    },
    query: { attempt: attempt.id },
    url: "/voice-experiment/telnyx/events",
  });

  assert.equal(response.statusCode, 500);
  assert.equal(finalized, true);
  assert.equal(attempts.getAttempt(attempt.id)?.transportStatus, "completed");
  await gateway.close();
});

test("replays nullable optional fields from the failed hosted call through scheduling and follow-up", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: {
      internalSecret: "candidate-internal-secret-1234",
      testMode: true,
      testToolToken: "managed-test-token-1234",
    },
    controller: {
      async attachAssistant() {},
      async playOpeningGreeting() {},
      async complete() {},
      evidence: () => undefined,
      async finalize() {},
      async start() { throw new Error("not used"); },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => false,
  });


  const reset = () => gateway.inject({ method: "POST", url: "/internal/qualification-session",
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    payload: { callContext: createVoiceCallContext(), scenarioId: "nullable-provider-replay" } });
  const tool = (name: string, payload: Record<string, unknown>) => gateway.inject({ method: "POST",
    url: `/voice-experiment/telnyx/tools/${name}`,
    headers: { authorization: "Bearer managed-test-token-1234" }, payload });
  try {
    assert.equal((await reset()).statusCode, 204);
    assert.equal((await tool("verify_identity", { operationId: "verify-001", result: "confirmed" })).statusCode, 200);
    const slots = await tool("find_slots", { clearConstraints: null, dateFrom: null, dateTo: null,
      excludedWeekdays: null, limit: 3, minimumDaysEarlier: null, mode: "search", operationId: "slots-001",
      provider: "same", timeFrom: null, timeTo: null });
    assert.equal(slots.statusCode, 200, slots.body);
    assert.equal(slots.json().slots.length, 3);
    const prepared = await tool("prepare_change", { kind: "reschedule", operationId: "prepare-001", slotId: slots.json().slots[0].id });
    assert.equal(prepared.statusCode, 200);
    const committed = await tool("commit_change", { actionToken: prepared.json().actionToken, confirmed: true, operationId: "commit-001" });
    assert.equal(committed.json().type, "change_committed");
    await reset();
    const followUp = await tool("request_staff_follow_up", { callback: null, operationId: "staff-001", reason: "tool_failure" });
    assert.equal(followUp.statusCode, 200, followUp.body);
    assert.equal(followUp.json().type, "staff_follow_up_recorded");
    await reset();
    await tool("verify_identity", { operationId: "cancel-id", result: "confirmed" });
    const cancel = await tool("prepare_change", { kind: "cancellation", operationId: "cancel-prepare", slotId: null });
    assert.equal(cancel.statusCode, 200, cancel.body);
    assert.equal((await tool("commit_change", { actionToken: cancel.json().actionToken, operationId: "cancel-unconfirmed", confirmed: null })).statusCode, 400);
    const cancelled = await tool("commit_change", { actionToken: cancel.json().actionToken, operationId: "cancel-confirmed", confirmed: true });
    assert.equal(cancelled.json().result.kind, "canceled");
    await reset();
    const callback = await tool("request_staff_follow_up", { reason: "caller_request", operationId: "callback-exact", callback: {
      confirmed: true, date: addVoiceCalendarDays(voiceLocalDateIso(new Date()), 1), time: "15:00", timeEnd: null, timeZone: "America/New_York",
    } });
    assert.equal(callback.statusCode, 200, callback.body);
    await reset();
    assert.equal((await tool("verify_identity", { operationId: null, result: "confirmed" })).statusCode, 400);
  } finally { await gateway.close(); }
});

test("ends a call after repeated rejected tool requests even without a native hangup", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "telnyx-gateway-hangup-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const hangups: Array<{ callControlId: string; commandId: string }> = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return { callControlId: "v3:hangup-call", callLegId: "leg-test", callSessionId: "session-test" };
      },
      async hangup(callControlId, commandId) {
        hangups.push({ callControlId, commandId });
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot,
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "55555555-5555-4555-8555-555555555555",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "answered");

  const scheduled: Array<{
    canceled: boolean;
    delayMs: number;
    task: () => Promise<void>;
  }> = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller,
    async preflight() {},
    scheduleHangup(delayMs, task) {
      const entry = { canceled: false, delayMs, task };
      scheduled.push(entry);
      return () => {
        entry.canceled = true;
      };
    },
    validateRequest: () => true,
  });

  try {
    const tool = () => gateway.inject({ method: "POST", url: "/voice-experiment/telnyx/tools/find_slots",
      headers: { authorization: `Bearer ${attempts.getAttempt(started.attemptId)!.relayToken}`, "x-telnyx-call-control-id": started.callControlId },
      payload: { operationId: "broken-search", provider: "not-a-provider" } });
    assert.equal((await tool()).statusCode, 400);
    assert.equal(scheduled.length, 0);
    const repeated = await tool();
    assert.equal(repeated.statusCode, 400);
    assert.equal(repeated.json().terminal, true);
    assert.equal(scheduled.length, 1);
    await scheduled[0]!.task();
    assert.equal(hangups.length, 1);
  } finally {
    await gateway.close();
    await controller.finalize(started.attemptId);
  }
});


test("recognizes the final clinic goodbye without interpreting quoted questions as a closing", () => {
  assert.equal(isTelnyxTerminalAssistantClosing("Thank you for your time with Brightview Dental. Goodbye."), true);
  assert.equal(isTelnyxTerminalAssistantClosing("Did you say goodbye?"), false);
  assert.equal(isTelnyxTerminalAssistantClosing("I can check another dentist. Would that help?"), false);
});
