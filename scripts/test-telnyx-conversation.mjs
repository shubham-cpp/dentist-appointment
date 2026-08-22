import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set(["--help", "--dry-run", "--verify", "--confirm"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);
const SAY_VOICE = "Telnyx.Natural.abbie";
const RELAY_PATH = "/telnyx/conversation";
const INTENT_VALUES = new Set(["confirm", "deny", "unclear"]);
const intentOutputSchema = z.object({
  intent: z.enum(["confirm", "deny", "unclear"]),
}).strict();
const NGROK_TUNNELS_URL = "http://127.0.0.1:4040/api/tunnels";
const NGROK_TUNNEL_NAME = "telnyx-conversation";

export const AGENT_LINES = Object.freeze({
  greeting: "Hi, this is Bright Dental. Am I speaking with Oliver?",
  reschedule:
    "Oliver, Dr Patel is unavailable on 25 August. Can I move you to 26 August?",
  closing: "Okay. We have rescheduled your visit to 26 August. Goodbye.",
  identityRetry: "Sorry, am I speaking with Oliver?",
  rescheduleRetry: "Can I move that visit to 26 August?",
  identityDenied: "Please ask Oliver to call Bright Dental. Goodbye.",
  rescheduleDenied: "Okay. The team will call you back. Goodbye.",
  failed: "Sorry. The team will call you back. Goodbye.",
});

const INTENT_PROMPT = [
  "Classify one caller utterance from a dental rescheduling call.",
  "Reply with only one word: confirm, deny, or unclear.",
  "confirm means the caller is Oliver, agrees they are Oliver, or accepts moving 25 August 2026 to 26 August 2026.",
  "deny means the caller is not Oliver or rejects the new date.",
  "unclear means anything else.",
  "confirm examples: Yes. Yeah I'm Oliver. This is Oliver. Speaking. Okay. That's fine. Okay understandable, I'm ok with the 26th. Sure. Yep. Go ahead.",
].join(" ");

const DEFAULT_TIMING = Object.freeze({
  httpTimeoutMs: 15_000,
  intentTimeoutMs: 1_500,
  ngrokPollIntervalMs: 250,
  ngrokWaitMs: 10_000,
  partialFinalizeMs: 400,
  pollIntervalMs: 2_000,
  pollDeadlineMs: 90_000,
  maxTransientReadFailures: 2,
});

class ValidationError extends Error {}

class VerificationError extends Error {}

class TelnyxHttpError extends Error {
  constructor(status, code) {
    super("Telnyx returned an HTTP error.");
    this.status = status;
    this.code = code;
  }
}

class UnknownCallOutcomeError extends Error {}

class PollingError extends Error {}

function defaultWrite(message) {
  console.log(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function valueFromEnvironment(env, key) {
  return String(env[key] ?? "").trim();
}

function isAccountSid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isApplicationSid(value) {
  return /^\d{10,20}$/.test(value);
}

function isCallSid(value) {
  return typeof value === "string" && /^v3:[A-Za-z0-9_-]{8,}$/.test(value);
}

function isE164Number(value) {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.host);
  } catch {
    return false;
  }
}

function isPlaceholderPublicUrl(value) {
  return !value || value.includes("replace-with-your-ngrok-domain");
}

function isLoopbackHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function maskPhoneNumber(value) {
  return `${value.slice(0, 2)}••••${value.slice(-4)}`;
}

function maskAccountSid(value) {
  return `${value.slice(0, 2)}••••${value.slice(-4)}`;
}

export function createConversationState() {
  return {
    end: false,
    phase: "identity",
    success: false,
    unclearCount: 0,
  };
}

function normalizeCallerText(callerText) {
  return String(callerText ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function isNegativeUtterance(callerText) {
  const text = normalizeCallerText(callerText);
  if (/^(no|nope|nah|not now|never)$/.test(text)) return true;
  if (/^(no|nope|nah)[, ]/.test(text)) return true;
  if (/\b(not (me|oliver|olivia)|wrong (person|number)|do not want|don't want|not okay|not ok)\b/.test(text)) {
    return true;
  }
  return false;
}

export function isAffirmativeUtterance(callerText) {
  const text = normalizeCallerText(callerText);
  if (isNegativeUtterance(text)) return false;
  if (/^(yes|yeah|yep|yup|yea|ok|okay|sure|correct|right|alright|fine|agreed|absolutely|please)$/.test(text)) {
    return true;
  }
  if (/^(yes|yeah|yep|yup|yea|ok|okay|sure)[, ]/.test(text)) return true;
  if (/^(sounds good|that works|that's fine|thats fine|that's good|that's correct|that is correct|go ahead|go for it|that's me|thats me)$/.test(text)) {
    return true;
  }
  if (/\b(sounds good|that works|go ahead|that's fine|thats fine)\b/.test(text)) return true;
  return /\b(ok|okay|yes|yeah|fine|sure|good)\b/.test(text) && /\b(26th|26|twenty ?six)\b/.test(text);
}

export function classifyLocalOliverTurn(phase, callerText) {
  const text = normalizeCallerText(callerText);
  if (isNegativeUtterance(text)) return "deny";

  if (phase === "identity") {
    if (isAffirmativeUtterance(text) || /\b(that's me|thats me|speaking|oliver)\b/.test(text)) {
      return "confirm";
    }
    return "unclear";
  }

  if (phase === "reschedule") {
    if (isAffirmativeUtterance(text)) return "confirm";
    return "unclear";
  }

  if (isAffirmativeUtterance(text)) return "confirm";
  return "unclear";
}

export function parseIntentReply(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "unclear";

  try {
    const parsed = JSON.parse(text);
    const candidate = parsed.intent ?? parsed.output ?? parsed;
    if (typeof candidate === "string" && INTENT_VALUES.has(candidate.trim().toLowerCase())) {
      return candidate.trim().toLowerCase();
    }
  } catch {
    // Plain-text replies are expected.
  }

  const normalized = text.toLowerCase();
  const confirm = /\bconfirm\b/.test(normalized);
  const deny = /\bdeny\b/.test(normalized);
  if (confirm && !deny) return "confirm";
  if (deny && !confirm) return "deny";
  return "unclear";
}

export function applyOliverTurn(state, intent) {
  if (state.phase === "ended") {
    return {
      end: true,
      nextState: state,
      text: AGENT_LINES.failed,
    };
  }

  if (intent === "unclear") {
    if (state.unclearCount >= 1) {
      return {
        end: true,
        nextState: { ...state, end: true, phase: "ended", success: false },
        text: AGENT_LINES.failed,
      };
    }

    return {
      end: false,
      nextState: { ...state, unclearCount: state.unclearCount + 1 },
      text: state.phase === "identity" ? AGENT_LINES.identityRetry : AGENT_LINES.rescheduleRetry,
    };
  }

  if (state.phase === "identity") {
    if (intent === "confirm") {
      return {
        end: false,
        nextState: { end: false, phase: "reschedule", success: false, unclearCount: 0 },
        text: AGENT_LINES.reschedule,
      };
    }

    return {
      end: true,
      nextState: { ...state, end: true, phase: "ended", success: false },
      text: AGENT_LINES.identityDenied,
    };
  }

  if (intent === "confirm") {
    return {
      end: true,
      nextState: { end: true, phase: "ended", success: true, unclearCount: 0 },
      text: AGENT_LINES.closing,
    };
  }

  return {
    end: true,
    nextState: { ...state, end: true, phase: "ended", success: false },
    text: AGENT_LINES.rescheduleDenied,
  };
}

export function speechPlaybackMs(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12_000, Math.max(2_500, words * 420));
}

export function splitSpeechChunks(text) {
  const protectedText = text.replace(/\b(Dr|Mr|Mrs|Ms|Sr|Jr)\./g, "$1\u02D9");
  const parts = protectedText
    .split(/(?<=\.)\s+/)
    .map((part) => part.replaceAll("\u02D9", ".").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function getConfiguration(env) {
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const accountSid = valueFromEnvironment(env, "TELNYX_ACCOUNT_SID");
  const applicationSid = valueFromEnvironment(env, "TELNYX_APPLICATION_SID");
  const from = valueFromEnvironment(env, "TELNYX_PHONE_NUMBER");
  const to = valueFromEnvironment(env, "CALL_TO_NUMBER");
  const publicBaseUrl = valueFromEnvironment(env, "TELNYX_PUBLIC_BASE_URL").replace(/\/$/, "");
  const aiBaseUrl = valueFromEnvironment(env, "VOICE_AI_BASE_URL") || "http://127.0.0.1:18765/v1";
  const aiModel = valueFromEnvironment(env, "VOICE_AI_MODEL") || "gpt-5.6-terra";
  const aiApiKey = valueFromEnvironment(env, "VOICE_AI_API_KEY") || "local-codex-proxy-placeholder";
  const aiTimeoutMs = Number(valueFromEnvironment(env, "VOICE_AI_TIMEOUT_MS") || "5000");
  const gatewayPort = Number(valueFromEnvironment(env, "TELNYX_CONVERSATION_PORT") || "3002");

  if (!apiKey) {
    throw new ValidationError("TELNYX_API_KEY must not be empty.");
  }

  if (!isAccountSid(accountSid)) {
    throw new ValidationError("TELNYX_ACCOUNT_SID must be a valid Telnyx account UUID.");
  }

  if (!isApplicationSid(applicationSid)) {
    throw new ValidationError("TELNYX_APPLICATION_SID must be a Telnyx TeXML application id.");
  }

  if (!isE164Number(from)) {
    throw new ValidationError("TELNYX_PHONE_NUMBER must use E.164 format.");
  }

  if (!isE164Number(to)) {
    throw new ValidationError("CALL_TO_NUMBER must use E.164 format.");
  }

  if (from === to) {
    throw new ValidationError("CALL_TO_NUMBER must differ from TELNYX_PHONE_NUMBER.");
  }

  if (publicBaseUrl && !isPlaceholderPublicUrl(publicBaseUrl) && !isHttpsUrl(publicBaseUrl)) {
    throw new ValidationError("TELNYX_PUBLIC_BASE_URL must be an https URL.");
  }

  if (!isLoopbackHttpUrl(aiBaseUrl)) {
    throw new ValidationError("VOICE_AI_BASE_URL must use a loopback HTTP address.");
  }

  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 500 || aiTimeoutMs > 8_000) {
    throw new ValidationError("VOICE_AI_TIMEOUT_MS must be between 500 and 8000.");
  }

  if (!Number.isInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) {
    throw new ValidationError("TELNYX_CONVERSATION_PORT must be a valid TCP port.");
  }

  return {
    accountSid,
    aiApiKey,
    aiBaseUrl: aiBaseUrl.replace(/\/$/, ""),
    aiModel,
    aiTimeoutMs,
    apiKey,
    applicationSid,
    from,
    gatewayPort,
    publicBaseUrl: isPlaceholderPublicUrl(publicBaseUrl) ? "" : publicBaseUrl,
    to,
  };
}

function authorizationHeader(config) {
  return `Bearer ${config.apiKey}`;
}

function createUrl(pathname, searchParameters) {
  const url = new URL(pathname, API_ORIGIN);

  for (const [key, value] of Object.entries(searchParameters ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

function relayWebSocketUrl(config) {
  if (!config.publicBaseUrl) return `wss://<ngrok-will-start>${RELAY_PATH}`;
  return `${config.publicBaseUrl.replace(/^https:/, "wss:")}${RELAY_PATH}`;
}

function tunnelForwardsPort(tunnel, port) {
  const addr = String(tunnel?.config?.addr ?? tunnel?.addr ?? "");
  return new RegExp(`(^|[:/])${port}$`).test(addr);
}

function httpsUrlFromTunnel(tunnel) {
  const url = typeof tunnel?.public_url === "string" ? tunnel.public_url.replace(/\/$/, "") : "";
  return url.startsWith("https://") ? url : undefined;
}

async function readNgrokTunnels(fetchImpl, timing) {
  let response;

  try {
    response = await fetchImpl(NGROK_TUNNELS_URL, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch {
    return undefined;
  }

  if (!response.ok) return undefined;

  try {
    const payload = await response.json();
    return Array.isArray(payload?.tunnels) ? payload.tunnels : [];
  } catch {
    return undefined;
  }
}

function findHttpsTunnel(tunnels, port) {
  return tunnels.find((tunnel) => httpsUrlFromTunnel(tunnel) && tunnelForwardsPort(tunnel, port));
}

async function waitForHttpsTunnel({ fetchImpl, port, sleep, now, timing }) {
  const deadline = now() + timing.ngrokWaitMs;

  while (now() <= deadline) {
    const tunnels = await readNgrokTunnels(fetchImpl, timing);
    const match = findHttpsTunnel(tunnels ?? [], port);
    const publicBaseUrl = httpsUrlFromTunnel(match);
    if (publicBaseUrl) return publicBaseUrl;
    if (now() >= deadline) break;
    await sleep(timing.ngrokPollIntervalMs);
  }

  throw new VerificationError(`ngrok did not create an HTTPS tunnel for port ${port}.`);
}

function spawnNgrok(port) {
  try {
    return spawn("ngrok", ["http", String(port)], {
      stdio: "ignore",
    });
  } catch (error) {
    throw new VerificationError("Missing required command: ngrok.", { cause: error });
  }
}

async function defaultStartTunnel({
  port,
  fetchImpl,
  sleep,
  now,
  write,
  timing,
  spawnProcess = spawnNgrok,
}) {
  const existing = await readNgrokTunnels(fetchImpl, timing);
  const reusable = findHttpsTunnel(existing ?? [], port);
  const reusableUrl = httpsUrlFromTunnel(reusable);

  if (reusableUrl) {
    write(`Reusing ngrok tunnel: ${reusableUrl}.`);
    return {
      publicBaseUrl: reusableUrl,
      async stop() {},
    };
  }

  if (existing) {
    let created;

    try {
      created = await fetchImpl(NGROK_TUNNELS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(timing.httpTimeoutMs),
        body: JSON.stringify({
          addr: String(port),
          name: NGROK_TUNNEL_NAME,
          proto: "http",
        }),
      });
    } catch (error) {
      throw new VerificationError("ngrok is running, but a second tunnel could not be added.", { cause: error });
    }

    if (!created.ok) {
      throw new VerificationError(
        `ngrok is already forwarding another port. Stop that agent, or run with --no-ngrok and TELNYX_PUBLIC_BASE_URL.`,
      );
    }

    const publicBaseUrl = await waitForHttpsTunnel({ fetchImpl, now, port, sleep, timing });
    write(`Added ngrok tunnel: ${publicBaseUrl}.`);
    return {
      publicBaseUrl,
      async stop() {
        try {
          await fetchImpl(`${NGROK_TUNNELS_URL}/${NGROK_TUNNEL_NAME}`, {
            method: "DELETE",
            redirect: "error",
            signal: AbortSignal.timeout(timing.httpTimeoutMs),
          });
        } catch {
          // The parent ngrok agent may already have stopped.
        }
      },
    };
  }

  const child = spawnProcess(port);
  const spawnFailed = new Promise((_, reject) => {
    child.once?.("error", (error) => {
      reject(new VerificationError(
        error.code === "ENOENT" ? "Missing required command: ngrok." : "ngrok failed to start.",
        { cause: error },
      ));
    });
  });

  try {
    const publicBaseUrl = await Promise.race([
      waitForHttpsTunnel({ fetchImpl, now, port, sleep, timing }),
      spawnFailed,
    ]);
    write(`Started ngrok tunnel: ${publicBaseUrl}.`);
    return {
      publicBaseUrl,
      async stop() {
        if (child.killed || child.exitCode != null) return;
        child.kill("SIGTERM");
      },
    };
  } catch (error) {
    if (!child.killed && child.exitCode == null) child.kill("SIGTERM");
    throw error;
  }
}

function proxyOrigin(aiBaseUrl) {
  return new URL(aiBaseUrl).origin;
}

function proxyPort(aiBaseUrl) {
  const url = new URL(aiBaseUrl);
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

async function isProxyListening(fetchImpl, origin, timing) {
  try {
    await fetchImpl(`${origin}/healthz`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(timing.httpTimeoutMs, 1_000)),
    });
    return true;
  } catch {
    return false;
  }
}

function spawnCodexProxy(port) {
  try {
    return spawn("claude-code-proxy", ["serve", "--no-monitor", "--port", String(port)], {
      env: {
        ...process.env,
        CCP_CODEX_RESPONSES_API: "1",
      },
      stdio: "ignore",
    });
  } catch (error) {
    throw new VerificationError("Missing required command: claude-code-proxy.", { cause: error });
  }
}

async function waitForProxy({ fetchImpl, origin, sleep, now, timing }) {
  const deadline = now() + timing.ngrokWaitMs;

  while (now() <= deadline) {
    if (await isProxyListening(fetchImpl, origin, timing)) return;
    if (now() >= deadline) break;
    await sleep(timing.ngrokPollIntervalMs);
  }

  throw new VerificationError(`claude-code-proxy did not become ready at ${origin}.`);
}

async function defaultStartProxy({
  aiBaseUrl,
  fetchImpl,
  sleep,
  now,
  write,
  timing,
  spawnProcess = spawnCodexProxy,
}) {
  const origin = proxyOrigin(aiBaseUrl);

  if (await isProxyListening(fetchImpl, origin, timing)) {
    write(`Reusing local Codex proxy: ${origin}.`);
    return { async stop() {} };
  }

  const child = spawnProcess(proxyPort(aiBaseUrl));
  const spawnFailed = new Promise((_, reject) => {
    child.once?.("error", (error) => {
      reject(new VerificationError(
        error.code === "ENOENT"
          ? "Missing required command: claude-code-proxy."
          : "claude-code-proxy failed to start.",
        { cause: error },
      ));
    });
  });

  try {
    await Promise.race([
      waitForProxy({ fetchImpl, now, origin, sleep, timing }),
      spawnFailed,
    ]);
    write(`Started local Codex proxy: ${origin}.`);
    return {
      async stop() {
        if (child.killed || child.exitCode != null) return;
        child.kill("SIGTERM");
      },
    };
  } catch (error) {
    if (!child.killed && child.exitCode == null) child.kill("SIGTERM");
    throw error;
  }
}

function conversationTexml(config, relayToken) {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<Response>",
    `<Say voice="${SAY_VOICE}">${AGENT_LINES.greeting}</Say>`,
    "<Connect>",
    "<ConversationRelay",
    ` url="${relayWebSocketUrl(config)}"`,
    " interruptible=\"speech\"",
    ` voice="${SAY_VOICE}"`,
    " language=\"en-IN\"",
    " transcriptionProvider=\"deepgram\"",
    ">",
    `<Parameter name="relayToken" value="${relayToken}" />`,
    "</ConversationRelay>",
    "</Connect>",
    "</Response>",
  ].join("");
}

function readResponseErrorCode(payload) {
  const firstError = payload?.errors?.[0];
  const code = firstError?.code ?? payload?.code;
  return Number.isInteger(code) ? code : (typeof code === "string" && code ? code : undefined);
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new PollingError("Telnyx returned an invalid JSON response.");
  }
}

async function requestJson({ config, fetchImpl, url, method, timing, body }) {
  let response;

  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new PollingError("Telnyx could not be reached.", { cause: error });
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw new TelnyxHttpError(response.status, readResponseErrorCode(payload));
  }

  return payload;
}

async function verifyConfiguration({ config, fetchImpl, timing }) {
  const numbersUrl = createUrl("/v2/phone_numbers", {
    "filter[phone_number]": config.from,
    "page[size]": "1",
  });
  const numbersPayload = await requestJson({
    config,
    fetchImpl,
    url: numbersUrl,
    method: "GET",
    timing,
  });
  const number = numbersPayload.data?.find((candidate) => candidate.phone_number === config.from);

  if (!number) {
    throw new VerificationError("Telnyx does not list TELNYX_PHONE_NUMBER for this account.");
  }

  if (number.status && number.status !== "active") {
    throw new VerificationError("TELNYX_PHONE_NUMBER is not active.");
  }

  if (!number.connection_id) {
    throw new VerificationError("TELNYX_PHONE_NUMBER is not assigned to a Voice connection.");
  }

  const applicationUrl = createUrl(`/v2/texml_applications/${config.applicationSid}`);
  const applicationPayload = await requestJson({
    config,
    fetchImpl,
    url: applicationUrl,
    method: "GET",
    timing,
  });
  const application = applicationPayload.data ?? applicationPayload;

  if (String(application.id ?? "") !== config.applicationSid) {
    throw new VerificationError("TELNYX_APPLICATION_SID was not found on this account.");
  }

  if (!application.outbound?.outbound_voice_profile_id) {
    throw new VerificationError("TELNYX_APPLICATION_SID has no Outbound Voice Profile.");
  }
}

function readCreatedCallSid(payload) {
  const candidates = [
    payload?.sid,
    payload?.Sid,
    payload?.call_sid,
    payload?.data?.sid,
    payload?.data?.call_control_id,
  ];

  return candidates.find((value) => isCallSid(value));
}

function intentErrorDetail(payload) {
  const message = payload?.error?.message ?? payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.title;
  return typeof message === "string" && message.trim() ? message.trim() : "";
}

function wrapIntentError(error) {
  const status = error?.statusCode ?? error?.status;
  const body = typeof error?.responseBody === "string" ? error.responseBody : "";
  let detail = "";

  if (body.trim()) {
    try {
      detail = intentErrorDetail(JSON.parse(body)) || body.replace(/\s+/g, " ").slice(0, 300);
    } catch {
      detail = body.replace(/\s+/g, " ").slice(0, 300);
    }
  } else if (typeof error?.message === "string") {
    detail = error.message;
  }

  if (status) {
    return new VerificationError(
      detail
        ? `The intent model rejected the classification request (HTTP ${status}): ${detail}`
        : `The intent model rejected the classification request (HTTP ${status}).`,
    );
  }

  return new VerificationError("The intent model could not be reached.", { cause: error });
}

export async function completeIntentText({
  config,
  fetchImpl,
  text,
  timing = DEFAULT_TIMING,
  signal,
}) {
  const timeoutMs = config.aiTimeoutMs ?? timing.intentTimeoutMs;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const abortSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const provider = createOpenAI({
    apiKey: config.aiApiKey,
    baseURL: config.aiBaseUrl,
    fetch: fetchImpl,
  });

  try {
    const result = streamText({
      abortSignal,
      maxRetries: 0,
      model: provider.responses(config.aiModel),
      output: Output.object({
        description: "Whether the caller confirmed, denied, or was unclear.",
        name: "voice_turn_intent",
        schema: intentOutputSchema,
      }),
      prompt: text,
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningContext: "all_turns",
          reasoningEffort: "low",
          store: false,
        },
      },
      system: INTENT_PROMPT,
    });

    return (await result.output).intent;
  } catch (error) {
    throw wrapIntentError(error);
  }
}

export async function classifyCallerIntent({
  config,
  fetchImpl,
  text,
  phase,
  timing = DEFAULT_TIMING,
  signal,
  completeIntent = completeIntentText,
}) {
  const local = classifyLocalOliverTurn(phase, text);
  if (local !== "unclear") {
    return { intent: local, source: "local" };
  }

  try {
    const intent = await completeIntent({
      config,
      fetchImpl,
      signal,
      text,
      timing,
    });
    const parsed = INTENT_VALUES.has(intent) ? intent : parseIntentReply(intent);
    return { intent: parsed, source: "model" };
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw wrapIntentError(error);
  }
}

function readClassifiedIntent(value) {
  if (typeof value === "string") return { intent: value, source: "model" };
  return {
    intent: value?.intent,
    source: value?.source ?? "model",
  };
}

async function verifyIntentModel({ config, classifyIntent, fetchImpl, timing, now, write }) {
  const localStartedAt = now();
  const localResult = readClassifiedIntent(await classifyIntent({
    config,
    fetchImpl,
    phase: "identity",
    text: "Yeah I'm Oliver",
    timing,
  }));
  write(`Local sample classified as ${localResult.intent} via ${localResult.source} in ${now() - localStartedAt} ms.`);

  if (localResult.intent !== "confirm") {
    throw new VerificationError("The local matcher did not classify a spoken confirmation as confirm.");
  }

  const leftover = "Hmm I think maybe later this week if that is still possible";
  const modelStartedAt = now();
  try {
    const modelResult = readClassifiedIntent(await classifyIntent({
      config,
      fetchImpl,
      phase: "reschedule",
      text: leftover,
      timing,
    }));
    write(`Model sample classified as ${modelResult.intent} via ${modelResult.source} in ${now() - modelStartedAt} ms (reasoning=low).`);
  } catch (error) {
    write(`Model sample failed after ${now() - modelStartedAt} ms: ${error.message}`);
  }
}

async function createCall({ config, fetchImpl, timing, relayToken }) {
  const url = createUrl(`/v2/texml/Accounts/${config.accountSid}/Calls`);
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ApplicationSid: config.applicationSid,
        From: config.from,
        Texml: conversationTexml(config, relayToken),
        TimeLimit: 120,
        Timeout: 20,
        To: config.to,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new UnknownCallOutcomeError(
        "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      );
    }

    throw new TelnyxHttpError(response.status, readResponseErrorCode(payload));
  }

  const callSid = readCreatedCallSid(payload);

  if (!callSid) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
    );
  }

  return callSid;
}

function isTransientReadError(error) {
  if (error instanceof PollingError) {
    return true;
  }

  return (
    error instanceof TelnyxHttpError
    && (error.status === 404 || error.status === 429 || error.status >= 500)
  );
}

async function readCallStatus({ config, callSid, fetchImpl, timing }) {
  const url = createUrl(`/v2/texml/Accounts/${config.accountSid}/Calls/${callSid}`);
  return requestJson({
    config,
    fetchImpl,
    url,
    method: "GET",
    timing,
  });
}

async function pollCall({
  config,
  callSid,
  fetchImpl,
  sleep,
  now,
  timing,
  write,
}) {
  const deadline = now() + timing.pollDeadlineMs;
  let transientReadFailures = 0;
  let lastLoggedStatus;

  while (now() <= deadline) {
    try {
      const call = await readCallStatus({ config, callSid, fetchImpl, timing });
      const status = call.status ?? call.data?.status;

      if (typeof status !== "string") {
        throw new PollingError("Telnyx returned a call without a status.");
      }

      transientReadFailures = 0;
      if (status !== lastLoggedStatus) {
        write(`Call status: ${status}.`);
        lastLoggedStatus = status;
      }

      if (TERMINAL_STATUSES.has(status)) {
        return status;
      }
    } catch (error) {
      if (!isTransientReadError(error)) {
        throw error;
      }

      transientReadFailures += 1;

      if (transientReadFailures > timing.maxTransientReadFailures) {
        throw new PollingError("Call status is unavailable. Check Telnyx Call Logs.");
      }

      write("Call status is not available yet. Retrying status read.");
    }

    if (now() >= deadline) {
      break;
    }

    await sleep(timing.pollIntervalMs);
  }

  throw new PollingError("Timed out while waiting for the call status. Check Telnyx Call Logs.");
}

function sendRelayMessage(socket, message) {
  if (socket.readyState !== 1) return false;

  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function speakText(socket, text) {
  const chunks = splitSpeechChunks(text);
  let sent = false;

  for (const [index, token] of chunks.entries()) {
    const ok = sendRelayMessage(socket, {
      last: index === chunks.length - 1,
      token,
      type: "text",
    });
    if (ok) sent = true;
  }

  return sent;
}

function formatMs(value) {
  return value == null ? "n/a" : String(value);
}

export function formatTurnMetrics(timing) {
  const finality = timing.finality ? ` ${timing.finality}` : "";
  return [
    `TURN ${timing.phase}${finality}`,
    `  since_agent_ms=${formatMs(timing.sinceAgentMs)}  (agent text queued → this turn; includes you talking)`,
    `  eot_ms=${formatMs(timing.eotMs)}  (last transcript growth → we treated the turn as done)`,
    `  intent_ms=${formatMs(timing.intentMs)}  (classifier only)`,
    `  tts_send_ms=${formatMs(timing.ttsSendMs)}  (websocket send, not first audible audio)`,
    `  dead_air_ms=${formatMs(timing.deadAirMs)}  (last transcript growth → we queued agent text; closest to silence after you stop)`,
  ].join("\n");
}

async function defaultStartRelayServer({ config, onSocket }) {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.get(RELAY_PATH, { websocket: true }, (socket) => {
    onSocket(socket);
  });
  await app.listen({ host: "127.0.0.1", port: config.gatewayPort });
  return {
    async close() {
      await app.close();
    },
  };
}

function attachConversationSocket({
  socket,
  expectedToken,
  classifyIntent,
  config,
  fetchImpl,
  timing,
  now,
  write,
  onFinished,
}) {
  let state = createConversationState();
  const sessionStartedAt = now();
  let lastAgentSentAt = sessionStartedAt;
  let lastTranscriptGrowthAt;
  let lastTranscriptText = "";
  let activeRequest;
  let finished = false;
  let pendingSuccess = false;
  let turnBusy = false;
  let latestPartial = "";
  let partialDeadline;
  const seenFrameTypes = new Set();

  function logEvent(event, extra) {
    const elapsed = Math.max(0, now() - sessionStartedAt);
    write(`t+${String(elapsed).padStart(5, "0")}ms ${event}${extra ? ` ${extra}` : ""}`);
  }

  function finish(success) {
    if (finished) return;
    finished = true;
    activeRequest?.abort();
    clearPartialDeadline();
    sendRelayMessage(socket, { type: "end" });
    onFinished({
      frames: [...seenFrameTypes],
      success,
    });
  }

  function clearPartialDeadline() {
    if (partialDeadline) clearTimeout(partialDeadline);
    partialDeadline = undefined;
    latestPartial = "";
  }

  function armPartialDeadline(text) {
    clearPartialDeadline();
    latestPartial = text;
    const waitMs = Math.max(1, timing.partialFinalizeMs ?? DEFAULT_TIMING.partialFinalizeMs);
    partialDeadline = setTimeout(() => {
      const candidate = latestPartial;
      if (!candidate || finished || turnBusy) return;
      logEvent("decide", `stable_partial chars=${candidate.length}`);
      void respondToCaller(candidate, "partial");
    }, waitMs);
    partialDeadline.unref?.();
  }

  async function respondToCaller(callerText, finality) {
    if (finished || state.phase === "ended" || turnBusy) return;
    turnBusy = true;
    clearPartialDeadline();
    const promptReceivedAt = now();
    const sinceAgentMs = lastAgentSentAt == null ? undefined : promptReceivedAt - lastAgentSentAt;
    const eotMs = lastTranscriptGrowthAt == null ? undefined : promptReceivedAt - lastTranscriptGrowthAt;
    const controller = new AbortController();
    activeRequest = controller;
    const intentStartedAt = now();
    logEvent("classify_start", `phase=${state.phase} finality=${finality} chars=${String(callerText).trim().length}`);
    let intent;
    let source = "model";

    try {
      const classified = await classifyIntent({
        config,
        fetchImpl,
        phase: state.phase,
        signal: controller.signal,
        text: callerText,
        timing,
      });
      if (typeof classified === "string") {
        intent = classified;
      } else {
        intent = classified.intent;
        source = classified.source ?? "model";
      }
    } catch (error) {
      if (controller.signal.aborted || finished) {
        turnBusy = false;
        return;
      }
      logEvent("classify_fail", error.message);
      const spokenAt = now();
      speakText(socket, AGENT_LINES.failed);
      lastAgentSentAt = spokenAt;
      write(formatTurnMetrics({
        deadAirMs: lastTranscriptGrowthAt == null ? undefined : spokenAt - lastTranscriptGrowthAt,
        eotMs,
        finality,
        intentMs: spokenAt - intentStartedAt,
        phase: state.phase,
        sinceAgentMs,
        ttsSendMs: 0,
      }));
      finish(false);
      return;
    }

    if (controller.signal.aborted || finished) {
      turnBusy = false;
      return;
    }

    const intentMs = now() - intentStartedAt;
    const currentPhase = state.phase;
    const reply = applyOliverTurn(state, intent);
    state = reply.nextState;
    const ttsStartedAt = now();
    speakText(socket, reply.text);
    const ttsSendMs = now() - ttsStartedAt;
    lastAgentSentAt = now();
    const deadAirMs = lastTranscriptGrowthAt == null ? undefined : lastAgentSentAt - lastTranscriptGrowthAt;
    logEvent("classify_done", `intent=${intent} source=${source} intent_ms=${intentMs}`);
    logEvent("tts_queued", `chars=${reply.text.length} tts_send_ms=${ttsSendMs}`);
    write(formatTurnMetrics({
      deadAirMs,
      eotMs,
      finality,
      intentMs,
      phase: currentPhase,
      sinceAgentMs,
      ttsSendMs,
    }));
    turnBusy = false;
    lastTranscriptGrowthAt = undefined;
    lastTranscriptText = "";

    if (reply.end) {
      pendingSuccess = Boolean(state.success);
      const waitMs = speechPlaybackMs(reply.text);
      logEvent("tts_wait", `ms=${waitMs} (estimated playback; Telnyx sends no tokens-played)`);
      await delay(waitMs);
      if (!finished) finish(pendingSuccess);
    }
  }

  socket.on("message", (payload) => {
    void (async () => {
      let message;
      try {
        message = JSON.parse(payload.toString());
      } catch {
        write("Ignored a non-JSON Conversation Relay frame.");
        return;
      }

      if (typeof message?.type === "string") {
        seenFrameTypes.add(message.type);
        if (!["setup", "prompt", "interrupt", "dtmf", "error"].includes(message.type)) {
          logEvent("frame", `type=${message.type}`);
        }
      }

      if (message?.type === "setup") {
        const token = message.customParameters?.relayToken;
        if (token !== expectedToken) {
          logEvent("setup_fail", "relay token mismatch");
          finish(false);
          return;
        }
        logEvent("setup", "relay connected. Greeting should already be playing via Say.");
        return;
      }

      if (message?.type === "prompt" && message.last === false) {
        const partial = String(message.voicePrompt ?? "").trim();
        const grew = partial.length > lastTranscriptText.length || partial !== lastTranscriptText;
        lastTranscriptText = partial;
        if (grew) lastTranscriptGrowthAt = now();
        logEvent("prompt", `last=false chars=${partial.length} grew=${grew}`);
        if (partial && !turnBusy) armPartialDeadline(partial);
        return;
      }

      if (message?.type === "interrupt") {
        activeRequest?.abort();
        turnBusy = false;
        clearPartialDeadline();
        logEvent("interrupt", `duration_ms=${message.durationUntilInterruptMs ?? "n/a"}`);
        return;
      }

      if (message?.type === "error") {
        logEvent("error", String(message.description ?? "Conversation Relay reported an error"));
        finish(false);
        return;
      }

      if (message?.type !== "prompt" || message.last !== true) {
        if (message?.type && !["setup", "prompt", "interrupt", "dtmf", "error"].includes(message.type)) {
          logEvent("frame", `type=${message.type}`);
        }
        return;
      }

      const finalText = String(message.voicePrompt ?? "").trim();
      const grew = finalText.length > lastTranscriptText.length || finalText !== lastTranscriptText;
      lastTranscriptText = finalText;
      if (grew || lastTranscriptGrowthAt == null) lastTranscriptGrowthAt = now();
      logEvent("prompt", `last=true chars=${finalText.length} grew=${grew}`);
      await respondToCaller(finalText, "final");
    })();
  });

  socket.on("close", () => {
    if (!finished) finish(pendingSuccess);
  });
}

function helpText() {
  return [
    "Telnyx conversation sandbox",
    "",
    "--dry-run  Validate local configuration. No network request is made.",
    "--verify   Start the local Codex proxy and ngrok, then verify Telnyx and a fast confirm classification. No call is made.",
    "--confirm  Place one billable three-turn test call to CALL_TO_NUMBER.",
    "--no-ngrok    Use TELNYX_PUBLIC_BASE_URL instead of starting ngrok.",
    "--skip-proxy  Use an already running claude-code-proxy instead of starting one.",
    "",
    "The script only uses CALL_TO_NUMBER. It accepts no destination argument.",
    "--verify and --confirm start claude-code-proxy and ngrok, then stop only the processes they started.",
    "Existing shell variables override .env.local values loaded by Node.",
  ].join("\n");
}

function describeHttpError(error) {
  const codeSuffix = error.code ? `, Telnyx code ${error.code}` : "";
  return `Telnyx request failed with HTTP ${error.status}${codeSuffix}.`;
}

function exitForError(error, write) {
  if (error instanceof UnknownCallOutcomeError) {
    write(error.message);
    return 2;
  }

  if (error instanceof TelnyxHttpError) {
    write(describeHttpError(error));
    return 1;
  }

  if (error instanceof ValidationError || error instanceof VerificationError || error instanceof PollingError) {
    write(error.message);
    return 1;
  }

  write("Telnyx conversation test failed without a safe diagnostic.");
  return 1;
}

function writeConfigurationSummary(config, write) {
  write(`Account: ${maskAccountSid(config.accountSid)}.`);
  write(`From: ${maskPhoneNumber(config.from)}.`);
  write(`To: ${maskPhoneNumber(config.to)}.`);
  if (config.publicBaseUrl) {
    write(`Relay: ${relayWebSocketUrl(config)}.`);
  } else {
    write(`Relay: ngrok will start for port ${config.gatewayPort}.`);
  }
  write(`Intent proxy: ${config.aiBaseUrl}.`);
  write("Note: exported shell variables override values from .env.local.");
}

function parseCommandArgs(args) {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  const noNgrok = commandArgs.includes("--no-ngrok");
  const skipProxy = commandArgs.includes("--skip-proxy");
  const commands = commandArgs.filter((value) => value !== "--no-ngrok" && value !== "--skip-proxy");
  return { commandArgs: commands, noNgrok, skipProxy };
}

export async function runCommand({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
  write = defaultWrite,
  sleep = delay,
  now = Date.now,
  timing = DEFAULT_TIMING,
  classifyIntent = classifyCallerIntent,
  startRelayServer = defaultStartRelayServer,
  startTunnel = defaultStartTunnel,
  startProxy = defaultStartProxy,
  completeConversation,
}) {
  const { commandArgs, noNgrok, skipProxy } = parseCommandArgs(args);
  const [command] = commandArgs;

  if (commandArgs.length !== 1 || !COMMANDS.has(command)) {
    write("Use --help to see the supported command modes.");
    return 1;
  }

  if (command === "--help") {
    write(helpText());
    return 0;
  }

  let config;

  try {
    config = getConfiguration(env);
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--dry-run") {
    writeConfigurationSummary(config, write);
    write("Dry run passed. No network request was made.");
    return 0;
  }

  let relayServer;
  let tunnel;
  let proxy;

  try {
    if (noNgrok && !isHttpsUrl(config.publicBaseUrl)) {
      throw new ValidationError("TELNYX_PUBLIC_BASE_URL must be an https URL when --no-ngrok is set.");
    }

    if (skipProxy) {
      write(`Using existing Codex proxy: ${config.aiBaseUrl}.`);
    } else {
      proxy = await startProxy({
        aiBaseUrl: config.aiBaseUrl,
        fetchImpl,
        now,
        sleep,
        timing,
        write,
      });
    }

    if (!noNgrok) {
      tunnel = await startTunnel({
        fetchImpl,
        now,
        port: config.gatewayPort,
        sleep,
        timing,
        write,
      });
      config = { ...config, publicBaseUrl: tunnel.publicBaseUrl.replace(/\/$/, "") };
    }

    write(`Relay: ${relayWebSocketUrl(config)}.`);

    await verifyConfiguration({ config, fetchImpl, timing });
    write(`Verified Voice-capable sender: ${maskPhoneNumber(config.from)}.`);

    if (command === "--verify") {
      await verifyIntentModel({ classifyIntent, config, fetchImpl, now, timing, write });
      write("Verified fast confirm classification for a spoken variant.");
      write("Verification passed. No call was made.");
      return 0;
    }

    write("Placing the call now. Greeting plays as soon as you answer.");
    write("Metrics: dead_air_ms is silence after STT last grew. intent_ms is the classifier. tts_send_ms is not audible latency. Telnyx does not send tokens-played.");

    const relayToken = randomBytes(16).toString("hex");
    let sessionResult = { frames: [], success: false };
    let resolveSession = (result) => {
      sessionResult = result;
    };
    const sessionFinished = new Promise((resolve) => {
      resolveSession = (result) => {
        sessionResult = result;
        resolve(result);
      };
    });

    relayServer = await startRelayServer({
      config,
      onSocket(socket) {
        attachConversationSocket({
          classifyIntent,
          config,
          expectedToken: relayToken,
          fetchImpl,
          now,
          onFinished: resolveSession,
          socket,
          timing,
          write,
        });
      },
    });

    if (completeConversation) {
      resolveSession(await completeConversation({ relayToken }));
    }

    write(`Creating one conversation call from ${maskPhoneNumber(config.from)} to ${maskPhoneNumber(config.to)}.`);
    const callSid = await createCall({ config, fetchImpl, relayToken, timing });
    write(`Call created. Call SID: ${callSid}.`);

    const terminalStatus = await pollCall({
      callSid,
      config,
      fetchImpl,
      now,
      sleep,
      timing,
      write,
    });

    await Promise.race([sessionFinished, delay(0)]);
    write(`Conversation frames: ${sessionResult.frames.join(", ") || "none"}.`);

    if (terminalStatus === "completed" && sessionResult.success) {
      write("Conversation completed. Answer the call and hear the three turns before treating this test as passed.");
      return 0;
    }

    if (terminalStatus !== "completed") {
      write(`Call ended with ${terminalStatus}. The test did not pass.`);
      return 1;
    }

    write("Call completed before the scripted conversation finished. The test did not pass.");
    return 1;
  } catch (error) {
    return exitForError(error, write);
  } finally {
    await relayServer?.close?.();
    await tunnel?.stop?.();
    await proxy?.stop?.();
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const exitCode = await runCommand({ args: process.argv.slice(2) });
  process.exitCode = exitCode;
}
