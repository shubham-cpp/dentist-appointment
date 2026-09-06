import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import {
  createInternalVoiceRequestAuthorizer,
  registerControlledAttemptReadRoutes,
  registerControlledAttemptStartRoute,
} from "./internal-attempt-routes";

test("registers one authorized read contract for controlled attempts", async (t) => {
  const attempts = new VoiceAttemptStore(() => 1_000, 0);
  const attempt = attempts.createAttempt("11111111-1111-4111-8111-111111111111");
  const app = Fastify();
  const isAuthorized = createInternalVoiceRequestAuthorizer("internal-secret-value");
  registerControlledAttemptReadRoutes(app, { attempts, isAuthorized });
  t.after(() => app.close());

  assert.equal((await app.inject({ method: "GET", url: "/internal/controlled-attempt/current" })).statusCode, 401);
  const headers = { "x-voice-gateway-secret": "internal-secret-value" };
  assert.equal((await app.inject({ headers, method: "GET", url: "/internal/controlled-attempt/current" })).json().attempt.id, attempt.id);
  assert.equal((await app.inject({ headers, method: "GET", url: `/internal/controlled-attempt/${attempt.id}` })).json().attempt.id, attempt.id);
  assert.equal((await app.inject({ headers, method: "GET", url: "/internal/controlled-attempt/by-request/not-a-uuid" })).statusCode, 400);
  assert.equal((await app.inject({ headers, method: "GET", url: "/internal/controlled-attempt/voice_missing" })).statusCode, 404);
});

test("returns an attempt when provider call creation becomes uncertain", async (t) => {
  const attempts = new VoiceAttemptStore(() => 1_000, 0);
  const app = Fastify();
  const isAuthorized = createInternalVoiceRequestAuthorizer("internal-secret-value");
  registerControlledAttemptStartRoute(app, {
    attempts,
    isAuthorized,
    async start({ context, requestId }) {
      const attempt = attempts.createAttempt(requestId, context);
      attempts.markCreating(attempt.id);
      attempts.markCreationUncertain(attempt.id);
      throw new Error("Provider response was lost.");
    },
    unavailableError: "candidate_unavailable",
  });
  t.after(() => app.close());

  const response = await app.inject({
    headers: {
      "content-type": "application/json",
      "x-voice-gateway-secret": "internal-secret-value",
      "x-voice-request-id": "22222222-2222-4222-8222-222222222222",
    },
    method: "POST",
    payload: { callContext: createVoiceCallContext() },
    url: "/internal/controlled-attempt",
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().attempt.transportStatus, "creation_uncertain");
});
