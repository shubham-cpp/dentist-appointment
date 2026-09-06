import Fastify from "fastify";
import { z } from "zod";
import {
  voiceCallContextSchema,
  type VoiceCallResult,
} from "@/lib/voice-call-context";
import {
  constantTimeEqualSecrets,
} from "@/lib/voice-gateway-internal";
import {
  createInternalVoiceRequestAuthorizer,
  registerControlledAttemptReadRoutes,
  registerControlledAttemptStartRoute,
} from "@/voice-runtime/internal-attempt-routes";
import type { VoiceAttemptStore, VoiceAttemptTransportStatus } from "@/voice-core/attempt-store";
import {
  createVoiceSchedulingAuthority,
  VoiceSchedulingError,
  voiceSchedulingToolNameSchema,
  type VoiceSchedulingCommand,
  type VoiceSchedulingResult,
} from "@/voice-core/scheduling-authority";
import type { TelnyxCandidateCallController } from "./telnyx-call-controller";
import { parseTelnyxSchedulingToolBody } from "./telnyx-candidate";
import { TelnyxCandidatePreflightError } from "./telnyx-candidate-preflight";

const attemptQuery = z.object({ attempt: z.string().startsWith("voice_") });
const qualificationBody = z.object({
  callContext: voiceCallContextSchema,
  scenarioId: z.string().regex(/^[a-z0-9-]+$/),
}).strict();
const telnyxEvent = z.object({
  data: z.object({
    event_type: z.string().min(1),
    id: z.string().min(1),
    occurred_at: z.string().datetime(),
    payload: z.object({
      assistant_id: z.string().optional(),
      call_control_id: z.string().min(1),
      call_leg_id: z.string().optional(),
      call_session_id: z.string().optional(),
      conversation_id: z.string().optional(),
    }).passthrough(),
    record_type: z.literal("event"),
  }).passthrough(),
});
const messageHistory = z.array(z.object({
  content: z.string().optional(),
  role: z.string(),
}).passthrough());
const automaticHangupFallbackMs = 12_000;
const closingPlaybackGraceMs = 3_000;
const eventDedupeLimit = 2_048;
const eventDedupeTtlMs = 10 * 60 * 1_000;
const messageHistoryDeltaLimit = 8;
const terminalTombstoneLimit = 256;
const terminalTombstoneTtlMs = 5 * 60 * 1_000;

type ScheduleHangup = (
  delayMs: number,
  task: () => Promise<void>,
) => () => void;

type PendingHangup = {
  assistantText?: string;
  cancelFallback: () => void;
  cancelPlayback?: () => void;
};

type TerminalTombstone = {
  callControlId: string;
  expiresAt: number;
};

function defaultScheduleHangup(delayMs: number, task: () => Promise<void>) {
  const timer = setTimeout(() => {
    void task().catch(() => undefined);
  }, delayMs);
  return () => clearTimeout(timer);
}

function isTerminalSchedulingResult(result: VoiceSchedulingResult) {
  return result.type === "change_committed"
    || result.type === "staff_follow_up_recorded"
    || (result.type === "identity_recorded" && result.result === "wrong_person");
}

