import assert from "node:assert/strict";
import test from "node:test";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { MemoryControlledCallLease, type ControlledCallLease } from "@/voice-core/controlled-call-lease";
import type { VoiceIntent } from "./conversation";
import { loadVoiceGatewayConfig } from "./config";
import type { VoiceIntentClassifier } from "./intent-classifier";
import { createVoiceGatewayRuntime } from "./server";

const callSid = `CA${"1".repeat(32)}`;
const relaySessionId = `VX${"2".repeat(32)}`;
const requestId = "11111111-1111-4111-8111-111111111111";

function voiceIntent(intent: VoiceIntent["intent"], slotId = ""): VoiceIntent {
  return { intent, requestedDate: "", slotId, timePreference: "" };
}

async function waitFor(condition: () => boolean, failureMessage: string) {
  for (let retry = 0; retry < 100; retry += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(failureMessage);
}

const validEnvironment = {
  CALL_TO_NUMBER: "+919876543210",
  TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "test-auth-token",
  TWILIO_PHONE_NUMBER: "+14423790846",
  VOICE_CALLS_ENABLED: "true",
  VOICE_DEMO_MODE: "true",
  VOICE_GATEWAY_INTERNAL_SECRET: "a-controlled-demo-secret-value",
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice-demo.example.test",
  VOICE_LANGUAGE: "en-IN",
  VOICE_SPEECH_MODEL: "long",
  VOICE_TRANSCRIPTION_PROVIDER: "Google",
  VOICE_TTS_PROVIDER: "ElevenLabs",
  VOICE_TTS_VOICE: "mCQMfsqGDT6IDkEKR20a",
};

function createScriptedClassifier(intents: VoiceIntent[] = [
  voiceIntent("unknown"),
]): VoiceIntentClassifier {
  let intentIndex = 0;
  return {
    async checkReady() {},
    async classify() {
      const intent = intents[Math.min(intentIndex, intents.length - 1)];
      intentIndex += 1;
      return intent;
    },
  };
}

function createTestGateway(options: {
  callerReplyTimeoutMs?: number;
  callerReplyRetryTimeoutMs?: number;
  classifier?: VoiceIntentClassifier;
  controlledCallLease?: ControlledCallLease;
  createFails?: boolean;
  createNeverSettles?: boolean;
  dialTimeoutMs?: number;
  partialPromptFinalizationMs?: number;
  shutdownStopTimeoutMs?: number;
  terminalPlaybackTimeoutMs?: number;
  updateNeverSettles?: boolean;
  updateFails?: boolean;
  validateRequest?: (signature: string, url: string, params: Record<string, string>) => boolean;
} = {}) {
  const requests: unknown[] = [];
  const updates: string[] = [];
  const client = {
    calls: Object.assign(
      (sid: string) => ({
        update: async () => {
          if (options.updateFails) throw new Error("Twilio update failed");
          if (options.updateNeverSettles) await new Promise<void>(() => {});
          updates.push(sid);
        },
      }),
      {
        create: async (request: unknown) => {
          requests.push(request);
          if (options.createFails) throw new Error("Twilio create result is uncertain");
          if (options.createNeverSettles) await new Promise<void>(() => {});
          return { sid: callSid };
        },
      },
    ),
  };
  const config = loadVoiceGatewayConfig(validEnvironment);
  const attempts = new VoiceAttemptStore(() => 1_000, 0);
  const { app, close } = createVoiceGatewayRuntime(config, {
    attempts,
    createTwilioClient: () => client as never,
    callerReplyTimeoutMs: options.callerReplyTimeoutMs,
    callerReplyRetryTimeoutMs: options.callerReplyRetryTimeoutMs,
    controlledCallLease: options.controlledCallLease ?? new MemoryControlledCallLease(),
    dialTimeoutMs: options.dialTimeoutMs,
    intentClassifier: options.classifier ?? createScriptedClassifier(),
    partialPromptFinalizationMs: options.partialPromptFinalizationMs,
    shutdownStopTimeoutMs: options.shutdownStopTimeoutMs,
    terminalPlaybackTimeoutMs: options.terminalPlaybackTimeoutMs,
    validateRequest: options.validateRequest ?? (() => true),
  });

  return { app, attempts, close, config, requests, updates };
}

test("validates Relay WebSocket signatures against the WSS endpoint", async (t) => {
  const validatedUrls: string[] = [];
  const { app } = createTestGateway({
    validateRequest(_signature, url) {
      validatedUrls.push(url);
      return true;
    },
  });
  t.after(() => app.close());

  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());

  await waitFor(
    () => validatedUrls.length === 1,
    "The WebSocket handshake did not reach Twilio signature validation.",
  );
  assert.equal(validatedUrls[0], "wss://voice-demo.example.test/twilio/relay");
});

