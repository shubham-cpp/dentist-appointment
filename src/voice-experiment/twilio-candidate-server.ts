import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { streamText } from "ai";
import twilio from "twilio";
import { FileControlledCallLease } from "@/voice-core/controlled-call-lease";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { stopActiveCallsBeforeShutdown } from "@/voice-core/terminal-call-shutdown";
import { createTwilioCandidateCallController } from "./twilio-call-controller";
import { loadTwilioCandidateConfig } from "./twilio-candidate-config";
import { createTwilioCandidateGateway } from "./twilio-candidate-gateway";
import {
  checkTwilioVoiceVerification,
  createTwilioCandidatePreflight,
} from "./twilio-candidate-preflight";

async function checkModelReady(config: ReturnType<typeof loadTwilioCandidateConfig>) {
  try {
    const provider = createOpenAI({ apiKey: config.aiApiKey, baseURL: config.aiBaseUrl });
    const result = streamText({
      abortSignal: AbortSignal.timeout(5_000),
      maxRetries: 0,
      messages: [{ content: "Reply with ready.", role: "user" }],
      model: provider.responses(config.aiModel),
      onError() {},
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningContext: "all_turns",
          reasoningEffort: "none",
          store: false,
        } satisfies OpenAIResponsesProviderOptions,
      },
      system: "This is a non-billable local readiness check.",
    });
    let receivedText = false;
    for await (const token of result.textStream) {
      if (token) receivedText = true;
    }
    await result.finishReason;
    return receivedText;
  } catch {
    return false;
  }
}

function leasePath(config: ReturnType<typeof loadTwilioCandidateConfig>) {
  const key = createHash("sha256")
    .update(`${config.twilioAccountSid}\u0000${config.twilioPhoneNumber}\u0000${config.callToNumber}`)
    .digest("hex")
    .slice(0, 24);
  return join(tmpdir(), `dentist-voice-experiment-${key}.json`);
}

export async function startTwilioCandidateServer(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = loadTwilioCandidateConfig(environment);
  const client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  const attempts = new VoiceAttemptStore();

  const preflight = createTwilioCandidatePreflight({
    async checkAccount() {
      const [account, numbers] = await Promise.all([
        client.api.accounts(config.twilioAccountSid).fetch(),
        client.incomingPhoneNumbers.list({ phoneNumber: config.twilioPhoneNumber, limit: 1 }),
      ]);
      const active = account.status === "active";
      return {
        active,
        recordingAvailable: active,
        sourceNumberOwned: numbers.some((item) => item.phoneNumber === config.twilioPhoneNumber),
      };
    },
    async checkCallback() {
      try {
        const response = await fetch(`${config.publicBaseUrl}/health`, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5_000),
        });
        const value = await response.json() as { runtime?: unknown; status?: unknown };
        return response.ok && value.runtime === "twilio-candidate" && value.status === "ok";
      } catch {
        return false;
      }
    },
    checkModel: () => checkModelReady(config),
    checkVoice: () => checkTwilioVoiceVerification({
      path: join(config.artifactsRoot, "preflight", "twilio-voice.json"),
    }),
  });

  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall(request) {
        return client.calls.create(
          request as unknown as Parameters<typeof client.calls.create>[0],
        );
      },
      async stopCall(callSid) {
        await client.calls(callSid).update({ status: "completed" });
      },
    },
    config,
    lease: new FileControlledCallLease(leasePath(config)),
    preflight,
  });
  const app = createTwilioCandidateGateway({
    attempts,
    config,
    controller,
    preflight,
    validateRequest(signature, url, params) {
      return twilio.validateRequest(config.twilioAuthToken, signature, url, params);
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
  void startTwilioCandidateServer().then(({ close }) => {
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
