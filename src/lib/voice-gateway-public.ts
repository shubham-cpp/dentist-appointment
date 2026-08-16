import { z } from "zod";

const publicBaseUrlSchema = z
  .string()
  .url("VOICE_GATEWAY_PUBLIC_BASE_URL must be a valid HTTPS URL.")
  .refine((value) => new URL(value).protocol === "https:", "VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS.");

export function loadVoiceGatewayPublicBaseUrl(
  environment: Record<string, string | undefined>,
) {
  const parsed = publicBaseUrlSchema.safeParse(environment.VOICE_GATEWAY_PUBLIC_BASE_URL);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }

  const url = new URL(parsed.data);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL must not contain credentials, a query, or a fragment.");
  }
  if (url.pathname !== "/") {
    throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL must not contain a path.");
  }

  return url.origin;
}
