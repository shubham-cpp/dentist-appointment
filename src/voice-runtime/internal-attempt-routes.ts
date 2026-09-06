import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { constantTimeEqualSecrets, voiceGatewayInternalSecretHeader } from "@/lib/voice-gateway-internal";
import { voiceCallContextSchema, type VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceAttemptStore } from "@/voice-core/attempt-store";

const requestIdSchema = z.string().uuid();
const startBodySchema = z.object({ callContext: voiceCallContextSchema }).strict();

export function createInternalVoiceRequestAuthorizer(expectedSecret: string) {
  return (request: FastifyRequest) => {
    const value = request.headers[voiceGatewayInternalSecretHeader];
    return constantTimeEqualSecrets(Array.isArray(value) ? value[0] : value, expectedSecret);
  };
}

export function registerControlledAttemptReadRoutes(
  app: FastifyInstance,
  options: {
    attempts: VoiceAttemptStore;
    isAuthorized(request: FastifyRequest): boolean;
  },
) {
  app.get("/internal/controlled-attempt/current", async (request, reply) => {
    if (!options.isAuthorized(request)) return reply.code(401).send({ error: "unauthorized" });
    const attempt = options.attempts.getActiveView();
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });

  app.get("/internal/controlled-attempt/by-request/:requestId", async (request, reply) => {
    if (!options.isAuthorized(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsed = requestIdSchema.safeParse((request.params as { requestId?: string }).requestId);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request_id" });
    const attempt = options.attempts.getViewByRequestId(parsed.data);
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });

  app.get("/internal/controlled-attempt/:attemptId", async (request, reply) => {
    if (!options.isAuthorized(request)) return reply.code(401).send({ error: "unauthorized" });
    const { attemptId } = request.params as { attemptId?: string };
    const attempt = attemptId ? options.attempts.getView(attemptId) : undefined;
    return attempt ? { attempt } : reply.code(404).send({ error: "not_found" });
  });
}

export function registerControlledAttemptStartRoute(
  app: FastifyInstance,
  options: {
    attempts: VoiceAttemptStore;
    isAuthorized(request: FastifyRequest): boolean;
    start(input: { context: VoiceCallContext; requestId: string }): Promise<{ attemptId: string }>;
    unavailableError: string;
  },
) {
  app.post("/internal/controlled-attempt", async (request, reply) => {
    if (!options.isAuthorized(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsedRequestId = requestIdSchema.safeParse(request.headers["x-voice-request-id"]);
    const body = startBodySchema.safeParse(request.body);
    if (!parsedRequestId.success || !body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    try {
      const started = await options.start({
        context: body.data.callContext,
        requestId: parsedRequestId.data,
      });
      return reply.code(201).send({ attempt: options.attempts.getView(started.attemptId) });
    } catch {
      const attempt = options.attempts.getViewByRequestId(parsedRequestId.data);
      if (attempt) return reply.code(202).send({ attempt });
      return reply.code(503).send({ error: options.unavailableError });
    }
  });
}
