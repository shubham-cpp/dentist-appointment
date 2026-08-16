import { randomBytes, randomUUID } from "node:crypto";
import {
  isControlledVoiceAttemptActive,
  isControlledVoiceAttemptTransportTerminal,
  type ControlledVoiceAttempt,
  type ControlledVoiceAttemptEvent,
  type ControlledVoiceAttemptOutcome,
  type ControlledVoiceAttemptSessionStatus,
  type ControlledVoiceAttemptTransportStatus,
} from "@/lib/controlled-voice-attempt";
import {
  createVoiceCallContext,
  type VoiceCallContext,
  type VoiceCallResult,
} from "@/lib/voice-call-context";

export type VoiceAttemptOutcome = ControlledVoiceAttemptOutcome;
export type VoiceAttemptSessionStatus = ControlledVoiceAttemptSessionStatus;
export type VoiceAttemptTransportStatus = ControlledVoiceAttemptTransportStatus;

type VoiceAttempt = {
  callContext: VoiceCallContext;
  callSid?: string;
  createdAt: string;
  expiresAt: number;
  id: string;
  lastSequenceNumber?: number;
  outcome: VoiceAttemptOutcome;
  processInstanceId: string;
  requestId: string;
  relayToken: string;
  result?: VoiceCallResult;
  shouldPlayTwilioFallback: boolean;
  sessionId?: string;
  sessionStatus: VoiceAttemptSessionStatus;
  transportStatus: VoiceAttemptTransportStatus;
  updatedAt: string;
  events: ControlledVoiceAttemptEvent[];
};

export type VoiceAttemptView = ControlledVoiceAttempt;

function statusLabel(status: VoiceAttemptTransportStatus) {
  return {
    requested: "Call requested",
    creating: "Creating controlled call",
    creation_uncertain: "Twilio did not confirm call creation",
    initiated: "Call initiated",
    ringing: "Ringing",
    answered: "Connected",
    cancel_requested: "Staff requested call end",
    completed: "Call completed",
    busy: "Test phone was busy",
    failed: "Call failed",
    no_answer: "No answer",
    canceled: "Staff ended the call",
    unknown: "Call status is unknown",
  }[status];
}

function cloneAttempt(attempt: VoiceAttempt): VoiceAttempt {
  return {
    ...attempt,
    callContext: structuredClone(attempt.callContext),
    events: attempt.events.map((event) => ({ ...event })),
    result: attempt.result ? structuredClone(attempt.result) : undefined,
  };
}