test("does not expose the controlled call start without the internal secret", async (t) => {
  const { app } = createTestGateway();
  t.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/internal/controlled-attempt" });
  assert.equal(response.statusCode, 401);
});

test("checks the dashboard gateway secret without starting a call", async (t) => {
  const { app, attempts, requests } = createTestGateway();
  t.after(() => app.close());

  const unauthorized = await app.inject({ method: "GET", url: "/internal/preflight" });
  const authorized = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "GET",
    url: "/internal/preflight",
  });

  assert.equal(unauthorized.statusCode, 401);
  assert.equal(authorized.statusCode, 200);
  assert.deepEqual(authorized.json(), {
    processInstanceId: attempts.processInstanceId,
    status: "ok",
  });
  assert.equal(requests.length, 0);
});

test("checks the local intent classifier during preflight without starting a call", async (t) => {
  let readinessChecks = 0;
  const classifier: VoiceIntentClassifier = {
    async checkReady() {
      readinessChecks += 1;
    },
    async classify() {
      return voiceIntent("unknown");
    },
  };
  const { app, requests } = createTestGateway({ classifier });
  t.after(() => app.close());

  const response = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "GET",
    url: "/internal/preflight",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(readinessChecks, 1);
  assert.equal(requests.length, 0);
});

test("fails preflight safely when the local intent classifier is unavailable", async (t) => {
  const classifier: VoiceIntentClassifier = {
    async checkReady() {
      throw new Error("Local proxy is unavailable");
    },
    async classify() {
      return voiceIntent("unknown");
    },
  };
  const { app, requests } = createTestGateway({ classifier });
  t.after(() => app.close());

  const response = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "GET",
    url: "/internal/preflight",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(requests.length, 0);
});

test("checks the call safety policy again before the baseline Dial", async (t) => {
  const { app, attempts, config, requests } = createTestGateway();
  t.after(() => app.close());
  (config as unknown as { callsEnabled: boolean }).callsEnabled = false;

  const response = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "voice_calls_disabled" });
  assert.equal(requests.length, 0);
  assert.equal(attempts.getViewByRequestId(requestId)?.transportStatus, "failed");
});

test("completes one fixed-destination ConversationRelay canary", async (t) => {
  const { app, attempts, requests } = createTestGateway();
  t.after(() => app.close());

  const startResponse = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  assert.equal(startResponse.statusCode, 201);
  assert.equal((requests[0] as { to: string }).to, validEnvironment.CALL_TO_NUMBER);

  const attemptId = (startResponse.json() as { attempt: { id: string } }).attempt.id;
  const twimlResponse = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}`,
    url: `/twilio/voice?attempt=${attemptId}`,
  });

  assert.equal(twimlResponse.statusCode, 200);
  assert.match(twimlResponse.body, /<ConversationRelay/);
  assert.match(twimlResponse.body, /language="en-IN"/);
  assert.match(twimlResponse.body, /events="tokens-played"/);
  assert.match(twimlResponse.body, /partialPrompts="true"/);
  assert.match(twimlResponse.body, /welcomeGreetingInterruptible="any"/);
  assert.match(twimlResponse.body, /reportInputDuringAgentSpeech="speech"/);
  assert.match(twimlResponse.body, /Am I speaking with Olivia Garcia\?/);
  assert.match(twimlResponse.body, /wss:\/\/voice-demo\.example\.test\/twilio\/relay/);

  const attempt = attempts.getAttempt(attemptId);
  assert.ok(attempt);
  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());

  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  async function waitForOutboundCount(count: number) {
    await waitFor(
      () => outboundMessages.length >= count,
      `Expected ${count} Relay messages, received ${outboundMessages.length}.`,
    );
  }

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({
    last: true,
    type: "prompt",
    voicePrompt: "Yes, this is Olivia.",
  }));
  await waitForOutboundCount(1);
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({
    last: true,
    type: "prompt",
    voicePrompt: "Yes.",
  }));
  await waitForOutboundCount(2);
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({
    last: true,
    type: "prompt",
    voicePrompt: "Keep the same dentist.",
  }));
  await waitForOutboundCount(3);
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({
    last: true,
    type: "prompt",
    voicePrompt: "The first option.",
  }));
  await waitForOutboundCount(4);
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({
    last: true,
    type: "prompt",
    voicePrompt: "Yes.",
  }));
  await waitForOutboundCount(5);
  socket.send(JSON.stringify({ type: "tokens-played" }));
  await waitForOutboundCount(6);

  const spoken = outboundMessages.slice(0, 5) as Array<{ token: string }>;
  assert.match(spoken[0]!.token, /Is now a good time/);
  assert.match(spoken[1]!.token, /Dr Aisha Patel is unavailable/);
  assert.match(spoken[2]!.token, /I have 3 available times/);
  assert.match(spoken[3]!.token, /To confirm, I will move your crown fitting/);
  assert.match(spoken[4]!.token, /Your appointment has been moved/);
  assert.deepEqual(outboundMessages[5], { type: "end" });

  const completionResponse = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=completed`,
    url: `/twilio/relay-complete?attempt=${attemptId}`,
  });
  assert.equal(completionResponse.statusCode, 200);
  assert.match(completionResponse.body, /<Hangup\/>/);
  assert.equal(attempts.getView(attemptId)?.sessionStatus, "closed");
  assert.equal(attempts.getView(attemptId)?.outcome, "rescheduled");
  assert.equal(attempts.getView(attemptId)?.result?.kind, "rescheduled");
  socket.terminate();
});

