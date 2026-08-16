import assert from "node:assert/strict";
import test from "node:test";
import { VoiceConversationSession } from "./conversation-session";
import type { VoiceIntentClassifier } from "./intent-classifier";
import { createVoiceCallContext } from "@/lib/voice-call-context";

const context = createVoiceCallContext(new Date("2026-08-16T16:00:00.000Z"));

test("ignores an aborted classifier turn instead of ending the call", async () => {
  let rejectClassification: ((reason: Error) => void) | undefined;
  const classifier: VoiceIntentClassifier = {
    async checkReady() {},
    classify(_request, signal) {
      return new Promise((_resolve, reject) => {
        rejectClassification = reject;
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  };
  const session = new VoiceConversationSession(classifier, context);

  const pendingReply = session.respondToFinalPrompt("I am not sure who you mean");
  session.interrupt();
  rejectClassification?.(new Error("aborted"));

  assert.equal(await pendingReply, undefined);
});

test("propagates a classifier failure from the current turn", async () => {
  const classifier: VoiceIntentClassifier = {
    async checkReady() {},
    async classify() {
      throw new Error("classifier unavailable");
    },
  };
  const session = new VoiceConversationSession(classifier, context);

  await assert.rejects(session.respondToFinalPrompt("I am not sure who you mean"), /classifier unavailable/);
});
