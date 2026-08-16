export type ControlledVoicePollFailure =
  | "gateway_unavailable"
  | "not_configured"
  | "not_found"
  | "request_failed";

export function nextControlledVoicePollDelay(
  failure: ControlledVoicePollFailure,
  retryCount: number,
) {
  if (failure !== "gateway_unavailable") return undefined;

  return Math.min(2_000 * (2 ** Math.min(retryCount, 2)), 8_000);
}
