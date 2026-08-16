import assert from "node:assert/strict";
import test from "node:test";
import { gatewayWebSocketUrl, loadVoiceGatewayConfig } from "./config";

const validEnvironment = {
  CALL_TO_NUMBER: "+919876543210",
  TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "test-auth-token",
  TWILIO_PHONE_NUMBER: "+14423790846",
  VOICE_CALLS_ENABLED: "true",
  VOICE_DEMO_MODE: "true",
  VOICE_GATEWAY_INTERNAL_SECRET: "a-controlled-demo-secret-value",
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice-demo.example.test/",
  VOICE_LANGUAGE: "en-IN",
  VOICE_SPEECH_MODEL: "long",
  VOICE_TRANSCRIPTION_PROVIDER: "Google",
  VOICE_TTS_PROVIDER: "ElevenLabs",
  VOICE_TTS_VOICE: "mCQMfsqGDT6IDkEKR20a",
};

test("loads the controlled demo gateway configuration", () => {
  const config = loadVoiceGatewayConfig(validEnvironment);

  assert.equal(config.publicBaseUrl, "https://voice-demo.example.test");
  assert.equal(gatewayWebSocketUrl(config), "wss://voice-demo.example.test/twilio/relay");
  assert.equal(config.aiModel, "gpt-5.6-terra");
  assert.equal(config.aiTimeoutMs, 5_000);
});

test("refuses calls when demo mode is not explicit", () => {
  assert.throws(
    () => loadVoiceGatewayConfig({ ...validEnvironment, VOICE_DEMO_MODE: "false" }),
    /VOICE_DEMO_MODE/,
  );
});

test("refuses an identical Twilio sender and test destination", () => {
  assert.throws(
    () => loadVoiceGatewayConfig({ ...validEnvironment, CALL_TO_NUMBER: validEnvironment.TWILIO_PHONE_NUMBER }),
    /must differ/,
  );
});

test("refuses a non-loopback AI endpoint for the local demo", () => {
  assert.throws(
    () => loadVoiceGatewayConfig({ ...validEnvironment, VOICE_AI_BASE_URL: "https://model.example.test/v1" }),
    /loopback HTTP address/,
  );
});

test("refuses a non-loopback internal gateway endpoint", () => {
  assert.throws(
    () => loadVoiceGatewayConfig({
      ...validEnvironment,
      VOICE_GATEWAY_INTERNAL_URL: "https://gateway.example.test",
    }),
    /VOICE_GATEWAY_INTERNAL_URL must use a loopback HTTP address/,
  );
});
