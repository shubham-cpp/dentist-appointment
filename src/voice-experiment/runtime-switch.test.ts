import assert from "node:assert/strict";
import test from "node:test";
import { loadVoiceRuntimeSelection } from "./runtime-switch";

test("keeps the current gateway as the safe default", () => {
  assert.equal(loadVoiceRuntimeSelection({}), "current-gateway");
  assert.equal(loadVoiceRuntimeSelection({ VOICE_RUNTIME: "conversation-relay" }), "current-gateway");
});

test("selects each experiment candidate explicitly", () => {
  assert.equal(loadVoiceRuntimeSelection({ VOICE_RUNTIME: "twilio-candidate" }), "twilio-candidate");
  assert.equal(loadVoiceRuntimeSelection({ VOICE_RUNTIME: "telnyx-candidate" }), "telnyx-candidate");
});

test("normalizes the legacy Telnyx runtime during migration", () => {
  assert.equal(
    loadVoiceRuntimeSelection({ VOICE_RUNTIME: "telnyx-ai-assistant" }),
    "telnyx-candidate",
  );
});

test("rejects an unknown runtime instead of falling back", () => {
  assert.throws(
    () => loadVoiceRuntimeSelection({ VOICE_RUNTIME: "typo-runtime" }),
    /VOICE_RUNTIME must be/,
  );
});
