import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import twilio from "twilio";
import { z } from "zod";
import {
  VoiceAttemptStore,
  type VoiceAttemptTransportStatus,
} from "@/voice-core/attempt-store";
import {
  isControlledVoiceAttemptActive,
  isControlledVoiceAttemptTransportTerminal,
  type ControlledVoiceAttemptOutcome,
} from "@/lib/controlled-voice-attempt";
import {
  FileControlledCallLease,
  type ControlledCallLease,
} from "@/voice-core/controlled-call-lease";
import { assertControlledCallSafetyPolicy } from "@/voice-core/call-safety-policy";
import { VoiceConversationSession } from "./conversation-session";
import { initialVoiceGreeting, staffFollowUpText } from "./conversation";
import { gatewayWebSocketUrl, loadVoiceGatewayConfig, type VoiceGatewayConfig } from "./config";
import { createLocalCodexIntentClassifier, type VoiceIntentClassifier } from "./intent-classifier";
import { RelayTerminalPlayback } from "./relay-terminal-playback";
import { createVoiceCallContext, voiceCallContextSchema } from "@/lib/voice-call-context";
import { stopActiveCallsBeforeShutdown } from "@/voice-core/terminal-call-shutdown";
import {
  createInternalVoiceRequestAuthorizer,
  registerControlledAttemptReadRoutes,
} from "@/voice-runtime/internal-attempt-routes";

const callbackQuerySchema = z.object({ attempt: z.string().uuid().or(z.string().startsWith("voice_")) });
const callSidSchema = z.string().regex(/^CA[a-fA-F0-9]{32}$/);
const relaySessionIdSchema = z.string().regex(/^VX[a-fA-F0-9]{32}$/);
const requestIdSchema = z.string().uuid();
const voiceStatusSchema = z.object({
  CallSid: callSidSchema,
  CallStatus: z.enum(["initiated", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"]),
  SequenceNumber: z.coerce.number().int().nonnegative().optional(),
});
const voiceWebhookSchema = z.object({ CallSid: callSidSchema });
const relayCompleteSchema = z.object({
  CallSid: callSidSchema,
  SessionId: relaySessionIdSchema,
  SessionStatus: z.enum(["completed", "ended", "failed"]),
});
const relaySetupSchema = z.object({
  callSid: callSidSchema,
  customParameters: z.object({ relayToken: z.string().min(1) }).passthrough(),
  sessionId: relaySessionIdSchema,
  type: z.literal("setup"),
});
const relayPromptSchema = z.object({
  lang: z.string().max(32).optional(),
  last: z.boolean(),
  type: z.literal("prompt"),
  voicePrompt: z.string().min(1).max(500),
});
const controlledAttemptBodySchema = z.object({ callContext: voiceCallContextSchema }).strict();
const relayInterruptSchema = z.object({
  durationUntilInterruptMs: z.number().int().nonnegative(),
  type: z.literal("interrupt"),
  utteranceUntilInterrupt: z.string(),
});
const relayErrorSchema = z.object({ description: z.string().max(500), type: z.literal("error") });
const relayTokensPlayedEvent = "tokens-played";
const relayTokensPlayedSchema = z.object({ type: z.literal(relayTokensPlayedEvent) }).passthrough();
const relayMessageEnvelopeSchema = z.object({ type: z.string().min(1).max(64) }).passthrough();
const relayMessageSchema = z.union([
  relaySetupSchema,
  relayPromptSchema,
  relayInterruptSchema,
  relayErrorSchema,
  relayTokensPlayedSchema,
]);
const knownRelayMessageTypes = new Set([
  "setup",
  "prompt",
  "interrupt",
  "error",
  relayTokensPlayedEvent,
]);
const maxRelayMessageBytes = 16 * 1_024;
const maxQueuedRelayBytes = 64 * 1_024;
const maxQueuedRelayMessages = 16;

type TwilioClient = ReturnType<typeof twilio>;
type RelaySocket = {
  readyState: number;
  send: (payload: string) => void;
};

const relaySocketOpen = 1;

export type VoiceGatewayDependencies = {
  attempts?: VoiceAttemptStore;
  callerReplyTimeoutMs?: number;
  callerReplyRetryTimeoutMs?: number;
  controlledCallLease?: ControlledCallLease;
  createTwilioClient?: (config: VoiceGatewayConfig) => TwilioClient;
  dialTimeoutMs?: number;
  intentClassifier?: VoiceIntentClassifier;
  partialPromptFinalizationMs?: number;
  shutdownStopTimeoutMs?: number;
  terminalPlaybackTimeoutMs?: number;
  validateRequest?: (signature: string, url: string, params: Record<string, string>) => boolean;
};

function callStatusToTransportStatus(status: z.infer<typeof voiceStatusSchema>["CallStatus"]): VoiceAttemptTransportStatus {
  const statuses: Record<z.infer<typeof voiceStatusSchema>["CallStatus"], VoiceAttemptTransportStatus> = {
    initiated: "initiated",
    ringing: "ringing",
    "in-progress": "answered",
    completed: "completed",
    busy: "busy",
    failed: "failed",
    "no-answer": "no_answer",
    canceled: "canceled",
  };

  return statuses[status];
}

function formParameters(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};

  return Object.fromEntries(
    Object.entries(body).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []),
  );
}

