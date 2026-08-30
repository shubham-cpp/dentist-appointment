import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set(["--help", "--dry-run", "--verify", "--confirm"]);
const DEFAULT_TIMING = Object.freeze({ httpTimeoutMs: 30_000 });
const CONVERSATION_NAME = "Dental assistant isolated chat check";
const EXPECTED_ASSISTANT_MODEL = "openai/gpt-5.6-luna";
const EXPECTED_LLM_SECRET_REF = "dentist_voice_assistant_trial_openai_api_key";

export const DEFAULT_CHAT_MESSAGE =
  "Hello. This is a fictional connectivity check. Please answer briefly.";

class ValidationError extends Error {}

class VerificationError extends Error {}

class TelnyxHttpError extends Error {
  constructor(status, diagnostic) {
    super("Telnyx returned an HTTP error.");
    this.status = status;
    this.code = diagnostic.code;
    this.detail = diagnostic.detail;
    this.source = diagnostic.source;
    this.title = diagnostic.title;
  }
}

function defaultWrite(message) {
  console.log(message);
}

function valueFromEnvironment(env, key) {
  return String(env[key] ?? "").trim();
}

function isAssistantId(value) {
  return /^assistant-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function isConversationId(value) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function getConfiguration(env) {
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const assistantId = valueFromEnvironment(env, "TELNYX_AI_ASSISTANT_ID");

  if (!apiKey || /replace|placeholder/i.test(apiKey)) {
    throw new ValidationError("TELNYX_API_KEY is missing.");
  }
  if (!isAssistantId(assistantId)) {
    throw new ValidationError("TELNYX_AI_ASSISTANT_ID is invalid.");
  }

  return { apiKey, assistantId };
}

function helpText() {
  return [
    "Test one Telnyx managed Assistant through the public chat API.",
    "",
    "Usage:",
    "  npm run test:telnyx:assistant-chat -- --help",
    "  npm run test:telnyx:assistant-chat -- --dry-run",
    "  npm run test:telnyx:assistant-chat -- --verify",
    "  npm run test:telnyx:assistant-chat -- --confirm",
    "",
    "Modes:",
    "  --dry-run  Validate local settings. Make no network request.",
    "  --verify   Read and verify the main assistant. Run no inference.",
    "  --confirm  Create one disposable conversation and send one fictional message.",
    "",
    "This command never starts a tunnel or places a phone call.",
  ].join("\n");
}

function safeDiagnosticText(value, config) {
  let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  for (const secret of [config.apiKey, DEFAULT_CHAT_MESSAGE]) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }
  text = text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\+[1-9]\d{7,14}/g, "[redacted-phone]");
  return text.slice(0, 300);
}

function safeErrorDiagnostic(body, config) {
  const errors = Array.isArray(body?.errors)
    ? body.errors
    : Array.isArray(body?.data?.errors)
      ? body.data.errors
      : [];
  const first = errors[0] ?? {};
  const candidate = first.code ?? body?.code;
  const code = String(candidate ?? "unknown");
  const pointer = String(first.source?.pointer ?? "");
  const parameter = String(first.source?.parameter ?? "");
  const source = [pointer, parameter]
    .filter((value) => /^[A-Za-z0-9_./:-]{1,160}$/.test(value))
    .join(" ");
  return {
    code: /^[A-Za-z0-9_.:-]{1,80}$/.test(code) ? code : "unknown",
    detail: safeDiagnosticText(first.detail, config),
    source,
    title: safeDiagnosticText(first.title, config),
  };
}

function responseData(body) {
  if (body?.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
}

async function telnyxRequest({
  body,
  config,
  fetchImpl,
  method = "GET",
  path,
  timing,
}) {
  const response = await fetchImpl(`${API_ORIGIN}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    method,
    signal: AbortSignal.timeout(timing.httpTimeoutMs),
  });
  const text = await response.text();
  let result = {};
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new VerificationError("Telnyx returned invalid JSON.");
      }
    }
  }
  if (!response.ok) {
    throw new TelnyxHttpError(response.status, safeErrorDiagnostic(result, config));
  }
  return result;
}

async function readAssistant(input) {
  const assistant = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}`,
  });
  if (assistant?.id !== input.config.assistantId) {
    throw new VerificationError("Telnyx returned a different assistant.");
  }
  if (typeof assistant.model !== "string" || typeof assistant.version_id !== "string") {
    throw new VerificationError("Telnyx returned an incomplete assistant.");
  }
  if (assistant.model !== EXPECTED_ASSISTANT_MODEL
    || assistant.llm_api_key_ref !== EXPECTED_LLM_SECRET_REF) {
    throw new VerificationError("The configured assistant does not use the approved GPT-5.6 Luna model.");
  }
  return assistant;
}

