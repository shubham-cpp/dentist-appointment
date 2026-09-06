import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { MemoryControlledCallLease } from "@/voice-core/controlled-call-lease";
import { createTwilioCandidateCallController } from "./twilio-call-controller";
import { createTwilioCandidateGateway } from "./twilio-candidate-gateway";

async function waitFor(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

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
      callsEnabled: true,
      demoMode: true,
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
  await controller.evidence(attempt.id)?.flush();
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
      async finalize() {},
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

test("does not expose provider errors through the internal start route", async () => {
  const gateway = createTwilioCandidateGateway({
    attempts: new VoiceAttemptStore(() => Date.now(), 0),
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
      async finalize() {},
      async start() {
        throw new Error("provider response included a sensitive diagnostic");
      },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => true,
  });

  const response = await gateway.inject({
    headers: {
      "x-voice-gateway-secret": "candidate-internal-secret-1234",
      "x-voice-request-id": "55555555-5555-4555-8555-555555555555",
    },
    method: "POST",
    payload: { callContext: createVoiceCallContext() },
    url: "/internal/controlled-attempt",
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "twilio_candidate_unavailable" });
  await gateway.close();
});

test("a signed terminal callback finalizes evidence and releases the call lease", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const memoryLease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  let releaseCount = 0;
  const lease = {
    acquire: (ownerId: string) => memoryLease.acquire(ownerId),
    cancel: (ownerId: string) => memoryLease.cancel(ownerId),
    async release(ownerId: string) {
      releaseCount += 1;
      await memoryLease.release(ownerId);
    },
    replaceOwner: (currentOwnerId: string, nextOwnerId: string) => (
      memoryLease.replaceOwner(currentOwnerId, nextOwnerId)
    ),
  };
  const providerCallId = `CA${"7".repeat(32)}`;
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall() {
        return { sid: providerCallId };
      },
      async stopCall() {},
    },
    config: {
      aiModel: "gpt-5.6-luna-fast",
      artifactsRoot,
      callToNumber: "+12025550111",
      callsEnabled: true,
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      twilioPhoneNumber: "+12025550112",
    },
    lease,
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
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "77777777-7777-4777-8777-777777777777",
  });

  const terminal = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: {
      CallSid: providerCallId,
      CallStatus: "completed",
      SequenceNumber: "1",
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/twilio/status",
  });

  assert.equal(terminal.statusCode, 204);
  assert.equal(controller.evidence(started.attemptId), undefined);
  await assert.rejects(memoryLease.acquire("next-attempt"), /Wait four minutes/);

  const duplicate = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: {
      CallSid: providerCallId,
      CallStatus: "completed",
      SequenceNumber: "1",
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/twilio/status",
  });

  assert.equal(duplicate.statusCode, 204);
  assert.equal(releaseCount, 1);
  await gateway.close();
});

test("a manual stop keeps the lease until Twilio confirms the terminal state", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const lease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const providerCallId = `CA${"8".repeat(32)}`;
  const stoppedCallIds: string[] = [];
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall() {
        return { sid: providerCallId };
      },
      async stopCall(callId) {
        stoppedCallIds.push(callId);
      },
    },
    config: {
      aiModel: "gpt-5.6-luna-fast",
      artifactsRoot,
      callToNumber: "+12025550111",
      callsEnabled: true,
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      twilioPhoneNumber: "+12025550112",
    },
    lease,
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
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "88888888-8888-4888-8888-888888888888",
  });

  const stop = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "POST",
    url: `/internal/controlled-attempt/${started.attemptId}/stop`,
  });

  assert.equal(stop.statusCode, 200);
  assert.deepEqual(stoppedCallIds, [providerCallId]);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "cancel_requested");
  assert.ok(controller.evidence(started.attemptId));
  await assert.rejects(lease.acquire("next-attempt"), /may still be active/);

  const terminal = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: {
      CallSid: providerCallId,
      CallStatus: "completed",
      SequenceNumber: "1",
    },
    query: { attempt: started.attemptId },
    url: "/voice-experiment/twilio/status",
  });

  assert.equal(terminal.statusCode, 204);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "canceled");
  assert.equal(controller.evidence(started.attemptId), undefined);
  await assert.rejects(lease.acquire("next-attempt"), /Wait four minutes/);
  await gateway.close();
});

