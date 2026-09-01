import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  voiceCallContextSchema,
  type VoiceCallResult,
} from "@/lib/voice-call-context";
import { voiceGatewayInternalSecretHeader } from "@/lib/voice-gateway-internal";
import type { VoiceAttemptStore, VoiceAttemptTransportStatus } from "@/voice-gateway/attempt-store";
import {
  createVoiceSchedulingAuthority,
  type VoiceSchedulingCommand,
  type VoiceSchedulingResult,
} from "./scheduling-authority";
import type { TelnyxCandidateCallController } from "./telnyx-call-controller";
import { TelnyxCandidatePreflightError } from "./telnyx-candidate-preflight";

const attemptQuery = z.object({ attempt: z.string().startsWith("voice_") });
const requestId = z.string().uuid();
const startBody = z.object({ callContext: voiceCallContextSchema }).strict();
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
const toolName = z.enum([
  "verify_identity",
  "find_slots",
  "prepare_change",
  "commit_change",
  "request_staff_follow_up",
]);
const operationId = z.string().min(1).max(100);
const toolBodies = {
  verify_identity: z.object({ operationId, result: z.enum(["confirmed", "unclear", "wrong_person"]) }).strict(),
  find_slots: z.object({
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(6).optional(),
    operationId,
    provider: z.enum(["any", "current"]),
    timePreference: z.enum(["morning", "afternoon", "evening"]).optional(),
  }).strict(),
  prepare_change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("reschedule"), operationId, slotId: z.string().min(1) }).strict(),
    z.object({ kind: z.literal("cancellation"), operationId }).strict(),
  ]),
  commit_change: z.object({ actionToken: z.string().min(1), confirmed: z.boolean(), operationId }).strict(),
  request_staff_follow_up: z.object({ operationId, reason: z.string().min(1).max(200) }).strict(),
} as const;

const messageHistory = z.array(z.object({
  content: z.string().optional(),
  role: z.string(),
}).passthrough());
const automaticHangupFallbackMs = 12_000;
const closingPlaybackGraceMs = 3_000;

type ScheduleHangup = (
  delayMs: number,
  task: () => Promise<void>,
) => () => void;

type PendingHangup = {
  assistantText?: string;
  cancelFallback: () => void;
  cancelPlayback?: () => void;
};

function defaultScheduleHangup(delayMs: number, task: () => Promise<void>) {
  const timer = setTimeout(() => {
    void task().catch(() => undefined);
  }, delayMs);
  return () => clearTimeout(timer);
}

function callerAskedToEndCall(content: string) {
  const spacing = "[\\s,.!]+";
  const preface = `(?:(?:yeah|yes|yep|ok(?:ay)?|please|sure|thanks|thank${spacing}you|go${spacing}ahead|and)${spacing})*`;
  const endCall = `(?:end|finish|disconnect)(?:${spacing}(?:the|this|our))?${spacing}call`;
  const hangUp = `(?:you${spacing}can${spacing})?hang${spacing}up(?:${spacing}(?:the|this)${spacing}call)?`;
  const politeQuestion = `(?:can|could|would|will)${spacing}you(?:${spacing}please)?${spacing}(?:${endCall}|hang${spacing}up)`;
  return new RegExp(
    `^${preface}(?:${politeQuestion}|(?:please${spacing})?(?:${endCall}|${hangUp}))(?:${spacing}now)?[\\s,.!?]*$`,
    "i",
  ).test(content.trim());
}

function isTerminalSchedulingResult(result: VoiceSchedulingResult) {
  return result.type === "change_committed"
    || result.type === "staff_follow_up_recorded"
    || (result.type === "identity_recorded" && result.result === "wrong_person");
}

