import type { VoiceCallContext } from "@/lib/voice-call-context";
import { assertControlledCallSafetyPolicy } from "@/voice-core/call-safety-policy";
import type { VoiceAttemptStore } from "@/voice-core/attempt-store";
import type { ControlledCallLease } from "@/voice-core/controlled-call-lease";
import { openVoiceEvidenceRecorder, type VoiceEvidenceRecorder } from "@/voice-core/evidence-recorder";
import {
  TELNYX_CANDIDATE_MODEL,
  TELNYX_MAEVE_VOICE,
  createTelnyxAssistantDraft,
  createTelnyxAssistantStartRequest,
  createTelnyxDialRequest,
  createTelnyxOpeningSpeakRequest,
  spokenTelnyxCandidateGreeting,
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
  speak(callControlId: string, body: Record<string, unknown>): Promise<void>;
  startAiAssistant(callControlId: string, body: Record<string, unknown>): Promise<void>;
};

export type TelnyxCandidateCallController = {
  attachAssistant(attemptId: string): Promise<void>;
  complete(attemptId: string): Promise<void>;
  evidence(attemptId: string): VoiceEvidenceRecorder | undefined;
  finalize(attemptId: string): Promise<void>;
  playOpeningGreeting(attemptId: string): Promise<void>;
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
    callsEnabled: true;
    connectionId: string;
    dataRetentionEnabled?: boolean;
    demoMode: true;
    publicBaseUrl: string;
    recordingEnabled?: boolean;
    telnyxPhoneNumber: string;
  };
  hangupRetry?: {
    delaysMs?: readonly number[];
    sleep?(delayMs: number): Promise<void>;
  };
  lease: ControlledCallLease;
  openEvidenceRecorder?: typeof openVoiceEvidenceRecorder;
  preflight(): Promise<unknown>;
}): TelnyxCandidateCallController {
  const evidence = new Map<string, VoiceEvidenceRecorder>();
  const automaticHangups = new Map<string, Promise<void>>();
  const openingSpeaks = new Set<string>();
  const assistantStarts = new Set<string>();
  const retryDelaysMs = options.hangupRetry?.delaysMs ?? [250, 750];
  const sleep = options.hangupRetry?.sleep ?? ((delayMs: number) => (
    new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  ));
  const openEvidenceRecorder = options.openEvidenceRecorder ?? openVoiceEvidenceRecorder;

  async function requestAutomaticHangup(attemptId: string) {
    const attempt = options.attempts.getAttempt(attemptId);
    if (!attempt?.providerCallId) return;
    const commandId = `${attempt.requestId}-automatic-hangup`;
    let lastError: unknown;
    for (let tryIndex = 0; tryIndex <= retryDelaysMs.length; tryIndex += 1) {
      try {
        await options.client.hangup(attempt.providerCallId, commandId);
        return;
      } catch (error) {
        lastError = error;
        await evidence.get(attemptId)?.record({
          channel: "events",
          monotonicMs: performance.now(),
          observedAt: new Date().toISOString(),
          payload: {
            commandId,
            error: error instanceof Error ? error.message : "hangup_request_failed",
            try: tryIndex + 1,
          },
          source: "telnyx-candidate-controller",
          type: "hangup.request_failed",
        }).catch(() => undefined);
        const retryDelayMs = retryDelaysMs[tryIndex];
        if (retryDelayMs === undefined) break;
        await sleep(retryDelayMs);
      }
    }

    options.attempts.markTerminationUncertain(attemptId);
    await evidence.get(attemptId)?.record({
      channel: "events",
      monotonicMs: performance.now(),
      observedAt: new Date().toISOString(),
      payload: { commandId },
      source: "telnyx-candidate-controller",
      type: "hangup.unconfirmed",
    }).catch(() => undefined);
    throw lastError;
  }

  async function finalizeResources(attemptId: string, leaseAction: "cancel" | "release") {
    const attempt = options.attempts.getAttempt(attemptId);
    const recorder = evidence.get(attemptId);
    let leaseFailure: unknown;
    let evidenceFailure: unknown;
    try {
      await options.lease[leaseAction](attemptId);
    } catch (error) {
      leaseFailure = error;
    }
    try {
      if (recorder) {
        const outcome = attempt?.outcome ?? "unknown";
        await recorder.finalize({
          dashboardOutcome: outcome,
          finishedAt: new Date().toISOString(),
          schedulingOutcome: attempt?.result?.kind ?? outcome,
        });
      }
    } catch (error) {
      evidenceFailure = error;
    } finally {
      evidence.delete(attemptId);
      automaticHangups.delete(attemptId);
      openingSpeaks.delete(attemptId);
      assistantStarts.delete(attemptId);
    }
    if (leaseFailure !== undefined && evidenceFailure !== undefined) {
      throw new AggregateError([leaseFailure, evidenceFailure], "Call cleanup and evidence finalization failed.");
    }
    if (evidenceFailure !== undefined) throw evidenceFailure;
    if (leaseFailure !== undefined) throw leaseFailure;
  }

  return {
    async attachAssistant(attemptId) {
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt?.providerCallId || assistantStarts.has(attemptId) || !openingSpeaks.has(attemptId)) {
        return;
      }
      assistantStarts.add(attemptId);
      const openingGreeting = spokenTelnyxCandidateGreeting(attempt.callContext);
      const commandId = `${attempt.requestId}-assistant-start`;
      await evidence.get(attemptId)?.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: { commandId },
        source: "telnyx-candidate-controller",
        type: "assistant.start_requested",
      });
      try {
        await options.client.startAiAssistant(
          attempt.providerCallId,
          createTelnyxAssistantStartRequest({
            assistantId: options.config.assistantId,
            attemptId: attempt.id,
            commandId,
            context: attempt.callContext,
            openingGreeting,
            toolToken: attempt.relayToken,
          }),
        );
      } catch (error) {
        assistantStarts.delete(attemptId);
        throw error;
      }
    },
    async complete(attemptId) {
      const inFlight = automaticHangups.get(attemptId);
      if (inFlight) return inFlight;
      const operation = requestAutomaticHangup(attemptId);
      automaticHangups.set(attemptId, operation);
      await operation;
    },
    evidence(attemptId) {
      return evidence.get(attemptId);
    },
    async playOpeningGreeting(attemptId) {
      const attempt = options.attempts.getAttempt(attemptId);
      if (!attempt?.providerCallId || openingSpeaks.has(attemptId)) return;
      openingSpeaks.add(attemptId);
      const commandId = `${attempt.requestId}-opening-speak`;
      const payload = spokenTelnyxCandidateGreeting(attempt.callContext);
      await evidence.get(attemptId)?.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: { commandId },
        source: "telnyx-candidate-controller",
        type: "speak.requested",
      });
      try {
        await options.client.speak(
          attempt.providerCallId,
          createTelnyxOpeningSpeakRequest({ commandId, payload }),
        );
      } catch (error) {
        openingSpeaks.delete(attemptId);
        throw error;
      }
    },
    async finalize(attemptId) {
      await finalizeResources(attemptId, "release");
    },
    async start(input) {
      const existing = options.attempts.assertCanCreateAttempt(input.requestId);
      if (existing?.providerCallId) {
        return { attemptId: existing.id, callControlId: existing.providerCallId };
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
      await options.lease.replaceOwner(input.requestId, attempt.id);

      const draft = createTelnyxAssistantDraft({
        dataRetentionEnabled: options.config.dataRetentionEnabled,
        publicBaseUrl: options.config.publicBaseUrl,
        recordingEnabled: options.config.recordingEnabled,
      });
      let recorder: VoiceEvidenceRecorder;
      try {
        recorder = await openEvidenceRecorder({
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

      try {
        assertControlledCallSafetyPolicy(options.config);
      } catch (error) {
        options.attempts.markFailed(attempt.id);
        await recorder.record({
          channel: "events",
          monotonicMs: performance.now(),
          observedAt: new Date().toISOString(),
          payload: { resultCode: "call_safety_policy_blocked" },
          source: "telnyx-candidate-controller",
          type: "dial.blocked",
        });
        await finalizeResources(attempt.id, "cancel");
        throw error;
      }

      let call: Awaited<ReturnType<TelnyxCandidateCallClient["dial"]>>;
      try {
        call = await options.client.dial(createTelnyxDialRequest({
          attemptId: attempt.id,
          callToNumber: options.config.callToNumber,
          commandId: input.requestId,
          connectionId: options.config.connectionId,
          publicBaseUrl: options.config.publicBaseUrl,
          recordingEnabled: options.config.recordingEnabled,
          telnyxPhoneNumber: options.config.telnyxPhoneNumber,
        }));
      } catch (error) {
        const definiteRejection = error instanceof TelnyxCandidateApiError
          && error.status >= 400
          && error.status < 500;
        if (definiteRejection) {
          options.attempts.markFailed(attempt.id);
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
        if (definiteRejection) await finalizeResources(attempt.id, "cancel");
        throw error;
      }

      options.attempts.bindProviderCallId(attempt.id, call.callControlId);
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
      if (!attempt) return;
      options.attempts.markCancelRequested(attemptId);
      if (!attempt.providerCallId) return;
      await options.client.hangup(attempt.providerCallId, `${attempt.requestId}-hangup`);
    },
  };
}
