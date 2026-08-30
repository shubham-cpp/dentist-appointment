import assert from "node:assert/strict";
import test from "node:test";
import {
  createTwilioRelayRuntime,
  TwilioRelayRuntimeError,
  type TwilioRelayMessage,
} from "./twilio-relay-runtime";
import type { TwilioDialogueSession } from "./twilio-dialogue-session";

test("routes setup, partial, final, interruption, and playback events", async () => {
  const calls: string[] = [];
  const evidence: string[] = [];
  const session: TwilioDialogueSession = {
    close() {
      calls.push("close");
    },
    interrupt() {
      calls.push("interrupt");
    },
    async respond(text) {
      calls.push(`final:${text}`);
      return { status: "completed", text: "response" };
    },
    revisePartial(text) {
      calls.push(`partial:${text}`);
    },
  };
  const runtime = createTwilioRelayRuntime({
    createSession(setup) {
      calls.push(`setup:${setup.callSid}:${setup.sessionId}`);
      return session;
    },
    async record(event) {
      evidence.push(event.type);
    },
  });

  const messages: TwilioRelayMessage[] = [
    {
      callSid: "CA11111111111111111111111111111111",
      customParameters: { relayToken: "relay-token" },
      sessionId: "VX11111111111111111111111111111111",
      type: "setup",
    },
    { last: false, type: "prompt", voicePrompt: "Can you move" },
    { last: true, type: "prompt", voicePrompt: "Can you move it to Thursday?" },
    { durationUntilInterruptMs: 120, type: "interrupt", utteranceUntilInterrupt: "The first" },
    { type: "tokens-played" },
  ];
  for (const message of messages) await runtime.handle(message);

  assert.deepEqual(calls, [
    "setup:CA11111111111111111111111111111111:VX11111111111111111111111111111111",
    "partial:Can you move",
    "final:Can you move it to Thursday?",
    "interrupt",
  ]);
  assert.deepEqual(evidence, [
    "relay.setup",
    "transcript.partial",
    "transcript.final",
    "relay.interrupt",
    "relay.tokens_played",
  ]);
});

test("requires setup and closes safely on a provider error", async () => {
  let closed = false;
  const runtime = createTwilioRelayRuntime({
    createSession() {
      return {
        close() {
          closed = true;
        },
        interrupt() {},
        async respond() {
          return { status: "completed", text: "" };
        },
        revisePartial() {},
      };
    },
    async record() {},
  });

  await assert.rejects(
    runtime.handle({ last: true, type: "prompt", voicePrompt: "Hello" }),
    (error: unknown) => error instanceof TwilioRelayRuntimeError && error.code === "setup_required",
  );
  await runtime.handle({
    callSid: "CA22222222222222222222222222222222",
    customParameters: { relayToken: "relay-token" },
    sessionId: "VX22222222222222222222222222222222",
    type: "setup",
  });
  await assert.rejects(
    runtime.handle({ description: "provider failed", type: "error" }),
    (error: unknown) => error instanceof TwilioRelayRuntimeError && error.code === "provider_error",
  );
  assert.equal(closed, true);
});
