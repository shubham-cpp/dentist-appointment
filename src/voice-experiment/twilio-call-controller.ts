import type { VoiceCallContext } from "@/lib/voice-call-context";
import { isControlledVoiceAttemptTransportTerminal } from "@/lib/controlled-voice-attempt";
import { assertControlledCallSafetyPolicy } from "@/voice-core/call-safety-policy";
import type { ControlledCallLease } from "@/voice-core/controlled-call-lease";
import type { VoiceAttemptStore } from "@/voice-core/attempt-store";
import {
  openVoiceEvidenceRecorder,
  type VoiceEvidenceRecorder,
} from "@/voice-core/evidence-recorder";
import {
  createTwilioCandidateCallRequest,
  createTwilioCandidateGreeting,
  twilioCandidateDefaults,
} from "./twilio-candidate";

type TwilioCallRequest = ReturnType<typeof createTwilioCandidateCallRequest>;

export type TwilioCandidateCallClient = {
  createCall(request: TwilioCallRequest): Promise<{ sid: string }>;
  stopCall(callSid: string): Promise<void>;
};

export type TwilioCandidateCallController = {
  evidence(attemptId: string): VoiceEvidenceRecorder | undefined;
  finalize(attemptId: string): Promise<void>;
  isStopRequested?(attemptId: string): boolean;
  start(input: {
    context: VoiceCallContext;
    requestId: string;
  }): Promise<{ attemptId: string; callSid: string }>;
  stop(attemptId: string): Promise<void>;
};

export class TwilioCallCreationTimeoutError extends Error {
  constructor() {
    super("Twilio did not confirm call creation in time.");
    this.name = "TwilioCallCreationTimeoutError";
  }
}

