import { randomBytes } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import { z } from "zod";
import {
  loadVoiceGatewayInternalSettings,
  type VoiceGatewayInternalSettings,
  voiceGatewayInternalSecretHeader,
} from "@/lib/voice-gateway-internal";
import { loadVoiceGatewayPublicBaseUrl } from "@/lib/voice-gateway-public";

const gatewayHealthSchema = z.object({
  processInstanceId: z.string().uuid(),
  status: z.literal("ok"),
});

type FetchLike = (input: URL, init?: RequestInit) => Promise<Response>;
type PublicRelayProbe = (config: VoiceDemoPreflightSettings) => Promise<void>;

export type VoiceDemoPreflightResult = {
  processInstanceId: string;
};

export type VoiceDemoPreflightSettings = VoiceGatewayInternalSettings & {
  publicBaseUrl: string;
  twilioAuthToken: string;
};

export function loadVoiceDemoPreflightSettings(
  environment: Record<string, string | undefined>,
): VoiceDemoPreflightSettings {
  const internalSettings = loadVoiceGatewayInternalSettings(environment);
  const publicBaseUrl = loadVoiceGatewayPublicBaseUrl(environment);
  const twilioAuthToken = z.string().min(1, "TWILIO_AUTH_TOKEN must not be empty.").parse(environment.TWILIO_AUTH_TOKEN);

  return {
    ...internalSettings,
    publicBaseUrl,
    twilioAuthToken,
  };
}

function internalGatewayUrl(config: VoiceDemoPreflightSettings) {
  return new URL("/internal/preflight", config.internalUrl);
}

function publicGatewayUrl(config: VoiceDemoPreflightSettings) {
  return new URL("/health", config.publicBaseUrl);
}

function publicRelayWebSocketUrl(config: VoiceDemoPreflightSettings) {
  const url = new URL("/twilio/relay", config.publicBaseUrl);
  url.protocol = "wss:";
  return url;
}

export function isWebSocketCloseFrame(chunk: Buffer) {
  return chunk.length > 0 && (chunk[0] & 0x0f) === 0x08;
}

export async function probePublicRelayWebSocket(config: VoiceDemoPreflightSettings) {
  const relayUrl = publicRelayWebSocketUrl(config);
  const requestUrl = new URL(relayUrl);
  requestUrl.protocol = "https:";
  const signature = twilio.getExpectedTwilioSignature(
    config.twilioAuthToken,
    relayUrl.toString(),
    {},
  );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const request = httpsRequest(requestUrl, {
      headers: {
        Connection: "Upgrade",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version": "13",
        Upgrade: "websocket",
        "X-Twilio-Signature": signature,
      },
      method: "GET",
    });

    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error("The public signed voice WebSocket did not connect."));
    };
    request.setTimeout(5_000, () => request.destroy());
    request.once("error", fail);
    request.once("response", (response) => {
      response.resume();
      fail();
    });
    request.once("upgrade", (_response, socket, head) => {
      const probeState: { stabilityTimeout?: ReturnType<typeof setTimeout> } = {};
      const failAfterUpgrade = () => {
        if (probeState.stabilityTimeout) clearTimeout(probeState.stabilityTimeout);
        socket.destroy();
        fail();
      };
      const rejectCloseFrame = (chunk: Buffer) => {
        if (isWebSocketCloseFrame(chunk)) failAfterUpgrade();
      };
      probeState.stabilityTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.removeListener("close", failAfterUpgrade);
        socket.removeListener("data", rejectCloseFrame);
        socket.removeListener("error", failAfterUpgrade);
        socket.destroy();
        resolve();
      }, 1_000);
      socket.once("close", failAfterUpgrade);
      socket.on("data", rejectCloseFrame);
      socket.once("error", failAfterUpgrade);
      rejectCloseFrame(head);
    });
    request.end();
  });
}

async function readGatewayHealth(
  label: "internal" | "public",
  url: URL,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
) {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error(`The ${label} voice gateway is unavailable.`);
  }

  if (!response.ok) throw new Error(`The ${label} voice gateway health check failed.`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The ${label} voice gateway health check returned invalid data.`);
  }

  const health = gatewayHealthSchema.safeParse(body);
  if (!health.success) throw new Error(`The ${label} voice gateway health check returned invalid data.`);
  return health.data;
}

export async function runVoiceDemoPreflight(
  config: VoiceDemoPreflightSettings,
  fetchImpl: FetchLike = fetch,
  publicRelayProbe: PublicRelayProbe = probePublicRelayWebSocket,
): Promise<VoiceDemoPreflightResult> {
  const [internal, publicGateway] = await Promise.all([
    readGatewayHealth(
      "internal",
      internalGatewayUrl(config),
      fetchImpl,
      { [voiceGatewayInternalSecretHeader]: config.internalSecret },
    ),
    readGatewayHealth("public", publicGatewayUrl(config), fetchImpl),
  ]);

  if (internal.processInstanceId !== publicGateway.processInstanceId) {
    throw new Error("The public tunnel does not reach the local voice gateway.");
  }

  await publicRelayProbe(config);

  return { processInstanceId: internal.processInstanceId };
}

async function main() {
  try {
    const config = loadVoiceDemoPreflightSettings(process.env);
    await runVoiceDemoPreflight(config);
    console.log("Local gateway: ready.");
    console.log("Public tunnel: reaches the same gateway.");
    console.log("Public signed WebSocket: ready.");
    console.log("Preflight passed. It did not place a phone call.");
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Check the local gateway, public tunnel, and controlled demo environment.";
    console.error(`Voice demo preflight failed. ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