test("does not create a billable call when the local intent classifier is unavailable", async (t) => {
  const classifier: VoiceIntentClassifier = {
    async checkReady() {
      throw new Error("Local proxy is unavailable");
    },
    async classify() {
      return voiceIntent("unknown");
    },
  };
  const { app, requests } = createTestGateway({ classifier });
  t.after(() => app.close());

  const response = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(requests.length, 0);
});

test("does not start a second controlled call after a gateway restart", async (t) => {
  const controlledCallLease = new MemoryControlledCallLease();
  const firstGateway = createTestGateway({ controlledCallLease });
  const restartedGateway = createTestGateway({ controlledCallLease });
  t.after(() => firstGateway.app.close());
  t.after(() => restartedGateway.app.close());

  const firstResponse = await firstGateway.app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  assert.equal(firstResponse.statusCode, 201);

  const restartedResponse = await restartedGateway.app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": "22222222-2222-4222-8222-222222222222",
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });

  assert.equal(restartedResponse.statusCode, 409);
  assert.equal(restartedGateway.requests.length, 0);
});

test("returns the redacted active call after a dashboard refresh", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  const response = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "GET",
    url: "/internal/controlled-attempt/current",
  });

  assert.equal(response.statusCode, 200);
  assert.equal((response.json() as { attempt: { id: string } }).attempt.id, attempt.id);
});

test("returns no active call after the controlled call ends", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  attempts.updateStatus(attempt.id, callSid, "completed");

  const response = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "GET",
    url: "/internal/controlled-attempt/current",
  });

  assert.equal(response.statusCode, 404);
});