export function createTwilioCandidateCallController(options: {
  attempts: VoiceAttemptStore;
  callCreationTimeoutMs?: number;
  client: TwilioCandidateCallClient;
  config: {
    aiModel: string;
    artifactsRoot: string;
    callToNumber: string;
    callsEnabled: true;
    demoMode: true;
    publicBaseUrl: string;
    recordingEnabled?: boolean;
    twilioPhoneNumber: string;
  };
  lease: ControlledCallLease;
  openEvidenceRecorder?: typeof openVoiceEvidenceRecorder;
  preflight(): Promise<unknown>;
}): TwilioCandidateCallController {
  const evidence = new Map<string, VoiceEvidenceRecorder>();
  const finalizations = new Map<string, Promise<void>>();
  const cancelRequestedAttempts = new Set<string>();
  const stopRequests = new Map<string, Promise<void>>();
  const callCreationTimeoutMs = Math.max(1, options.callCreationTimeoutMs ?? 10_000);
  const createEvidenceRecorder = options.openEvidenceRecorder ?? openVoiceEvidenceRecorder;

  async function createCallWithDeadline(request: TwilioCallRequest) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        options.client.createCall(request),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new TwilioCallCreationTimeoutError()),
            callCreationTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function finalizeAndRelease(attemptId: string) {
    const inFlight = finalizations.get(attemptId);
    if (inFlight) return inFlight;
    const operation = (async () => {
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt || !isControlledVoiceAttemptTransportTerminal(attempt.transportStatus)) {
        throw new Error("The controlled call cannot finish before a terminal provider callback.");
      }
      const recorder = evidence.get(attemptId);
      if (!recorder) return;
      let evidenceError: unknown;
      try {
        await recorder.finalize({
          dashboardOutcome: attempt.outcome,
          finishedAt: new Date().toISOString(),
          schedulingOutcome: attempt.result?.kind ?? attempt.outcome,
        });
      } catch (error) {
        evidenceError = error;
      }

      let leaseError: unknown;
      try {
        await options.lease.release(attemptId);
      } catch (error) {
        leaseError = error;
      }

      if (!leaseError) {
        cancelRequestedAttempts.delete(attemptId);
        evidence.delete(attemptId);
        stopRequests.delete(attemptId);
      }
      if (evidenceError && leaseError) {
        throw new AggregateError(
          [evidenceError, leaseError],
          "Evidence finalization and controlled call lease release failed.",
        );
      }
      if (leaseError) throw leaseError;
      if (evidenceError) throw evidenceError;
    })();
    finalizations.set(attemptId, operation);
    try {
      await operation;
    } finally {
      finalizations.delete(attemptId);
    }
  }

  async function rejectBlockedDial(
    attemptId: string,
    recorder: VoiceEvidenceRecorder,
    error: unknown,
  ) {
    options.attempts.markFailed(attemptId);
    await recorder.record({
      channel: "events",
      monotonicMs: performance.now(),
      observedAt: new Date().toISOString(),
      payload: { resultCode: "call_safety_policy_blocked" },
      source: "twilio-candidate-controller",
      type: "dial.blocked",
    });
    const attempt = options.attempts.getAttempt(attemptId);
    await recorder.finalize({
      dashboardOutcome: attempt?.outcome ?? "failed",
      finishedAt: new Date().toISOString(),
      schedulingOutcome: attempt?.result?.kind ?? "failed",
    });
    await options.lease.cancel(attemptId);
    evidence.delete(attemptId);
    throw error;
  }

  async function stop(attemptId: string) {
    const inFlight = stopRequests.get(attemptId);
    if (inFlight) return inFlight;
    const attempt = options.attempts.getAttempt(attemptId);
    if (!attempt) throw new Error("The controlled call is unavailable.");
    cancelRequestedAttempts.add(attemptId);
    const stoppedAttempt = options.attempts.markCancelRequested(attemptId);
    if (!stoppedAttempt.providerCallId) return;
    const operation = options.client.stopCall(stoppedAttempt.providerCallId);
    stopRequests.set(attemptId, operation);
    try {
      await operation;
    } catch (error) {
      stopRequests.delete(attemptId);
      options.attempts.markTerminationUncertain(attemptId);
      throw error;
    }
  }

  return {
    evidence(attemptId) {
      return evidence.get(attemptId);
    },
    finalize: finalizeAndRelease,
    isStopRequested(attemptId) {
      return cancelRequestedAttempts.has(attemptId);
    },
    async start(input) {
      const existing = options.attempts.assertCanCreateAttempt(input.requestId);
      if (existing?.providerCallId) {
        return { attemptId: existing.id, callSid: existing.providerCallId };
      }

      await options.lease.acquire(input.requestId);
      try {
        await options.preflight();
      } catch (error) {
        await options.lease.cancel(input.requestId).catch(() => undefined);
        throw error;
      }

      const attempt = options.attempts.createAttempt(input.requestId, input.context);
      options.attempts.markCreating(attempt.id);
      try {
        await options.lease.replaceOwner(input.requestId, attempt.id);
      } catch (error) {
        options.attempts.markFailed(attempt.id);
        await options.lease.cancel(input.requestId).catch(() => undefined);
        throw error;
      }

      let recorder: VoiceEvidenceRecorder;
      try {
        recorder = await createEvidenceRecorder({
          artifactsRoot: options.config.artifactsRoot,
          manifest: {
            attemptId: attempt.id,
            configuration: twilioCandidateDefaults,
            correlation: { requestId: input.requestId },
            greeting: createTwilioCandidateGreeting(input.context),
            model: options.config.aiModel,
            requestId: input.requestId,
            route: "conversation-relay",
            runtime: "twilio-candidate",
            startedAt: attempt.createdAt,
            voice: twilioCandidateDefaults.voice,
          },
        });
        evidence.set(attempt.id, recorder);
        await recorder.record({
          channel: "events",
          monotonicMs: performance.now(),
          observedAt: new Date().toISOString(),
          payload: { requestId: input.requestId },
          source: "twilio-candidate-controller",
          type: "dial.requested",
        });
      } catch (error) {
        options.attempts.markFailed(attempt.id);
        await options.lease.release(attempt.id).catch(() => undefined);
        throw error;
      }

      try {
        assertControlledCallSafetyPolicy(options.config);
      } catch (error) {
        await rejectBlockedDial(attempt.id, recorder, error);
      }

      let call: { sid: string };
      try {
        call = await createCallWithDeadline(createTwilioCandidateCallRequest({
          attemptId: attempt.id,
          callToNumber: options.config.callToNumber,
          publicBaseUrl: options.config.publicBaseUrl,
          recordCall: options.config.recordingEnabled,
          twilioPhoneNumber: options.config.twilioPhoneNumber,
        }));
      } catch (error) {
        options.attempts.markCreationUncertain(attempt.id);
        await recorder.record({
          channel: "events",
          monotonicMs: performance.now(),
          observedAt: new Date().toISOString(),
          payload: { message: error instanceof Error ? error.message : "Call creation failed." },
          source: "twilio-candidate-controller",
          type: "dial.failed",
        });
        throw error;
      }

      const updatedAttempt = options.attempts.bindProviderCallId(attempt.id, call.sid);
      if (updatedAttempt.transportStatus === "cancel_requested"
        || cancelRequestedAttempts.has(attempt.id)) {
        await stop(attempt.id);
      }
      await recorder.correlate({ providerCallId: call.sid });
      await recorder.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: { providerCallId: call.sid },
        source: "twilio-candidate-controller",
        type: "dial.created",
      });
      return { attemptId: attempt.id, callSid: call.sid };
    },
    stop,
  };
}