function publicRequestUrl(config: VoiceGatewayConfig, request: FastifyRequest) {
  const publicBaseUrl = new URL(config.publicBaseUrl);
  if (request.headers.upgrade?.toLowerCase() === "websocket") {
    publicBaseUrl.protocol = "wss:";
  }

  return new URL(request.raw.url ?? "/", publicBaseUrl).toString();
}

function createTwiML(
  config: VoiceGatewayConfig,
  attemptId: string,
  relayToken: string,
  welcomeGreeting: string,
) {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect({
    action: `${config.publicBaseUrl}/twilio/relay-complete?attempt=${encodeURIComponent(attemptId)}`,
    method: "POST",
  });
  const relayAttributes = {
    dtmfDetection: false,
    events: relayTokensPlayedEvent,
    interruptSensitivity: "medium",
    interruptible: "speech",
    language: config.language,
    speechModel: config.speechModel,
    speechTimeout: 1200,
    transcriptionProvider: config.transcriptionProvider,
    ttsProvider: config.ttsProvider,
    url: gatewayWebSocketUrl(config),
    voice: config.ttsVoice,
    welcomeGreeting,
    welcomeGreetingInterruptible: "any",
    partialPrompts: true,
    reportInputDuringAgentSpeech: "speech",
  } as unknown as Parameters<typeof connect.conversationRelay>[0];
  const relay = connect.conversationRelay(relayAttributes);

  relay.parameter({ name: "relayToken", value: relayToken });
  return response.toString();
}

function sendText(socket: RelaySocket, token: string) {
  return sendRelayMessage(socket, {
    interruptible: true,
    last: true,
    token,
    type: "text",
  });
}

function endRelay(socket: RelaySocket) {
  return sendRelayMessage(socket, { type: "end" });
}