test("acknowledges a signed failed Relay completion before setup", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const startResponse = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  const attemptId = (startResponse.json() as { attempt: { id: string } }).attempt.id;

  const completionResponse = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=failed`,
    url: `/twilio/relay-complete?attempt=${attemptId}`,
  });

  assert.equal(completionResponse.statusCode, 200);
  assert.match(completionResponse.body, /<Hangup\/>/);
  assert.equal(attempts.getView(attemptId)?.sessionStatus, "closed");
  assert.equal(attempts.getView(attemptId)?.outcome, "failed");
});

test("waits for Twilio playback confirmation before ending a terminal reply", async (t) => {
  const { app, attempts } = createTestGateway({
    classifier: createScriptedClassifier([voiceIntent("decline")]),
  });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ last: true, type: "prompt", voicePrompt: "No." }));
  await waitFor(() => outboundMessages.length === 1, "The terminal reply was not sent.");
  assert.deepEqual(outboundMessages[0], {
    interruptible: true,
    last: true,
    token: "Thank you. Please ask the intended patient to contact Brightview Dental. Goodbye.",
    type: "text",
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(outboundMessages.length, 1);
  assert.equal(attempts.getView(attempt.id)?.outcome, "none");

  socket.send(JSON.stringify({ type: "tokens-played" }));
  await waitFor(() => outboundMessages.length === 2, "The Relay session did not end after playback confirmation.");

  assert.deepEqual(outboundMessages[1], { type: "end" });
  assert.equal(attempts.getView(attempt.id)?.outcome, "identity_failed");
});

test("records an unknown outcome when final playback is not confirmed", async (t) => {
  const { app, attempts } = createTestGateway({
    classifier: createScriptedClassifier([voiceIntent("decline")]),
    terminalPlaybackTimeoutMs: 1,
  });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ last: true, type: "prompt", voicePrompt: "No." }));
  await waitFor(() => outboundMessages.length === 2, "The timeout did not end the Relay session.");

  assert.deepEqual(outboundMessages[1], { type: "end" });
  assert.equal(attempts.getView(attempt.id)?.outcome, "unknown");
});

test("uses Twilio's fallback when the caller interrupts a terminal reply", async (t) => {
  const { app, attempts } = createTestGateway({
    classifier: createScriptedClassifier([voiceIntent("decline")]),
  });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ last: true, type: "prompt", voicePrompt: "No." }));
  await waitFor(() => outboundMessages.length === 1, "The terminal reply was not sent.");
  socket.send(JSON.stringify({
    durationUntilInterruptMs: 10,
    type: "interrupt",
    utteranceUntilInterrupt: "Understood.",
  }));
  await waitFor(() => outboundMessages.length === 2, "The interrupted Relay did not end.");
  socket.send(JSON.stringify({
    durationUntilInterruptMs: 10,
    type: "interrupt",
    utteranceUntilInterrupt: "Please stop.",
  }));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(outboundMessages, [
    {
      interruptible: true,
      last: true,
      token: "Thank you. Please ask the intended patient to contact Brightview Dental. Goodbye.",
      type: "text",
    },
    { type: "end" },
  ]);
  assert.equal(attempts.getView(attempt.id)?.outcome, "staff_follow_up");

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=ended`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<Say>Our team will contact you\. Goodbye\.<\/Say>/);
});

test("ends a Relay session safely after an error and asks Twilio for a fallback message", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "connected",
    "The Relay session was not connected.",
  );
  socket.send(JSON.stringify({ description: "TTS failed", type: "error" }));
  socket.send(JSON.stringify({ description: "TTS failed again", type: "error" }));
  await waitFor(() => outboundMessages.length === 1, "The Relay error did not end the session.");

  assert.deepEqual(outboundMessages, [{ type: "end" }]);
  assert.equal(attempts.getView(attempt.id)?.outcome, "staff_follow_up");
  assert.equal(
    attempts.getView(attempt.id)?.events.filter((event) => event.label === "Voice service reported an error").length,
    1,
  );

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=ended`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<Say>Our team will contact you\. Goodbye\.<\/Say>/);
  assert.match(response.body, /<Hangup\/>/);
});

test("retries once and ends safely when no final caller prompt arrives", async (t) => {
  const { app, attempts } = createTestGateway({
    callerReplyRetryTimeoutMs: 10,
    callerReplyTimeoutMs: 10,
  });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ type: "tokens-played" }));
  await waitFor(() => outboundMessages.length === 1, "The caller-input retry was not sent.");
  socket.send(JSON.stringify({ type: "tokens-played" }));
  await waitFor(() => outboundMessages.length === 2, "The caller-input timeout did not complete safely.");

  assert.deepEqual(outboundMessages, [
    {
      interruptible: true,
      last: true,
      token: "I did not hear a response. Hello. This is Brightview Dental. Am I speaking with Olivia Garcia?",
      type: "text",
    },
    { type: "end" },
  ]);
  assert.equal(attempts.getView(attempt.id)?.outcome, "staff_follow_up");
  assert.ok(
    attempts.getView(attempt.id)?.events.some((event) => event.label === "No caller reply received"),
  );
});

test("recovers a clear affirmative partial prompt when no final prompt arrives", async (t) => {
  const { app, attempts } = createTestGateway({
    callerReplyRetryTimeoutMs: 100,
    callerReplyTimeoutMs: 100,
    partialPromptFinalizationMs: 10,
  });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ type: "tokens-played" }));
  socket.send(JSON.stringify({ last: false, type: "prompt", voicePrompt: "Yes" }));
  await waitFor(() => outboundMessages.length === 1, "The clear partial prompt was not processed.");

  assert.deepEqual(outboundMessages[0], {
    interruptible: true,
    last: true,
    token: "Thank you. Is now a good time to choose a new appointment time?",
    type: "text",
  });
  assert.notEqual(attempts.getView(attempt.id)?.outcome, "staff_follow_up");
});

test("marks an unexpected Relay disconnection as unknown", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "connected",
    "The Relay session was not connected.",
  );
  socket.terminate();
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "closed",
    "The Relay disconnection was not recorded.",
  );

  assert.equal(attempts.getView(attempt.id)?.outcome, "unknown");
});

test("lets a failed Relay callback replace an unknown disconnect outcome", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  await app.ready();

  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "connected",
    "The Relay session was not connected.",
  );
  socket.terminate();
  await waitFor(
    () => attempts.getView(attempt.id)?.outcome === "unknown",
    "The Relay disconnection was not recorded.",
  );

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=failed`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(attempts.getView(attempt.id)?.outcome, "failed");
});

