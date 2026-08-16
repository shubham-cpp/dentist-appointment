import assert from "node:assert/strict";
import test from "node:test";
import {
  isWebSocketCloseFrame,
  loadVoiceDemoPreflightSettings,
  runVoiceDemoPreflight,
} from "./preflight";

const settings = {
  internalSecret: "a-controlled-demo-secret-value",
  internalUrl: "http://127.0.0.1:3001",
  publicBaseUrl: "https://voice-demo.example.test",
  twilioAuthToken: "test-auth-token",
};

const successfulRelayProbe = async () => {};

function healthyResponse(processInstanceId: string) {
  return new Response(JSON.stringify({ processInstanceId, status: "ok" }), { status: 200 });
}

test("loads the settings needed for non-billable preflight checks", () => {
  const result = loadVoiceDemoPreflightSettings({
    TWILIO_AUTH_TOKEN: settings.twilioAuthToken,
    VOICE_GATEWAY_INTERNAL_SECRET: settings.internalSecret,
    VOICE_GATEWAY_INTERNAL_URL: settings.internalUrl,
    VOICE_GATEWAY_PUBLIC_BASE_URL: settings.publicBaseUrl,
  });

  assert.deepEqual(result, {
    ...settings,
    internalUrl: "http://127.0.0.1:3001/",
  });
});

test("detects a WebSocket close frame from a rejected signed connection", () => {
  assert.equal(isWebSocketCloseFrame(Buffer.from([0x88, 0x02, 0x03, 0xf0])), true);
  assert.equal(isWebSocketCloseFrame(Buffer.from([0x81, 0x00])), false);
  assert.equal(isWebSocketCloseFrame(Buffer.alloc(0)), false);
});

test("rejects unsafe preflight gateway URLs", () => {
  assert.throws(
    () => loadVoiceDemoPreflightSettings({
      TWILIO_AUTH_TOKEN: settings.twilioAuthToken,
      VOICE_GATEWAY_INTERNAL_SECRET: settings.internalSecret,
      VOICE_GATEWAY_INTERNAL_URL: "https://gateway.example.test",
      VOICE_GATEWAY_PUBLIC_BASE_URL: settings.publicBaseUrl,
    }),
    /VOICE_GATEWAY_INTERNAL_URL must use a loopback HTTP address/,
  );
  assert.throws(
    () => loadVoiceDemoPreflightSettings({
      TWILIO_AUTH_TOKEN: settings.twilioAuthToken,
      VOICE_GATEWAY_INTERNAL_SECRET: settings.internalSecret,
      VOICE_GATEWAY_INTERNAL_URL: settings.internalUrl,
      VOICE_GATEWAY_PUBLIC_BASE_URL: "http://voice-demo.example.test",
    }),
    /VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS/,
  );
  for (const publicBaseUrl of [
    "https://user:password@voice-demo.example.test",
    "https://voice-demo.example.test/callback-base",
    "https://voice-demo.example.test?target=other",
    "https://voice-demo.example.test#fragment",
  ]) {
    assert.throws(
      () => loadVoiceDemoPreflightSettings({
        TWILIO_AUTH_TOKEN: settings.twilioAuthToken,
        VOICE_GATEWAY_INTERNAL_SECRET: settings.internalSecret,
        VOICE_GATEWAY_INTERNAL_URL: settings.internalUrl,
        VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
      }),
      /VOICE_GATEWAY_PUBLIC_BASE_URL must not contain/,
    );
  }
});

test("checks that the public tunnel reaches the local gateway", async () => {
  const requestedUrls: string[] = [];
  const requestedHeaders: Array<Record<string, string> | undefined> = [];
  const requestedRedirectModes: Array<RequestRedirect | undefined> = [];
  const fetchImpl = async (url: URL, init?: RequestInit) => {
    requestedUrls.push(url.toString());
    requestedHeaders.push(init?.headers as Record<string, string> | undefined);
    requestedRedirectModes.push(init?.redirect);
    return healthyResponse("11111111-1111-4111-8111-111111111111");
  };

  const result = await runVoiceDemoPreflight(settings, fetchImpl, successfulRelayProbe);

  assert.equal(result.processInstanceId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(requestedUrls, [
    "http://127.0.0.1:3001/internal/preflight",
    "https://voice-demo.example.test/health",
  ]);
  assert.deepEqual(requestedHeaders, [
    { "x-voice-gateway-secret": settings.internalSecret },
    undefined,
  ]);
  assert.deepEqual(requestedRedirectModes, ["error", "error"]);
});

test("rejects a public tunnel that reaches a different gateway", async () => {
  const fetchImpl = async (url: URL) => {
    return healthyResponse(url.pathname === "/internal/preflight"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222");
  };

  await assert.rejects(
    runVoiceDemoPreflight(settings, fetchImpl, successfulRelayProbe),
    /does not reach the local voice gateway/,
  );
});

test("reports an unavailable gateway before opening the signed WebSocket", async () => {
  const fetchImpl = async () => {
    throw new Error("Network unavailable");
  };

  await assert.rejects(
    runVoiceDemoPreflight(settings, fetchImpl, successfulRelayProbe),
    /voice gateway is unavailable/,
  );
});

test("uses the dashboard gateway URL instead of deriving it from the gateway port", async () => {
  const customSettings = { ...settings, internalUrl: "http://localhost:3456" };
  const requestedUrls: string[] = [];
  const fetchImpl = async (url: URL) => {
    requestedUrls.push(url.toString());
    return healthyResponse("11111111-1111-4111-8111-111111111111");
  };

  await runVoiceDemoPreflight(customSettings, fetchImpl, successfulRelayProbe);

  assert.equal(requestedUrls[0], "http://localhost:3456/internal/preflight");
});

test("reports a rejected internal secret without exposing response data", async () => {
  const fetchImpl = async (url: URL) => (
    url.pathname === "/internal/preflight"
      ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
      : healthyResponse("11111111-1111-4111-8111-111111111111")
  );

  await assert.rejects(
    runVoiceDemoPreflight(settings, fetchImpl, successfulRelayProbe),
    /internal voice gateway health check failed/,
  );
});

test("reports invalid public health data", async () => {
  const fetchImpl = async (url: URL) => (
    url.pathname === "/internal/preflight"
      ? healthyResponse("11111111-1111-4111-8111-111111111111")
      : new Response("not json", { status: 200 })
  );

  await assert.rejects(
    runVoiceDemoPreflight(settings, fetchImpl, successfulRelayProbe),
    /public voice gateway health check returned invalid data/,
  );
});

test("reports a signed WebSocket handshake failure", async () => {
  await assert.rejects(
    runVoiceDemoPreflight(
      settings,
      async () => healthyResponse("11111111-1111-4111-8111-111111111111"),
      async () => {
        throw new Error("WebSocket unavailable");
      },
    ),
    /WebSocket unavailable/,
  );
});
