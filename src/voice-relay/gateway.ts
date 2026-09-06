import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { voiceCallContextSchema } from "@/lib/voice-call-context";
import { isControlledVoiceAttemptActive } from "@/lib/controlled-voice-attempt";
import { createInternalVoiceRequestAuthorizer } from "@/voice-runtime/internal-attempt-routes";
import { controlledCallLeasePath, FileControlledCallLease, type ControlledCallLease } from "@/voice-core/controlled-call-lease";
import { createVoiceSchedulingAuthority } from "@/voice-core/scheduling-authority";
import { decodeTelnyxPublicKey, verifyTelnyxWebhookSignature } from "@/voice-experiment/telnyx-signature";
import { TELNYX_MAEVE_VOICE } from "@/voice-experiment/telnyx-candidate";
import { SchedulingConversation, type ConversationReply } from "./conversation";
import { createOpenRouterInterpreter, type Interpreter } from "./interpretation";
import { RelayStore, type StoredRelayAttempt } from "./store";
import { createSpeechSynthesizer, type SynthesizeSpeech } from "./speech";
import type { RelayConfig } from "./config";

type Socket = { readyState: number; send(data: string): void; close(code?: number): void };
type Session = {
  record: StoredRelayAttempt; conversation: SchedulingConversation; socket?: Socket; setup: boolean;
  pendingReply?: ConversationReply; confirmation?: { version: number; token: string; text: string; audio: Buffer; fetched: boolean };
  generation: number; actionResponses: Map<number, string>; confirmationResponses: Map<string, Promise<string>>; media: Map<string, Buffer>; synthesis?: AbortController; disconnectAt?: number;
  phase: "relay" | "confirmation" | "closing";
  timer?: ReturnType<typeof setTimeout>; turnTimer?: ReturnType<typeof setTimeout>;
  pendingText: string[]; earlyFrames: unknown[]; lastFinal?: { text: string; at: number };
  closeTimer?: ReturnType<typeof setTimeout>; reminder: boolean; stop?: Promise<void>;
};
const xml = (text: string) => text.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const terminal = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