function sameSecret(provided: string | undefined, expected: string) {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
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
  preflight(): Promise<void>;
  scheduleHangup?: ScheduleHangup;
  validateRequest(rawBody: string, timestamp: string, signature: string): boolean;
}) {
  const app = Fastify({ logger: false });
  const rawBodies = new WeakMap<object, string>();
  const processedEvents = new Set<string>();
  const schedulingByAttempt = new Map<string, ReturnType<typeof createVoiceSchedulingAuthority>>();
  const lastAssistantText = new Map<string, string>();
  const pendingHangups = new Map<string, PendingHangup>();
  const endingAttempts = new Set<string>();
  const endedAttempts = new Set<string>();
  const scheduleHangup = options.scheduleHangup ?? defaultScheduleHangup;
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

  function internal(request: FastifyRequest) {
    const value = request.headers[voiceGatewayInternalSecretHeader];
    return sameSecret(Array.isArray(value) ? value[0] : value, options.config.internalSecret);
  }

  function clearPendingHangup(attemptId: string) {
    const pending = pendingHangups.get(attemptId);
    pending?.cancelFallback();
    pending?.cancelPlayback?.();
    pendingHangups.delete(attemptId);
  }

  async function endAttempt(attemptId: string) {
    if (endingAttempts.has(attemptId) || endedAttempts.has(attemptId)) return;
    endingAttempts.add(attemptId);
    try {
      await options.controller.complete(attemptId);
      endedAttempts.add(attemptId);
      clearPendingHangup(attemptId);
    } finally {
      endingAttempts.delete(attemptId);
    }
  }

  function armAutomaticHangup(attemptId: string) {
    if (pendingHangups.has(attemptId) || endedAttempts.has(attemptId)) return;
    pendingHangups.set(attemptId, {
      assistantText: lastAssistantText.get(attemptId),
      cancelFallback: scheduleHangup(
        automaticHangupFallbackMs,
        () => endAttempt(attemptId),
      ),
    });
  }

  function processMessageHistory(attemptId: string, payload: Record<string, unknown>) {
    const parsed = messageHistory.safeParse(payload.message_history);
    if (!parsed.success) return;
    const latest = parsed.data.at(-1);
    if (!latest) return;
    if (latest.role === "user" && latest.content && callerAskedToEndCall(latest.content)) {
      armAutomaticHangup(attemptId);
      return;
    }
    if (latest.role !== "assistant" || !latest.content) return;
    lastAssistantText.set(attemptId, latest.content);
    const pending = pendingHangups.get(attemptId);
    if (!pending || pending.assistantText === latest.content) return;
    pending.assistantText = latest.content;
    pending.cancelPlayback?.();
    pending.cancelPlayback = scheduleHangup(
      closingPlaybackGraceMs,
      () => endAttempt(attemptId),
    );
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
  app.post("/internal/controlled-attempt", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsedRequestId = requestId.safeParse(request.headers["x-voice-request-id"]);
    const body = startBody.safeParse(request.body);
    if (!parsedRequestId.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
    try {
      const started = await options.controller.start({ context: body.data.callContext, requestId: parsedRequestId.data });
      return reply.code(201).send({ attempt: options.attempts.getView(started.attemptId) });
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "telnyx_candidate_unavailable" });
    }
  });
  app.get("/internal/controlled-attempt/current", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const attempt = options.attempts.getActiveView();
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });
  app.get("/internal/controlled-attempt/by-request/:requestId", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsed = requestId.safeParse((request.params as { requestId?: string }).requestId);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request_id" });
    const attempt = options.attempts.getViewByRequestId(parsed.data);
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });
  app.get("/internal/controlled-attempt/:attemptId", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const attempt = options.attempts.getView((request.params as { attemptId: string }).attemptId);
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });
  app.post("/internal/controlled-attempt/:attemptId/stop", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const attemptId = (request.params as { attemptId: string }).attemptId;
    if (!options.attempts.getAttempt(attemptId)) return reply.code(404).send({ error: "not_found" });
    await options.controller.stop(attemptId);
    return { attempt: options.attempts.getView(attemptId) };
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
    if (processedEvents.has(event.data.data.id)) return reply.code(200).send();
    const attempt = options.attempts.getAttempt(query.data.attempt);
    const recorder = options.controller.evidence(query.data.attempt);
    if (!attempt || attempt.callSid !== event.data.data.payload.call_control_id || !recorder) {
      return reply.code(409).send();
    }
    processedEvents.add(event.data.data.id);
    const status = eventTransportStatus(event.data.data.event_type, event.data.data.payload);
    if (status) options.attempts.updateStatus(attempt.id, attempt.callSid, status);
    if (event.data.data.event_type === "call.ai_gather.message_history_updated") {
      processMessageHistory(attempt.id, event.data.data.payload);
    }
    if (event.data.data.event_type === "call.hangup") {
      endedAttempts.add(attempt.id);
      clearPendingHangup(attempt.id);
    }
    await recorder.correlate({
      ...(event.data.data.payload.assistant_id ? { assistantId: event.data.data.payload.assistant_id } : {}),
      ...(event.data.data.payload.conversation_id ? { conversationId: event.data.data.payload.conversation_id } : {}),
    });
    await recorder.record({
      channel: event.data.data.event_type.includes("message_history") ? "transcript" : "events",
      monotonicMs: performance.now(),
      observedAt: new Date().toISOString(),
      payload: event.data.data,
      source: "telnyx-signed-webhook",
      type: event.data.data.event_type,
    });
    return reply.code(200).send();
  });

  app.post("/voice-experiment/telnyx/tools/:toolName", async (request, reply) => {
    const parsedName = toolName.safeParse((request.params as { toolName?: string }).toolName);
    if (!parsedName.success) return reply.code(404).send();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    const attempt = token ? options.attempts.getAttemptByRelayToken(token) : undefined;
    const managedTest = Boolean(
      token
      && options.config.testMode
      && options.config.testToolToken
      && sameSecret(token, options.config.testToolToken),
    );
    if (!attempt && !managedTest) return reply.code(401).send();
    if (attempt && !sameSecret(token, attempt.relayToken)) return reply.code(401).send();
    if (attempt && request.headers["x-telnyx-call-control-id"] !== attempt.callSid) {
      return reply.code(409).send();
    }
    if (managedTest && !qualificationSession) return reply.code(409).send({ error: "test_session_inactive" });
    const body = toolBodies[parsedName.data].safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_tool_request" });
    const recorder = attempt ? options.controller.evidence(attempt.id) : undefined;
    if (attempt && !recorder) return reply.code(409).send();
    let scheduling = attempt ? schedulingByAttempt.get(attempt.id) : qualificationSession?.authority;
    if (!scheduling && attempt) {
      scheduling = createVoiceSchedulingAuthority({
        applyResult(result) {
          options.attempts.setResultByRelayToken(attempt.relayToken, result);
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
        error: error instanceof Error ? error.message : "tool_failed",
      });
    }
  });

  return app;
}