test("does not run an AI readiness request when the call limit rejects the start", async (t) => {
  let readinessChecks = 0;
  const classifier: VoiceIntentClassifier = {
    async checkReady() {
      readinessChecks += 1;
    },
    async classify() {
      return voiceIntent("unknown");
    },
  };
  const { app, attempts } = createTestGateway({ classifier });
  t.after(() => app.close());
  attempts.createAttempt("22222222-2222-4222-8222-222222222222");

  const response = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(readinessChecks, 0);
});

test("does not speak or record an AI result after staff stops the call", async (t) => {
  let classificationStarted = false;
  let resolveClassification: ((intent: VoiceIntent) => void) | undefined;
  const classifier: VoiceIntentClassifier = {
    async checkReady() {},
    classify() {
      classificationStarted = true;
      return new Promise((resolve) => {
        resolveClassification = resolve;
      });
    },
  };
  const { app, attempts } = createTestGateway({ classifier });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });
  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ last: true, type: "prompt", voicePrompt: "I suppose that depends." }));
  await waitFor(() => classificationStarted, "The classifier did not receive the Relay prompt.");

  const stopResponse = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "POST",
    url: `/internal/controlled-attempt/${attempt.id}/stop`,
  });
  resolveClassification?.(voiceIntent("identity_confirmed"));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(stopResponse.statusCode, 200);
  assert.deepEqual(outboundMessages, []);
  assert.equal(attempts.getView(attempt.id)?.transportStatus, "cancel_requested");
  assert.equal(attempts.getView(attempt.id)?.outcome, "none");

  const terminal = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&CallStatus=completed&SequenceNumber=1`,
    url: `/twilio/status?attempt=${attempt.id}`,
  });
  assert.equal(terminal.statusCode, 204);
  assert.equal(attempts.getView(attempt.id)?.transportStatus, "canceled");
  assert.equal(attempts.getView(attempt.id)?.outcome, "failed");
  socket.terminate();
});

test("does not send a delayed AI reply after the Relay WebSocket closes", async (t) => {
  let classificationStarted = false;
  let resolveClassification: ((intent: VoiceIntent) => void) | undefined;
  const classifier: VoiceIntentClassifier = {
    async checkReady() {},
    classify() {
      classificationStarted = true;
      return new Promise((resolve) => {
        resolveClassification = resolve;
      });
    },
  };
  const { app, attempts } = createTestGateway({ classifier });
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });
  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  socket.send(JSON.stringify({ last: true, type: "prompt", voicePrompt: "I suppose that depends." }));
  await waitFor(() => classificationStarted, "The classifier did not receive the Relay prompt.");

  socket.terminate();
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "closed",
    "The Relay disconnection was not recorded.",
  );
  resolveClassification?.(voiceIntent("identity_confirmed"));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(outboundMessages, []);
  assert.equal(attempts.getView(attempt.id)?.sessionStatus, "closed");
  assert.equal(
    attempts.getView(attempt.id)?.events.some((event) => event.label === "Gateway response sent"),
    false,
  );
});

test("ends a connected Relay session safely after a non-terminal Relay error", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());
  const outboundMessages: unknown[] = [];
  socket.on("message", (payload: { toString(): string }) => {
    outboundMessages.push(JSON.parse(payload.toString()));
  });

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "connected",
    "The Relay session was not connected.",
  );

  socket.send(JSON.stringify({
    description: "A recoverable Conversation Relay error occurred.",
    type: "error",
  }));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(outboundMessages, [{ type: "end" }]);
  assert.equal(attempts.getView(attempt.id)?.outcome, "staff_follow_up");
  assert.ok(
    attempts.getView(attempt.id)?.events.some((event) => event.label === "Voice service reported an error"),
  );
});

test("ignores an unrecognized Relay event after setup", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  await app.ready();
  const socket = await app.injectWS("/twilio/relay", {
    headers: { "x-twilio-signature": "validated-by-test" },
  });
  t.after(() => socket.terminate());

  socket.send(JSON.stringify({
    callSid,
    customParameters: { relayToken: attempt.relayToken },
    sessionId: relaySessionId,
    type: "setup",
  }));
  await waitFor(
    () => attempts.getView(attempt.id)?.sessionStatus === "connected",
    "The Relay session was not connected.",
  );

  socket.send(JSON.stringify({ type: "session-update" }));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(socket.readyState, socket.OPEN);
  assert.equal(attempts.getView(attempt.id)?.sessionStatus, "connected");
  assert.ok(
    attempts.getView(attempt.id)?.events.some((event) => event.label === "Voice service sent an unsupported event"),
  );
});

test("rejects Relay completion for a different session", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  attempts.bindRelaySession(attempt.relayToken, callSid, relaySessionId);

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=VX${"3".repeat(32)}&SessionStatus=failed`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 403);
  assert.equal(attempts.getView(attempt.id)?.sessionStatus, "connected");
});

