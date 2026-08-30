import assert from "node:assert/strict";
import test from "node:test";
import {
  createVoiceGatewayInternalRequestInit,
  voiceGatewayRequestFailureMessage,
} from "@/lib/voice-gateway-internal";

test("builds a redirect-safe dashboard gateway request", () => {
  const request = createVoiceGatewayInternalRequestInit(
    "a-controlled-demo-secret-value",
    "POST",
    {
      "x-voice-gateway-secret": "must-not-override-the-configured-secret",
      "x-voice-request-id": "11111111-1111-4111-8111-111111111111",
    },
  );

  assert.equal(request.cache, "no-store");
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error");
  assert.deepEqual(request.headers, {
    "x-voice-gateway-secret": "a-controlled-demo-secret-value",
    "x-voice-request-id": "11111111-1111-4111-8111-111111111111",
  });
});

test("gives a safe, actionable message for known gateway failures", () => {
  assert.match(voiceGatewayRequestFailureMessage(401), /configuration/i);
  assert.match(voiceGatewayRequestFailureMessage(409), /active|cooldown/i);
  assert.match(voiceGatewayRequestFailureMessage(503), /selected voice runtime/i);
  assert.equal(
    voiceGatewayRequestFailureMessage(
      503,
      "Telnyx API request failed with 422 (code 10015): Invalid request payload.",
    ),
    "Telnyx API request failed with 422 (code 10015): Invalid request payload.",
  );
  assert.equal(
    voiceGatewayRequestFailureMessage(500),
    "The voice gateway could not complete this request.",
  );
});
