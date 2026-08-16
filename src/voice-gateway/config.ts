import { z } from "zod";
import { isLoopbackHttpUrl } from "@/lib/loopback-url";
import { loadVoiceGatewayInternalSettings } from "@/lib/voice-gateway-internal";
import { loadVoiceGatewayPublicBaseUrl } from "@/lib/voice-gateway-public";

const e164PhoneNumber = /^\+[1-9]\d{7,14}$/;

const environmentSchema = z.object({
  CALL_TO_NUMBER: z
    .string()
    .regex(e164PhoneNumber, "CALL_TO_NUMBER must use E.164 format."),
  TWILIO_ACCOUNT_SID: z
    .string()
    .regex(
      /^AC[a-fA-F0-9]{32}$/,
      "TWILIO_ACCOUNT_SID must be a valid Account SID.",
    ),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN must not be empty."),
  TWILIO_PHONE_NUMBER: z
    .string()
    .regex(e164PhoneNumber, "TWILIO_PHONE_NUMBER must use E.164 format."),
  VOICE_CALLS_ENABLED: z.literal("true", {
    error: "VOICE_CALLS_ENABLED must be true before a voice call can start.",
  }),
  VOICE_DEMO_MODE: z.literal("true", {
    error: "VOICE_DEMO_MODE must be true for the controlled voice demo.",
  }),
  VOICE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  VOICE_LANGUAGE: z.literal("en-IN"),
  VOICE_SPEECH_MODEL: z.literal("long"),
  VOICE_TRANSCRIPTION_PROVIDER: z.literal("Google"),
  VOICE_TTS_PROVIDER: z.literal("ElevenLabs"),
  VOICE_TTS_VOICE: z.literal("mCQMfsqGDT6IDkEKR20a"),
  VOICE_AI_PROVIDER: z
    .literal("local-codex-proxy")
    .default("local-codex-proxy"),
  VOICE_AI_BASE_URL: z
    .string()
    .url("VOICE_AI_BASE_URL must be a valid URL.")
    .default("http://127.0.0.1:18765/v1"),
  VOICE_AI_MODEL: z
    .string()
    .regex(/^[a-zA-Z0-9._/-]{1,128}$/, "VOICE_AI_MODEL has invalid characters.")
    .default("gpt-5.6-terra"),
  VOICE_AI_API_KEY: z.string().min(1).default("local-codex-proxy-placeholder"),
  VOICE_AI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(8_000)
    .default(5_000),
});

export type VoiceGatewayConfig = {
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  aiTimeoutMs: number;
  callToNumber: string;
  callsEnabled: true;
  demoMode: true;
  gatewayPort: number;
  internalUrl: string;
  internalSecret: string;
  language: "en-IN";
  publicBaseUrl: string;
  speechModel: "long";
  transcriptionProvider: "Google";
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  ttsProvider: "ElevenLabs";
  ttsVoice: "mCQMfsqGDT6IDkEKR20a";
};

export function loadVoiceGatewayConfig(
  environment: Record<string, string | undefined>,
): VoiceGatewayConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  if (parsed.data.CALL_TO_NUMBER === parsed.data.TWILIO_PHONE_NUMBER) {
    throw new Error("CALL_TO_NUMBER must differ from TWILIO_PHONE_NUMBER.");
  }

  const aiBaseUrl = new URL(parsed.data.VOICE_AI_BASE_URL);
  if (!isLoopbackHttpUrl(aiBaseUrl)) {
    throw new Error(
      "VOICE_AI_BASE_URL must use a loopback HTTP address for the local demo.",
    );
  }

  const internalSettings = loadVoiceGatewayInternalSettings(environment);
  const publicBaseUrl = loadVoiceGatewayPublicBaseUrl(environment);

  return {
    aiApiKey: parsed.data.VOICE_AI_API_KEY,
    aiBaseUrl: aiBaseUrl.toString().replace(/\/$/, ""),
    aiModel: parsed.data.VOICE_AI_MODEL,
    aiTimeoutMs: parsed.data.VOICE_AI_TIMEOUT_MS,
    callToNumber: parsed.data.CALL_TO_NUMBER,
    callsEnabled: true,
    demoMode: true,
    gatewayPort: parsed.data.VOICE_GATEWAY_PORT,
    internalSecret: internalSettings.internalSecret,
    internalUrl: internalSettings.internalUrl,
    language: parsed.data.VOICE_LANGUAGE,
    publicBaseUrl,
    speechModel: parsed.data.VOICE_SPEECH_MODEL,
    transcriptionProvider: parsed.data.VOICE_TRANSCRIPTION_PROVIDER,
    twilioAccountSid: parsed.data.TWILIO_ACCOUNT_SID,
    twilioAuthToken: parsed.data.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: parsed.data.TWILIO_PHONE_NUMBER,
    ttsProvider: parsed.data.VOICE_TTS_PROVIDER,
    ttsVoice: parsed.data.VOICE_TTS_VOICE,
  };
}

export function gatewayWebSocketUrl(config: VoiceGatewayConfig) {
  return `${config.publicBaseUrl.replace(/^https:/, "wss:")}/twilio/relay`;
}