test("accepts Twilio's ended Relay completion callback", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  attempts.bindRelaySession(attempt.relayToken, callSid, relaySessionId);

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}&SessionStatus=ended`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(attempts.getView(attempt.id)?.sessionStatus, "closed");
  assert.equal(attempts.getView(attempt.id)?.outcome, "unknown");
});

test("rejects a Relay completion without Twilio's session status", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());

  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);
  attempts.bindRelaySession(attempt.relayToken, callSid, relaySessionId);

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&SessionId=${relaySessionId}`,
    url: `/twilio/relay-complete?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(attempts.getView(attempt.id)?.sessionStatus, "connected");
});

test("tracks uncertain creation and does not create the same request twice", async (t) => {
  const { app, attempts, requests } = createTestGateway({ createFails: true });
  t.after(() => app.close());
  const headers = {
    "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
    "x-voice-request-id": requestId,
  };

  const firstResponse = await app.inject({ headers, method: "POST", url: "/internal/controlled-attempt" });
  const secondResponse = await app.inject({ headers, method: "POST", url: "/internal/controlled-attempt" });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(requests.length, 1);
  const attemptId = (firstResponse.json() as { attempt: { id: string } }).attempt.id;
  assert.equal(attempts.getView(attemptId)?.transportStatus, "creation_uncertain");
  assert.equal(attempts.getViewByRequestId(requestId)?.id, attemptId);
});

test("bounds an uncertain Twilio Dial without retrying it", async (t) => {
  const { app, attempts, requests } = createTestGateway({
    createNeverSettles: true,
    dialTimeoutMs: 1,
  });
  t.after(() => app.close().catch(() => {}));

  const response = await Promise.race([
    app.inject({
      headers: {
        "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
        "x-voice-request-id": requestId,
      },
      method: "POST",
      url: "/internal/controlled-attempt",
    }),
    new Promise<"timed_out">((resolve) => setTimeout(() => resolve("timed_out"), 100)),
  ]);

  assert.notEqual(response, "timed_out");
  if (response === "timed_out") return;
  assert.equal(response.statusCode, 202);
  const attemptId = (response.json() as { attempt: { id: string } }).attempt.id;
  assert.equal(attempts.getView(attemptId)?.transportStatus, "creation_uncertain");
  assert.equal(requests.length, 1);
});

test("hangs up a late Twilio call after staff stops an uncertain Dial", async (t) => {
  const lease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const { app, attempts, updates } = createTestGateway({
    controlledCallLease: lease,
    createNeverSettles: true,
    dialTimeoutMs: 1,
  });
  t.after(() => app.close().catch(() => {}));

  const start = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  const attemptId = (start.json() as { attempt: { id: string } }).attempt.id;
  assert.equal(start.statusCode, 202);
  assert.equal(attempts.getView(attemptId)?.transportStatus, "creation_uncertain");

  const stop = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "POST",
    url: `/internal/controlled-attempt/${attemptId}/stop`,
  });
  assert.equal(stop.statusCode, 200);
  assert.equal(attempts.getView(attemptId)?.transportStatus, "cancel_requested");
  assert.deepEqual(updates, []);

  const twiml = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}`,
    url: `/twilio/voice?attempt=${attemptId}`,
  });
  assert.equal(twiml.statusCode, 200);
  assert.match(twiml.body, /<Hangup\s*\/>/);
  assert.doesNotMatch(twiml.body, /<ConversationRelay/);
  assert.deepEqual(updates, [callSid]);

  const duplicateTwiml = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}`,
    url: `/twilio/voice?attempt=${attemptId}`,
  });
  assert.equal(duplicateTwiml.statusCode, 200);
  assert.match(duplicateTwiml.body, /<Hangup\s*\/>/);
  assert.deepEqual(updates, [callSid]);
  await assert.rejects(lease.acquire("next-before-terminal"), /may still be active/);

  const terminal = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&CallStatus=completed&SequenceNumber=1`,
    url: `/twilio/status?attempt=${attemptId}`,
  });
  assert.equal(terminal.statusCode, 204);
  assert.equal(attempts.getView(attemptId)?.transportStatus, "canceled");
  await assert.rejects(lease.acquire("next-after-terminal"), /Wait four minutes/);
});

