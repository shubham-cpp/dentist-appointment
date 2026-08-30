import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set(["--help", "--dry-run", "--verify", "--confirm"]);
const EXPECTED_ASSISTANT_NAME = "Controlled dental scheduling trial";
const EXPECTED_ASSISTANT_MODEL = "openai/gpt-5.6-luna";
const EXPECTED_LLM_SECRET_REF = "dentist_voice_assistant_trial_openai_api_key";
const CALL_TIME_LIMIT_SECS = 60;
const CALL_TIMEOUT_SECS = 20;
const DIAGNOSTIC_EVENT = "telnyx.standalone_assistant_diagnostic";
const DIAGNOSTIC_ROUTE = "/voice/assistant/diagnostics";
const DEFAULT_DEBUG_LOG_PATH = join(
  tmpdir(),
  "dentist-management-system-voice-gateway.jsonl",
);

export const LOW_LATENCY_PROFILE = Object.freeze({
  interruption_settings: {
    start_speaking_plan: {
      transcription_endpointing_plan: {
        on_no_punctuation_seconds: 0.1,
        on_number_seconds: 0.1,
        on_punctuation_seconds: 0.1,
      },
      wait_seconds: 0.1,
    },
  },
  transcription: {
    language: "en",
    model: "deepgram/flux",
    settings: {
      eager_eot_threshold: 0.3,
      eot_threshold: 0.8,
      eot_timeout_ms: 5_000,
    },
  },
});

export const CALL_GREETING =
  "Hello, this is Brightview Dental. Am I speaking with Oliver?";

export const CALL_TOOLS = Object.freeze([{
  hangup: {
    description: [
      "End the phone call after the assistant has spoken its final goodbye.",
      "Use this when the test is complete or the caller asks to end the call.",
    ].join(" "),
  },
  type: "hangup",
}]);

export const CALL_INSTRUCTIONS = [
  "You are a friendly voice agent for a fictional Brightview Dental call.",
  "This is an isolated voice test, not a real clinic call.",
  "The fixed greeting already asked whether the caller is Oliver.",
  "Understand the caller's meaning and use the conversation context.",
  "Do not repeat a question after the caller answers it.",
  "Start each spoken reply with a complete sentence of six words or fewer.",
  "Keep most replies under eighteen words and use no more than two short sentences.",
  "Ask at most one short question in each turn.",
  "If the caller is not Oliver, apologize, say goodbye, and end the call.",
  "If the caller confirms they are Oliver, thank them.",
  "Then explain that a scheduling issue means their fictional appointment needs rescheduling.",
  "Ask whether they would like to reschedule it.",
  "If they agree, say: Thank you. Our team will contact you with available options. Goodbye.",
  "Then end the call.",
  "If they decline, acknowledge their choice, thank them, say goodbye, and end the call.",
  "Answer simple follow-up questions naturally and keep the conversation brief.",
  "Never claim that an appointment was changed or cancelled.",
  "Use no tool except Hangup.",
  "When the caller asks to end the test, say goodbye and end the call.",
  "After every final goodbye, use Hangup immediately. Do not wait for the caller.",
].join(" ");

const DEFAULT_TIMING = Object.freeze({
  diagnosticDeadlineMs: 10_000,
  diagnosticPollIntervalMs: 500,
  httpTimeoutMs: 20_000,
  maxTransientReadFailures: 5,
  pollDeadlineMs: 100_000,
  pollIntervalMs: 2_000,
});

class ValidationError extends Error {}
class VerificationError extends Error {}
class RequestError extends Error {}
class PollingError extends Error {}
class UnknownCallOutcomeError extends Error {}

class TelnyxHttpError extends Error {
  constructor(status, diagnostic) {
    super("Telnyx returned an HTTP error.");
    this.status = status;
    this.code = diagnostic.code;
    this.detail = diagnostic.detail;
    this.title = diagnostic.title;
  }
}

function defaultWrite(message) {
  console.log(message);
}

function defaultSleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function valueFromEnvironment(env, key) {
  return String(env[key] ?? "").trim();
}

