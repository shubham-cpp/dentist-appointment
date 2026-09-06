import { z } from "zod";
import { isLoopbackHttpUrl } from "@/lib/loopback-url";
import { loadVoiceGatewayInternalSettings } from "@/lib/voice-gateway-internal";
import { loadVoiceGatewayPublicBaseUrl } from "@/lib/voice-gateway-public";
import {
  loadControlledCallSafetyPolicy,
  type ControlledCallSafetyPolicy,
} from "@/voice-core/call-safety-policy";

const e164PhoneNumber = /^\+[1-9]\d{7,14}$/;

const schema = z.object({
  CALL_TO_NUMBER: z.string().regex(e164PhoneNumber),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[a-fA-F0-9]{32}$/),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().regex(e164PhoneNumber),
  VOICE_AI_API_KEY: z.string().min(1).default("local-codex-proxy-placeholder"),
  VOICE_AI_BASE_URL: z.string().url().default("http://127.0.0.1:18765/v1"),
  VOICE_AI_MODEL: z.literal("gpt-5.6-luna-fast").default("gpt-5.6-luna-fast"),
  VOICE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  VOICE_RECORDING_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_RUNTIME: z.literal("twilio-candidate", {
    error: "VOICE_RUNTIME must be twilio-candidate for this server.",
  }),
});

export type TwilioCandidateConfig = ControlledCallSafetyPolicy & {
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: "gpt-5.6-luna-fast";
  artifactsRoot: ".voice-artifacts";
  callToNumber: string;
  gatewayPort: number;
  internalSecret: string;
  internalUrl: string;
  publicBaseUrl: string;
  recordingEnabled: boolean;
  runtime: "twilio-candidate";
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
};

export function loadTwilioCandidateConfig(
  environment: Record<string, string | undefined>,
): TwilioCandidateConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }
  if (parsed.data.CALL_TO_NUMBER === parsed.data.TWILIO_PHONE_NUMBER) {
    throw new Error("CALL_TO_NUMBER must differ from TWILIO_PHONE_NUMBER.");
  }
  const aiBaseUrl = new URL(parsed.data.VOICE_AI_BASE_URL);
  if (!isLoopbackHttpUrl(aiBaseUrl)) {
    throw new Error("VOICE_AI_BASE_URL must use a loopback HTTP address for the local demo.");
  }
  const internal = loadVoiceGatewayInternalSettings(environment);
  const safetyPolicy = loadControlledCallSafetyPolicy(environment);
  return {
    aiApiKey: parsed.data.VOICE_AI_API_KEY,
    aiBaseUrl: aiBaseUrl.toString().replace(/\/$/, ""),
    aiModel: parsed.data.VOICE_AI_MODEL,
    artifactsRoot: ".voice-artifacts",
    callToNumber: parsed.data.CALL_TO_NUMBER,
    ...safetyPolicy,
    gatewayPort: parsed.data.VOICE_GATEWAY_PORT,
    internalSecret: internal.internalSecret,
    internalUrl: internal.internalUrl,
    publicBaseUrl: loadVoiceGatewayPublicBaseUrl(environment),
    recordingEnabled: parsed.data.VOICE_RECORDING_ENABLED === "true",
    runtime: parsed.data.VOICE_RUNTIME,
    twilioAccountSid: parsed.data.TWILIO_ACCOUNT_SID,
    twilioAuthToken: parsed.data.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: parsed.data.TWILIO_PHONE_NUMBER,
  };
}