test("keeps the safety lease when Twilio does not accept the hangup", async (t) => {
  const { app, attempts } = createTestGateway({ updateFails: true });
  t.after(() => app.close().catch(() => {}));
  const startResponse = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  const attemptId = (startResponse.json() as { attempt: { id: string } }).attempt.id;

  const stopResponse = await app.inject({
    headers: { "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET },
    method: "POST",
    url: `/internal/controlled-attempt/${attemptId}/stop`,
  });

  assert.equal(stopResponse.statusCode, 502);
  assert.equal(attempts.getView(attemptId)?.transportStatus, "unknown");
});

test("ends a known active call when the gateway shuts down", async () => {
  const { app, close, updates } = createTestGateway();
  const startResponse = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });

  assert.equal(startResponse.statusCode, 201);
  const closing = close();
  await waitFor(() => updates.length === 1, "Shutdown did not request call termination.");
  const terminal = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&CallStatus=completed&SequenceNumber=1`,
    url: `/twilio/status?attempt=${startResponse.json().attempt.id}`,
  });
  assert.equal(terminal.statusCode, 204);
  await closing;
  assert.deepEqual(updates, [callSid]);
});

test("fails shutdown within its deadline when Twilio never confirms the stop", async () => {
  const { app, close } = createTestGateway({
    shutdownStopTimeoutMs: 1,
    updateNeverSettles: true,
  });
  const startResponse = await app.inject({
    headers: {
      "x-voice-gateway-secret": validEnvironment.VOICE_GATEWAY_INTERNAL_SECRET,
      "x-voice-request-id": requestId,
    },
    method: "POST",
    url: "/internal/controlled-attempt",
  });
  assert.equal(startResponse.statusCode, 201);

  const closeResult = await Promise.race([
    close().then(() => "closed", () => "rejected"),
    new Promise<"timed_out">((resolve) => setTimeout(() => resolve("timed_out"), 100)),
  ]);

  assert.equal(closeResult, "rejected");
  await app.close();
});

test("rejects unsigned Twilio status callbacks", async (t) => {
  const { app } = createTestGateway();
  t.after(() => app.close());

  const response = await app.inject({
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    payload: `CallSid=${callSid}&CallStatus=ringing&SequenceNumber=1`,
    url: "/twilio/status?attempt=voice_test",
  });

  assert.equal(response.statusCode, 403);
});

test("accepts Twilio's canceled terminal status", async (t) => {
  const { app, attempts } = createTestGateway();
  t.after(() => app.close());
  const attempt = attempts.createAttempt(requestId);
  attempts.bindProviderCallId(attempt.id, callSid);

  const response = await app.inject({
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "validated-by-test",
    },
    method: "POST",
    payload: `CallSid=${callSid}&CallStatus=canceled&SequenceNumber=1`,
    url: `/twilio/status?attempt=${attempt.id}`,
  });

  assert.equal(response.statusCode, 204);
  assert.equal(attempts.getView(attempt.id)?.transportStatus, "canceled");
});