function publicBaseUrlFromEnvironment(env) {
  let url;
  try {
    url = new URL(valueFromEnvironment(env, "VOICE_GATEWAY_PUBLIC_BASE_URL"));
  } catch {
    throw new ValidationError("VOICE_GATEWAY_PUBLIC_BASE_URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ValidationError("VOICE_GATEWAY_PUBLIC_BASE_URL must be a public HTTPS URL.");
  }
  return url.toString().replace(/\/+$/, "");
}

function isAssistantId(value) {
  return /^assistant-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function isCallControlId(value) {
  return typeof value === "string" && /^v3:[A-Za-z0-9_-]{8,}$/.test(value);
}

function isE164Number(value) {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

function isResourceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{8,200}$/.test(value);
}

function isTelnyxApplicationId(value) {
  return /^\d{10,20}$/.test(value);
}

function getConfiguration(env) {
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const connectionId = valueFromEnvironment(env, "TELNYX_CONNECTION_ID");
  const from = valueFromEnvironment(env, "TELNYX_PHONE_NUMBER");
  const to = valueFromEnvironment(env, "CALL_TO_NUMBER");
  const mainAssistantId = valueFromEnvironment(env, "TELNYX_AI_ASSISTANT_ID");
  const publicBaseUrl = publicBaseUrlFromEnvironment(env);

  if (!apiKey || /replace|placeholder/i.test(apiKey)) {
    throw new ValidationError("TELNYX_API_KEY is missing.");
  }
  if (!isTelnyxApplicationId(connectionId)) {
    throw new ValidationError("TELNYX_CONNECTION_ID is invalid.");
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
  if (!isAssistantId(mainAssistantId)) {
    throw new ValidationError("TELNYX_AI_ASSISTANT_ID is invalid.");
  }
  if (valueFromEnvironment(env, "VOICE_RUNTIME") !== "telnyx-ai-assistant") {
    throw new ValidationError("VOICE_RUNTIME must be telnyx-ai-assistant.");
  }
  if (valueFromEnvironment(env, "VOICE_CALLS_ENABLED") !== "true") {
    throw new ValidationError("VOICE_CALLS_ENABLED must be true.");
  }
  if (valueFromEnvironment(env, "VOICE_DEMO_MODE") !== "true") {
    throw new ValidationError("VOICE_DEMO_MODE must be true.");
  }

  return {
    apiKey,
    connectionId,
    debugLogPath: valueFromEnvironment(env, "VOICE_GATEWAY_DEBUG_LOG_PATH")
      || DEFAULT_DEBUG_LOG_PATH,
    from,
    mainAssistantId,
    publicBaseUrl,
    to,
  };
}

function maskPhoneNumber(value) {
  return `${value.slice(0, 2)}****${value.slice(-4)}`;
}

function maskIdentifier(value) {
  return `${value.slice(0, 4)}...${value.slice(-6)}`;
}

function helpText() {
  return [
    "Run one standalone Telnyx AI Assistant phone conversation.",
    "",
    "Usage:",
    "  pnpm test:telnyx:assistant-call -- --help",
    "  pnpm test:telnyx:assistant-call -- --dry-run",
    "  pnpm test:telnyx:assistant-call -- --verify",
    "  pnpm test:telnyx:assistant-call -- --confirm",
    "",
    "Modes:",
    "  --dry-run  Validate local guards. Make no network request.",
    "  --verify   Read the configured assistant, connection, profile, and sender.",
    "  --confirm  Place one billable call to CALL_TO_NUMBER.",
    "",
    "The confirmed call has a 60-second limit. Recording and AMD stay disabled.",
    "The call uses a fixed greeting and exposes only the Hangup tool.",
    "The voice gateway must run at VOICE_GATEWAY_PUBLIC_BASE_URL.",
    "The result is written below .voice-logs with the captured transcript.",
    "This test does not exercise or change the scheduling workflow.",
    "The script accepts no destination or assistant argument.",
  ].join("\n");
}

function safeText(value, config) {
  let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  for (const secret of [config.apiKey, config.from, config.to]) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\+[1-9]\d{7,14}/g, "[redacted-phone]")
    .slice(0, 300);
}

function safeDiagnostic(body, config) {
  const errors = Array.isArray(body?.errors)
    ? body.errors
    : Array.isArray(body?.data?.errors)
      ? body.data.errors
      : [];
  const first = errors[0] ?? {};
  const candidate = first.code ?? body?.code;
  const code = String(candidate ?? "unknown");
  return {
    code: /^[A-Za-z0-9_.:-]{1,80}$/.test(code) ? code : "unknown",
    detail: safeText(first.detail, config),
    title: safeText(first.title, config),
  };
}

function responseData(body) {
  if (body?.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (response.ok) {
      throw new RequestError("Telnyx returned invalid JSON.");
    }
    return {};
  }
}

async function telnyxRequest({
  body,
  config,
  fetchImpl,
  method = "GET",
  path,
  timing,
}) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method,
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new RequestError("Telnyx could not be reached.", { cause: error });
  }

  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new TelnyxHttpError(response.status, safeDiagnostic(result, config));
  }
  return result;
}