export async function createRelayGateway(config: RelayConfig, dependencies: {
  closingTimeoutMs?: number;
  synthesize?: SynthesizeSpeech;
  store?: RelayStore; interpreter?: Interpreter; lease?: ControlledCallLease;
  request?: (path: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
} = {}) {
  const app = Fastify({ logger: false, bodyLimit: 32_768 });
  await app.register(websocket, { options: { maxPayload: 16_384 } });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(["application/json", "application/x-www-form-urlencoded"], { parseAs: "string" }, (_request, body, done) => done(null, body));
  const store = dependencies.store ?? new RelayStore(config.VOICE_RELAY_STORE_PATH);
  const interpreter = dependencies.interpreter ?? createOpenRouterInterpreter(config.OPENROUTER_API_KEY, config.VOICE_RELAY_MODEL);
  const authorize = createInternalVoiceRequestAuthorizer(config.VOICE_GATEWAY_INTERNAL_SECRET);
  const lease = dependencies.lease ?? new FileControlledCallLease(controlledCallLeasePath({
    connectionId: config.TELNYX_CONNECTION_ID, from: config.TELNYX_PHONE_NUMBER, to: config.CALL_TO_NUMBER,
  }));
  const synthesize = dependencies.synthesize ?? createSpeechSynthesizer(config.TELNYX_API_KEY);
  const sessions = new Map<string, Session>();
  const instanceId = randomUUID();
  const request: (path: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>> = dependencies.request ?? (async (path, body) => {
    const response = await fetch(`https://api.telnyx.com/v2/${path}`, { method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${config.TELNYX_API_KEY}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Telnyx request failed: HTTP ${response.status}`);
    const json = await response.json();
    return json.data ?? json;
  });
  const base = config.VOICE_GATEWAY_PUBLIC_BASE_URL.replace(/\/$/, "");
  const route = (s: Session, name: string) => `${base}/telnyx/relay/${s.record.view.id}/${s.record.token}/${name}`;
  const note = (s: Session, label: string) => {
    s.record.view.updatedAt = new Date().toISOString();
    s.record.view.events.unshift({ id: randomUUID(), label, timestamp: s.record.view.updatedAt });
    s.record.view.events = s.record.view.events.slice(0, 120);
    s.record.state = s.conversation.snapshot();
    store.save(s.record);
  };
  const send = (s: Session, value: object) => { if (s.socket?.readyState === 1) s.socket.send(JSON.stringify(value)); };
  const clearTimer = (s: Session) => { if (s.timer) clearTimeout(s.timer); s.timer = undefined; };
  async function hangup(s: Session) {
    if (!s.record.callSid || !isControlledVoiceAttemptActive(s.record.view)) return;
    if (s.stop) return s.stop;
    s.record.view.transportStatus = "cancel_requested";
    note(s, "Disconnect requested");
    s.stop = (async () => {
      const commandId = randomUUID();
      for (let retry = 0; retry < 2; retry++) {
        try {
          await request(`calls/${encodeURIComponent(s.record.callSid!)}/actions/hangup`, { command_id: commandId });
          note(s, "Provider accepted disconnect; awaiting terminal status");
          return;
        } catch { note(s, "Provider disconnect request failed"); }
      }
      s.stop = undefined;
    })();
    return s.stop;
  }
  function close(s: Session, text = "Thank you for your time with Brightview Dental. Goodbye.") {
    if (s.phase === "closing") return;
    s.phase = "closing";
    if (s.record.view.outcome === "none") s.record.view.outcome = "unknown";
    s.conversation.close();
    s.synthesis?.abort();
    clearTimer(s);
    if (s.turnTimer) clearTimeout(s.turnTimer);
    send(s, { type: "text", token: text, last: true });
    note(s, `Willow: ${text}`);
    // This timer bounds shutdown; it does not claim that speech completed.
    const closingBound = text.split(/\s+/).length <= 14 ? 5_000 : Math.min(18_000, text.split(/\s+/).length * 400 + 2_000);
    const waitMs = dependencies.closingTimeoutMs ?? closingBound;
    s.disconnectAt = Date.now() + waitMs;
    s.closeTimer = setTimeout(() => { void hangup(s); }, waitMs);
  }
  function idle(s: Session, speech = "") {
    clearTimer(s);
    s.timer = setTimeout(() => {
      if (s.reminder) { close(s); return; }
      s.reminder = true;
      speak(s, { text: "Are you still there? Could you repeat your reply?", terminal: false });
    // Relay has no documented playback-completed frame. Reserve conservative
    // speaking time, then allow 25 seconds for a reply. Never use this as delivery proof.
    }, 25_000 + (speech ? 5_000 + speech.split(/\s+/).length * 600 : 0));
  }
  function speak(s: Session, reply: ConversationReply) {
    s.pendingReply = reply;
    if (reply.terminal) { if (reply.outcome) s.record.view.outcome = reply.outcome; close(s, reply.text); return; }
    if (reply.readbackVersion !== undefined) {
      clearTimer(s);
      s.synthesis?.abort();
      const synthesis = new AbortController();
      s.synthesis = synthesis;
      const startedAt = Date.now();
      s.timer = setTimeout(() => {
        if (s.synthesis === synthesis && s.phase === "relay") {
          send(s, { type: "text", token: "I'm preparing your confirmation.", last: true });
        }
      }, 2_000);
      void synthesize(`${reply.text} Please answer after this message.`, synthesis.signal).then(audio => {
        if (synthesis.signal.aborted || s.phase !== "relay" || s.pendingReply !== reply) return;
        s.synthesis = undefined;
        clearTimer(s);
        s.phase = "confirmation";
        s.confirmation = { version: reply.readbackVersion!, text: reply.text, token: randomBytes(24).toString("hex"), audio, fetched: false };
        send(s, { type: "end", handoffData: JSON.stringify({ reason: "confirmation" }) });
        note(s, `Confirmation audio ready in ${Date.now() - startedAt} ms; starting playback handoff`);
        s.timer = setTimeout(() => {
          note(s, "Confirmation audio was not fetched within eight seconds");
          close(s); void hangup(s);
        }, 8_000);
      }).catch(() => {
        if (synthesis.signal.aborted || s.phase !== "relay") return;
        s.synthesis = undefined;
        note(s, "Confirmation audio generation failed; no change committed");
        close(s, "I'm sorry, I couldn't prepare the confirmation. No change has been saved. Goodbye.");
      });
      return;
    }
    send(s, { type: "text", token: reply.text, last: true });
    s.record.view.sessionStatus = "speaking";
    note(s, `Willow: ${reply.text}`);
    idle(s, reply.text);
  }
  function createSession(record: StoredRelayAttempt): Session {
    const scheduling = createVoiceSchedulingAuthority({ context: record.context,
      applyResult: result => {
        record.view.result = result;
        record.view.outcome = result.kind;
        record.view.updatedAt = new Date().toISOString();
        store.save(record); // Persist before announcing success, independent of dashboard polling.
      }, recordStaffFollowUp: result => {
        record.callback = result;
        if (result.callback) record.view.callback = { ...result.callback, status: "requested" };
        record.view.outcome = "staff_follow_up";
        store.save(record);
      } });
    return { record, conversation: new SchedulingConversation({ context: record.context, interpreter, scheduling }),
      generation: 0, actionResponses: new Map(), confirmationResponses: new Map(), media: new Map(), phase: "relay", pendingText: [], earlyFrames: [], reminder: false, setup: false };
  }
  async function handleInput(s: Session, frame: unknown) {
    if (!frame || typeof frame !== "object" || !("type" in frame)) return;
    const data = frame as Record<string, unknown>;
    if (data.type === "dtmf" && data.digit === "9") { if (s.phase === "closing") await hangup(s); else close(s); return; }
    if (s.phase !== "relay") return;
    if (data.type === "interrupt") {
      s.synthesis?.abort();
      s.conversation.interrupt();
      s.record.view.sessionStatus = "interrupted";
      note(s, "Caller interrupted speech");
      idle(s);
    }
    if (data.type === "error") { note(s, "Relay provider reported an error"); close(s); }
    if (data.type !== "prompt" || typeof data.voicePrompt !== "string" || typeof data.last !== "boolean") return;
    // Interim transcripts can arrive after a final. Only a final or an explicit
    // interrupt may replace accepted work; an interim frame cannot erase it.
    if (!data.last) return;
    const text = data.voicePrompt.trim().slice(0, 8_000);
    if (!text) { idle(s); return; }
    if (s.lastFinal?.text === text && Date.now() - s.lastFinal.at < 1_000) return;
    clearTimer(s);
    s.synthesis?.abort();
    s.lastFinal = { text, at: Date.now() };
    s.conversation.interrupt();
    s.pendingText.push(text);
    if (s.turnTimer) clearTimeout(s.turnTimer);
    s.turnTimer = setTimeout(() => {
      s.turnTimer = undefined;
      const utterance = s.pendingText.splice(0).join(" ");
      note(s, `Caller: ${utterance}`);
      s.reminder = false;
      clearTimer(s);
      s.timer = setTimeout(() => {
        if (s.phase !== "relay") return;
        send(s, { type: "text", token: "One moment, please.", last: true });
        note(s, "Response preparation exceeded three seconds");
      }, 3_000);
      void s.conversation.respond(utterance).then(reply => {
        if (reply && s.phase === "relay") speak(s, reply);
      }).catch(() => close(s, "I'm sorry, I couldn't finish this request. Goodbye."));
    }, 350);
  }
  function relayXml(s: Session) {
    return `<Response><Connect action="${xml(route(s, `action/${s.generation}`))}"><ConversationRelay url="${xml(route(s, `socket/${s.generation}`).replace(/^https:/, "wss:"))}" voice="${xml(TELNYX_MAEVE_VOICE)}" language="en-US" transcriptionProvider="deepgram" interruptible="any" dtmfDetection="true"><Parameter name="probeRunToken" value="${s.record.token}" /><Language code="en-US" transcriptionProvider="deepgram" speechModel="nova-3" voice="${xml(TELNYX_MAEVE_VOICE)}" /></ConversationRelay></Connect><Hangup /></Response>`;
  }
  app.get("/health", async () => ({ status: "ok", runtime: "telnyx-relay", processInstanceId: instanceId }));
  app.get("/internal/preflight", async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: "unauthorized" });
    try {
      const [appInfo, keyInfo, voiceInfo] = await Promise.all([
        request(`texml_applications/${encodeURIComponent(config.TELNYX_APPLICATION_SID)}`),
        request("public_key"), request("text-to-speech/voices?filter[provider]=telnyx"),
      ]);
      const normalizeKey = (value: string) => decodeTelnyxPublicKey(value).export({ type: "spki", format: "der" });
      if (typeof keyInfo.public !== "string" || !normalizeKey(keyInfo.public).equals(normalizeKey(config.TELNYX_PUBLIC_KEY))) throw new Error("Webhook public key mismatch");
      const voices = Array.isArray(voiceInfo) ? voiceInfo : voiceInfo.voices;
      if (!Array.isArray(voices) || !voices.some(voice => voice.id === TELNYX_MAEVE_VOICE)) throw new Error("Maeve voice unavailable");
      if (appInfo.active !== true || String(appInfo.voice_method).toLowerCase() !== "post") throw new Error("TeXML application must be active with POST callbacks.");
      await Promise.all([
        interpreter({ text: "Yes, you are", state: { stage: "identity" }, signal: AbortSignal.timeout(8_000) }),
        synthesize("Your confirmation audio is ready.", AbortSignal.timeout(8_000)),
      ]);
      return { status: "ok", runtime: "telnyx-relay", model: config.VOICE_RELAY_MODEL, confirmation: "prepared-audio-sequential-readback", phoneQualification: "pending" };
    } catch { return reply.code(503).send({ error: "Relay preflight failed. Check provider and model configuration." }); }
  });
  app.post("/internal/controlled-attempt", async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: "unauthorized" });
    const id = z.string().uuid().safeParse(req.headers["x-voice-request-id"]);
    let body: unknown;
    try { body = JSON.parse(String(req.body)); } catch { return reply.code(400).send({ error: "invalid_body" }); }
    const parsed = z.object({ callContext: voiceCallContextSchema, callbackAttemptId: z.string().startsWith("voice_").optional() }).strict().safeParse(body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const existing = store.byRequest(id.data);
    if (existing) return { attempt: existing.view };
    if (store.all().some(a => isControlledVoiceAttemptActive(a.view) || a.cooldownUntil > Date.now())) return reply.code(409).send({ error: "A call is active or its four-minute cooldown has not ended." });
    if (store.all().some(record => !record.archived && record.view.result?.previousAppointment.id === parsed.data.callContext.appointment.id)) {
      return reply.code(409).send({ error: "This appointment already has a saved result. Reset the demo before calling again." });
    }
    const callbackSource = parsed.data.callbackAttemptId ? store.get(parsed.data.callbackAttemptId) : undefined;
    if (parsed.data.callbackAttemptId && (callbackSource?.archived || callbackSource?.view.callback?.status !== "requested")) return reply.code(409).send({ error: "Callback already dispatched or unavailable." });
    try { await lease.acquire(id.data); } catch { return reply.code(409).send({ error: "A call is active or cooling down." }); }
    const at = new Date().toISOString();
    const record: StoredRelayAttempt = { requestId: id.data, token: randomBytes(32).toString("hex"),
      context: { ...(callbackSource?.context ?? parsed.data.callContext), callStartedAt: at }, cooldownUntil: Date.now() + 240_000,
      view: { cooldownUntil: new Date(Date.now() + 240_000).toISOString(), id: `voice_${randomUUID()}`, createdAt: at, updatedAt: at, events: [], outcome: "none",
        processInstanceId: instanceId, sessionStatus: "not_connected", transportStatus: "creating" } };
    const s = createSession(record);
    sessions.set(record.view.id, s);
    note(s, "Call requested from dashboard");
    if (callbackSource?.view.callback) {
      callbackSource.view.callback.status = "dispatched";
      store.save(callbackSource);
    }
    try {
      const result = await request(`texml/Accounts/${encodeURIComponent(config.TELNYX_ACCOUNT_SID)}/Calls`, {
        ApplicationSid: config.TELNYX_APPLICATION_SID, From: config.TELNYX_PHONE_NUMBER, To: config.CALL_TO_NUMBER,
        Url: route(s, "instructions"), UrlMethod: "POST", StatusCallback: route(s, "status"), StatusCallbackMethod: "POST",
        StatusCallbackEvent: "initiated ringing answered completed", TimeLimit: 240, Timeout: 25 });
      void result; // Signed callbacks provide the authoritative call-control identifier.
      note(s, "Provider accepted one call request");
    } catch {
      record.view.transportStatus = "creation_uncertain";
      note(s, "Dial response uncertain; automatic retry disabled");
    }
    return reply.code(202).send({ attempt: record.view });
  });
  for (const endpoint of ["current", "by-request/:requestId", ":attemptId"]) {
    app.get(`/internal/controlled-attempt/${endpoint}`, async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: "unauthorized" });
      const params = req.params as { attemptId?: string; requestId?: string };
      const record = params.requestId ? store.byRequest(params.requestId) : params.attemptId ? store.get(params.attemptId) : store.all().find(record => !record.archived);
      return record ? { attempt: record.view } : reply.code(404).send({ error: "not_found" });
    });
  }
  app.post("/internal/controlled-attempt/reset", async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: "unauthorized" });
    const records = store.all();
    if (records.some(record => isControlledVoiceAttemptActive(record.view))) return reply.code(409).send({ error: "End the active call before resetting the demo." });
    for (const record of records) { record.archived = true; store.save(record); sessions.delete(record.view.id); }
    return reply.code(204).send();
  });
  app.post("/internal/controlled-attempt/:attemptId/stop", async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: "unauthorized" });
    const id = (req.params as { attemptId: string }).attemptId;
    const s = sessions.get(id);
    if (!s) return reply.code(409).send({ error: "Attempt needs provider reconciliation after restart." });
    close(s);
    await hangup(s);
    return { attempt: s.record.view };
  });
  const prefix = "/telnyx/relay/:id/:token";
  function lookup(params: unknown) {
    const { id, token } = params as { id: string; token: string };
    const s = sessions.get(id);
    return s?.record.token === token ? s : undefined;
  }
  app.route({ method: ["GET", "POST"], url: `${prefix}/instructions`, handler: async (req, reply) => {
    const s = lookup(req.params);
    return s ? reply.type("application/xml").send(relayXml(s)) : reply.code(404).send();
  } });
  for (const kind of ["status", "action/:generation", "confirm/:confirmationToken"]) {
    app.route({ method: ["GET", "POST"], url: `${prefix}/${kind}`, handler: async (req, reply) => {
      const s = lookup(req.params);
      if (!s) return reply.code(404).send();
      // Telnyx signs the exact encoded query for GET Gather callbacks.
      // Verified against the failed live delivery; do not decode before verification.
      const rawBody = req.method === "GET" ? req.raw.url?.split("?").slice(1).join("?") ?? "" : String(req.body ?? "");
      const signature = req.headers["telnyx-signature-ed25519"];
      const timestamp = req.headers["telnyx-timestamp"];
      if (typeof signature !== "string" || typeof timestamp !== "string" || !verifyTelnyxWebhookSignature({ publicKey: config.TELNYX_PUBLIC_KEY, rawBody, signature, timestamp })) return reply.code(403).send();
      let body: Record<string, unknown>;
      try { body = req.method !== "GET" && req.headers["content-type"]?.includes("application/json") ? JSON.parse(rawBody) : Object.fromEntries(new URLSearchParams(rawBody)); }
      catch { return reply.code(400).send(); }
      if (body.To !== config.CALL_TO_NUMBER || typeof body.CallSid !== "string" || (s.record.callSid && s.record.callSid !== body.CallSid)) return reply.code(409).send();
      s.record.callSid = body.CallSid;
      if (kind === "status") {
        const status = String(body.CallStatus);
        if (!isControlledVoiceAttemptActive(s.record.view)) return reply.code(204).send();
        const mapped = { initiated: "initiated", ringing: "ringing", "in-progress": "answered", completed: "completed", busy: "busy", failed: "failed", "no-answer": "no_answer", canceled: "canceled" } as const;
        if (status in mapped) s.record.view.transportStatus = mapped[status as keyof typeof mapped];
        if (terminal.has(status)) {
          if (s.record.view.outcome === "none") s.record.view.outcome = "unknown";
          clearTimer(s);
          if (s.closeTimer) clearTimeout(s.closeTimer);
          if (s.turnTimer) clearTimeout(s.turnTimer);
          s.synthesis?.abort();
          s.conversation.close(); s.phase = "closing"; s.socket?.close();
          s.record.view.sessionStatus = "closed";
          await lease.release(s.record.requestId);
        }
        note(s, `Call status: ${status}`);
        if (s.setup && s.phase === "relay" && s.earlyFrames.length) {
          clearTimer(s);
          const frames = s.earlyFrames.splice(0);
          if (!frames.some(f => (f as { type?: string }).type === "prompt" && (f as { last?: boolean }).last === true)) speak(s, s.pendingReply ?? s.conversation.greeting());
          for (const frame of frames) await handleInput(s, frame);
        }
        return reply.code(204).send();
      }
      if (kind === "action/:generation") {
        const generation = Number((req.params as { generation: string }).generation);
        const cached = s.actionResponses.get(generation);
        if (cached) return reply.type("application/xml").send(cached);
        if (generation !== s.generation) return reply.code(409).send();
        if (s.phase !== "confirmation" || !s.confirmation) {
          close(s); void hangup(s);
          return reply.type("application/xml").send("<Response><Hangup /></Response>");
        }
        const confirmation = s.confirmation;
        const document = `<Response><Play>${xml(route(s, `audio/${confirmation.token}`))}</Play><Gather input="speech" transcriptionEngine="Deepgram" model="deepgram/nova-3" speechTimeout="1" timeout="8" action="${xml(route(s, `confirm/${confirmation.token}`))}" /><Redirect>${xml(route(s, `confirm/${confirmation.token}`))}</Redirect></Response>`;
        s.actionResponses.set(generation, document);
        note(s, "Prepared confirmation playback submitted through TeXML");
        return reply.type("application/xml").send(document);
      }
      const token = (req.params as { confirmationToken: string }).confirmationToken;
      const cached = s.confirmationResponses.get(token);
      if (cached) return reply.type("application/xml").send(await cached);
      const confirmation = s.confirmation;
      if (!confirmation || token !== confirmation.token) return reply.code(409).send();
      if (s.phase !== "confirmation") return reply.code(409).send();
      // Cache in-flight work and its TeXML response. A provider retry cannot commit twice.
      const processing = (async () => {
        clearTimer(s);
        const speech = typeof body.SpeechResult === "string" ? body.SpeechResult.trim() : "";
        const finish = async (text: string) => {
          try {
            const audio = await synthesize(text, AbortSignal.timeout(8_000));
            if (!isControlledVoiceAttemptActive(s.record.view)) return "<Response><Hangup /></Response>";
            const mediaToken = randomBytes(24).toString("hex");
            s.media.set(mediaToken, audio);
            close(s, text);
            return `<Response><Play>${xml(route(s, `audio/${mediaToken}`))}</Play><Hangup /></Response>`;
          } catch {
            note(s, "Closing audio unavailable; disconnecting");
            close(s); void hangup(s);
            return "<Response><Hangup /></Response>";
          }
        };
        if (!speech) return finish("I didn't hear a confirmation, so no change has been saved. Thank you for your time. Goodbye.");
        // Gather is a sibling AFTER Say. Its signed result belongs to this readback token.
        if (!confirmation.fetched) {
          note(s, "Confirmation rejected because its audio was never fetched");
          return finish("I couldn't verify the confirmation playback. No change has been saved. Goodbye.");
        }
        s.conversation.readbackDelivered(confirmation.version);
        note(s, `Caller confirmation: ${speech}`);
        try {
          const response = await s.conversation.respond(speech);
          if (!response) return finish("I couldn't finish this request. Thank you for your time. Goodbye.");
          if (response.terminal) {
            if (response.outcome) s.record.view.outcome = response.outcome;
            return finish(response.text);
          }
          s.generation += 1;
          s.phase = "relay"; s.setup = false; s.socket = undefined; s.pendingReply = response;
          return relayXml(s);
        } catch {
          note(s, "Confirmation processing failed");
          return finish("I couldn't finish this request. Please check the dashboard for its saved status. Goodbye.");
        }
      })();
      s.confirmationResponses.set(token, processing);
      return reply.type("application/xml").send(await processing);
    } });
  }
  app.get(`${prefix}/audio/:mediaToken`, async (req, reply) => {
    const s = lookup(req.params);
    const token = (req.params as { mediaToken: string }).mediaToken;
    if (!s) return reply.code(404).send();
    const confirmation = s.confirmation;
    const audio = confirmation?.token === token ? confirmation.audio : s.media.get(token);
    if (!audio) return reply.code(404).send();
    if (req.method === "GET" && confirmation?.token === token && !confirmation.fetched && s.phase === "confirmation") {
      confirmation.fetched = true;
      clearTimer(s);
      note(s, "Provider fetched confirmation audio");
      // Play must finish before Gather. The callback, not this fetch, acknowledges the sequence.
      s.timer = setTimeout(() => {
        note(s, "Confirmation response deadline elapsed");
        close(s); void hangup(s);
      }, 25_000 + confirmation.text.split(/\s+/).length * 600);
    }
    return reply.header("cache-control", "private, no-store").type("audio/mpeg").send(audio);
  });
  app.get(`${prefix}/socket/:generation`, { websocket: true }, (socket, req) => {
    const s = lookup(req.params);
    if (!s || Number((req.params as { generation: string }).generation) !== s.generation || s.phase !== "relay" || s.socket?.readyState === 1) { socket.close(1008); return; }
    s.socket = socket;
    const setupDeadline = setTimeout(() => close(s, "I'm sorry, the call could not connect. Goodbye."), 5_000);
    s.timer = setupDeadline;
    socket.on("message", (raw: { toString(): string }) => {
      if (s.socket !== socket) return;
      let frame: Record<string, unknown>;
      try { frame = JSON.parse(raw.toString()); } catch { close(s); return; }
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) { close(s); return; }
      if (frame.type === "setup") {
        const parameters = frame.customParameters as Record<string, unknown> | null;
        if (s.setup || parameters?.probeRunToken !== s.record.token || (frame.to && frame.to !== config.CALL_TO_NUMBER)) { close(s); return; }
        s.setup = true;
        if (s.record.callSid) clearTimeout(setupDeadline);
        s.record.view.sessionStatus = "connected";
        note(s, "Relay connected");
        if (!s.record.callSid) { s.earlyFrames.push({ type: "activate" }); return; }
        speak(s, s.pendingReply ?? s.conversation.greeting());
        return;
      }
      if (!s.setup || !s.record.callSid) {
        if (s.earlyFrames.length >= 24) { close(s); return; }
        s.earlyFrames.push(frame); return;
      }
      void handleInput(s, frame).catch(() => close(s));
    });
    socket.on("close", () => {
      clearTimeout(setupDeadline);
      const current = s.socket === socket;
      if (current) s.socket = undefined;
      if (current && s.phase === "relay") { close(s); void hangup(s); }
    });
    socket.on("error", () => { if (s.socket === socket) { close(s); void hangup(s); } });
  });
  // Rehydrate call identity and outcomes, but never replay model turns or mutations.
  for (const record of store.all()) {
    if (!isControlledVoiceAttemptActive(record.view)) continue;
    const restored = createSession(record);
    restored.phase = "closing";
    restored.conversation.close();
    sessions.set(record.view.id, restored);
  }
  let reconciling = false;
  const reconcile = async () => {
    if (reconciling) return;
    reconciling = true;
    try {
      for (const s of sessions.values()) {
        if (!isControlledVoiceAttemptActive(s.record.view)) continue;
        const age = Date.now() - Date.parse(s.record.view.createdAt);
        if (s.phase !== "closing" && age < 270_000) continue;
        if (s.disconnectAt && Date.now() < s.disconnectAt) continue;
        if (!s.record.callSid) {
          if (age > 300_000) {
            s.record.view.transportStatus = "unknown";
            note(s, "Provider call limit elapsed; outcome unknown, no redial attempted");
            await lease.release(s.record.requestId);
          }
          continue;
        }
        try {
          const status = await request(`calls/${encodeURIComponent(s.record.callSid)}`);
          if (status.is_alive === false) {
            s.record.view.transportStatus = "completed";
            s.record.view.sessionStatus = "closed";
            note(s, "Disconnection verified by provider status reconciliation");
            await lease.release(s.record.requestId);
          } else if (status.is_alive === true) { s.stop = undefined; await hangup(s); }
        } catch { note(s, "Provider status reconciliation unavailable; call ownership retained"); }
      }
    } finally { reconciling = false; }
  };
  let reconciliationWork: Promise<void> | undefined;
  const reconciliationTimer = setInterval(() => {
    if (reconciliationWork) return;
    reconciliationWork = reconcile().catch(() => {}).finally(() => { reconciliationWork = undefined; });
  }, 15_000);
  reconciliationTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(reconciliationTimer);
    await reconciliationWork;
    for (const s of sessions.values()) {
      s.phase = "closing"; s.synthesis?.abort();
      s.conversation.close(); clearTimer(s);
      if (s.turnTimer) clearTimeout(s.turnTimer);
      if (s.closeTimer) clearTimeout(s.closeTimer);
      await hangup(s);
    }
    await Promise.allSettled([...sessions.values()].flatMap(s => [...s.confirmationResponses.values()]));
    if (!dependencies.store) store.close();
  });
  await app.ready();
  return { app, store, reconcile };
}
