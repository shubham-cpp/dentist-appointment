import assert from "node:assert/strict";
import test from "node:test";
import {
  createTwilioDialogueSession,
  type VoiceDialogueModel,
  type VoiceDialogueTurn,
} from "./twilio-dialogue-session";

test("streams model text and keeps one persistent conversation history", async () => {
  const turns: VoiceDialogueTurn[] = [];
  const messages: unknown[] = [];
  const model: VoiceDialogueModel = {
    async *generate(turn) {
      turns.push(turn);
      yield "I can help ";
      yield `with ${turn.callerText}.`;
    },
  };
  const session = createTwilioDialogueSession({
    model,
    send(message) {
      messages.push(message);
    },
  });

  await session.respond("move my appointment");
  await session.respond("Thursday is better");

  assert.deepEqual(messages.slice(0, 3), [
    { interruptible: true, last: false, preemptible: true, token: "I can help ", type: "text" },
    {
      interruptible: true,
      last: false,
      preemptible: true,
      token: "with move my appointment.",
      type: "text",
    },
    { interruptible: true, last: true, preemptible: true, token: "", type: "text" },
  ]);
  assert.deepEqual(turns[1]!.history, [
    { content: "move my appointment", role: "user" },
    { content: "I can help with move my appointment.", role: "assistant" },
  ]);
});

test("cancels interrupted output without ending the conversation", async () => {
  let firstSignal: AbortSignal | undefined;
  const messages: unknown[] = [];
  const model: VoiceDialogueModel = {
    async *generate(turn) {
      firstSignal ??= turn.signal;
      yield "The first option is ";
      await new Promise<void>((resolve) => turn.signal.addEventListener("abort", () => resolve(), { once: true }));
      yield "Tuesday.";
    },
  };
  const session = createTwilioDialogueSession({
    model,
    send(message) {
      messages.push(message);
    },
  });

  const response = session.respond("What times are open?");
  await new Promise((resolve) => setImmediate(resolve));
  session.interrupt();
  const result = await response;

  assert.equal(firstSignal?.aborted, true);
  assert.equal(result.status, "interrupted");
  assert.equal(messages.some((message) => (message as { type?: string }).type === "end"), false);
  assert.deepEqual(messages, [
    {
      interruptible: true,
      last: false,
      preemptible: true,
      token: "The first option is ",
      type: "text",
    },
  ]);
});

test("cancels speculative work when a partial transcript changes", async () => {
  const signals: AbortSignal[] = [];
  const model: VoiceDialogueModel = {
    async *generate() {
      yield "final";
    },
    async prefetch(turn) {
      signals.push(turn.signal);
      await new Promise<void>((resolve) => turn.signal.addEventListener("abort", () => resolve(), { once: true }));
    },
  };
  const session = createTwilioDialogueSession({ model, send() {} });

  session.revisePartial("Can you move");
  await new Promise((resolve) => setImmediate(resolve));
  session.revisePartial("Can you move it to Thursday");
  await new Promise((resolve) => setImmediate(resolve));
  await session.respond("Can you move it to Thursday?");

  assert.equal(signals.length, 2);
  assert.equal(signals.every((signal) => signal.aborted), true);
});
