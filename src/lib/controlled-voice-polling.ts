export type ControlledVoicePollFailure =
  | "gateway_unavailable"
  | "not_configured"
  | "not_found"
  | "request_failed";

export const MAX_CONTROLLED_VOICE_POLL_RETRIES = 5;

export function nextControlledVoicePollDelay(
  failure: ControlledVoicePollFailure,
  retryCount: number,
) {
  if (failure !== "gateway_unavailable") return undefined;
  if (retryCount >= MAX_CONTROLLED_VOICE_POLL_RETRIES) return undefined;

  return Math.min(2_000 * (2 ** Math.min(retryCount, 2)), 8_000);
}