function sendRelayMessage(socket: RelaySocket, message: object) {
  if (socket.readyState !== relaySocketOpen) return false;

  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function createRelayCompletionTwiML(playStaffFallback: boolean) {
  const response = new twilio.twiml.VoiceResponse();
  if (playStaffFallback) response.say(staffFollowUpText);
  response.hangup();
  return response.toString();
}

function controlledCallLeasePath(config: VoiceGatewayConfig) {
  const key = createHash("sha256")
    .update(`${config.twilioAccountSid}\u0000${config.twilioPhoneNumber}\u0000${config.callToNumber}`)
    .digest("hex")
    .slice(0, 24);
  return join(tmpdir(), `dentist-management-system-voice-${key}.json`);
}

export function createVoiceGatewayRuntime(
  config: VoiceGatewayConfig,
  dependencies: VoiceGatewayDependencies = {},
): { app: FastifyInstance; close(): Promise<void> } {
  const attempts = dependencies.attempts ?? new VoiceAttemptStore();
  const controlledCallLease = dependencies.controlledCallLease
    ?? new FileControlledCallLease(controlledCallLeasePath(config));
  const twilioClient = (dependencies.createTwilioClient ?? ((settings) => twilio(settings.twilioAccountSid, settings.twilioAuthToken)))(config);
  const intentClassifier = dependencies.intentClassifier ?? createLocalCodexIntentClassifier(config);
  const callerReplyTimeoutMs = Math.max(1, dependencies.callerReplyTimeoutMs ?? 18_000);
  const callerReplyRetryTimeoutMs = Math.max(1, dependencies.callerReplyRetryTimeoutMs ?? 20_000);
  const partialPromptFinalizationMs = Math.max(1, dependencies.partialPromptFinalizationMs ?? 1_600);
  const dialTimeoutMs = Math.max(1, dependencies.dialTimeoutMs ?? 10_000);
  const shutdownStopTimeoutMs = dependencies.shutdownStopTimeoutMs ?? 5_000;
  const terminalPlaybackTimeoutMs = dependencies.terminalPlaybackTimeoutMs ?? 15_000;
  const validateRequest = dependencies.validateRequest ?? ((signature, url, params) => (
    twilio.validateRequest(config.twilioAuthToken, signature, url, params)
  ));
  const app = Fastify({ logger: false });
  const cancelRequestedAttempts = new Set<string>();
  const callStopRequests = new Map<string, Promise<boolean>>();
  let readinessCheck: Promise<void> | undefined;

  void app.register(formbody);
  void app.register(websocket);

  async function requestCallStop(callSid: string) {
    const attemptTimeoutMs = Math.max(1, Math.floor(shutdownStopTimeoutMs / 2));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const stopped = await Promise.race([
          twilioClient.calls(callSid).update({ status: "completed" }).then(() => true),
          new Promise<false>((resolve) => {
            deadline = setTimeout(() => resolve(false), attemptTimeoutMs);
          }),
        ]);
        if (stopped) return true;
      } catch {
        // A second idempotent stop request can recover a transient failure.
      } finally {
        if (deadline) clearTimeout(deadline);
      }
    }
    return false;
  }

  async function stopAttempt(attemptId: string) {
    const attempt = attempts.getAttempt(attemptId);
    if (!attempt) throw new Error("The controlled call is unavailable.");
    cancelRequestedAttempts.add(attempt.id);
    const stoppedAttempt = attempts.markCancelRequested(attempt.id);
    if (!stoppedAttempt.providerCallId) return;
    const inFlight = callStopRequests.get(attempt.id);
    if (inFlight) {
      if (await inFlight) return;
    } else {
      const operation = requestCallStop(stoppedAttempt.providerCallId);
      callStopRequests.set(attempt.id, operation);
      if (await operation) return;
      callStopRequests.delete(attempt.id);
    }
    attempts.markTerminationUncertain(attempt.id);
    throw new Error("Twilio did not accept the stop request.");
  }

  const isInternalRequest = createInternalVoiceRequestAuthorizer(config.internalSecret);

  function isValidTwilioRequest(request: FastifyRequest) {
    const signature = request.headers["x-twilio-signature"];
    if (typeof signature !== "string") return false;
    return validateRequest(signature, publicRequestUrl(config, request), formParameters(request.body));
  }

  function checkIntentClassifierReady() {
    if (!readinessCheck) {
      readinessCheck = (async () => {
        try {
          await intentClassifier.checkReady();
        } finally {
          readinessCheck = undefined;
        }
      })();
    }
    return readinessCheck;
  }

  function gatewayHealth() {
    return { processInstanceId: attempts.processInstanceId, status: "ok" as const };
  }

  app.get("/health", async () => gatewayHealth());

  app.get("/internal/preflight", async (request, reply) => {
    if (!isInternalRequest(request)) return reply.code(401).send({ error: "unauthorized" });

    try {
      await checkIntentClassifierReady();
    } catch {
      return reply.code(503).send({ error: "voice_ai_unavailable" });
    }

    return gatewayHealth();
  });

  app.post("/internal/controlled-attempt", async (request, reply) => {
    if (!isInternalRequest(request)) return reply.code(401).send({ error: "unauthorized" });
    const requestId = requestIdSchema.safeParse(request.headers["x-voice-request-id"]);
    if (!requestId.success) return reply.code(400).send({ error: "invalid_request_id" });
    const body = request.body === undefined
      ? { success: true as const, data: { callContext: createVoiceCallContext() } }
      : controlledAttemptBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_call_context" });

    try {
      const existingAttempt = attempts.assertCanCreateAttempt(requestId.data);
      if (existingAttempt) return reply.code(200).send({ attempt: attempts.getView(existingAttempt.id) });
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "Call is unavailable." });
    }

    try {
      await controlledCallLease.acquire(requestId.data);
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "Call is unavailable." });
    }

    try {
      await checkIntentClassifierReady();
    } catch {
      await controlledCallLease.cancel(requestId.data).catch(() => undefined);
      return reply.code(503).send({ error: "voice_ai_unavailable" });
    }

    let attempt;
    try {
      attempt = attempts.createAttempt(requestId.data, body.data.callContext);
      if (attempt.transportStatus !== "requested") {
        await controlledCallLease.cancel(requestId.data).catch(() => undefined);
        return reply.code(200).send({ attempt: attempts.getView(attempt.id) });
      }
      attempts.markCreating(attempt.id);
    } catch (error) {
      await controlledCallLease.cancel(requestId.data).catch(() => undefined);
      return reply.code(409).send({ error: error instanceof Error ? error.message : "Call is unavailable." });
    }

    try {
      await controlledCallLease.replaceOwner(requestId.data, attempt.id);
    } catch {
      attempts.markFailed(attempt.id);
      await controlledCallLease.cancel(requestId.data).catch(() => undefined);
      return reply.code(503).send({ error: "voice_safety_lock_unavailable" });
    }

    try {
      assertControlledCallSafetyPolicy(config);
    } catch {
      attempts.markFailed(attempt.id);
      await controlledCallLease.cancel(attempt.id).catch(() => undefined);
      return reply.code(503).send({ error: "voice_calls_disabled" });
    }

    let call;
    try {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        call = await Promise.race([
          twilioClient.calls.create({
            from: config.twilioPhoneNumber,
            record: false,
            statusCallback: `${config.publicBaseUrl}/twilio/status?attempt=${encodeURIComponent(attempt.id)}`,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            statusCallbackMethod: "POST",
            timeLimit: 180,
            timeout: 20,
            to: config.callToNumber,
            url: `${config.publicBaseUrl}/twilio/voice?attempt=${encodeURIComponent(attempt.id)}`,
          }),
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error("Twilio Dial result is uncertain.")), dialTimeoutMs);
          }),
        ]);
      } finally {
        if (deadline) clearTimeout(deadline);
      }

    } catch {
      attempts.markCreationUncertain(attempt.id);
      return reply.code(202).send({ attempt: attempts.getView(attempt.id) });
    }

    const updatedAttempt = attempts.bindProviderCallId(attempt.id, call.sid);
    if (updatedAttempt.transportStatus === "cancel_requested") {
      try {
        await stopAttempt(attempt.id);
      } catch {
        return reply.code(202).send({ attempt: attempts.getView(attempt.id) });
      }
      return reply.code(202).send({ attempt: attempts.getView(attempt.id) });
    }

    return reply.code(201).send({ attempt: attempts.getView(attempt.id) });
  });

  registerControlledAttemptReadRoutes(app, { attempts, isAuthorized: isInternalRequest });

  app.post("/internal/controlled-attempt/:attemptId/stop", async (request, reply) => {
    if (!isInternalRequest(request)) return reply.code(401).send({ error: "unauthorized" });
    const params = request.params as { attemptId?: string };
    if (!params.attemptId) return reply.code(400).send({ error: "invalid_attempt" });

    const attempt = attempts.getAttempt(params.attemptId);
    if (!attempt) return reply.code(404).send({ error: "not_found" });

    if (isControlledVoiceAttemptTransportTerminal(attempt.transportStatus)) {
      return { attempt: attempts.getView(attempt.id) };
    }

    try {
      await stopAttempt(attempt.id);
      return { attempt: attempts.getView(attempt.id) };
    } catch {
      return reply.code(502).send({ error: "Twilio did not accept the stop request." });
    }
  });

  app.post("/twilio/voice", async (request, reply) => {
    if (!isValidTwilioRequest(request)) return reply.code(403).send();

    const query = callbackQuerySchema.safeParse(request.query);
    const body = voiceWebhookSchema.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();

    try {
      const attempt = attempts.bindProviderCallId(query.data.attempt, body.data.CallSid);
      if (attempt.transportStatus === "cancel_requested" || cancelRequestedAttempts.has(attempt.id)) {
        await stopAttempt(attempt.id).catch(() => undefined);
        return reply.type("text/xml").send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
        );
      }
      return reply.type("text/xml").send(createTwiML(
        config,
        attempt.id,
        attempt.relayToken,
        initialVoiceGreeting(attempt.callContext),
      ));
    } catch {
      return reply.code(403).send();
    }
  });

  app.post("/twilio/status", async (request, reply) => {
    if (!isValidTwilioRequest(request)) return reply.code(403).send();

    const query = callbackQuerySchema.safeParse(request.query);
    const body = voiceStatusSchema.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();

    try {
      const current = attempts.getAttempt(query.data.attempt);
      const nextStatus = body.data.CallStatus === "completed"
        && current?.transportStatus === "cancel_requested"
        ? "canceled"
        : callStatusToTransportStatus(body.data.CallStatus);
      const updatedAttempt = attempts.updateStatus(
        query.data.attempt,
        body.data.CallSid,
        nextStatus,
        body.data.SequenceNumber,
      );
      if (isControlledVoiceAttemptTransportTerminal(updatedAttempt.transportStatus)) {
        cancelRequestedAttempts.delete(updatedAttempt.id);
        callStopRequests.delete(updatedAttempt.id);
        await controlledCallLease.release(updatedAttempt.id).catch(() => undefined);
      }
      return reply.code(204).send();
    } catch {
      if (isControlledVoiceAttemptTransportTerminal(callStatusToTransportStatus(body.data.CallStatus))) {
        cancelRequestedAttempts.delete(query.data.attempt);
        callStopRequests.delete(query.data.attempt);
        await controlledCallLease.release(query.data.attempt).catch(() => undefined);
        return reply.code(204).send();
      }
      return reply.code(403).send();
    }
  });

  app.post("/twilio/relay-complete", async (request, reply) => {
    if (!isValidTwilioRequest(request)) return reply.code(403).send();

    const query = callbackQuerySchema.safeParse(request.query);
    const body = relayCompleteSchema.safeParse(request.body);
    if (!query.success || !body.success) return reply.code(400).send();

    let playStaffFallback: boolean;
    try {
      attempts.completeRelaySession(
        query.data.attempt,
        body.data.CallSid,
        body.data.SessionId,
        body.data.SessionStatus,
      );
    } catch {
      if (body.data.SessionStatus !== "failed") return reply.code(403).send();

      try {
        attempts.completeFailedRelaySessionBeforeSetup(
          query.data.attempt,
          body.data.CallSid,
          body.data.SessionId,
        );
      } catch {
        return reply.code(403).send();
      }
    }

    try {
      playStaffFallback = attempts.shouldPlayTwilioStaffFollowUp(query.data.attempt);
    } catch {
      return reply.code(403).send();
    }

    return reply.type("text/xml").send(createRelayCompletionTwiML(playStaffFallback));
  });

  void app.register(async (routes) => {
    routes.get("/twilio/relay", { websocket: true }, (socket, request) => {
      if (!isValidTwilioRequest(request)) {
        socket.close(1008, "Invalid Twilio signature.");
        return;
      }

      let relayToken: string | undefined;
      let conversation: VoiceConversationSession | undefined;
      let relayEnded = false;
      let callerReplyDeadline: ReturnType<typeof setTimeout> | undefined;
      let callerReplyRetrySent = false;
      let partialPromptDeadline: ReturnType<typeof setTimeout> | undefined;
      let latestPartialPrompt: string | undefined;
      let awaitingQuestionPlayback = false;
      let resetRetryAfterPlayback = true;
      let lastQuestionText = "";
      type RelayMessage = z.infer<typeof relayMessageSchema>;
      type QueuedRelayMessage = { bytes: number; message: RelayMessage };
      const relayQueue: QueuedRelayMessage[] = [];
      let queuedRelayBytes = 0;
      let processingRelayQueue = false;
      const terminalPlayback = new RelayTerminalPlayback(
        terminalPlaybackTimeoutMs,
        (outcome, reason) => {
          if (!relayToken) return;

          try {
            if (!getActiveRelayAttempt()) {
              finishRelay();
              return;
            }

            if (reason === "timeout") {
              attempts.markFinalPlaybackUnconfirmed(relayToken);
              attempts.setOutcomeByRelayToken(relayToken, "unknown");
            } else {
              attempts.setOutcomeByRelayToken(relayToken, outcome);
            }

            finishRelay();
          } catch {
            finishRelay();
          }
        },
      );

      function finishRelay() {
        if (relayEnded) return;
        relayEnded = true;
        relayQueue.length = 0;
        queuedRelayBytes = 0;
        clearCallerReplyDeadline();
        clearPartialPromptDeadline();
        terminalPlayback.reset();
        conversation?.close();
        endRelay(socket);
      }

      function clearCallerReplyDeadline() {
        if (callerReplyDeadline) clearTimeout(callerReplyDeadline);
        callerReplyDeadline = undefined;
      }

      function clearPartialPromptDeadline() {
        if (partialPromptDeadline) clearTimeout(partialPromptDeadline);
        partialPromptDeadline = undefined;
        latestPartialPrompt = undefined;
      }

      function getActiveRelayAttempt() {
        if (!relayToken) return undefined;
        const attempt = attempts.getAttemptByRelayToken(relayToken);
        return attempt
          && attempt.transportStatus !== "cancel_requested"
          && isControlledVoiceAttemptActive(attempt)
          ? attempt
          : undefined;
      }

      function endForStaffFollowUp(label: string, markRelayError = false) {
        if (relayEnded) return;
        clearCallerReplyDeadline();
        if (relayToken) {
          try {
            if (markRelayError) attempts.markRelayError(relayToken);
            attempts.requestTwilioStaffFollowUp(relayToken, label);
          } catch {
            // The attempt can expire while a provider closes the WebSocket.
          }
        }
        finishRelay();
      }

      function speakReply(text: string, resetRetry = true) {
        if (!relayToken || relayEnded || !getActiveRelayAttempt()) return false;
        if (!sendText(socket, text)) return false;

        try {
          attempts.markSpeaking(relayToken);
          terminalPlayback.recordSpeechSent();
          awaitingQuestionPlayback = true;
          resetRetryAfterPlayback = resetRetry;
          lastQuestionText = text;
          return true;
        } catch {
          return false;
        }
      }

      function speakTerminalReply(
        text: string,
        outcome: Exclude<ControlledVoiceAttemptOutcome, "none">,
      ) {
        if (!speakReply(text)) {
          endForStaffFollowUp("Gateway could not deliver a voice response", true);
          return;
        }
        terminalPlayback.begin(outcome);
      }

      function armCallerReplyDeadline(resetRetry = false, timeoutMs = callerReplyTimeoutMs) {
        clearCallerReplyDeadline();
        if (resetRetry) callerReplyRetrySent = false;

        callerReplyDeadline = setTimeout(() => {
          if (relayEnded || terminalPlayback.isPending || !getActiveRelayAttempt()) return;

          if (!callerReplyRetrySent) {
            callerReplyRetrySent = true;
            try {
              attempts.recordRelayNotice(relayToken!, "No caller reply received");
            } catch {
              endForStaffFollowUp("System ended the call safely", true);
              return;
            }

            if (!speakReply(`I did not hear a response. ${lastQuestionText}`, false)) {
              endForStaffFollowUp("Gateway could not deliver a voice response", true);
            }
            return;
          }

          endForStaffFollowUp("No caller reply received");
        }, timeoutMs);
        callerReplyDeadline.unref();
      }

      async function respondToCaller(callerText: string, finality: "final" | "partial", lang?: string) {
        if (!relayToken || relayEnded || terminalPlayback.isPending) return;
        clearCallerReplyDeadline();
        clearPartialPromptDeadline();
        const startedAt = Date.now();
        attempts.recordRelayNotice(
          relayToken,
          `Caller input ${finality} received (${callerText.length} characters${lang ? `, ${lang}` : ""})`,
        );
        attempts.markCallerReplyReceived(relayToken);

        try {
          const reply = await conversation?.respondToFinalPrompt(callerText);
          if (!reply) return;
          attempts.recordRelayNotice(relayToken, `Scheduling response ready in ${Date.now() - startedAt} ms`);

          if (!getActiveRelayAttempt()) {
            conversation?.close();
            return;
          }

          if (reply.result) attempts.setResultByRelayToken(relayToken, reply.result);
          if (reply.end) {
            speakTerminalReply(reply.text, reply.outcome ?? "staff_follow_up");
          } else {
            if (!speakReply(reply.text)) {
              endForStaffFollowUp("Gateway could not deliver a voice response", true);
            }
          }
        } catch {
          speakTerminalReply(
            "I’m sorry, I could not process that response. Our team will contact you. Goodbye.",
            "staff_follow_up",
          );
        }
      }

      async function handleRelayMessage(message: RelayMessage) {
        if (relayEnded) return;

        if (message.type === "setup") {
          if (relayToken) {
            socket.close(1008, "Relay setup is already complete.");
            return;
          }

          try {
            const candidateToken = message.customParameters.relayToken;
            attempts.bindRelaySession(candidateToken, message.callSid, message.sessionId);
            relayToken = candidateToken;
            const callContext = attempts.getCallContextByRelayToken(candidateToken);
            conversation = new VoiceConversationSession(intentClassifier, callContext);
            lastQuestionText = initialVoiceGreeting(callContext);
            awaitingQuestionPlayback = true;
          } catch {
            socket.close(1008, "Invalid Relay session.");
          }
          return;
        }

        if (!relayToken) {
          socket.close(1008, "Relay setup is required.");
          return;
        }

        if (message.type === relayTokensPlayedEvent) {
          const terminalConfirmed = terminalPlayback.confirmPlayback();
          if (terminalConfirmed || terminalPlayback.isPending) return;
          if (awaitingQuestionPlayback) {
            awaitingQuestionPlayback = false;
            armCallerReplyDeadline(
              resetRetryAfterPlayback,
              resetRetryAfterPlayback ? callerReplyTimeoutMs : callerReplyRetryTimeoutMs,
            );
          }
          return;
        }

        if (message.type === "prompt" && !message.last) {
          clearPartialPromptDeadline();
          latestPartialPrompt = message.voicePrompt;
          armCallerReplyDeadline();
          if (conversation?.canProcessLocally(message.voicePrompt)) {
            const candidate = message.voicePrompt;
            const partialLang = message.lang;
            partialPromptDeadline = setTimeout(() => {
              if (latestPartialPrompt !== candidate || relayEnded) return;
              void respondToCaller(candidate, "partial", partialLang);
            }, partialPromptFinalizationMs);
            partialPromptDeadline.unref();
          }
          return;
        }

        if (message.type === "prompt" && message.last) {
          await respondToCaller(message.voicePrompt, "final", message.lang);
          return;
        }

        if (message.type === "interrupt") {
          if (terminalPlayback.isPending) {
            terminalPlayback.cancel();
            conversation?.close();
            attempts.markInterrupted(relayToken);
            endForStaffFollowUp("Caller interrupted the final response");
            return;
          }

          conversation?.interrupt();
          attempts.markInterrupted(relayToken);
          armCallerReplyDeadline();
          return;
        }

        if (message.type === "error") {
          attempts.recordRelayNotice(relayToken, "Voice service reported an error");
          endForStaffFollowUp("Voice service reported an error", true);
        }
      }

      function parseRelayPayload(payload: Buffer): RelayMessage | undefined {
        if (payload.byteLength > maxRelayMessageBytes) {
          socket.close(1009, "Relay message is too large.");
          return undefined;
        }
        let value: unknown;
        try {
          value = JSON.parse(payload.toString());
        } catch {
          socket.close(1008, "Invalid Relay message.");
          return undefined;
        }
        const envelope = relayMessageEnvelopeSchema.safeParse(value);
        if (!envelope.success) {
          socket.close(1008, "Invalid Relay message.");
          return undefined;
        }
        const parsed = relayMessageSchema.safeParse(value);
        if (parsed.success) return parsed.data;
        if (relayToken && !knownRelayMessageTypes.has(envelope.data.type)) {
          attempts.recordRelayNotice(relayToken, "Voice service sent an unsupported event");
          return undefined;
        }
        socket.close(1008, "Unsupported Relay message.");
        return undefined;
      }

      async function drainRelayQueue() {
        if (processingRelayQueue || relayEnded) return;
        processingRelayQueue = true;
        try {
          while (!relayEnded && relayQueue.length > 0) {
            const entry = relayQueue.shift()!;
            queuedRelayBytes -= entry.bytes;
            await handleRelayMessage(entry.message);
          }
        } catch {
          endForStaffFollowUp("Gateway ended the call safely", true);
        } finally {
          processingRelayQueue = false;
        }
      }

      function dispatchRelayMessage(message: RelayMessage, bytes: number) {
        if (message.type === "interrupt") {
          void handleRelayMessage(message).catch(() => {
            endForStaffFollowUp("Gateway ended the call safely", true);
          });
          return;
        }
        const last = relayQueue.at(-1);
        if (message.type === "prompt" && !message.last
          && last?.message.type === "prompt" && !last.message.last) {
          queuedRelayBytes -= last.bytes;
          if (queuedRelayBytes + bytes > maxQueuedRelayBytes) {
            endForStaffFollowUp("Voice connection backlog exceeded its limit", true);
            return;
          }
          last.bytes = bytes;
          last.message = message;
          queuedRelayBytes += bytes;
          return;
        }
        if (relayQueue.length >= maxQueuedRelayMessages
          || queuedRelayBytes + bytes > maxQueuedRelayBytes) {
          endForStaffFollowUp("Voice connection backlog exceeded its limit", true);
          return;
        }
        relayQueue.push({ bytes, message });
        queuedRelayBytes += bytes;
        void drainRelayQueue();
      }

      socket.on("message", (payload: Buffer) => {
        const message = parseRelayPayload(payload);
        if (message) dispatchRelayMessage(message, payload.byteLength);
      });

      socket.on("error", () => {
        endForStaffFollowUp("Voice connection ended unexpectedly", true);
      });

      socket.on("close", () => {
        if (!relayToken) return;
        relayEnded = true;
        relayQueue.length = 0;
        queuedRelayBytes = 0;
        clearCallerReplyDeadline();
        clearPartialPromptDeadline();
        terminalPlayback.reset();
        conversation?.close();
        try {
          attempts.markRelayClosed(relayToken);
          attempts.setOutcomeByRelayToken(relayToken, "unknown");
        } catch {
          // The short-lived in-memory attempt can expire before the socket closes.
        }
      });
    });
  });

  const close = async () => {
    await stopActiveCallsBeforeShutdown({
      attempts,
      controller: { stop: stopAttempt },
      isFinalized: (attemptId) => !attempts.getActiveProviderCallStops()
        .some((attempt) => attempt.attemptId === attemptId),
      timeoutMs: shutdownStopTimeoutMs,
    });
    await app.close();
  };
  return { app, close };
}

export async function startGateway(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = loadVoiceGatewayConfig(environment);
  const { app, close } = createVoiceGatewayRuntime(config);
  await app.listen({ host: "127.0.0.1", port: config.gatewayPort });

  const shutdown = () => void close()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Voice gateway shutdown failed.");
      process.exitCode = 1;
    });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return { app, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startGateway();
}
