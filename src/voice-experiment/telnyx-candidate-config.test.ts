import assert from "node:assert/strict";
import test from "node:test";
import { loadTelnyxCandidateConfig } from "./telnyx-candidate-config";

const validEnv = {
  CALL_TO_NUMBER: "+12025550111",
  TELNYX_AI_ASSISTANT_ID: "assistant-11111111-1111-4111-8111-111111111111",
  TELNYX_AI_ASSISTANT_VERSION_ID: "20260828T120000000000",
  TELNYX_API_KEY: "KEY_test",
  TELNYX_CONNECTION_ID: "1234567890",
  TELNYX_PHONE_NUMBER: "+12025550112",
  TELNYX_PUBLIC_KEY: "a".repeat(64),
  VOICE_GATEWAY_INTERNAL_SECRET: "candidate-internal-secret-1234",
  VOICE_GATEWAY_PORT: "3101",
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice.example.test",
  VOICE_ASSISTANT_TEST_MODE: "false",
  VOICE_CALLS_ENABLED: "true",
  VOICE_DEMO_MODE: "true",
  VOICE_RUNTIME: "telnyx-candidate",
};

test("loads an isolated fixed-destination Telnyx candidate", () => {
  const config = loadTelnyxCandidateConfig(validEnv);
  assert.equal(config.runtime, "telnyx-candidate");
  assert.equal(config.callToNumber, "+12025550111");
  assert.notEqual(config.callToNumber, config.telnyxPhoneNumber);
  assert.equal(config.assistantVersionId, "20260828T120000000000");
  assert.equal(config.gatewayPort, 3101);
  assert.equal(config.dataRetentionEnabled, false);
  assert.equal(config.recordingEnabled, false);
  assert.equal(config.testMode, false);
});

test("requires explicit opt-in for recording and provider data retention", () => {
  const config = loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_PROVIDER_DATA_RETENTION_ENABLED: "true",
    VOICE_RECORDING_ENABLED: "true",
  });

  assert.equal(config.dataRetentionEnabled, true);
  assert.equal(config.recordingEnabled, true);
});

test("rejects the removed Telnyx runtime alias", () => {
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_RUNTIME: "telnyx-ai-assistant",
  }), /VOICE_RUNTIME must be/);
});

test("requires a separate token when managed Assistant Test mode is active", () => {
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_ASSISTANT_TEST_MODE: "true",
  }), /VOICE_ASSISTANT_TEST_TOOL_TOKEN/);
  const config = loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_ASSISTANT_TEST_MODE: "true",
    VOICE_ASSISTANT_TEST_TOOL_TOKEN: "managed-test-token-1234",
  });
  assert.equal(config.testMode, true);
  assert.equal(config.testToolToken, "managed-test-token-1234");
});

test("rejects a missing pinned version or an unsafe destination", () => {
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    TELNYX_AI_ASSISTANT_VERSION_ID: undefined,
  }), /TELNYX_AI_ASSISTANT_VERSION_ID/);
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    CALL_TO_NUMBER: validEnv.TELNYX_PHONE_NUMBER,
  }), /different/);
});

test("requires the global call and demo safety gates", () => {
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_CALLS_ENABLED: "false",
  }), /VOICE_CALLS_ENABLED/);
  assert.throws(() => loadTelnyxCandidateConfig({
    ...validEnv,
    VOICE_DEMO_MODE: undefined,
  }), /VOICE_DEMO_MODE/);
});