function verifyAssistant(assistant, config) {
  if (assistant?.id !== config.mainAssistantId) {
    throw new VerificationError("Telnyx returned a different assistant.");
  }
  if (assistant.name !== EXPECTED_ASSISTANT_NAME) {
    throw new VerificationError("The configured assistant name differs from the approved trial.");
  }
  if (assistant.model !== EXPECTED_ASSISTANT_MODEL
    || assistant.llm_api_key_ref !== EXPECTED_LLM_SECRET_REF) {
    throw new VerificationError("The configured assistant does not use the approved GPT-5.6 Luna model.");
  }
  if (assistant.privacy_settings?.data_retention !== false) {
    throw new VerificationError("The configured assistant has data retention enabled.");
  }
  if (!assistant.enabled_features?.includes("telephony")) {
    throw new VerificationError("The configured assistant does not have telephony enabled.");
  }
  if (assistant.telephony_settings?.recording_settings?.enabled !== false) {
    throw new VerificationError("The configured assistant does not disable recording.");
  }
  if (assistant.telephony_settings?.send_message_history_updates !== true) {
    throw new VerificationError("The configured assistant does not emit transcript updates.");
  }
  if (assistant.transcription?.model !== LOW_LATENCY_PROFILE.transcription.model
    || assistant.transcription?.language !== LOW_LATENCY_PROFILE.transcription.language
    || assistant.transcription?.settings?.eager_eot_threshold
      !== LOW_LATENCY_PROFILE.transcription.settings.eager_eot_threshold
    || assistant.transcription?.settings?.eot_threshold
      !== LOW_LATENCY_PROFILE.transcription.settings.eot_threshold
    || assistant.transcription?.settings?.eot_timeout_ms
      !== LOW_LATENCY_PROFILE.transcription.settings.eot_timeout_ms) {
    throw new VerificationError(
      "The configured assistant does not use the approved Flux latency profile.",
    );
  }
  const speakingPlan = assistant.interruption_settings?.start_speaking_plan;
  const endpointing = speakingPlan?.transcription_endpointing_plan;
  if (speakingPlan?.wait_seconds !== 0.1
    || endpointing?.on_no_punctuation_seconds !== 0.1
    || endpointing?.on_number_seconds !== 0.1
    || endpointing?.on_punctuation_seconds !== 0.1) {
    throw new VerificationError(
      "The configured assistant does not use the approved speaking plan.",
    );
  }
  if (typeof assistant.version_id !== "string" || !assistant.version_id) {
    throw new VerificationError("The configured assistant version is missing.");
  }
  return assistant;
}

async function readAssistant(input) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.mainAssistantId)}`,
  });
  return verifyAssistant(responseData(response), input.config);
}

async function verifyConnection(input) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/call_control_applications/${encodeURIComponent(input.config.connectionId)}`,
  });
  const connection = responseData(response);
  if (String(connection?.id ?? "") !== input.config.connectionId) {
    throw new VerificationError("TELNYX_CONNECTION_ID was not found.");
  }
  if (connection.active !== true) {
    throw new VerificationError("TELNYX_CONNECTION_ID is not active.");
  }
  const profileId = String(connection.outbound?.outbound_voice_profile_id ?? "");
  if (!isTelnyxApplicationId(profileId)) {
    throw new VerificationError("TELNYX_CONNECTION_ID has no outbound voice profile.");
  }
  return profileId;
}

