import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { voiceCallContextSchema } from "@/lib/voice-call-context";
import { voiceGatewayInternalSecretHeader } from "@/lib/voice-gateway-internal";
import type {
  VoiceAttemptStore,
  VoiceAttemptTransportStatus,
} from "@/voice-gateway/attempt-store";
import { createLocalOpenAiVoiceDialogueModel } from "./openai-dialogue-model";
import { createVoiceSchedulingAuthority } from "./scheduling-authority";
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
const requestId = z.string().uuid();
const startBody = z.object({ callContext: voiceCallContextSchema }).strict();
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

function sameSecret(provided: string | undefined, expected: string) {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

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
  preflight(): Promise<void>;
  validateRequest(signature: string, url: string, params: Record<string, string>): boolean;
}) {
  const app = Fastify({ logger: false });
  void app.register(formbody);
  void app.register(websocket);

  function internal(request: FastifyRequest) {
    const value = request.headers[voiceGatewayInternalSecretHeader];
    return sameSecret(Array.isArray(value) ? value[0] : value, options.config.internalSecret);
  }

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

  app.post("/internal/controlled-attempt", async (request, reply) => {
    if (!internal(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsedRequestId = requestId.safeParse(request.headers["x-voice-request-id"]);
    const body = startBody.safeParse(request.body);
    if (!parsedRequestId.success || !body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      const started = await options.controller.start({
        context: body.data.callContext,
        requestId: parsedRequestId.data,
      });
      return reply.code(201).send({ attempt: options.attempts.getView(started.attemptId) });
    } catch (error) {
      return reply.code(503).send({
        error: error instanceof Error ? error.message : "twilio_candidate_unavailable",
      });
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
    const { attemptId } = request.params as { attemptId?: string };
    const attempt = attemptId ? options.attempts.getView(attemptId) : undefined;
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
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
      const attempt = options.attempts.bindCallSid(query.data.attempt, body.data.CallSid);
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
      options.attempts.updateStatus(
        query.data.attempt,
        body.data.CallSid,
        transportStatus(body.data.CallStatus),
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
    if (!attempt || attempt.callSid !== body.data.CallSid || !recorder) {
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
              void recorder.record({
                channel: "model",
                monotonicMs: performance.now(),
                observedAt: new Date().toISOString(),
                payload: message,
                source: "twilio-candidate-dialogue",
                type: message.last ? "model.output.completed" : "model.output.chunk",
              });
            },
          });
        },
        record: (event) => recorder.record(event),
      });

      socket.on("message", (payload: Buffer) => {
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
        void runtime.handle(parsed.data as TwilioRelayMessage).catch(() => {
          socket.close(1011, "Relay runtime failed.");
        });
      });
      socket.on("close", () => runtime.close());
    });
  });

  return app;
}
