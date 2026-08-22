import assert from "node:assert/strict";
import test from "node:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { createVoiceConversationState } from "./conversation";
import { createStructuredVoiceIntentClassifier } from "./intent-classifier";

const emptyUsage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 0, total: 0 },
  outputTokens: { reasoning: 0, text: 0, total: 0 },
};

function modelWithOutput(output: unknown) {
  return new MockLanguageModelV3({
    doStream: {
      stream: simulateReadableStream({
        chunkDelayInMs: null,
        chunks: [
          { type: "stream-start", warnings: [] },
          { id: "intent", type: "text-start" },
          { delta: JSON.stringify(output), id: "intent", type: "text-delta" },
          { id: "intent", type: "text-end" },
          { finishReason: { raw: "stop", unified: "stop" }, type: "finish", usage: emptyUsage },
        ],
        initialDelayInMs: null,
      }),
    },
  });
}

const context = createVoiceCallContext(new Date("2026-08-16T16:00:00.000Z"));
const offeredSlotIds = context.availableSlots.filter((slot) => slot.provider.id === "patel").slice(0, 3).map((slot) => slot.id);
const offeredState = { ...createVoiceConversationState(), offeredSlotIds, phase: "offer_slots" as const };

test("uses structured output with explicit Terra low-effort options", async () => {
  const model = modelWithOutput({
    intent: "select_slot",
    requestedDate: "",
    slotId: offeredSlotIds[0],
    timePreference: "",
  });
  const classifier = createStructuredVoiceIntentClassifier(model, 5_000);

  const intent = await classifier.classify({
    callerText: "The first option works.",
    context,
    state: offeredState,
  });

  assert.equal(intent.slotId, offeredSlotIds[0]);
  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(model.doStreamCalls[0]?.responseFormat?.type, "json");
  assert.doesNotMatch(JSON.stringify(model.doStreamCalls[0]?.responseFormat), /"(?:anyOf|oneOf)"/);
  assert.deepEqual(model.doStreamCalls[0]?.providerOptions?.openai, {
    parallelToolCalls: false,
    reasoningContext: "all_turns",
    reasoningEffort: "low",
    store: false,
  });
  assert.match(JSON.stringify(model.doStreamCalls[0]?.prompt), /America\/New_York/);
  assert.match(JSON.stringify(model.doStreamCalls[0]?.prompt), /2026-08-16/);
});

test("rejects a model-selected slot outside the offered times", async () => {
  const model = modelWithOutput({
    intent: "select_slot",
    requestedDate: "",
    slotId: "outside-slot",
    timePreference: "",
  });
  const classifier = createStructuredVoiceIntentClassifier(model, 5_000);

  await assert.rejects(classifier.classify({ callerText: "Wednesday at nine.", context, state: offeredState }));
});

test("rejects a non-slot intent that includes a slot ID", async () => {
  const model = modelWithOutput({
    intent: "identity_confirmed",
    requestedDate: "",
    slotId: offeredSlotIds[0],
    timePreference: "",
  });
  const classifier = createStructuredVoiceIntentClassifier(model, 5_000);

  await assert.rejects(classifier.classify({
    callerText: "Yes, this is the patient.",
    context,
    state: createVoiceConversationState(),
  }));
});
