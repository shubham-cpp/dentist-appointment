import { createTelnyxAssistantDraft, TELNYX_MAEVE_VOICE } from "./telnyx-candidate";

type ProviderSnapshot = {
  accountReady: boolean;
  assistant: Record<string, unknown>;
  connectionReady: boolean;
  phoneNumberOwned: boolean;
  publicKeyMatches: boolean;
  voices: Array<Record<string, unknown>>;
};

type TelnyxPreflightDependencies = {
  callbackReady(): Promise<boolean>;
  readProvider(): Promise<ProviderSnapshot>;
};

export type TelnyxCandidatePreflightCheck = { name: string; passed: boolean };

export class TelnyxCandidatePreflightError extends Error {
  constructor(readonly failedChecks: string[]) {
    super(`Telnyx candidate preflight failed: ${failedChecks.join(", ")}`);
    this.name = "TelnyxCandidatePreflightError";
  }
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizedTool(value: unknown) {
  const tool = recordValue(value);
  if (tool?.type === "webhook") {
    const webhook = recordValue(tool.webhook);
    if (!webhook) return undefined;
    return {
      type: "webhook",
      webhook: {
        async: webhook.async,
        body_parameters: webhook.body_parameters,
        description: webhook.description,
        headers: Array.isArray(webhook.headers)
          ? [...webhook.headers].sort((left, right) => (
              String(recordValue(left)?.name).localeCompare(String(recordValue(right)?.name))
            ))
          : webhook.headers,
        method: webhook.method,
        name: webhook.name,
        timeout_ms: webhook.timeout_ms,
        url: webhook.url,
      },
    };
  }
  if (tool?.type === "hangup") {
    const hangup = recordValue(tool.hangup);
    return {
      hangup: { description: hangup?.description },
      type: "hangup",
    };
  }
  return undefined;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = recordValue(value);
  if (!record) return JSON.stringify(value);
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

function normalizedTools(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizedTool).sort((left, right) => (
    canonicalJson(left).localeCompare(canonicalJson(right))
  ));
}

export function telnyxAssistantConfigurationMatches(
  assistant: Record<string, unknown>,
  expected: ReturnType<typeof createTelnyxAssistantDraft>,
) {
  const voice = assistant.voice_settings as Record<string, unknown> | undefined;
  const transcription = assistant.transcription as Record<string, unknown> | undefined;
  const transcriptionSettings = transcription?.settings as Record<string, unknown> | undefined;
  const interruption = assistant.interruption_settings as Record<string, unknown> | undefined;
  const privacy = assistant.privacy_settings as Record<string, unknown> | undefined;
  const telephony = assistant.telephony_settings as Record<string, unknown> | undefined;
  const recording = telephony?.recording_settings as Record<string, unknown> | undefined;
  return canonicalJson(assistant.enabled_features) === canonicalJson(expected.enabled_features)
    && assistant.model === expected.model
    && assistant.name === expected.name
    && voice?.voice === expected.voice_settings.voice
    && voice.expressive_mode === expected.voice_settings.expressive_mode
    && voice.voice_speed === expected.voice_settings.voice_speed
    && transcription?.model === expected.transcription.model
    && transcription.language === expected.transcription.language
    && transcriptionSettings?.eager_eot_threshold === expected.transcription.settings.eager_eot_threshold
    && transcriptionSettings.eot_threshold === expected.transcription.settings.eot_threshold
    && transcriptionSettings.eot_timeout_ms === expected.transcription.settings.eot_timeout_ms
    && interruption?.enable === expected.interruption_settings.enable
    && interruption.disable_greeting_interruption === expected.interruption_settings.disable_greeting_interruption
    && privacy?.data_retention === expected.privacy_settings.data_retention
    && telephony?.send_message_history_updates === expected.telephony_settings.send_message_history_updates
    && telephony.time_limit_secs === expected.telephony_settings.time_limit_secs
    && recording?.enabled === expected.telephony_settings.recording_settings.enabled
    && recording.channels === expected.telephony_settings.recording_settings.channels
    && recording.format === expected.telephony_settings.recording_settings.format
    && recording.stop_on_conversation_end === expected.telephony_settings.recording_settings.stop_on_conversation_end
    && canonicalJson(normalizedTools(assistant.tools)) === canonicalJson(normalizedTools(expected.tools))
    && assistant.greeting === expected.greeting
    && assistant.instructions === expected.instructions;
}

export async function runTelnyxCandidatePreflight(options: {
  assistantId: string;
  assistantVersionId: string;
  dependencies: TelnyxPreflightDependencies;
  publicBaseUrl: string;
}) {
  const expected = createTelnyxAssistantDraft({ publicBaseUrl: options.publicBaseUrl });
  const [provider, callbackReady] = await Promise.all([
    options.dependencies.readProvider(),
    options.dependencies.callbackReady(),
  ]);
  const voice = provider.voices.find((entry) => entry.id === TELNYX_MAEVE_VOICE);
  const checks: TelnyxCandidatePreflightCheck[] = [
    { name: "account", passed: provider.accountReady },
    { name: "connection", passed: provider.connectionReady },
    { name: "source-number", passed: provider.phoneNumberOwned },
    { name: "public-key", passed: provider.publicKeyMatches },
    { name: "callback", passed: callbackReady },
    {
      name: "maeve-voice",
      passed: voice?.accent === "American" && voice.language === "en-US",
    },
    {
      name: "assistant-version",
      passed: provider.assistant.id === options.assistantId
        && provider.assistant.version_id === options.assistantVersionId,
    },
    {
      name: "assistant-configuration",
      passed: telnyxAssistantConfigurationMatches(provider.assistant, expected),
    },
  ];
  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  if (failedChecks.length > 0) throw new TelnyxCandidatePreflightError(failedChecks);
  return { checks };
}
