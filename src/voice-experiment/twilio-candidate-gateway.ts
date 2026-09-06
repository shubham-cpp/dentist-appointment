import Fastify, { type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { isControlledVoiceAttemptTransportTerminal } from "@/lib/controlled-voice-attempt";
import {
  createInternalVoiceRequestAuthorizer,
  registerControlledAttemptReadRoutes,
  registerControlledAttemptStartRoute,
} from "@/voice-runtime/internal-attempt-routes";
import type {
  VoiceAttemptStore,
  VoiceAttemptTransportStatus,
} from "@/voice-core/attempt-store";
import { createLocalOpenAiVoiceDialogueModel } from "./openai-dialogue-model";
import { createVoiceSchedulingAuthority } from "@/voice-core/scheduling-authority";
import type { TwilioCandidateCallController } from "./twilio-call-controller";
import { createTwilioCandidateTwiML } from "./twilio-candidate";
import { createTwilioDialogueSession } from "./twilio-dialogue-session";
import { TwilioCandidatePreflightError } from "./twilio-candidate-preflight";
import {
  createTwilioRelayRuntime,
  type TwilioRelayMessage,
} from "./twilio-relay-runtime";

const attemptQuery = z.object({ attempt: z.string().startsWith("voice_") });
const callSid = z.string().regex(/^CA[a-fA-F0-9]{32}$/);
const twimlBody = z.object({ CallSid: callSid });
const statusBody = z.object({
  CallSid: callSid,
  CallStatus: z.enum([
    "initiated",
    "ringing",
    "in-progress",
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
  ]),
  SequenceNumber: z.coerce.number().int().nonnegative().optional(),
});
const recordingBody = z.object({
  CallSid: callSid,
  RecordingChannels: z.coerce.number().int().positive().optional(),
  RecordingDuration: z.coerce.number().int().nonnegative().optional(),
  RecordingSid: z.string().regex(/^RE[a-fA-F0-9]{32}$/),
  RecordingStatus: z.enum(["in-progress", "completed", "absent", "failed"]),
  RecordingUrl: z.string().url().optional(),
}).passthrough();
const relayMessage = z.discriminatedUnion("type", [
  z.object({
    callSid,
    customParameters: z.object({ relayToken: z.string().min(1) }).passthrough(),
    sessionId: z.string().regex(/^VX[a-fA-F0-9]{32}$/),
    type: z.literal("setup"),
  }),
  z.object({ last: z.boolean(), type: z.literal("prompt"), voicePrompt: z.string().min(1).max(500) }),
  z.object({
    durationUntilInterruptMs: z.number().int().nonnegative(),
    type: z.literal("interrupt"),
    utteranceUntilInterrupt: z.string(),
  }),
  z.object({ type: z.literal("tokens-played") }).passthrough(),
  z.object({ description: z.string().max(500), type: z.literal("error") }),
]);
const maxRelayMessageBytes = 16 * 1_024;
const maxQueuedRelayBytes = 64 * 1_024;
const maxQueuedRelayMessages = 16;

function formParameters(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body).flatMap(([key, value]) => (
    typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : []
  )));
}

function publicRequestUrl(publicBaseUrl: string, request: FastifyRequest) {
  const base = new URL(publicBaseUrl);
  if (request.headers.upgrade?.toLowerCase() === "websocket") base.protocol = "wss:";
  return new URL(request.raw.url ?? "/", base).toString();
}

function transportStatus(status: z.infer<typeof statusBody>["CallStatus"]): VoiceAttemptTransportStatus {
  return {
    initiated: "initiated",
    ringing: "ringing",
    "in-progress": "answered",
    completed: "completed",
    busy: "busy",
    failed: "failed",
    "no-answer": "no_answer",
    canceled: "canceled",
  }[status] as VoiceAttemptTransportStatus;
}