test("hangs up a late candidate call after staff stops an uncertain Dial", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-gateway-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const lease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const providerCallId = `CA${"9".repeat(32)}`;
  const stoppedCallIds: string[] = [];
  let createCount = 0;
  const controller = createTwilioCandidateCallController({
    attempts,
    callCreationTimeoutMs: 1,
    client: {
      createCall() {
        createCount += 1;
        return new Promise<{ sid: string }>(() => undefined);
      },
      async stopCall(callId) {
        stoppedCallIds.push(callId);
      },
    },
    config: {
      aiModel: "gpt-5.6-luna-fast",
      artifactsRoot,
      callToNumber: "+12025550111",
      callsEnabled: true,
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      twilioPhoneNumber: "+12025550112",
    },
    lease,
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
  const requestId = "99999999-9999-4999-8999-999999999999";

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
  const attempt = attempts.getViewByRequestId(requestId);
  assert.ok(attempt);
  assert.equal(attempt.transportStatus, "creation_uncertain");
  assert.equal(start.json().attempt.id, attempt.id);
  assert.equal(start.json().attempt.transportStatus, "creation_uncertain");

  const stop = await gateway.inject({
    headers: { "x-voice-gateway-secret": "candidate-internal-secret-1234" },
    method: "POST",
    url: `/internal/controlled-attempt/${attempt.id}/stop`,
  });
  assert.equal(stop.statusCode, 200);
  assert.equal(attempts.getView(attempt.id)?.transportStatus, "cancel_requested");
  assert.deepEqual(stoppedCallIds, []);

  const twiml = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: { CallSid: providerCallId },
    query: { attempt: attempt.id },
    url: "/voice-experiment/twilio/twiml",
  });
  assert.equal(twiml.statusCode, 200);
  assert.match(twiml.body, /<Hangup\s*\/>/);
  assert.doesNotMatch(twiml.body, /<ConversationRelay/);
  assert.deepEqual(stoppedCallIds, [providerCallId]);

  const duplicateTwiml = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: { CallSid: providerCallId },
    query: { attempt: attempt.id },
    url: "/voice-experiment/twilio/twiml",
  });
  assert.equal(duplicateTwiml.statusCode, 200);
  assert.match(duplicateTwiml.body, /<Hangup\s*\/>/);
  assert.deepEqual(stoppedCallIds, [providerCallId]);
  assert.equal(createCount, 1);
  await assert.rejects(lease.acquire("next-before-terminal"), /may still be active/);

  const terminal = await gateway.inject({
    headers: { "x-twilio-signature": "test-signature" },
    method: "POST",
    payload: {
      CallSid: providerCallId,
      CallStatus: "completed",
      SequenceNumber: "1",
    },
    query: { attempt: attempt.id },
    url: "/voice-experiment/twilio/status",
  });
  assert.equal(terminal.statusCode, 204);
  assert.equal(attempts.getView(attempt.id)?.transportStatus, "canceled");
  await assert.rejects(lease.acquire("next-after-terminal"), /Wait four minutes/);
  await gateway.close();
});

test("processes an interrupt immediately and coalesces queued partial prompts", async (t) => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const attempt = attempts.createAttempt("44444444-4444-4444-8444-444444444444", createVoiceCallContext());
  const callSid = `CA${"5".repeat(32)}`;
  attempts.bindProviderCallId(attempt.id, callSid);
  const eventTypes: string[] = [];
  const partialTexts: string[] = [];
  let releasePlayback: (() => void) | undefined;
  let playbackStarted = false;
  const recorder = {
    async correlate() {},
    async record(event: { payload: Record<string, unknown>; type: string }) {
      eventTypes.push(event.type);
      if (event.type === "transcript.partial") {
        partialTexts.push(String(event.payload.voicePrompt));
      }
      if (event.type === "relay.tokens_played") {
        playbackStarted = true;
        await new Promise<void>((resolve) => {
          releasePlayback = resolve;
        });
      }
    },
  };
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
        return recorder as never;
      },
      async finalize() {},
      async start() {
        throw new Error("not used");
      },
      async stop() {},
    },
    async preflight() {},
    validateRequest: () => true,
  });
  await gateway.ready();
  const socket = await gateway.injectWS(`/voice-experiment/twilio/relay?attempt=${attempt.id}`, {
    headers: { "x-twilio-signature": "test-signature" },
  });
  t.after(() => {
    socket.terminate();
    return gateway.close();
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: `VX${"6".repeat(32)}`,
    type: "setup",
  }));
  await waitFor(() => eventTypes.includes("relay.setup"), "Relay setup was not processed.");
  socket.send(JSON.stringify({ type: "tokens-played" }));
  await waitFor(() => playbackStarted, "Playback processing did not start.");
  socket.send(JSON.stringify({ last: false, type: "prompt", voicePrompt: "Can you" }));
  socket.send(JSON.stringify({ last: false, type: "prompt", voicePrompt: "Can you move it" }));
  socket.send(JSON.stringify({
    durationUntilInterruptMs: 50,
    type: "interrupt",
    utteranceUntilInterrupt: "The first",
  }));

  await waitFor(
    () => eventTypes.includes("relay.interrupt"),
    "The interrupt waited for queued playback processing.",
  );
  const partialTextsBeforeRelease = [...partialTexts];
  releasePlayback?.();
  await waitFor(() => partialTexts.length >= 1, "The queued partial prompt was not processed.");
  assert.deepEqual(partialTextsBeforeRelease, []);
  assert.deepEqual(partialTexts, ["Can you move it"]);
});