export class VoiceAttemptStore {
  readonly processInstanceId = randomUUID();
  private readonly attempts = new Map<string, VoiceAttempt>();
  private lastAttemptAt = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly cooldownMs = 10 * 60 * 1000,
    private readonly attemptLifetimeMs = 10 * 60 * 1000,
  ) {}

  createAttempt(
    requestId: string = randomUUID(),
    callContext: VoiceCallContext = createVoiceCallContext(new Date(this.now())),
  ) {
    const existingAttempt = this.assertCanCreateAttempt(requestId);
    if (existingAttempt) return cloneAttempt(existingAttempt);

    const createdAt = this.nowIso();
    const attempt: VoiceAttempt = {
      callContext: structuredClone(callContext),
      createdAt,
      expiresAt: this.now() + this.attemptLifetimeMs,
      id: `voice_${randomUUID()}`,
      outcome: "none",
      processInstanceId: this.processInstanceId,
      requestId,
      relayToken: randomBytes(32).toString("base64url"),
      sessionStatus: "not_connected",
      shouldPlayTwilioFallback: false,
      transportStatus: "requested",
      updatedAt: createdAt,
      events: [{ id: randomUUID(), label: "Call requested", timestamp: createdAt }],
    };

    this.attempts.set(attempt.id, attempt);
    this.lastAttemptAt = this.now();
    return cloneAttempt(attempt);
  }

  assertCanCreateAttempt(requestId: string) {
    this.removeExpiredAttempts();

    const existingAttempt = [...this.attempts.values()].find((attempt) => attempt.requestId === requestId);
    if (existingAttempt) return cloneAttempt(existingAttempt);

    if ([...this.attempts.values()].some(isControlledVoiceAttemptActive)) {
      throw new Error("A controlled call is already active.");
    }

    if (this.now() - this.lastAttemptAt < this.cooldownMs) {
      throw new Error("Wait ten minutes before starting another controlled call.");
    }
  }

  getAttempt(attemptId: string) {
    this.removeExpiredAttempts();
    const attempt = this.attempts.get(attemptId);
    return attempt ? cloneAttempt(attempt) : undefined;
  }

  getAttemptByRelayToken(relayToken: string) {
    this.removeExpiredAttempts();
    const attempt = [...this.attempts.values()].find((candidate) => candidate.relayToken === relayToken);
    return attempt ? cloneAttempt(attempt) : undefined;
  }

  getCallContextByRelayToken(relayToken: string) {
    return structuredClone(this.requireAttemptByRelayToken(relayToken).callContext);
  }

  getActiveCallSids() {
    this.removeExpiredAttempts();
    return [...this.attempts.values()].flatMap((attempt) => (
      attempt.callSid && isControlledVoiceAttemptActive(attempt) ? [attempt.callSid] : []
    ));
  }

  getActiveCallStops() {
    this.removeExpiredAttempts();
    return [...this.attempts.values()].flatMap((attempt) => (
      attempt.callSid && isControlledVoiceAttemptActive(attempt)
        ? [{ attemptId: attempt.id, callSid: attempt.callSid }]
        : []
    ));
  }

  getViewByRequestId(requestId: string): VoiceAttemptView | undefined {
    this.removeExpiredAttempts();
    const attempt = [...this.attempts.values()].find((candidate) => candidate.requestId === requestId);
    return attempt ? this.toView(attempt) : undefined;
  }

  getActiveView(): VoiceAttemptView | undefined {
    this.removeExpiredAttempts();
    const attempt = [...this.attempts.values()].find(isControlledVoiceAttemptActive);
    return attempt ? this.toView(attempt) : undefined;
  }

  getView(attemptId: string): VoiceAttemptView | undefined {
    const attempt = this.getAttempt(attemptId);
    return attempt ? this.toView(attempt) : undefined;
  }

  markCreating(attemptId: string) {
    return this.updateTransportStatus(attemptId, "creating");
  }

  bindCallSid(attemptId: string, callSid: string) {
    const attempt = this.requireAttempt(attemptId);

    if (attempt.callSid && attempt.callSid !== callSid) {
      throw new Error("The callback does not match the controlled call.");
    }

    if (attempt.callSid === callSid) return cloneAttempt(attempt);

    attempt.callSid = callSid;
    this.touch(attempt);
    return cloneAttempt(attempt);
  }

  updateStatus(attemptId: string, callSid: string, status: VoiceAttemptTransportStatus, sequenceNumber?: number) {
    const attempt = this.requireAttempt(attemptId);

    if (attempt.callSid && attempt.callSid !== callSid) {
      throw new Error("The callback does not match the controlled call.");
    }

    if (sequenceNumber !== undefined) {
      if (attempt.lastSequenceNumber !== undefined && sequenceNumber <= attempt.lastSequenceNumber) {
        return cloneAttempt(attempt);
      }

      attempt.lastSequenceNumber = sequenceNumber;
    }

    if (!attempt.callSid) attempt.callSid = callSid;

    if (attempt.transportStatus === "cancel_requested" && isControlledVoiceAttemptActive({
      ...this.toView(attempt),
      transportStatus: status,
    })) {
      return cloneAttempt(attempt);
    }

    if (attempt.transportStatus === "creation_uncertain" && status !== "unknown") {
      attempt.outcome = "none";
    }

    return this.updateTransportStatus(attemptId, status);
  }

  bindRelaySession(relayToken: string, callSid: string, sessionId: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);

    if (attempt.callSid !== callSid) {
      throw new Error("The Relay session does not match the controlled call.");
    }

    if (attempt.sessionId && attempt.sessionId !== sessionId) {
      throw new Error("A Relay session already exists for this controlled call.");
    }

    if (attempt.sessionId === sessionId && attempt.sessionStatus === "connected") {
      return cloneAttempt(attempt);
    }

    attempt.sessionId = sessionId;
    attempt.sessionStatus = "connected";
    this.addEvent(attempt, "Voice session connected");
    return cloneAttempt(attempt);
  }

  markCallerReplyReceived(relayToken: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    this.addEvent(attempt, "Caller reply received");
    return cloneAttempt(attempt);
  }

  markSpeaking(relayToken: string) {
    return this.updateSessionStatus(relayToken, "speaking", "Gateway response sent");
  }

  markInterrupted(relayToken: string) {
    return this.updateSessionStatus(relayToken, "interrupted", "Caller interrupted the response");
  }

  markRelayError(relayToken: string) {
    return this.updateSessionStatus(relayToken, "errored", "Voice session error");
  }

  recordRelayNotice(relayToken: string, label: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    if (attempt.events.some((event) => event.label === label)) return cloneAttempt(attempt);
    this.addEvent(attempt, label);
    return cloneAttempt(attempt);
  }

  requestTwilioStaffFollowUp(relayToken: string, label: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    if (attempt.shouldPlayTwilioFallback) return cloneAttempt(attempt);

    attempt.shouldPlayTwilioFallback = true;
    this.setOutcome(attempt.id, "staff_follow_up");
    if (!attempt.events.some((event) => event.label === label)) this.addEvent(attempt, label);
    return cloneAttempt(attempt);
  }

  shouldPlayTwilioStaffFollowUp(attemptId: string) {
    return this.requireAttempt(attemptId).shouldPlayTwilioFallback;
  }

  markRelayClosed(relayToken: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    this.closeSession(attempt);
    return cloneAttempt(attempt);
  }

  markFinalPlaybackUnconfirmed(relayToken: string) {
    return this.updateSessionStatus(
      relayToken,
      "errored",
      "System did not confirm final speech playback",
    );
  }

  markCanceled(attemptId: string) {
    return this.updateTransportStatus(attemptId, "canceled");
  }

  markCancelRequested(attemptId: string) {
    return this.updateTransportStatus(attemptId, "cancel_requested");
  }

  markFailed(attemptId: string) {
    return this.updateTransportStatus(attemptId, "failed");
  }

  markCreationUncertain(attemptId: string) {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.outcome === "none") attempt.outcome = "unknown";
    if (attempt.transportStatus === "cancel_requested") {
      this.addEvent(attempt, "Twilio did not confirm call creation");
      return cloneAttempt(attempt);
    }
    return this.updateTransportStatus(attemptId, "creation_uncertain");
  }

  completeFailedRelaySessionBeforeSetup(
    attemptId: string,
    callSid: string,
    sessionId: string,
  ) {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.callSid !== callSid || attempt.sessionId) {
      throw new Error("The failed Relay completion does not match an unbound controlled session.");
    }

    attempt.sessionId = sessionId;
    this.closeSession(attempt);
    if (["none", "unknown"].includes(attempt.outcome)) {
      attempt.outcome = "failed";
      this.addEvent(attempt, "System recorded the call outcome");
    }

    return cloneAttempt(attempt);
  }

  completeRelaySession(
    attemptId: string,
    callSid: string,
    sessionId: string,
    sessionStatus: "completed" | "ended" | "failed",
  ) {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.callSid !== callSid || attempt.sessionId !== sessionId) {
      throw new Error("The Relay completion does not match the controlled session.");
    }

    this.closeSession(attempt);

    if (sessionStatus === "failed" && ["none", "unknown"].includes(attempt.outcome)) {
      attempt.outcome = "failed";
      this.addEvent(attempt, "System recorded the call outcome");
    } else if (attempt.outcome === "none") {
      this.setOutcome(attempt.id, "unknown");
    }

    return cloneAttempt(attempt);
  }

  setOutcome(attemptId: string, outcome: VoiceAttemptOutcome) {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.outcome === outcome) return cloneAttempt(attempt);
    if (attempt.outcome !== "none") return cloneAttempt(attempt);
    attempt.outcome = outcome;
    const label = outcome === "rescheduled" ? "Fictional appointment rescheduled"
      : outcome === "canceled" ? "Fictional appointment canceled"
        : outcome === "slot_proposed" ? "System recorded a preferred time for staff review"
          : "System recorded the call outcome";
    this.addEvent(attempt, label);
    return cloneAttempt(attempt);
  }

  setOutcomeByRelayToken(relayToken: string, outcome: VoiceAttemptOutcome) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    return this.setOutcome(attempt.id, outcome);
  }

  setResultByRelayToken(relayToken: string, result: VoiceCallResult) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    if (attempt.result) return cloneAttempt(attempt);
    if (result.previousAppointment.id !== attempt.callContext.appointment.id) {
      throw new Error("The result does not match the active fictional appointment.");
    }
    if (result.kind === "rescheduled") {
      const stillAvailable = attempt.callContext.availableSlots.some((slot) => (
        slot.id === result.replacement.id
        && slot.dateIso === result.replacement.dateIso
        && slot.time === result.replacement.time
        && slot.provider.id === result.replacement.provider.id
      ));
      if (!stillAvailable) throw new Error("The replacement time is no longer available.");
    }
    attempt.result = structuredClone(result);
    this.setOutcome(attempt.id, result.kind);
    return cloneAttempt(attempt);
  }

  private addEvent(attempt: VoiceAttempt, label: string) {
    const timestamp = this.nowIso();
    attempt.events.unshift({ id: randomUUID(), label, timestamp });
    attempt.events.splice(20);
    attempt.updatedAt = timestamp;
  }

  private closeSession(attempt: VoiceAttempt) {
    if (attempt.sessionStatus === "closed") return;
    attempt.sessionStatus = "closed";
    this.addEvent(attempt, "Voice session closed");
  }

  private markTerminalOutcome(attempt: VoiceAttempt, status: VoiceAttemptTransportStatus) {
    if (attempt.outcome !== "none") return;
    if (!isControlledVoiceAttemptTransportTerminal(status)) return;
    attempt.outcome = ["completed", "unknown"].includes(status) ? "unknown" : "failed";
  }

  private removeExpiredAttempts() {
    for (const [id, attempt] of this.attempts.entries()) {
      if (attempt.expiresAt < this.now()) this.attempts.delete(id);
    }
  }

  private requireAttempt(attemptId: string) {
    this.removeExpiredAttempts();
    const attempt = this.attempts.get(attemptId);
    if (!attempt) throw new Error("The controlled call attempt is not available.");
    return attempt;
  }

  private requireAttemptByRelayToken(relayToken: string) {
    const attempt = this.getAttemptByRelayToken(relayToken);
    if (!attempt) throw new Error("The Relay token is not available.");
    return this.requireAttempt(attempt.id);
  }

  private toView(attempt: VoiceAttempt): VoiceAttemptView {
    return {
      createdAt: attempt.createdAt,
      events: attempt.events.map((event) => ({ ...event })),
      id: attempt.id,
      outcome: attempt.outcome,
      processInstanceId: attempt.processInstanceId,
      result: attempt.result ? structuredClone(attempt.result) : undefined,
      sessionStatus: attempt.sessionStatus,
      transportStatus: attempt.transportStatus,
      updatedAt: attempt.updatedAt,
    };
  }

  private touch(attempt: VoiceAttempt) {
    attempt.updatedAt = this.nowIso();
  }

  private updateSessionStatus(relayToken: string, status: VoiceAttemptSessionStatus, label: string) {
    const attempt = this.requireAttemptByRelayToken(relayToken);
    if (attempt.sessionStatus === status) return cloneAttempt(attempt);
    attempt.sessionStatus = status;
    this.addEvent(attempt, label);
    return cloneAttempt(attempt);
  }

  private updateTransportStatus(attemptId: string, status: VoiceAttemptTransportStatus) {
    const attempt = this.requireAttempt(attemptId);

    if (!isControlledVoiceAttemptActive(attempt) || attempt.transportStatus === status) {
      return cloneAttempt(attempt);
    }

    attempt.transportStatus = status;
    this.markTerminalOutcome(attempt, status);
    this.addEvent(attempt, statusLabel(status));
    return cloneAttempt(attempt);
  }

  private nowIso() {
    return new Date(this.now()).toISOString();
  }
}
