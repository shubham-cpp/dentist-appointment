import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import {
  applyVoiceIntent,
  classifyLocalVoiceIntent,
  createVoiceConversationState,
  voiceIntentSchema,
  type VoiceIntent,
} from "./conversation";

const context = createVoiceCallContext(new Date("2026-08-16T16:00:00.000Z"));

function intent(name: VoiceIntent["intent"], slotId = ""): VoiceIntent {
  return { intent: name, requestedDate: "", slotId, timePreference: "" };
}

test("reschedules only after identity, permission, provider choice, and exact confirmation", () => {
  const identity = applyVoiceIntent(context, createVoiceConversationState(), intent("identity_confirmed"));
  const permission = applyVoiceIntent(context, identity.nextState, intent("permission_granted"));
  const offered = applyVoiceIntent(context, permission.nextState, intent("prefer_same_provider"));
  const slotId = offered.nextState.offeredSlotIds[0]!;
  const selected = applyVoiceIntent(context, offered.nextState, intent("select_slot", slotId));
  const confirmed = applyVoiceIntent(context, selected.nextState, intent("confirm"), "2026-08-16T16:00:05.000Z");

  assert.match(permission.text, /Dr Aisha Patel is unavailable/);
  assert.equal(offered.nextState.offeredSlotIds.length, 3);
  assert.match(selected.text, /Monday, August 17, 2026 at 10:30 AM/);
  assert.equal(confirmed.outcome, "rescheduled");
  assert.equal(confirmed.result?.kind, "rescheduled");
  assert.equal(confirmed.result?.kind === "rescheduled" && confirmed.result.replacement.id, slotId);
});

test("confirms cancellation before the soft-delete result", () => {
  const question = applyVoiceIntent(context, createVoiceConversationState(), intent("cancel"));
  const confirmed = applyVoiceIntent(context, question.nextState, intent("confirm"));

  assert.match(question.text, /you want to cancel/);
  assert.equal(confirmed.outcome, "canceled");
  assert.equal(confirmed.result?.kind, "canceled");
});

test("handles clear short answers without Terra", () => {
  const initial = createVoiceConversationState();
  assert.equal(classifyLocalVoiceIntent(initial, "Yes")?.intent, "identity_confirmed");
  assert.equal(classifyLocalVoiceIntent(initial, "Yes, this is Olivia")?.intent, "identity_confirmed");
  assert.equal(classifyLocalVoiceIntent(initial, "Yeah I'm Olivia")?.intent, "identity_confirmed");
  assert.equal(classifyLocalVoiceIntent(initial, "That's me")?.intent, "identity_confirmed");
  assert.equal(classifyLocalVoiceIntent(initial, "Yep")?.intent, "identity_confirmed");
});

test("handles spoken confirmation paraphrases without Terra", () => {
  const state = { ...createVoiceConversationState(), phase: "confirm_reschedule" as const };
  assert.equal(classifyLocalVoiceIntent(state, "Sure")?.intent, "confirm");
  assert.equal(classifyLocalVoiceIntent(state, "Go ahead")?.intent, "confirm");
  assert.equal(classifyLocalVoiceIntent(state, "Okay understandable, I'm ok with the 26th")?.intent, "confirm");
  assert.equal(classifyLocalVoiceIntent(state, "No")?.intent, "decline");
});

test("uses the agreed third-failure message", () => {
  const first = applyVoiceIntent(context, createVoiceConversationState(), intent("unknown"));
  const second = applyVoiceIntent(context, first.nextState, intent("unknown"));
  const third = applyVoiceIntent(context, second.nextState, intent("unknown"));

  assert.equal(first.text.startsWith("I’m sorry, I could not process that response."), true);
  assert.equal(second.text.startsWith("I’m sorry, I could not process that response."), true);
  assert.equal(third.text, "I’m sorry, I could not process that response. Our team will contact you");
  assert.equal(third.end, true);
});

test("rejects invalid structured intent output", () => {
  assert.throws(() => voiceIntentSchema.parse({
    callerFacingText: "Use model output as speech",
    intent: "select_slot",
    requestedDate: "",
    slotId: "",
    timePreference: "",
  }));
  assert.throws(() => voiceIntentSchema.parse({
    intent: "identity_confirmed",
    requestedDate: "",
    slotId: "not-an-offered-slot",
    timePreference: "",
  }));
});