async function verifyOutboundProfile(input, profileId) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/outbound_voice_profiles/${encodeURIComponent(profileId)}`,
  });
  const profile = responseData(response);
  if (String(profile?.id ?? "") !== profileId) {
    throw new VerificationError("The outbound voice profile was not found.");
  }
  if (profile.enabled !== true) {
    throw new VerificationError("The outbound voice profile is not enabled.");
  }
}

async function verifySender(input) {
  const query = new URLSearchParams({
    "filter[phone_number]": input.config.from,
    "page[size]": "1",
  });
  const response = await telnyxRequest({
    ...input,
    path: `/v2/phone_numbers?${query}`,
  });
  if (!Array.isArray(response?.data)) {
    throw new VerificationError("Telnyx returned an invalid phone number list.");
  }
  const sender = response.data.find(
    (candidate) => candidate?.phone_number === input.config.from,
  );
  if (!sender) {
    throw new VerificationError("Telnyx does not list TELNYX_PHONE_NUMBER for this account.");
  }
  if (sender.status !== "active") {
    throw new VerificationError("TELNYX_PHONE_NUMBER is not active.");
  }
}

async function verifyRemoteConfiguration(input) {
  const assistant = await readAssistant(input);
  const profileId = await verifyConnection(input);
  await verifyOutboundProfile(input, profileId);
  await verifySender(input);
  return assistant;
}

async function verifyDiagnosticGateway({ config, fetchImpl, timing }) {
  let response;
  try {
    response = await fetchImpl(`${config.publicBaseUrl}${DIAGNOSTIC_ROUTE}`, {
      headers: { Accept: "application/json" },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new VerificationError(
      "The public voice diagnostic receiver is unavailable.",
      { cause: error },
    );
  }
  const body = await readJsonResponse(response);
  if (!response.ok
    || body?.runtime !== "telnyx-ai-assistant"
    || body?.status !== "ready") {
    throw new VerificationError("The public voice diagnostic receiver is not ready.");
  }
}

function createCallBody(config, commandId) {
  const clientState = Buffer.from(JSON.stringify({
    command_id: commandId,
    scope: "standalone-assistant-call",
  })).toString("base64");
  return {
    assistant: {
      greeting: CALL_GREETING,
      id: config.mainAssistantId,
      instructions: CALL_INSTRUCTIONS,
      tools: CALL_TOOLS,
    },
    client_state: clientState,
    command_id: commandId,
    connection_id: config.connectionId,
    from: config.from,
    retry_on_timeout: false,
    time_limit_secs: CALL_TIME_LIMIT_SECS,
    timeout_secs: CALL_TIMEOUT_SECS,
    to: config.to,
    webhook_url: `${config.publicBaseUrl}${DIAGNOSTIC_ROUTE}`,
    webhook_url_method: "POST",
  };
}

async function createCall({ commandId, config, fetchImpl, timing }) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}/v2/calls`, {
      body: JSON.stringify(createCallBody(config, commandId)),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }

  let result;
  try {
    result = await readJsonResponse(response);
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }
  if (response.status >= 500) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
    );
  }
  if (!response.ok) {
    throw new TelnyxHttpError(response.status, safeDiagnostic(result, config));
  }

  const call = responseData(result);
  if (!isCallControlId(call?.call_control_id)
    || !isResourceId(call?.call_leg_id)
    || !isResourceId(call?.call_session_id)) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
    );
  }
  return call;
}

function isTransientStatusError(error) {
  return error instanceof RequestError
    || (error instanceof TelnyxHttpError
      && (error.status === 404 || error.status === 429 || error.status >= 500));
}

