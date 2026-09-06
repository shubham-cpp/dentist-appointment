import { z } from "zod";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const schema = z.object({
  TELNYX_API_KEY: z.string().min(1), TELNYX_APPLICATION_SID: z.string().min(1),
  TELNYX_ACCOUNT_SID: z.string().min(1), TELNYX_CONNECTION_ID: z.string().min(1),
  TELNYX_PUBLIC_KEY: z.string().min(1), TELNYX_PHONE_NUMBER: phone, CALL_TO_NUMBER: phone,
  OPENROUTER_API_KEY: z.string().min(1),
  VOICE_RELAY_MODEL: z.string().min(1).default("openai/gpt-4.1-mini"),
  VOICE_GATEWAY_INTERNAL_SECRET: z.string().min(24),
  VOICE_GATEWAY_PUBLIC_BASE_URL: z.url(),
  VOICE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  VOICE_RELAY_STORE_PATH: z.string().default(".voice-artifacts/relay-runtime.sqlite"),
  VOICE_CALLS_ENABLED: z.literal("true"), VOICE_DEMO_MODE: z.literal("true"),
});
export type RelayConfig = z.infer<typeof schema>;
export function loadRelayConfig(environment: Record<string, string | undefined>): RelayConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid relay settings: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
  const url = new URL(parsed.data.VOICE_GATEWAY_PUBLIC_BASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Relay public URL must be an HTTPS origin.");
  if (parsed.data.CALL_TO_NUMBER === parsed.data.TELNYX_PHONE_NUMBER) throw new Error("Use distinct source and destination numbers.");
  return parsed.data;
}
