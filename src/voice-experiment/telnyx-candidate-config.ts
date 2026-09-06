import { z } from "zod";
import { loadControlledCallSafetyPolicy } from "@/voice-core/call-safety-policy";
import { loadVoiceRuntimeSelection } from "./runtime-switch";

const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/);
const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "must use HTTPS");
const envSchema = z.object({
  CALL_TO_NUMBER: e164,
  TELNYX_AI_ASSISTANT_ID: z.string().startsWith("assistant-"),
  TELNYX_AI_ASSISTANT_VERSION_ID: z.string().min(1),
  TELNYX_API_KEY: z.string().min(8),
  TELNYX_CONNECTION_ID: z.string().min(1),
  TELNYX_PHONE_NUMBER: e164,
  TELNYX_PUBLIC_KEY: z.string().min(32),
  VOICE_GATEWAY_INTERNAL_SECRET: z.string().min(16),
  VOICE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  VOICE_GATEWAY_PUBLIC_BASE_URL: httpsUrl,
  VOICE_PROVIDER_DATA_RETENTION_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_RECORDING_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_ASSISTANT_TEST_MODE: z.enum(["true", "false"]).default("false"),
  VOICE_ASSISTANT_TEST_TOOL_TOKEN: z.string().min(16).optional(),
  VOICE_RUNTIME: z.string().min(1),
}).passthrough().superRefine((value, context) => {
  if (value.VOICE_ASSISTANT_TEST_MODE === "true" && !value.VOICE_ASSISTANT_TEST_TOOL_TOKEN) {
    context.addIssue({
      code: "custom",
      message: "is required when VOICE_ASSISTANT_TEST_MODE is true",
      path: ["VOICE_ASSISTANT_TEST_TOOL_TOKEN"],
    });
  }
});

export function loadTelnyxCandidateConfig(env: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  if (parsed.data.CALL_TO_NUMBER === parsed.data.TELNYX_PHONE_NUMBER) {
    throw new Error("CALL_TO_NUMBER must be different from TELNYX_PHONE_NUMBER.");
  }
  const runtime = loadVoiceRuntimeSelection(env);
  if (runtime !== "telnyx-candidate") {
    throw new Error("VOICE_RUNTIME must select the Telnyx candidate for this server.");
  }
  const safetyPolicy = loadControlledCallSafetyPolicy(env);
  return {
    apiKey: parsed.data.TELNYX_API_KEY,
    artifactsRoot: ".voice-artifacts",
    assistantId: parsed.data.TELNYX_AI_ASSISTANT_ID,
    assistantVersionId: parsed.data.TELNYX_AI_ASSISTANT_VERSION_ID,
    callToNumber: parsed.data.CALL_TO_NUMBER,
    ...safetyPolicy,
    connectionId: parsed.data.TELNYX_CONNECTION_ID,
    dataRetentionEnabled: parsed.data.VOICE_PROVIDER_DATA_RETENTION_ENABLED === "true",
    gatewayPort: parsed.data.VOICE_GATEWAY_PORT,
    internalSecret: parsed.data.VOICE_GATEWAY_INTERNAL_SECRET,
    publicBaseUrl: parsed.data.VOICE_GATEWAY_PUBLIC_BASE_URL,
    publicKey: parsed.data.TELNYX_PUBLIC_KEY,
    recordingEnabled: parsed.data.VOICE_RECORDING_ENABLED === "true",
    runtime,
    telnyxPhoneNumber: parsed.data.TELNYX_PHONE_NUMBER,
    testMode: parsed.data.VOICE_ASSISTANT_TEST_MODE === "true",
    testToolToken: parsed.data.VOICE_ASSISTANT_TEST_TOOL_TOKEN,
  } as const;
}
