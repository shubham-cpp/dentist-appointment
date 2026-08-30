export type VoiceRuntimeSelection =
  | "current-gateway"
  | "telnyx-candidate"
  | "twilio-candidate";

export function loadVoiceRuntimeSelection(
  environment: Record<string, string | undefined>,
): VoiceRuntimeSelection {
  const value = environment.VOICE_RUNTIME;
  if (!value || value === "conversation-relay" || value === "current-gateway") {
    return "current-gateway";
  }
  if (value === "telnyx-ai-assistant") return "telnyx-candidate";
  if (value === "twilio-candidate" || value === "telnyx-candidate") return value;
  throw new Error(
    "VOICE_RUNTIME must be current-gateway, conversation-relay, twilio-candidate, telnyx-candidate, or telnyx-ai-assistant.",
  );
}
