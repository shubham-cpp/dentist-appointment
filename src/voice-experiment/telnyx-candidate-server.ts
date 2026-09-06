import { fileURLToPath } from "node:url";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { controlledCallLeasePath, FileControlledCallLease } from "@/voice-core/controlled-call-lease";
import { stopActiveCallsBeforeShutdown } from "@/voice-core/terminal-call-shutdown";
import { TELNYX_MAEVE_VOICE } from "./telnyx-candidate";
import { createTelnyxCandidateCallController } from "./telnyx-call-controller";
import { createTelnyxCandidateClient } from "./telnyx-candidate-client";
import { loadTelnyxCandidateConfig } from "./telnyx-candidate-config";
import { createTelnyxCandidateGateway } from "./telnyx-candidate-gateway";
import { createTelnyxCandidatePreflight } from "./telnyx-candidate-preflight";
import { decodeTelnyxPublicKey, verifyTelnyxWebhookSignature } from "./telnyx-signature";

function stringField(value: unknown, name: string) {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>)[name] === "string"
    ? (value as Record<string, string>)[name]
    : undefined;
}

function samePublicKey(left: string | undefined, right: string) {
  if (!left) return false;
  try {
    return decodeTelnyxPublicKey(left).export({ format: "der", type: "spki" })
      .equals(decodeTelnyxPublicKey(right).export({ format: "der", type: "spki" }));
  } catch {
    return false;
  }
}

export async function startTelnyxCandidateServer(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = loadTelnyxCandidateConfig(environment);
  const client = createTelnyxCandidateClient({ apiKey: config.apiKey });
  const attempts = new VoiceAttemptStore();

  const preflight = createTelnyxCandidatePreflight({
    assistantId: config.assistantId,
    assistantVersionId: config.assistantVersionId,
    dataRetentionEnabled: config.dataRetentionEnabled,
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
    recordingEnabled: config.recordingEnabled,
  });

  const controller = createTelnyxCandidateCallController({
    attempts,
    client,
    config,
    lease: new FileControlledCallLease(controlledCallLeasePath({
      connectionId: config.connectionId, from: config.telnyxPhoneNumber, to: config.callToNumber,
    })),
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
    await stopActiveCallsBeforeShutdown({
      attempts,
      controller,
      isFinalized: (attemptId) => controller.evidence(attemptId) === undefined,
      timeoutMs: 10_000,
    });
    await app.close();
  };
  return { app, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startTelnyxCandidateServer().then(({ close }) => {
    const shutdown = () => void close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : "Voice gateway shutdown failed.");
        process.exitCode = 1;
      });
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
