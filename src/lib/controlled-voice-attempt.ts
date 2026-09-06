import type { VoiceCallResult } from "./voice-call-context";

export const controlledVoiceAttemptOutcomes = [
  "none",
  "rescheduled",
  "canceled",
  "slot_proposed",
  "staff_follow_up",
  "declined",
  "identity_failed",
  "voicemail_or_uncertain",
  "failed",
  "unknown",
] as const;

export type ControlledVoiceAttemptOutcome = (typeof controlledVoiceAttemptOutcomes)[number];

export const controlledVoiceAttemptSessionStatuses = [
  "not_connected",
  "connected",
  "awaiting_reply",
  "speaking",
  "interrupted",
  "closed",
  "errored",
] as const;

export type ControlledVoiceAttemptSessionStatus = (typeof controlledVoiceAttemptSessionStatuses)[number];

export const controlledVoiceAttemptTransportStatuses = [
  "requested",
  "creating",
  "creation_uncertain",
  "initiated",
  "ringing",
  "answered",
  "cancel_requested",
  "completed",
  "busy",
  "failed",
  "no_answer",
  "canceled",
  "unknown",
] as const;

export type ControlledVoiceAttemptTransportStatus = (typeof controlledVoiceAttemptTransportStatuses)[number];

export type ControlledVoiceAttemptEvent = {
  id: string;
  label: string;
  timestamp: string;
};

export type ControlledVoiceAttempt = {
  callback?: { date: string; time: string; timeEnd?: string; timeZone: string; status: "requested" | "dispatched" };
  cooldownUntil?: string;
  createdAt: string;
  events: ControlledVoiceAttemptEvent[];
  id: string;
  outcome: ControlledVoiceAttemptOutcome;
  processInstanceId: string;
  result?: VoiceCallResult;
  sessionStatus: ControlledVoiceAttemptSessionStatus;
  transportStatus: ControlledVoiceAttemptTransportStatus;
  updatedAt: string;
};

const terminalTransportStatuses = new Set<ControlledVoiceAttemptTransportStatus>([
  "completed",
  "busy",
  "failed",
  "no_answer",
  "canceled",
  "unknown",
]);

export function isControlledVoiceAttemptActive(attempt: ControlledVoiceAttempt) {
  return !isControlledVoiceAttemptTransportTerminal(attempt.transportStatus);
}

export function isControlledVoiceAttemptTransportTerminal(status: ControlledVoiceAttemptTransportStatus) {
  return terminalTransportStatuses.has(status);
}
