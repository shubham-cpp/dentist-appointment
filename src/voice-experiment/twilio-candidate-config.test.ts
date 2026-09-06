import assert from "node:assert/strict";
import test from "node:test";
import { loadTwilioCandidateConfig } from "./twilio-candidate-config";

function environment() {
  return {
    CALL_TO_NUMBER: "+12025550111",
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "twilio-auth-token",
    TWILIO_PHONE_NUMBER: "+12025550112",
    VOICE_AI_API_KEY: "local-placeholder",
    VOICE_AI_BASE_URL: "http://127.0.0.1:18765/v1",
    VOICE_CALLS_ENABLED: "true",
    VOICE_DEMO_MODE: "true",
    VOICE_GATEWAY_INTERNAL_SECRET: "a-voice-secret-with-24-characters",
    VOICE_GATEWAY_INTERNAL_URL: "http://127.0.0.1:3001",
    VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice.example.test",
    VOICE_RUNTIME: "twilio-candidate",
  };
}

test("loads an isolated Twilio candidate without direct Deepgram credentials", () => {
  const config = loadTwilioCandidateConfig(environment());

  assert.equal(config.runtime, "twilio-candidate");
  assert.equal(config.aiModel, "gpt-5.6-luna-fast");
  assert.equal(config.callToNumber, "+12025550111");
  assert.equal(config.artifactsRoot, ".voice-artifacts");
  assert.equal(config.recordingEnabled, false);
  assert.equal("deepgramApiKey" in config, false);
});

test("requires an explicit flag before it records calls", () => {
  assert.equal(
    loadTwilioCandidateConfig({ ...environment(), VOICE_RECORDING_ENABLED: "true" }).recordingEnabled,
    true,
  );
});

test("rejects an unsafe runtime or destination", () => {
  assert.throws(
    () => loadTwilioCandidateConfig({ ...environment(), VOICE_RUNTIME: "conversation-relay" }),
    /VOICE_RUNTIME must be twilio-candidate/,
  );
  assert.throws(
    () => loadTwilioCandidateConfig({ ...environment(), CALL_TO_NUMBER: "+12025550112" }),
    /CALL_TO_NUMBER must differ/,
  );
});
