import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import { MemoryControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import { createTelnyxCandidateCallController } from "./telnyx-call-controller";
import { createTelnyxCandidateGateway } from "./telnyx-candidate-gateway";

test("exposes dashboard, signed event, and deterministic tool routes", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "telnyx-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return { callControlId: "v3:test-call", callLegId: "leg-test", callSessionId: "session-test" };
      },
      async hangup() {},
    },
    config: {
      artifactsRoot,
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      connectionId: "connection-test",
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const signedBodies: string[] = [];
  const gateway = createTelnyxCandidateGateway({
    attempts,
    config: { internalSecret: "candidate-internal-secret-1234" },
    controller,
    async preflight() {},
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
    controller: { evidence: () => undefined, async start() { throw new Error("not used"); }, async stop() {} },
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
    controller: { evidence: () => undefined, async start() { throw new Error("not used"); }, async stop() {} },
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
  assert.deepEqual(session.json().toolCalls, [{
    name: "verify_identity",
    operationId: "identity-test",
    status: "completed",
  }]);
  await gateway.close();
});