export function createTwilioCandidateGateway(options: {
  attempts: VoiceAttemptStore;
  config: {
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;
    internalSecret: string;
    publicBaseUrl: string;
  };
  controller: TwilioCandidateCallController;
  preflight(): Promise<unknown>;
  validateRequest(signature: string, url: string, params: Record<string, string>): boolean;
}) {
  const app = Fastify({ logger: false });
  void app.register(formbody);
  void app.register(websocket);

  const internal = createInternalVoiceRequestAuthorizer(options.config.internalSecret);

  function signed(request: FastifyRequest) {
    const signature = request.headers["x-twilio-signature"];
    const value = Array.isArray(signature) ? signature[0] : signature;
    return Boolean(value) && options.validateRequest(
      value!,
      publicRequestUrl(options.config.publicBaseUrl, request),
      formParameters(request.body),
    );
  }

  app.get("/health", async () => ({ status: "ok", runtime: "twilio-candidate" }));

  app.get("/internal/preflight", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    try {
      await options.preflight();
      return { status: "ok", runtime: "twilio-candidate" };
    } catch (error) {
      return reply.code(503).send({
        error: "twilio_candidate_unavailable",
        failedChecks: error instanceof TwilioCandidatePreflightError
          ? error.failedChecks
          : undefined,
      });
    }
  });

  registerControlledAttemptStartRoute(app, {
    attempts: options.attempts,
    isAuthorized: internal,
    start: (input) => options.controller.start(input),
    unavailableError: "twilio_candidate_unavailable",
  });

  registerControlledAttemptReadRoutes(app, {
    attempts: options.attempts,
    isAuthorized: internal,
  });

  app.post("/internal/controlled-attempt/:attemptId/stop", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const { attemptId } = request.params as { attemptId?: string };
    if (!attemptId || !options.attempts.getAttempt(attemptId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    await options.controller.stop(attemptId);
    return { attempt: options.attempts.getView(attemptId) };
  });

  app.post("/voice-experiment/twilio/twiml", async (request, reply) => {
    if (!signed(request)) return reply.code(403).send();
    const query = attemptQuery.safeParse(request.query);
    const body = twimlBody.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();
    try {
      const attempt = options.attempts.bindProviderCallId(query.data.attempt, body.data.CallSid);
      if (attempt.transportStatus === "cancel_requested"
        || options.controller.isStopRequested?.(attempt.id)) {
        await options.controller.stop(attempt.id).catch(() => undefined);
        return reply.type("text/xml").send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
        );
      }
      return reply.type("text/xml").send(createTwilioCandidateTwiML({
        attemptId: attempt.id,
        context: attempt.callContext,
        publicBaseUrl: options.config.publicBaseUrl,
        relayToken: attempt.relayToken,
      }));
    } catch {
      return reply.code(409).send();
    }
  });

  app.post("/voice-experiment/twilio/status", async (request, reply) => {
    if (!signed(request)) return reply.code(403).send();
    const query = attemptQuery.safeParse(request.query);
    const body = statusBody.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();
    try {
      const current = options.attempts.getAttempt(query.data.attempt);
      const nextStatus = body.data.CallStatus === "completed"
        && current?.transportStatus === "cancel_requested"
        ? "canceled"
        : transportStatus(body.data.CallStatus);
      const attempt = options.attempts.updateStatus(
        query.data.attempt,
        body.data.CallSid,
        nextStatus,
        body.data.SequenceNumber,
      );
      await options.controller.evidence(query.data.attempt)?.record({
        channel: "events",
        monotonicMs: performance.now(),
        observedAt: new Date().toISOString(),
        payload: body.data,
        source: "twilio-status-callback",
        type: body.data.CallStatus === "in-progress" ? "destination.answered" : "call.status",
      });
      if (isControlledVoiceAttemptTransportTerminal(attempt.transportStatus)) {
        await options.controller.finalize(attempt.id);
      }
      return reply.code(204).send();
    } catch {
      return reply.code(409).send();
    }
  });

  app.post("/voice-experiment/twilio/recording", async (request, reply) => {
    if (!signed(request)) return reply.code(403).send();
    const query = attemptQuery.safeParse(request.query);
    const body = recordingBody.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();
    const attempt = options.attempts.getAttempt(query.data.attempt);
    const recorder = options.controller.evidence(query.data.attempt);
    if (!attempt || attempt.providerCallId !== body.data.CallSid || !recorder) {
      return reply.code(409).send();
    }
    await recorder.record({
      channel: "events",
      monotonicMs: performance.now(),
      observedAt: new Date().toISOString(),
      payload: body.data,
      source: "twilio-recording-callback",
      type: `recording.${body.data.RecordingStatus}`,
    });
    return reply.code(204).send();
  });

  void app.register(async (routes) => {
    routes.get("/voice-experiment/twilio/relay", { websocket: true }, (socket, request) => {
      if (!signed(request)) {
        socket.close(1008, "Invalid Twilio signature.");
        return;
      }
      const query = attemptQuery.safeParse(request.query);
      if (!query.success) {
        socket.close(1008, "Invalid attempt.");
        return;
      }
      const recorder = options.controller.evidence(query.data.attempt);
      if (!recorder) {
        socket.close(1008, "Evidence is unavailable.");
        return;
      }
      const runtime = createTwilioRelayRuntime({
        createSession(setup) {
          const attempt = options.attempts.bindRelaySession(
            setup.customParameters.relayToken,
            setup.callSid,
            setup.sessionId,
          );
          if (attempt.id !== query.data.attempt) throw new Error("Relay attempt mismatch.");
          void recorder.correlate({ relaySessionId: setup.sessionId });
          const scheduling = createVoiceSchedulingAuthority({
            applyResult(result) {
              options.attempts.setResultByRelayToken(setup.customParameters.relayToken, result);
            },
            recordStaffFollowUp(result) {
              if (result.callback) {
                const { date, time, timeEnd, timeZone } = result.callback;
                options.attempts.recordRelayNotice(setup.customParameters.relayToken,
                  `Demo callback requested for ${date} around ${time}${timeEnd ? ` to ${timeEnd}` : ""} ${timeZone}. Return call is simulated.`);
              }
            },
            context: attempt.callContext,
          });
          const model = createLocalOpenAiVoiceDialogueModel({
            apiKey: options.config.aiApiKey,
            baseUrl: options.config.aiBaseUrl,
            context: attempt.callContext,
            modelName: options.config.aiModel,
            onToolEvent: (event) => recorder.record({ channel: "tools", ...event }),
            scheduling,
          });
          return createTwilioDialogueSession({
            model,
            send(message) {
              socket.send(JSON.stringify(message));
            },
          });
        },
        record: (event) => recorder.record(event),
      });

      type QueuedRelayMessage = { bytes: number; message: TwilioRelayMessage };
      const queue: QueuedRelayMessage[] = [];
      let queuedBytes = 0;
      let processing = false;
      let closed = false;

      function failRelay(code: number, reason: string) {
        if (closed) return;
        closed = true;
        queue.length = 0;
        queuedBytes = 0;
        runtime.close();
        socket.close(code, reason);
      }

      async function drainQueue() {
        if (processing || closed) return;
        processing = true;
        try {
          while (!closed && queue.length > 0) {
            const entry = queue.shift()!;
            queuedBytes -= entry.bytes;
            await runtime.handle(entry.message);
          }
        } catch {
          failRelay(1011, "Relay runtime failed.");
        } finally {
          processing = false;
        }
      }

      function dispatch(message: TwilioRelayMessage, bytes: number) {
        if (message.type === "interrupt") {
          void runtime.handle(message).catch(() => failRelay(1011, "Relay runtime failed."));
          return;
        }

        const last = queue.at(-1);
        if (message.type === "prompt" && !message.last
          && last?.message.type === "prompt" && !last.message.last) {
          queuedBytes -= last.bytes;
          if (queuedBytes + bytes > maxQueuedRelayBytes) {
            failRelay(1009, "Relay message backlog exceeded its limit.");
            return;
          }
          last.bytes = bytes;
          last.message = message;
          queuedBytes += bytes;
          return;
        }
        if (queue.length >= maxQueuedRelayMessages || queuedBytes + bytes > maxQueuedRelayBytes) {
          failRelay(1009, "Relay message backlog exceeded its limit.");
          return;
        }
        queue.push({ bytes, message });
        queuedBytes += bytes;
        void drainQueue();
      }

      socket.on("message", (payload: Buffer) => {
        if (payload.byteLength > maxRelayMessageBytes) {
          socket.close(1009, "Relay message is too large.");
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(payload.toString());
        } catch {
          socket.close(1008, "Invalid Relay message.");
          return;
        }
        const parsed = relayMessage.safeParse(value);
        if (!parsed.success) {
          socket.close(1008, "Unsupported Relay message.");
          return;
        }
        dispatch(parsed.data as TwilioRelayMessage, payload.byteLength);
      });
      socket.on("close", () => {
        closed = true;
        queue.length = 0;
        queuedBytes = 0;
        runtime.close();
      });
    });
  });

  return app;
}