function assistantSummary(assistant) {
  return {
    dataRetention: assistant.privacy_settings?.data_retention === true,
    model: assistant.model,
    toolCount: Array.isArray(assistant.tools) ? assistant.tools.length : 0,
    versionId: assistant.version_id,
  };
}

function writeAssistantSummary(assistant, write) {
  const summary = assistantSummary(assistant);
  write(`Model: ${summary.model}.`);
  write(`Main version: ${summary.versionId}.`);
  write(`Attached tools: ${summary.toolCount}.`);
  write(`Data retention: ${summary.dataRetention ? "enabled" : "disabled"}.`);
}

function exitForError(error, write) {
  if (error instanceof TelnyxHttpError) {
    write(`Telnyx request failed. Status: ${error.status}. Code: ${error.code}.`);
    if (error.title) write(`Title: ${error.title}.`);
    if (error.detail) write(`Detail: ${error.detail}.`);
    if (error.source) write(`Source: ${error.source}.`);
    return 1;
  }
  if (error instanceof ValidationError || error instanceof VerificationError) {
    write(error.message);
    return 1;
  }
  if (error?.name === "TimeoutError") {
    write("Telnyx request timed out.");
    return 1;
  }
  write("Telnyx Assistant chat test failed without a safe diagnostic.");
  return 1;
}

async function createConversation(input) {
  const response = await telnyxRequest({
    ...input,
    body: {
      metadata: {
        diagnostic: "fictional",
        telnyx_conversation_channel: "web_chat",
      },
      name: CONVERSATION_NAME,
    },
    method: "POST",
    path: "/v2/ai/conversations",
  });
  const conversation = responseData(response);
  if (!isConversationId(conversation?.id)) {
    throw new VerificationError("Telnyx returned an invalid conversation ID.");
  }
  return conversation.id;
}

async function sendChat(input, conversationId) {
  const result = await telnyxRequest({
    ...input,
    body: {
      content: DEFAULT_CHAT_MESSAGE,
      conversation_id: conversationId,
      name: "Fictional test caller",
      stream: false,
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}/chat`,
  });
  const response = responseData(result);
  if (typeof response?.content !== "string") {
    throw new VerificationError("Telnyx returned an invalid chat response.");
  }
  return response.content;
}

async function deleteConversation(input, conversationId) {
  await telnyxRequest({
    ...input,
    method: "DELETE",
    path: `/v2/ai/conversations/${encodeURIComponent(conversationId)}`,
  });
}

export async function runCommand({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timing = DEFAULT_TIMING,
  write = defaultWrite,
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
    write("Assistant ID: configured.");
    write("Dry run passed. No network request was made.");
    return 0;
  }

  const requestInput = { config, fetchImpl, timing };
  let assistant;
  try {
    assistant = await readAssistant(requestInput);
    writeAssistantSummary(assistant, write);
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--verify") {
    write("Verification passed. No conversation or inference was created.");
    return 0;
  }

  let conversationId;
  try {
    conversationId = await createConversation(requestInput);
  } catch (error) {
    return exitForError(error, write);
  }

  const startedAt = now();
  let exitCode = 0;
  try {
    const content = await sendChat(requestInput, conversationId);
    write(`Chat succeeded in ${Math.max(0, now() - startedAt)} ms.`);
    write(`Response received: ${content.length} characters.`);
  } catch (error) {
    exitCode = exitForError(error, write);
  } finally {
    try {
      await deleteConversation(requestInput, conversationId);
      write("Disposable conversation deleted.");
    } catch (error) {
      write("Disposable conversation cleanup failed.");
      exitCode = exitCode || exitForError(error, write);
    }
  }
  return exitCode;
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const exitCode = await runCommand({ args: process.argv.slice(2) });
  process.exitCode = exitCode;
}
