import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import { MemoryControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import { createTwilioCandidateCallController } from "./twilio-call-controller";
import { createTwilioCandidateGateway } from "./twilio-candidate-gateway";

test("exposes dashboard-compatible start and TwiML routes without a real call", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const createdRequests: unknown[] = [];
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall(request) {
        createdRequests.push(request);
        return { sid: `CA${"3".repeat(32)}` };
      },
      async stopCall() {},
    },
    config: {
      aiModel: "gpt-5.6-luna-fast",
      artifactsRoot,
      callToNumber: "+12025550111",
      publicBaseUrl: "https://voice.example.test",
      twilioPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const gateway = createTwilioCandidateGateway({
    attempts,
    config: {
      aiApiKey: "local-placeholder",
      aiBaseUrl: "http://127.0.0.1:18765/v1",
      aiModel: "gpt-5.6-luna-fast",
      internalSecret: "candidate-internal-secret-1234",
      publicBaseUrl: "https://voice.example.test",
    },
    controller,
    async preflight() {},
    validateRequest: () => true,
  });

  const unauthorized = await gateway.inject({
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  assert.equal(unauthorized.statusCode, 401);

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
  assert.equal(createdRequests.length, 1);
  const attempt = start.json().attempt as { id: string };

  const recovered = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: "/internal/controlled-attempt/by-request/33333333-3333-4333-8333-333333333333",
  });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.json().attempt.id, attempt.id);

  const twiml = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: { CallSid: `CA${"3".repeat(32)}` },
    query: { attempt: attempt.id },
    url: "/voice-experiment/twilio/twiml",
  });
  assert.equal(twiml.statusCode, 200);
  assert.match(twiml.body, /<ConversationRelay/);
  assert.match(twiml.body, /speechModel="flux"/);

  const recording = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: {
      CallSid: `CA${"3".repeat(32)}`,
      RecordingChannels: "2",
      RecordingDuration: "18",
      RecordingSid: `RE${"4".repeat(32)}`,
      RecordingStatus: "completed",
      RecordingUrl: `https://api.twilio.test/Recordings/RE${"4".repeat(32)}`,
    },
    query: { attempt: attempt.id },
    url: "/voice-experiment/twilio/recording",
  });
  assert.equal(recording.statusCode, 204);
  const events = await readFile(join(artifactsRoot, attempt.id, "events.jsonl"), "utf8");
  assert.match(events, /recording\.completed/);
  assert.match(events, /twilio-recording-callback/);

  await gateway.close();
});

test("blocks the internal preflight route when qualification fails", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const gateway = createTwilioCandidateGateway({
    attempts,
    config: {
      aiApiKey: "local-placeholder",
      aiBaseUrl: "http://127.0.0.1:18765/v1",
      aiModel: "gpt-5.6-luna-fast",
      internalSecret: "candidate-internal-secret-1234",
      publicBaseUrl: "https://voice.example.test",
    },
    controller: {
      evidence() {
        return undefined;
      },
      async start() {
        throw new Error("not used");
      },
      async stop() {},
    },
    async preflight() {
      throw new Error("voice unavailable");
    },
    validateRequest: () => true,
  });

  const response = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "GET",
    url: "/internal/preflight",
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "twilio_candidate_unavailable" });

  await gateway.close();
});
