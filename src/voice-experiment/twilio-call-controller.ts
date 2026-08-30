import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { ControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import type { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import {
  openVoiceEvidenceRecorder,
  type VoiceEvidenceRecorder,
} from "./evidence-recorder";
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
  start(input: {
    context: VoiceCallContext;
    requestId: string;
  }): Promise<{ attemptId: string; callSid: string }>;
  stop(attemptId: string): Promise<void>;
};

export function createTwilioCandidateCallController(options: {
  attempts: VoiceAttemptStore;
  client: TwilioCandidateCallClient;
  config: {
    aiModel: string;
    artifactsRoot: string;
    callToNumber: string;
    publicBaseUrl: string;
    twilioPhoneNumber: string;
  };
  lease: ControlledCallLease;
  preflight(): Promise<void>;
}): TwilioCandidateCallController {
  const evidence = new Map<string, VoiceEvidenceRecorder>();

  return {
    evidence(attemptId) {
      return evidence.get(attemptId);
    },
    async start(input) {
      const existing = options.attempts.assertCanCreateAttempt(input.requestId);
      if (existing?.callSid) return { attemptId: existing.id, callSid: existing.callSid };

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
        recorder = await openVoiceEvidenceRecorder({
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

      let call: { sid: string };
      try {
        call = await options.client.createCall(createTwilioCandidateCallRequest({
          attemptId: attempt.id,
          callToNumber: options.config.callToNumber,
          publicBaseUrl: options.config.publicBaseUrl,
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

      options.attempts.bindCallSid(attempt.id, call.sid);
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
    async stop(attemptId) {
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt?.callSid) return;
      options.attempts.markCancelRequested(attemptId);
      await options.client.stopCall(attempt.callSid);
      options.attempts.markCanceled(attemptId);
      await options.lease.release(attemptId);
    },
  };
}
