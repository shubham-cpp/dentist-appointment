import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import type { ControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import { openVoiceEvidenceRecorder, type VoiceEvidenceRecorder } from "./evidence-recorder";
import {
  TELNYX_CANDIDATE_MODEL,
  TELNYX_MAEVE_VOICE,
  createTelnyxAssistantDraft,
  createTelnyxDialRequest,
} from "./telnyx-candidate";
import { TelnyxCandidateApiError } from "./telnyx-candidate-client";

type TelnyxDialRequest = ReturnType<typeof createTelnyxDialRequest>;

export type TelnyxCandidateCallClient = {
  dial(request: TelnyxDialRequest): Promise<{
    callControlId: string;
    callLegId: string;
    callSessionId: string;
  }>;
  hangup(callControlId: string, commandId: string): Promise<void>;
};

export type TelnyxCandidateCallController = {
  complete(attemptId: string): Promise<void>;
  evidence(attemptId: string): VoiceEvidenceRecorder | undefined;
  start(input: { context: VoiceCallContext; requestId: string }): Promise<{
    attemptId: string;
    callControlId: string;
  }>;
  stop(attemptId: string): Promise<void>;
};

export function createTelnyxCandidateCallController(options: {
  attempts: VoiceAttemptStore;
  client: TelnyxCandidateCallClient;
  config: {
    artifactsRoot: string;
    assistantId: string;
    assistantVersionId: string;
    callToNumber: string;
    connectionId: string;
    publicBaseUrl: string;
    telnyxPhoneNumber: string;
  };
  lease: ControlledCallLease;
  preflight(): Promise<void>;
}): TelnyxCandidateCallController {
  const evidence = new Map<string, VoiceEvidenceRecorder>();
  const automaticHangups = new Map<string, Promise<void>>();

  return {
    async complete(attemptId) {
      const inFlight = automaticHangups.get(attemptId);
      if (inFlight) return inFlight;
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt?.callSid) return;
      const callSid = attempt.callSid;
      const operation = (async () => {
        await options.client.hangup(
          callSid,
          `${attempt.requestId}-automatic-hangup`,
        );
        await options.lease.release(attemptId);
      })();
      automaticHangups.set(attemptId, operation);
      try {
        await operation;
      } catch (error) {
        automaticHangups.delete(attemptId);
        throw error;
      }
    },
    evidence(attemptId) {
      return evidence.get(attemptId);
    },
    async start(input) {
      const existing = options.attempts.assertCanCreateAttempt(input.requestId);
      if (existing?.callSid) return { attemptId: existing.id, callControlId: existing.callSid };

      await options.lease.acquire(input.requestId);
      try {
        await options.preflight();
      } catch (error) {
        await options.lease.cancel(input.requestId).catch(() => undefined);
        throw error;
      }

      const attempt = options.attempts.createAttempt(input.requestId, input.context);
      options.attempts.markCreating(attempt.id);
      await options.lease.replaceOwner(input.requestId, attempt.id);

      const draft = createTelnyxAssistantDraft({ publicBaseUrl: options.config.publicBaseUrl });
      let recorder: VoiceEvidenceRecorder;
      try {
        recorder = await openVoiceEvidenceRecorder({
          artifactsRoot: options.config.artifactsRoot,
          manifest: {
            attemptId: attempt.id,
            configuration: {
              assistantId: options.config.assistantId,
              assistantVersionId: options.config.assistantVersionId,
              draft,
            },
            correlation: { requestId: input.requestId },
            greeting: draft.greeting,
            model: TELNYX_CANDIDATE_MODEL,
            requestId: input.requestId,
            route: "call-control-embedded-assistant",
            runtime: "telnyx-candidate",
            startedAt: attempt.createdAt,
            voice: TELNYX_MAEVE_VOICE,
          },
        });
        evidence.set(attempt.id, recorder);
      } catch (error) {
        options.attempts.markFailed(attempt.id);
        await options.lease.release(attempt.id).catch(() => undefined);
        throw error;
      }

      await recorder.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: { commandId: input.requestId, requestId: input.requestId },
        source: "telnyx-candidate-controller",
        type: "dial.requested",
      });

      let call: Awaited<ReturnType<TelnyxCandidateCallClient["dial"]>>;
      try {
        call = await options.client.dial(createTelnyxDialRequest({
          assistantId: options.config.assistantId,
          attemptId: attempt.id,
          callToNumber: options.config.callToNumber,
          commandId: input.requestId,
          connectionId: options.config.connectionId,
          context: input.context,
          publicBaseUrl: options.config.publicBaseUrl,
          telnyxPhoneNumber: options.config.telnyxPhoneNumber,
          toolToken: attempt.relayToken,
        }));
      } catch (error) {
        const definiteRejection = error instanceof TelnyxCandidateApiError
          && error.status >= 400
          && error.status < 500;
        if (definiteRejection) {
          options.attempts.markFailed(attempt.id);
          await options.lease.cancel(attempt.id).catch(() => undefined);
        } else {
          options.attempts.markCreationUncertain(attempt.id);
        }
        await recorder.record({
          channel: "events",
          monotonicMs: performance.now(),
          observedAt: new Date().toISOString(),
          payload: error instanceof TelnyxCandidateApiError
            ? {
              message: error.message,
              providerCode: error.providerCode,
              providerDetail: error.providerDetail,
              providerTitle: error.providerTitle,
              status: error.status,
            }
            : { message: error instanceof Error ? error.message : "Call creation failed." },
          source: "telnyx-candidate-controller",
          type: "dial.failed",
        });
        throw error;
      }

      options.attempts.bindCallSid(attempt.id, call.callControlId);
      await recorder.correlate({
        assistantId: options.config.assistantId,
        assistantVersionId: options.config.assistantVersionId,
        providerCallId: call.callControlId,
        providerCallLegId: call.callLegId,
        providerCallSessionId: call.callSessionId,
      });
      await recorder.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: call,
        source: "telnyx-candidate-controller",
        type: "dial.created",
      });
      return { attemptId: attempt.id, callControlId: call.callControlId };
    },
    async stop(attemptId) {
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt?.callSid) return;
      options.attempts.markCancelRequested(attemptId);
      await options.client.hangup(attempt.callSid, `${attempt.requestId}-hangup`);
      options.attempts.markCanceled(attemptId);
      await options.lease.release(attemptId);
    },
  };
}
