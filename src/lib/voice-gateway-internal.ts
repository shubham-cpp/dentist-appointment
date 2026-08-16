import { z } from "zod";
import { isLoopbackHttpUrl } from "./loopback-url";

export const defaultVoiceGatewayInternalUrl = "http://127.0.0.1:3001";
export const voiceGatewayInternalSecretHeader = "x-voice-gateway-secret";

const internalSettingsSchema = z.object({
  VOICE_GATEWAY_INTERNAL_SECRET: z.string().min(24, "VOICE_GATEWAY_INTERNAL_SECRET must have at least 24 characters."),
  VOICE_GATEWAY_INTERNAL_URL: z
    .string()
    .url("VOICE_GATEWAY_INTERNAL_URL must be a valid URL.")
    .default(defaultVoiceGatewayInternalUrl),
});

export type VoiceGatewayInternalSettings = {
  internalSecret: string;
  internalUrl: string;
};

export function createVoiceGatewayInternalRequestInit(
  internalSecret: string,
  method: "GET" | "POST",
  extraHeaders: Record<string, string> = {},
): RequestInit {
  return {
    cache: "no-store",
    headers: { ...extraHeaders, [voiceGatewayInternalSecretHeader]: internalSecret },
    method,
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  };
}

export function voiceGatewayRequestFailureMessage(status: number) {
  if (status === 400) {
    return "The voice gateway could not validate this request. Restart pnpm dev, then try again.";
  }

  if (status === 401) {
    return "The dashboard and voice gateway configuration do not match. Stop pnpm dev, then start it again.";
  }

  if (status === 409) {
    return "A controlled test call is active, or the cooldown has not ended.";
  }

  if (status === 503) {
    return "The local AI service is unavailable. Make sure claude-code-proxy is running, then restart pnpm dev.";
  }

  return "The voice gateway could not complete this request.";
}

export function loadVoiceGatewayInternalSettings(
  environment: Record<string, string | undefined>,
): VoiceGatewayInternalSettings {
  const parsed = internalSettingsSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }

  const internalUrl = new URL(parsed.data.VOICE_GATEWAY_INTERNAL_URL);
  if (!isLoopbackHttpUrl(internalUrl)) {
    throw new Error("VOICE_GATEWAY_INTERNAL_URL must use a loopback HTTP address for the local demo.");
  }

  return {
    internalSecret: parsed.data.VOICE_GATEWAY_INTERNAL_SECRET,
    internalUrl: internalUrl.toString(),
  };
}
