import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TELNYX_MAEVE_VOICE } from "./telnyx-candidate";
import { verifyTelnyxWebhookSignature } from "./telnyx-signature";

// Transport experiment only. No scheduling authority or model tools are connected.
const frameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setup"), sessionId: z.string().nullish(), callSid: z.string().nullish(), callControlId: z.string().nullish(), to: z.string().nullish(), customParameters: z.record(z.string(), z.unknown()).nullish() }),
  z.object({ type: z.literal("prompt"), voicePrompt: z.string().max(8_000), last: z.boolean() }),
  z.object({ type: z.literal("interrupt"), utteranceUntilInterrupt: z.string().max(8_000), durationUntilInterruptMs: z.number().nonnegative() }),
  z.object({ type: z.literal("dtmf"), digit: z.string().max(1) }),
  z.object({ type: z.literal("error"), description: z.string().max(2_000) }),
]);

export type RelayProbeEvent = { at: string; kind: string; details: Record<string, unknown> };

function xml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export async function createTelnyxRelayProbe(options: {
  publicBaseUrl: string;
  token: string;
  expectedTo: string;
  publicKey: string;
  record: (event: RelayProbeEvent) => void;
  sessionDeadlineMs?: number;
  chunkDelayMs?: number;
  idleTimeoutMs?: number;
  closingTimeoutMs?: number;
  hangup: (callSid: string, commandId: string) => Promise<void>;
}) {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(options.token)) throw new Error("Use a random probe token of at least 32 characters.");
  const base = new URL(options.publicBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("The probe requires a public HTTPS origin.");
  }
  const app = Fastify({ logger: false, bodyLimit: 32_768 });
  await app.register(websocket, { options: { maxPayload: 16_384 } });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(["application/json", "application/x-www-form-urlencoded"], { parseAs: "string" }, (_request, body, done) => done(null, body));
  const prefix = `/relay-probe/${options.token}`;
  const url = (suffix: string) => new URL(`${prefix}/${suffix}`, base).toString();
  const socketUrl = url("socket").replace(/^https:/, "wss:");
  let claimed = false;
  let callSid: string | undefined;
  let completed = false;
  let endSession: (() => void) | undefined;
  let activateSetup: (() => void) | undefined;
  let closingRequested = false;
  let serverClosing = false;
  let closingTimer: ReturnType<typeof setTimeout> | undefined;
  let hangupRequest: Promise<void> | undefined;
  const hangupCommandId = randomUUID();
  const record = (kind: string, details: Record<string, unknown> = {}) => options.record({ at: new Date().toISOString(), kind, details });
  const requestHangup = () => {
    if (completed || !callSid) return Promise.resolve();
    if (hangupRequest) return hangupRequest;
    const target = callSid;
    hangupRequest = (async () => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (completed) return;
        try {
          await options.hangup(target, hangupCommandId);
          record("hangup_accepted", { attempt, callDisconnectionVerified: false });
          return;
        } catch {
          record("hangup_failed", { attempt });
        }
      }
    })();
    return hangupRequest;
  };
  const armClosing = () => {
    closingRequested = true;
    if (completed || serverClosing || closingTimer || !callSid) return;
    closingTimer = setTimeout(() => {
      record("closing_deadline");
      void requestHangup();
    }, options.closingTimeoutMs ?? 5_000);
  };
  app.addHook("onClose", async () => {
    serverClosing = true;
    if (closingTimer) clearTimeout(closingTimer);
    await requestHangup();
  });
  const closingXml = `<Response><Say voice="${xml(TELNYX_MAEVE_VOICE)}">Thank you for your time with Brightview Dental. Goodbye.</Say><Hangup /></Response>`;
  const instructions = `<Response><Connect action="${xml(url("action"))}"><ConversationRelay url="${xml(socketUrl)}" voice="${xml(TELNYX_MAEVE_VOICE)}" language="en-US" transcriptionProvider="deepgram" interruptible="any" dtmfDetection="true"><Parameter name="probeRunToken" value="${xml(options.token)}" /><Language code="en-US" transcriptionProvider="deepgram" speechModel="nova-3" voice="${xml(TELNYX_MAEVE_VOICE)}" /></ConversationRelay></Connect>${closingXml.replace(/^<Response>|<\/Response>$/g, "")}</Response>`;

  app.get("/health", async () => ({ runtime: "telnyx-relay-probe", status: "ok", claimed, completed, deliveryVerified: false }));
  app.get(`${prefix}/instructions`, async (_request, reply) => reply.type("application/xml").send(instructions));
  for (const route of ["action", "status"]) {
    app.post(`${prefix}/${route}`, async (request, reply) => {
      const rawBody = typeof request.body === "string" ? request.body : "";
      const signature = request.headers["telnyx-signature-ed25519"];
      const timestamp = request.headers["telnyx-timestamp"];
      if (typeof signature !== "string" || typeof timestamp !== "string" || !verifyTelnyxWebhookSignature({ publicKey: options.publicKey, rawBody, signature, timestamp })) {
        return reply.code(403).send({ error: "invalid_signature" });
      }
      let body: Record<string, unknown>;
      try {
        body = request.headers["content-type"]?.includes("application/json") ? JSON.parse(rawBody) : Object.fromEntries(new URLSearchParams(rawBody));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body");
      } catch { return reply.code(400).send({ error: "invalid_body" }); }
      if (body.To !== options.expectedTo || typeof body.CallSid !== "string" || (callSid && body.CallSid !== callSid)) {
        return reply.code(409).send({ error: "unexpected_call" });
      }
      callSid = body.CallSid;
      if (route === "action") {
        record("closing_instructions_requested");
        armClosing();
        return reply.type("application/xml").send(closingXml);
      }
      const status = typeof body.CallStatus === "string" ? body.CallStatus : "unknown";
      record("call_status", { status, callSid });
      if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
        completed = true;
        if (closingTimer) clearTimeout(closingTimer);
        endSession?.();
      } else if (closingRequested) armClosing();
      else activateSetup?.();
      return reply.code(204).send();
    });
  }

  app.get(`${prefix}/socket`, { websocket: true }, (socket) => {
    if (claimed || completed) { socket.close(1008, "Probe already used"); return; }
    claimed = true;
    let setup = false;
    let pendingSetup: Extract<z.infer<typeof frameSchema>, { type: "setup" }> | undefined;
    type InputFrame = Exclude<z.infer<typeof frameSchema>, { type: "setup" }>;
    const earlyFrames: InputFrame[] = [];
    let replies = 0;
    let ended = false;
    let generation = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let idleReminded = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const cancelOutput = () => {
      generation += 1;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (idleTimer) clearTimeout(idleTimer);
    };
    const send = (frame: Record<string, unknown>) => {
      if (socket.readyState !== 1) return;
      socket.send(JSON.stringify(frame));
      record("outbound", { ...frame, generation, delivery: "submitted_only" });
    };
    const finish = (reason: string) => {
      if (ended) return;
      ended = true;
      cancelOutput();
      record("relay_end_requested", { reason });
      armClosing();
      send({ type: "end", handoffData: JSON.stringify({ reason }) });
      socket.close(1000, "Probe complete");
    };
    endSession = () => finish("call_terminal");
    const deadline = setTimeout(() => finish("deadline"), options.sessionDeadlineMs ?? 120_000);
    const setupDeadline = setTimeout(() => { if (!setup) finish("setup_timeout"); }, 5_000);
    const armIdle = (text = "") => {
      if (idleTimer) clearTimeout(idleTimer);
      // A probe-only speech-length estimate, not evidence of playback completion.
      const timeout = options.idleTimeoutMs ?? Math.max(10_000, text.split(/\s+/).length * 450 + 8_000);
      idleTimer = setTimeout(() => {
        if (ended) return;
        if (idleReminded) { finish("no_input"); return; }
        idleReminded = true;
        record("idle_reminder");
        speak(["I have not received a complete reply. Press 1 for the voice test, 2 for the readback, or 9 to finish."]);
      }, timeout);
    };
    const speak = (chunks: string[]) => {
      cancelOutput();
      const owner = generation;
      chunks.forEach((token, index) => {
        const emit = () => {
          if (!ended && owner === generation) {
            send({ type: "text", token, last: index === chunks.length - 1 });
            if (index === chunks.length - 1) armIdle(chunks.join(" "));
          }
        };
        if (index === 0) emit();
        else {
          const timer = setTimeout(() => { timers.delete(timer); emit(); }, index * (options.chunkDelayMs ?? 500));
          timers.add(timer);
        }
      });
    };
    activateSetup = () => {
      if (ended || setup || !pendingSetup || !callSid || completed) return;
      // Relay IDs and TeXML callback IDs need not have identical string representations.
      // Bind the private socket to this run using a Parameter echoed by Telnyx, then
      // retain the signed callback's destination and identifier as the call authority.
      const runMatches = pendingSetup.customParameters?.probeRunToken === options.token;
      const destinationMatches = !pendingSetup.to || pendingSetup.to === options.expectedTo;
      record("setup_binding", {
        runMatches, destinationMatches,
        relayCallSidMatchesCallback: pendingSetup.callSid == null ? null : pendingSetup.callSid === callSid,
        relayCallControlIdMatchesCallback: pendingSetup.callControlId == null ? null : pendingSetup.callControlId === callSid,
      });
      if (!runMatches || !destinationMatches) {
        finish("unexpected_setup");
        return;
      }
      setup = true;
      clearTimeout(setupDeadline);
      record("setup", { sessionId: pendingSetup.sessionId ?? null, callSid, binding: "signed_callback" });
      // Do not ask a question until this socket is ready to handle the answer.
      if (!earlyFrames.some((frame) => frame.type === "prompt" && frame.last)) {
        speak(["Hello, I am Willow from Brightview Dental. Am I speaking with Alex?"]);
      }
      for (const frame of earlyFrames.splice(0)) handleInput(frame);
    };
    socket.on("message", (raw: { toString(): string }) => {
      if (ended) return;
      let input: unknown;
      try { input = JSON.parse(raw.toString()); } catch { finish("invalid_json"); return; }
      if (input && typeof input === "object" && "type" in input && input.type === "setup") {
        record("setup_shape", { fields: Object.fromEntries(Object.entries(input).slice(0, 40).map(([key, value]) => [key, value === null ? "null" : Array.isArray(value) ? "array" : typeof value])) });
      }
      const parsed = frameSchema.safeParse(input);
      if (!parsed.success) {
        const type = typeof input === "object" && input && "type" in input ? String(input.type).slice(0, 100) : "unknown";
        record("unrecognized_frame", { type, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) });
        if (["setup", "prompt", "interrupt", "dtmf", "error"].includes(type)) finish("invalid_provider_frame");
        return;
      }
      const frame = parsed.data;
      if (frame.type === "setup") {
        if (pendingSetup) { finish("duplicate_setup"); return; }
        pendingSetup = frame;
        activateSetup?.();
        return;
      }
      if (!setup) {
        if (!pendingSetup || earlyFrames.length >= 32) { finish("setup_required"); return; }
        earlyFrames.push(frame);
        record("input_waiting_for_call_binding", { type: frame.type });
        return;
      }
      handleInput(frame);
    });
    function handleInput(frame: InputFrame) {
      if (ended) return;
      record("inbound", { ...frame, generation });
      if (frame.type === "interrupt") {
        cancelOutput();
        record("generation_canceled", { generation, providerQueueCleared: "unverified" });
        armIdle();
      } else if (frame.type === "prompt") {
        // Observe transcript finality; never interpret a probe reply as authorization.
        if (!frame.last) armIdle();
        if (frame.last && frame.voicePrompt.trim()) {
          record("final_transcript", { text: frame.voicePrompt, deliveryVerified: false, mutationAllowed: false });
          replies += 1;
          idleReminded = false;
          speak([replies === 1
            ? "I received your reply. This is the voice test. Press 1 to test interruptions, 2 for the readback, or 9 to finish."
            : "I captured that reply. Press 1 or 2 for another test, or 9 to finish."]);
        }
      } else if (frame.type === "error") finish("provider_error");
      else if (frame.type === "dtmf") {
        idleReminded = false;
        if (frame.digit === "1") speak(["This is a voice and interruption test. ", "The first fictional option is Monday at nine. ", "The second is Tuesday at two. ", "The third is Wednesday at eleven. Please interrupt while I am speaking."]);
        else if (frame.digit === "2") speak(["This is a readback test only. ", "Your fictional selection is Friday at two with Doctor Morgan. ", "No appointment will be changed. You may interrupt or reply now."]);
        else if (frame.digit === "3") speak(["Please say: yes, you are. Then try: not right now, maybe this evening. This probe records speech without scheduling actions."]);
        else if (frame.digit === "9") finish("tester_finished");
        else speak(["Press 1 for the voice test, 2 for the readback, or 9 to finish."]);
      }
    }
    socket.on("error", () => { record("socket_error"); finish("socket_error"); });
    socket.on("close", (code: number) => {
      ended = true;
      cancelOutput();
      clearTimeout(deadline);
      clearTimeout(setupDeadline);
      armClosing();
      record("socket_closed", { code, callDisconnectionVerified: completed });
    });
  });
  await app.ready();
  return { app, instructionsUrl: url("instructions"), statusUrl: url("status"), record };
}