export function isTelnyxTerminalAssistantClosing(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  return (
    /\bgoodbye[.!]?\s*$/.test(normalized)
    || /\bour team will contact you\b/.test(normalized)
    || /\bstaff will contact you\b/.test(normalized)
    || /\b(?:could not|couldn't|couldn’t|unable to) process\b/.test(normalized)
    || /\b(?:i am|i'm|i’m) ending the call\b/.test(normalized)
  );
}

function applyTerminalSchedulingOutcome(
  attempts: VoiceAttemptStore,
  attemptId: string,
  result: VoiceSchedulingResult,
) {
  if (result.type === "staff_follow_up_recorded") {
    attempts.setOutcome(attemptId, "staff_follow_up");
  } else if (result.type === "identity_recorded" && result.result === "wrong_person") {
    attempts.setOutcome(attemptId, "identity_failed");
  }
}

function eventTransportStatus(eventType: string, payload: Record<string, unknown>): VoiceAttemptTransportStatus | undefined {
  if (eventType === "call.initiated") return "initiated";
  if (eventType === "call.ringing") return "ringing";
  if (eventType === "call.answered") return "answered";
  if (eventType !== "call.hangup") return undefined;
  if (payload.hangup_cause === "busy") return "busy";
  if (["no_answer", "timeout"].includes(String(payload.hangup_cause))) return "no_answer";
  return "completed";
}

export function createTelnyxCandidateGateway(options: {
  attempts: VoiceAttemptStore;
  config: {
    internalSecret: string;
    testMode?: boolean;
    testToolToken?: string;
  };
  controller: TelnyxCandidateCallController;
  now?: () => number;
  preflight(): Promise<unknown>;
  scheduleHangup?: ScheduleHangup;
  validateRequest(rawBody: string, timestamp: string, signature: string): boolean;
}) {
  const app = Fastify({ logger: false });
  const rawBodies = new WeakMap<object, string>();
  const processedEvents = new Map<string, number>();
  const processingEvents = new Map<string, Promise<200 | 409>>();
  const messageHistoryCursors = new Map<string, { lastEntry: string; length: number }>();
  const terminalTombstones = new Map<string, TerminalTombstone>();
  const schedulingByAttempt = new Map<string, ReturnType<typeof createVoiceSchedulingAuthority>>();
  const lastAssistantText = new Map<string, string>();
  const toolFailures = new Map<string, number>();
  const pendingHangups = new Map<string, PendingHangup>();
  const endingAttempts = new Set<string>();
  const finalizingAttempts = new Map<string, Promise<void>>();
  const scheduleHangup = options.scheduleHangup ?? defaultScheduleHangup;
  const now = options.now ?? Date.now;
  let qualificationSession: {
    authority: ReturnType<typeof createVoiceSchedulingAuthority>;
    result?: VoiceCallResult;
    scenarioId: string;
    toolCalls: Array<{
      name: string;
      operationId: string;
      status: "completed" | "failed";
    }>;
  } | undefined;
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = String(body);
    rawBodies.set(request, rawBody);
    try {
      done(null, JSON.parse(rawBody));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  const internal = createInternalVoiceRequestAuthorizer(options.config.internalSecret);

  function pruneBoundedState() {
    const currentTime = now();
    for (const [eventId, expiresAt] of processedEvents) {
      if (expiresAt <= currentTime) processedEvents.delete(eventId);
    }
    for (const [attemptId, tombstone] of terminalTombstones) {
      if (tombstone.expiresAt <= currentTime) terminalTombstones.delete(attemptId);
    }
  }

  function rememberProcessedEvent(eventId: string) {
    processedEvents.set(eventId, now() + eventDedupeTtlMs);
    while (processedEvents.size > eventDedupeLimit) {
      const oldest = processedEvents.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      processedEvents.delete(oldest);
    }
  }

  function rememberTerminalAttempt(attemptId: string, callControlId: string) {
    terminalTombstones.set(attemptId, {
      callControlId,
      expiresAt: now() + terminalTombstoneTtlMs,
    });
    while (terminalTombstones.size > terminalTombstoneLimit) {
      const oldest = terminalTombstones.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      terminalTombstones.delete(oldest);
    }
  }

  function clearPendingHangup(attemptId: string) {
    const pending = pendingHangups.get(attemptId);
    pending?.cancelFallback();
    pending?.cancelPlayback?.();
    pendingHangups.delete(attemptId);
  }

  async function endAttempt(attemptId: string) {
    if (endingAttempts.has(attemptId) || terminalTombstones.has(attemptId)) return;
    endingAttempts.add(attemptId);
    try {
      await options.controller.complete(attemptId);
      clearPendingHangup(attemptId);
    } catch (error) {
      clearPendingHangup(attemptId);
      throw error;
    }
  }

  function armAutomaticHangup(attemptId: string, fromAssistantClosing = false) {
    if (pendingHangups.has(attemptId) || endingAttempts.has(attemptId) || terminalTombstones.has(attemptId)) return;
    options.attempts.revokeRelayAuthority(attemptId);
    const pending: PendingHangup = {
      assistantText: lastAssistantText.get(attemptId),
      cancelFallback: scheduleHangup(
        automaticHangupFallbackMs,
        () => endAttempt(attemptId),
      ),
    };
    if (fromAssistantClosing) {
      pending.cancelPlayback = scheduleHangup(
        closingPlaybackGraceMs,
        () => endAttempt(attemptId),
      );
    }
    pendingHangups.set(attemptId, pending);
  }

  function recordToolFailure(attemptId: string, unrecoverable = false) {
    const failures = (toolFailures.get(attemptId) ?? 0) + 1;
    toolFailures.set(attemptId, failures);
    const terminal = unrecoverable || failures >= 2;
    if (terminal) armAutomaticHangup(attemptId);
    return {
      terminal,
      message: terminal
        ? "This call cannot continue. Do not claim any action succeeded. Briefly apologize, thank the caller for their time with the clinic, say goodbye, and use hangup now."
        : "Correct the invalid arguments using the existing conversation context. Retry once without asking for details already supplied.",
    };
  }

  async function finalizeAttempt(attemptId: string, callControlId: string) {
    const inFlight = finalizingAttempts.get(attemptId);
    if (inFlight) return inFlight;
    const operation = (async () => {
      clearPendingHangup(attemptId);
      options.attempts.revokeRelayAuthority(attemptId);
      messageHistoryCursors.delete(attemptId);
      schedulingByAttempt.delete(attemptId);
      toolFailures.delete(attemptId);
      lastAssistantText.delete(attemptId);
      endingAttempts.delete(attemptId);
      await options.controller.finalize(attemptId);
      rememberTerminalAttempt(attemptId, callControlId);
    })();
    finalizingAttempts.set(attemptId, operation);
    try {
      await operation;
    } finally {
      finalizingAttempts.delete(attemptId);
    }
  }

  function prepareMessageHistory(attemptId: string, payload: Record<string, unknown>) {
    const parsed = messageHistory.safeParse(payload.message_history);
    if (!parsed.success) return { commit() {}, payload };
    const history = parsed.data;
    const previous = messageHistoryCursors.get(attemptId);
    const latest = history.at(-1);
    const latestEntry = latest ? JSON.stringify(latest) : "";
    let deltaStart = 0;
    if (previous?.length === history.length) {
      deltaStart = latestEntry === previous.lastEntry
        ? history.length
        : Math.max(0, history.length - 1);
    } else if (previous && previous.length < history.length) {
      const previousBoundary = history[previous.length - 1];
      const boundaryUnchanged = previous.length === 0
        || (previousBoundary !== undefined && JSON.stringify(previousBoundary) === previous.lastEntry);
      if (boundaryUnchanged) deltaStart = previous.length;
    }
    const uncappedDelta = history.slice(deltaStart);
    const delta = uncappedDelta.slice(-messageHistoryDeltaLimit);
    return {
      commit() {
        messageHistoryCursors.set(attemptId, { lastEntry: latestEntry, length: history.length });
        if (latest?.role !== "assistant" || !latest.content) return;
        lastAssistantText.set(attemptId, latest.content);
        if (isTelnyxTerminalAssistantClosing(latest.content)) {
          armAutomaticHangup(attemptId, true);
        }
        const pending = pendingHangups.get(attemptId);
        if (!pending || pending.assistantText === latest.content) return;
        pending.assistantText = latest.content;
        pending.cancelPlayback?.();
        pending.cancelPlayback = scheduleHangup(
          closingPlaybackGraceMs,
          () => endAttempt(attemptId),
        );
      },
      payload: {
        ...payload,
        message_history: delta,
        message_history_delta_start: Math.max(deltaStart, history.length - delta.length),
        message_history_total: history.length,
        ...(uncappedDelta.length > delta.length ? { message_history_delta_truncated: true } : {}),
      },
    };
  }

  app.addHook("onClose", async () => {
    for (const attemptId of pendingHangups.keys()) clearPendingHangup(attemptId);
  });

  app.get("/health", async () => ({ runtime: "telnyx-candidate", status: "ok" }));
  app.get("/internal/preflight", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    try {
      await options.preflight();
      return { runtime: "telnyx-candidate", status: "ok" };
    } catch (error) {
      return reply.code(503).send({
        error: "telnyx_candidate_unavailable",
        failedChecks: error instanceof TelnyxCandidatePreflightError ? error.failedChecks : undefined,
      });
    }
  });
  app.post("/internal/qualification-session", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    if (!options.config.testMode || !options.config.testToolToken) {
      return reply.code(404).send({ error: "test_mode_disabled" });
    }
    const body = qualificationBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request" });
    const session = {
      result: undefined as VoiceCallResult | undefined,
      scenarioId: body.data.scenarioId,
      toolCalls: [] as Array<{
        name: string;
        operationId: string;
        status: "completed" | "failed";
      }>,
    };
    qualificationSession = {
      ...session,
      authority: createVoiceSchedulingAuthority({
        applyResult(result) {
          session.result = result;
          if (qualificationSession) qualificationSession.result = result;
        },
        context: body.data.callContext,
      }),
    };
    return reply.code(204).send();
  });
  app.get("/internal/qualification-session", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    if (!qualificationSession) return reply.code(404).send({ error: "not_found" });
    return {
      outcome: qualificationSession.authority.outcome(),
      result: qualificationSession.result ?? null,
      scenarioId: qualificationSession.scenarioId,
      toolCalls: qualificationSession.toolCalls,
    };
  });
  registerControlledAttemptStartRoute(app, {
    attempts: options.attempts,
    isAuthorized: internal,
    start: (input) => options.controller.start(input),
    unavailableError: "telnyx_candidate_unavailable",
  });
  registerControlledAttemptReadRoutes(app, {
    attempts: options.attempts,
    isAuthorized: internal,
  });
  app.post("/internal/controlled-attempt/:attemptId/stop", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const attemptId = (request.params as { attemptId: string }).attemptId;
    if (!options.attempts.getAttempt(attemptId)) return reply.code(404).send({ error: "not_found" });
    try {
      await options.controller.stop(attemptId);
      return { attempt: options.attempts.getView(attemptId) };
    } catch {
      return reply.code(503).send({ error: "hangup_request_failed" });
    }
  });

  app.post("/voice-experiment/telnyx/events", async (request, reply) => {
    const rawBody = rawBodies.get(request) ?? "";
    const timestamp = request.headers["telnyx-timestamp"];
    const signature = request.headers["telnyx-signature-ed25519"];
    if (typeof timestamp !== "string" || typeof signature !== "string"
      || !options.validateRequest(rawBody, timestamp, signature)) {
      return reply.code(403).send();
    }
    const query = attemptQuery.safeParse(request.query);
    const event = telnyxEvent.safeParse(request.body);
    if (!query.success || !event.success) return reply.code(400).send();
    pruneBoundedState();
    const eventId = event.data.data.id;
    if (processedEvents.has(eventId)) return reply.code(200).send();
    const inFlight = processingEvents.get(eventId);
    if (inFlight) return reply.code(await inFlight).send();
    const operation = (async (): Promise<200 | 409> => {
      const tombstone = terminalTombstones.get(query.data.attempt);
      if (tombstone) {
        if (tombstone.callControlId !== event.data.data.payload.call_control_id) {
          return 409;
        }
        rememberProcessedEvent(eventId);
        return 200;
      }
      let attempt = options.attempts.getAttempt(query.data.attempt);
      const recorder = options.controller.evidence(query.data.attempt);
      const callControlId = event.data.data.payload.call_control_id;
      const mustTerminateLateCall = Boolean(
        attempt
        && ["creation_uncertain", "cancel_requested"].includes(attempt.transportStatus),
      );
      const canBindLateCall = Boolean(mustTerminateLateCall && attempt && !attempt.providerCallId);
      if (!attempt || !recorder
        || (attempt.providerCallId && attempt.providerCallId !== callControlId)
        || (!attempt.providerCallId && !canBindLateCall)) {
        return 409;
      }
      if (canBindLateCall) {
        options.attempts.bindProviderCallId(attempt.id, callControlId);
        if (attempt.transportStatus === "creation_uncertain") {
          options.attempts.markCancelRequested(attempt.id);
        }
        attempt = options.attempts.getAttempt(attempt.id)!;
      }
      let status = eventTransportStatus(event.data.data.event_type, event.data.data.payload);
      if (event.data.data.event_type === "call.hangup" && attempt.transportStatus === "cancel_requested") {
        status = "canceled";
      }
      if (status) options.attempts.updateStatus(attempt.id, callControlId, status);
      const historyUpdate = !mustTerminateLateCall
        && event.data.data.event_type === "call.ai_gather.message_history_updated"
        ? prepareMessageHistory(attempt.id, event.data.data.payload)
        : undefined;
      const evidencePayload = historyUpdate?.payload ?? event.data.data.payload;
      const evidenceEvent = {
        channel: event.data.data.event_type.includes("message_history") ? "transcript" : "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: { ...event.data.data, payload: evidencePayload },
        source: "telnyx-signed-webhook",
        type: event.data.data.event_type,
      } as const;
      let evidenceFailure: unknown;
      try {
        await recorder.correlate({
          ...(canBindLateCall ? { providerCallId: callControlId } : {}),
          ...(event.data.data.payload.assistant_id ? { assistantId: event.data.data.payload.assistant_id } : {}),
          ...(event.data.data.payload.conversation_id ? { conversationId: event.data.data.payload.conversation_id } : {}),
        });
        if (historyUpdate || mustTerminateLateCall) {
          await recorder.recordAndWait(evidenceEvent);
        } else {
          await recorder.record(evidenceEvent);
        }
        historyUpdate?.commit();
      } catch (error) {
        evidenceFailure = error;
      }
      let lifecycleFailure: unknown;
      try {
        if (event.data.data.event_type === "call.hangup") {
          await finalizeAttempt(attempt.id, callControlId);
        } else if (mustTerminateLateCall) {
          await options.controller.complete(attempt.id);
        } else if (event.data.data.event_type === "call.answered") {
          await options.controller.playOpeningGreeting(attempt.id);
        } else if (event.data.data.event_type === "call.speak.ended") {
          await options.controller.attachAssistant(attempt.id);
        }
      } catch (error) {
        lifecycleFailure = error;
      }
      if (evidenceFailure !== undefined && lifecycleFailure !== undefined) {
        throw new AggregateError([evidenceFailure, lifecycleFailure], "Evidence and call cleanup failed.");
      }
      if (evidenceFailure !== undefined) throw evidenceFailure;
      if (lifecycleFailure !== undefined) throw lifecycleFailure;
      rememberProcessedEvent(eventId);
      return 200;
    })();
    processingEvents.set(eventId, operation);
    try {
      return reply.code(await operation).send();
    } finally {
      if (processingEvents.get(eventId) === operation) processingEvents.delete(eventId);
    }
  });

  app.post("/voice-experiment/telnyx/tools/:toolName", async (request, reply) => {
    const parsedName = voiceSchedulingToolNameSchema.safeParse(
      (request.params as { toolName?: string }).toolName,
    );
    if (!parsedName.success) return reply.code(404).send();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    const attempt = token ? options.attempts.getAttemptByRelayToken(token) : undefined;
    const managedTest = Boolean(
      token
      && options.config.testMode
      && options.config.testToolToken
      && constantTimeEqualSecrets(token, options.config.testToolToken),
    );
    if (!attempt && !managedTest) return reply.code(401).send({ error: "invalid_tool_authority" });
    if (attempt && !constantTimeEqualSecrets(token, attempt.relayToken)) {
      return reply.code(401).send({ error: "invalid_tool_authority" });
    }
    if (attempt && (pendingHangups.has(attempt.id) || endingAttempts.has(attempt.id))) {
      return reply.code(409).send({ error: "attempt_ending" });
    }
    if (attempt && !options.attempts.hasActiveRelayAuthority(attempt.id, attempt.relayToken)) {
      return reply.code(409).send({ error: "attempt_inactive" });
    }
    if (attempt && request.headers["x-telnyx-call-control-id"] !== attempt.providerCallId) {
      return reply.code(409).send({ error: "call_mismatch" });
    }
    if (managedTest && !qualificationSession) return reply.code(409).send({ error: "test_session_inactive" });
    const body = parseTelnyxSchedulingToolBody(parsedName.data, request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "invalid_tool_request",
        fields: body.error.issues.map((issue) => issue.path.join(".")),
        ...(attempt ? recordToolFailure(attempt.id) : {}),
      });
    }
    const recorder = attempt ? options.controller.evidence(attempt.id) : undefined;
    if (attempt && !recorder) return reply.code(409).send({ error: "evidence_unavailable" });
    let scheduling = attempt ? schedulingByAttempt.get(attempt.id) : qualificationSession?.authority;
    if (!scheduling && attempt) {
      scheduling = createVoiceSchedulingAuthority({
        applyResult(result) {
          options.attempts.setResultByRelayToken(attempt.relayToken, result);
        },
        recordStaffFollowUp(result) {
          if (result.callback) {
            const { date, time, timeEnd, timeZone } = result.callback;
            options.attempts.recordRelayNotice(attempt.relayToken,
              `Demo callback requested for ${date} around ${time}${timeEnd ? ` to ${timeEnd}` : ""} ${timeZone}. Return call is simulated.`);
          }
        },
        context: attempt.callContext,
      });
      schedulingByAttempt.set(attempt.id, scheduling);
    }
    if (!scheduling) return reply.code(409).send({ error: "test_session_inactive" });
    const command = { name: parsedName.data, ...body.data } as VoiceSchedulingCommand;
    const eventBase = {
      channel: "tools" as const,
      observedAt: new Date().toISOString(),
      source: "telnyx-scheduling-tool",
    };
    if (recorder) {
      await recorder.record({
        ...eventBase,
        monotonicMs: performance.now(),
        payload: { command, name: command.name, operationId: command.operationId },
        type: "tool.started",
      });
    }
    try {
      if (managedTest
        && qualificationSession?.scenarioId === "tool-failure-duplicate-staff-follow-up"
        && command.name === "commit_change") {
        throw new Error("simulated_commit_failure");
      }
      const result = await scheduling.execute(command);
      if (attempt) {
        toolFailures.delete(attempt.id);
        applyTerminalSchedulingOutcome(options.attempts, attempt.id, result);
      }
      qualificationSession?.toolCalls.push({
        name: command.name,
        operationId: command.operationId,
        status: "completed",
      });
      if (recorder) {
        await recorder.record({
          ...eventBase,
          monotonicMs: performance.now(),
          payload: { name: command.name, operationId: command.operationId, result },
          type: "tool.completed",
        });
      }
      if (attempt && isTerminalSchedulingResult(result)) {
        armAutomaticHangup(attempt.id);
      }
      return result;
    } catch (error) {
      qualificationSession?.toolCalls.push({
        name: command.name,
        operationId: command.operationId,
        status: "failed",
      });
      if (recorder) {
        await recorder.record({
          ...eventBase,
          monotonicMs: performance.now(),
          payload: { error: error instanceof Error ? error.message : "unknown_tool_error", name: command.name, operationId: command.operationId },
          type: "tool.failed",
        });
      }
      const simulatedFailure = error instanceof Error && error.message === "simulated_commit_failure";
      return reply.code(simulatedFailure ? 503 : 409).send({
        error: simulatedFailure ? "tool_temporarily_unavailable" : "tool_failed",
        ...(attempt ? {
          code: error instanceof VoiceSchedulingError ? error.code : "tool_unavailable",
          ...recordToolFailure(attempt.id, !(error instanceof VoiceSchedulingError)
            || command.name === "request_staff_follow_up" || scheduling.outcome() === "uncertain"),
        } : {}),
      });
    }
  });

  return app;
}
