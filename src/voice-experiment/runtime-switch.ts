export type VoiceRuntimeSelection =
  | "telnyx-relay"
  | "current-gateway"
  | "telnyx-candidate"
  | "twilio-candidate";

export function loadVoiceRuntimeSelection(
  environment: Record<string, string | undefined>,
): VoiceRuntimeSelection {
  const value = environment.VOICE_RUNTIME;
  if (!value || value === "current-gateway") return "current-gateway";
  if (value === "telnyx-relay" || value === "twilio-candidate" || value === "telnyx-candidate") return value;
  throw new Error(
    "VOICE_RUNTIME must be telnyx-relay, current-gateway, twilio-candidate, or telnyx-candidate.",
  );
}
