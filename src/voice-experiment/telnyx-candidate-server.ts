import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import { FileControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import { TELNYX_MAEVE_VOICE } from "./telnyx-candidate";
import { createTelnyxCandidateCallController } from "./telnyx-call-controller";
import { createTelnyxCandidateClient } from "./telnyx-candidate-client";
import { loadTelnyxCandidateConfig } from "./telnyx-candidate-config";
import { createTelnyxCandidateGateway } from "./telnyx-candidate-gateway";
import { runTelnyxCandidatePreflight } from "./telnyx-candidate-preflight";
import { verifyTelnyxWebhookSignature } from "./telnyx-signature";

function leasePath(config: ReturnType<typeof loadTelnyxCandidateConfig>) {
  const key = createHash("sha256")
    .update(`${config.connectionId}\u0000${config.telnyxPhoneNumber}\u0000${config.callToNumber}`)
    .digest("hex")
    .slice(0, 24);
  return join(tmpdir(), `dentist-voice-experiment-${key}.json`);
}

function stringField(value: unknown, name: string) {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>)[name] === "string"
    ? (value as Record<string, string>)[name]
    : undefined;
}

function samePublicKey(left: string | undefined, right: string) {
  if (!left) return false;
  const decode = (value: string) => Buffer.from(value, /^[a-fA-F0-9]{64}$/.test(value) ? "hex" : "base64");
  const leftBytes = decode(left);
  const rightBytes = decode(right);
  return leftBytes.length === 32 && leftBytes.equals(rightBytes);
}

export async function startTelnyxCandidateServer(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = loadTelnyxCandidateConfig(environment);
  const client = createTelnyxCandidateClient({ apiKey: config.apiKey });
  const attempts = new VoiceAttemptStore();

  async function preflight() {
    await runTelnyxCandidatePreflight({
      assistantId: config.assistantId,
      assistantVersionId: config.assistantVersionId,
      dependencies: {
        async callbackReady() {
          try {
            const response = await fetch(`${config.publicBaseUrl}/health`, {
              cache: "no-store",
              redirect: "error",
              signal: AbortSignal.timeout(5_000),
            });
            const body = await response.json() as { runtime?: unknown; status?: unknown };
            return response.ok && body.runtime === "telnyx-candidate" && body.status === "ok";
          } catch {
            return false;
          }
        },
        async readProvider() {
          const [balance, assistant, connection, phoneNumbers, publicKey, voices] = await Promise.all([
            client.getBalance(),
            client.getAssistant(config.assistantId),
            client.getConnection(config.connectionId),
            client.listPhoneNumbers(config.telnyxPhoneNumber),
            client.getPublicKey(),
            client.listVoices(),
          ]);
          return {
            accountReady: Boolean(balance),
            assistant,
            connectionReady: Boolean(connection),
            phoneNumberOwned: phoneNumbers.some((entry) => (
              entry.phone_number === config.telnyxPhoneNumber || entry.phoneNumber === config.telnyxPhoneNumber
            )),
            publicKeyMatches: samePublicKey(stringField(publicKey, "public"), config.publicKey),
            voices: voices.filter((entry) => entry.id === TELNYX_MAEVE_VOICE),
          };
        },
      },
      publicBaseUrl: config.publicBaseUrl,
    });
  }

  const controller = createTelnyxCandidateCallController({
    attempts,
    client,
    config,
    lease: new FileControlledCallLease(leasePath(config)),
    preflight,
  });
  const app = createTelnyxCandidateGateway({
    attempts,
    config,
    controller,
    preflight,
    validateRequest(rawBody, timestamp, signature) {
      return verifyTelnyxWebhookSignature({ publicKey: config.publicKey, rawBody, signature, timestamp });
    },
  });
  await app.listen({ host: "127.0.0.1", port: config.gatewayPort });

  const close = async () => {
    for (const active of attempts.getActiveCallStops()) {
      await controller.stop(active.attemptId).catch(() => undefined);
    }
    await app.close();
  };
  return { app, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startTelnyxCandidateServer().then(({ close }) => {
    process.once("SIGINT", () => void close().then(() => process.exit(0)));
    process.once("SIGTERM", () => void close().then(() => process.exit(0)));
  });
}