async function readCall(input, callControlId) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/calls/${callControlId}`,
  });
  const call = responseData(response);
  if (call?.call_control_id !== callControlId || typeof call.is_alive !== "boolean") {
    throw new PollingError("Telnyx returned an invalid call status.");
  }
  return call;
}

async function pollCall({
  callControlId,
  config,
  fetchImpl,
  now,
  sleep,
  timing,
  write,
}) {
  const deadline = now() + timing.pollDeadlineMs;
  let transientReadFailures = 0;
  let activeReported = false;

  while (now() <= deadline) {
    try {
      const call = await readCall({ config, fetchImpl, timing }, callControlId);
      transientReadFailures = 0;
      if (!call.is_alive) return call;
      if (!activeReported) {
        write("Call is active.");
        activeReported = true;
      }
    } catch (error) {
      if (!isTransientStatusError(error)) throw error;
      transientReadFailures += 1;
      if (transientReadFailures > timing.maxTransientReadFailures) {
        throw new PollingError("Call status is unavailable. Check Telnyx Call Logs.");
      }
      write("Call status is not available yet. Retrying.");
    }

    if (now() >= deadline) break;
    await sleep(timing.pollIntervalMs);
  }
  throw new PollingError("Timed out while waiting for the call to end. Check Telnyx Call Logs.");
}

async function defaultReadDiagnosticLog(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function defaultWriteDiagnosticReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function diagnosticEntriesFromLog(text, commandId) {
  const byEventId = new Map();
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const data = entry?.data;
    if (entry?.event !== DIAGNOSTIC_EVENT
      || data?.commandId !== commandId
      || typeof entry.timestamp !== "string"
      || typeof data.eventId !== "string"
      || typeof data.eventType !== "string"
      || typeof data.occurredAt !== "string") {
      continue;
    }
    const messageHistory = Array.isArray(data.messageHistory)
      && data.messageHistory.every((message) => (
        typeof message?.content === "string" && typeof message?.role === "string"
      ))
      ? data.messageHistory.map(({ content, role }) => ({ content, role }))
      : undefined;
    byEventId.set(data.eventId, {
      ...(Number.isFinite(data.delayMs) ? { delayMs: data.delayMs } : {}),
      eventId: data.eventId,
      eventType: data.eventType,
      ...(Number.isFinite(data.generationSpanMs)
        ? { generationSpanMs: data.generationSpanMs }
        : {}),
      ...(typeof data.hangupCause === "string"
        ? { hangupCause: data.hangupCause }
        : {}),
      ...(typeof data.hangupSource === "string"
        ? { hangupSource: data.hangupSource }
        : {}),
      ...(messageHistory ? { messageHistory } : {}),
      occurredAt: data.occurredAt,
      ...(Number.isFinite(data.playbackEstimateMs)
        ? { playbackEstimateMs: data.playbackEstimateMs }
        : {}),
      receivedAt: entry.timestamp,
    });
  }
  return [...byEventId.values()].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );
}

function hasCompleteDiagnosticEvidence(entries) {
  return entries.some(({ eventType }) => eventType === "call.hangup")
    && entries.some(({ eventType, messageHistory }) => (
      eventType === "call.ai_gather.message_history_updated"
      && Array.isArray(messageHistory)
      && messageHistory.length > 0
    ));
}

async function collectDiagnosticEntries({
  commandId,
  config,
  now,
  readDiagnosticLog,
  sleep,
  timing,
}) {
  const deadline = now() + timing.diagnosticDeadlineMs;
  let entries = [];
  do {
    entries = diagnosticEntriesFromLog(
      await readDiagnosticLog(config.debugLogPath),
      commandId,
    );
    if (hasCompleteDiagnosticEvidence(entries)) return entries;
    if (now() >= deadline) return entries;
    await sleep(timing.diagnosticPollIntervalMs);
  } while (now() <= deadline);
  return entries;
}

function elapsedMilliseconds(start, end) {
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed) : null;
}

function buildTranscript(entries) {
  const transcript = [];
  for (const entry of entries) {
    if (!Array.isArray(entry.messageHistory)) continue;
    for (const [index, message] of entry.messageHistory.entries()) {
      if (!transcript[index]) {
        transcript[index] = {
          content: message.content,
          first_observed_at: entry.occurredAt,
          first_sentence_observed_at: /[.!?](?:["')\]]*)?(?:\s|$)/.test(message.content)
            ? entry.occurredAt
            : null,
          last_content_update_at: entry.occurredAt,
          role: message.role,
        };
      } else if (transcript[index].content !== message.content) {
        transcript[index].content = message.content;
        transcript[index].last_content_update_at = entry.occurredAt;
        if (transcript[index].first_sentence_observed_at === null
          && /[.!?](?:["')\]]*)?(?:\s|$)/.test(message.content)) {
          transcript[index].first_sentence_observed_at = entry.occurredAt;
        }
        transcript[index].role = message.role;
      }
    }
  }
  return transcript.filter(Boolean);
}

function buildTurnLatencyProxies(transcript) {
  const turns = [];
  let pendingUser;
  for (const [index, message] of transcript.entries()) {
    if (message.role === "user") {
      pendingUser = { index, observedAt: message.last_content_update_at };
    } else if (message.role === "assistant" && pendingUser) {
      turns.push({
        assistant_final_text_after_user_update_ms: elapsedMilliseconds(
          pendingUser.observedAt,
          message.last_content_update_at,
        ),
        assistant_first_sentence_after_user_update_ms:
          message.first_sentence_observed_at
            ? elapsedMilliseconds(
              pendingUser.observedAt,
              message.first_sentence_observed_at,
            )
            : null,
        assistant_first_token_after_user_update_ms: elapsedMilliseconds(
          pendingUser.observedAt,
          message.first_observed_at,
        ),
        assistant_generation_span_ms: elapsedMilliseconds(
          message.first_observed_at,
          message.last_content_update_at,
        ),
        assistant_message_index: index,
        user_message_index: pendingUser.index,
      });
      pendingUser = undefined;
    }
  }
  return turns;
}

function buildDiagnosticReport({
  assistant,
  commandId,
  completed,
  entries,
  timings,
}) {
  const transcript = buildTranscript(entries);
  const answered = entries.find(({ eventType }) => eventType === "call.answered");
  const conversationCreated = entries.find(
    ({ eventType }) => eventType === "call.conversation.created",
  );
  const firstAssistant = transcript.find(({ role }) => role === "assistant");
  const lastAssistant = transcript.findLast(({ role }) => role === "assistant");
  const longSilence = transcript.findLast(
    ({ content, role }) => role === "system" && content === "[long silence]",
  );
  const hangup = entries.findLast(({ eventType }) => eventType === "call.hangup");
  const terminalHangupEvents = entries.filter(
    ({ eventType }) => eventType.startsWith("gateway.terminal_hangup."),
  );
  const terminalHangupScheduled = terminalHangupEvents.find(
    ({ eventType }) => eventType === "gateway.terminal_hangup.scheduled",
  );
  const terminalHangupPhase = terminalHangupEvents.at(-1)?.eventType
    .replace("gateway.terminal_hangup.", "") ?? null;
  const hangupMethod = terminalHangupPhase === "succeeded"
    ? "gateway_fallback"
    : hangup?.hangupSource === "callee"
      ? "callee"
      : hangup
        ? "assistant_or_telnyx"
        : null;
  return {
    schema_version: 3,
    run: {
      assistant_version: assistant.version_id,
      call_duration_seconds: Math.round(Number(completed.call_duration)),
      command_id: commandId,
      completed_at: timings.completedAt,
      started_at: timings.startedAt,
    },
    latency_configuration: LOW_LATENCY_PROFILE,
    process_timings_ms: {
      call_until_complete: timings.callUntilCompleteMs,
      diagnostic_wait: timings.diagnosticWaitMs,
      dial_api: timings.dialApiMs,
      remote_verification: timings.remoteVerificationMs,
    },
    call_events: entries.map((entry) => ({
      delivery_lag_ms: elapsedMilliseconds(entry.occurredAt, entry.receivedAt),
      event_type: entry.eventType,
      ...(Number.isFinite(entry.delayMs) ? { delay_ms: entry.delayMs } : {}),
      ...(entry.hangupCause ? { hangup_cause: entry.hangupCause } : {}),
      ...(entry.hangupSource ? { hangup_source: entry.hangupSource } : {}),
      occurred_at: entry.occurredAt,
      received_at: entry.receivedAt,
    })),
    latency_proxies: {
      greeting: {
        answer_to_conversation_created_ms: answered && conversationCreated
          ? elapsedMilliseconds(answered.occurredAt, conversationCreated.occurredAt)
          : null,
        answer_to_first_assistant_update_ms: answered && firstAssistant
          ? elapsedMilliseconds(answered.occurredAt, firstAssistant.first_observed_at)
          : null,
        conversation_created_to_first_assistant_update_ms:
          conversationCreated && firstAssistant
            ? elapsedMilliseconds(
              conversationCreated.occurredAt,
              firstAssistant.first_observed_at,
            )
            : null,
      },
      terminal: {
        automatic_hangup_method: hangupMethod,
        fallback_delay_ms: terminalHangupScheduled?.delayMs ?? null,
        fallback_generation_span_ms:
          terminalHangupScheduled?.generationSpanMs ?? null,
        fallback_phase: terminalHangupPhase,
        fallback_playback_estimate_ms:
          terminalHangupScheduled?.playbackEstimateMs ?? null,
        hangup_cause: hangup?.hangupCause ?? null,
        hangup_source: hangup?.hangupSource ?? null,
        last_assistant_update_to_hangup_ms: lastAssistant && hangup
          ? elapsedMilliseconds(lastAssistant.last_content_update_at, hangup.occurredAt)
          : null,
        last_assistant_update_to_long_silence_ms: lastAssistant && longSilence
          ? elapsedMilliseconds(
            lastAssistant.last_content_update_at,
            longSilence.first_observed_at,
          )
          : null,
        long_silence_observed: Boolean(longSilence),
        long_silence_to_hangup_ms: longSilence && hangup
          ? elapsedMilliseconds(longSilence.last_content_update_at, hangup.occurredAt)
          : null,
      },
      turns: buildTurnLatencyProxies(transcript),
    },
    transcript,
    telemetry_status: hasCompleteDiagnosticEvidence(entries)
      ? "captured"
      : "incomplete",
    measurement_limits: [
      "History update times are Telnyx event times, not handset audio times.",
      "First sentence time is the first update with sentence-ending punctuation.",
      "Final text time is the last observed content change for that message.",
      "The fallback hangup delay estimates remaining speech playback.",
      "This report cannot split STT, model, TTS, carrier, or handset latency.",
      "The fixed greeting does not call the language model.",
    ],
  };
}

function writeConfigurationSummary(config, write) {
  write(`From: ${maskPhoneNumber(config.from)}.`);
  write(`To: ${maskPhoneNumber(config.to)}.`);
  write(`Connection: ${maskIdentifier(config.connectionId)}.`);
  write(`Assistant: ${maskIdentifier(config.mainAssistantId)}.`);
}

function exitForError(error, write) {
  if (error instanceof UnknownCallOutcomeError) {
    write(error.message);
    return 2;
  }
  if (error instanceof TelnyxHttpError) {
    write(`Telnyx request failed. Status: ${error.status}. Code: ${error.code}.`);
    if (error.title) write(`Title: ${error.title}.`);
    if (error.detail) write(`Detail: ${error.detail}.`);
    return 1;
  }
  if (error instanceof ValidationError
    || error instanceof VerificationError
    || error instanceof RequestError
    || error instanceof PollingError) {
    write(error.message);
    return 1;
  }
  if (error?.name === "TimeoutError") {
    write("Telnyx request timed out.");
    return 1;
  }
  write("The standalone Telnyx Assistant call test failed without a safe diagnostic.");
  return 1;
}

export async function runCommand({
  args,
  createId = randomUUID,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  readDiagnosticLog = defaultReadDiagnosticLog,
  sleep = defaultSleep,
  timing = DEFAULT_TIMING,
  write = defaultWrite,
  writeDiagnosticReport = defaultWriteDiagnosticReport,
}) {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
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

  let assistant;
  const verificationStartedMs = now();
  try {
    assistant = await verifyRemoteConfiguration({ config, fetchImpl, timing });
    await verifyDiagnosticGateway({ config, fetchImpl, timing });
    write(`Verified assistant version: ${assistant.version_id}.`);
    write("Verified assistant model: GPT-5.6 Luna.");
    write("Verified the Flux latency profile and transcript updates.");
    write("Verified active connection, sender, and public diagnostic receiver.");
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--verify") {
    write("Verification passed. No call was made and no resource changed.");
    return 0;
  }

  const commandId = createId();
  const startedAtMs = now();
  writeConfigurationSummary(config, write);
  write(`Placing one billable call with a ${CALL_TIME_LIMIT_SECS}-second limit.`);
  try {
    const dialStartedMs = now();
    const created = await createCall({ commandId, config, fetchImpl, timing });
    const dialCompletedMs = now();
    write(`Call created. Call leg: ${maskIdentifier(created.call_leg_id)}.`);
    const completed = await pollCall({
      callControlId: created.call_control_id,
      config,
      fetchImpl,
      now,
      sleep,
      timing,
      write,
    });
    const callCompletedMs = now();
    const duration = Number(completed.call_duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      write("The call ended before a conversation started.");
      return 1;
    }
    write(`Call ended after ${Math.round(duration)} seconds.`);
    write("Waiting for signed transcript and timing events.");
    const diagnosticStartedMs = now();
    const entries = await collectDiagnosticEntries({
      commandId,
      config,
      now,
      readDiagnosticLog,
      sleep,
      timing,
    });
    const diagnosticCompletedMs = now();
    const report = buildDiagnosticReport({
      assistant,
      commandId,
      completed,
      entries,
      timings: {
        callUntilCompleteMs: Math.max(0, callCompletedMs - dialCompletedMs),
        completedAt: new Date(diagnosticCompletedMs).toISOString(),
        diagnosticWaitMs: Math.max(0, diagnosticCompletedMs - diagnosticStartedMs),
        dialApiMs: Math.max(0, dialCompletedMs - dialStartedMs),
        remoteVerificationMs: Math.max(0, startedAtMs - verificationStartedMs),
        startedAt: new Date(startedAtMs).toISOString(),
      },
    });
    const reportPath = resolve(
      process.cwd(),
      ".voice-logs",
      `telnyx-assistant-call-${commandId}.json`,
    );
    await writeDiagnosticReport(reportPath, report);
    write(`Diagnostic report: ${reportPath}.`);
    if (report.latency_proxies.greeting.answer_to_first_assistant_update_ms !== null) {
      write(
        "Answer-to-first-assistant history update: "
        + `${report.latency_proxies.greeting.answer_to_first_assistant_update_ms} ms.`,
      );
    }
    for (const [index, turn] of report.latency_proxies.turns.entries()) {
      write(
        `Turn ${index + 1}: first token `
        + `${turn.assistant_first_token_after_user_update_ms} ms; first sentence `
        + `${turn.assistant_first_sentence_after_user_update_ms} ms; final text `
        + `${turn.assistant_final_text_after_user_update_ms} ms.`,
      );
    }
    if (report.latency_proxies.terminal.last_assistant_update_to_hangup_ms !== null) {
      write(
        "Final assistant update-to-hangup: "
        + `${report.latency_proxies.terminal.last_assistant_update_to_hangup_ms} ms.`,
      );
    }
    write(
      "Automatic hangup method: "
      + `${report.latency_proxies.terminal.automatic_hangup_method ?? "unknown"}.`,
    );
    if (report.latency_proxies.terminal.fallback_phase) {
      write(
        "Automatic hangup fallback: "
        + `${report.latency_proxies.terminal.fallback_phase}.`,
      );
    }
    write("Confirm that you heard the greeting and spoke with the assistant.");
    write("History timings are proxies. They do not measure first handset audio.");
    write("This result does not validate scheduling tools or appointment writes.");
    if (report.telemetry_status !== "captured") {
      write("The call ended, but transcript telemetry was incomplete.");
      return 1;
    }
    return 0;
  } catch (error) {
    return exitForError(error, write);
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const exitCode = await runCommand({ args: process.argv.slice(2) });
  process.exitCode = exitCode;
}
