import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set([
  "--help",
  "--dry-run",
  "--verify",
  "--confirm",
  "--confirm-production-shape",
  "--confirm-production-tool",
  "--confirm-production-set",
  "--confirm-production-set-with-hangup",
  "--confirm-main-dialogue",
]);
const DEFAULT_TIMING = Object.freeze({
  httpTimeoutMs: 30_000,
  messageReadAttempts: 5,
  messageReadDelayMs: 250,
});
const EXPECTED_ASSISTANT_NAME = "Dental chat isolation baseline";
const TOOL_DISPLAY_NAME = "Dental chat isolation | Schema-only webhook";
const TOOL_NAME = "schema_only_webhook";
const VERSION_NAME = "Retained one-tool schema baseline";
const CONVERSATION_NAME = "Dental assistant shared-tool schema check";
const PRODUCTION_TOOL_DISPLAY_NAME =
  "Dental chat isolation | Production-shaped record identity";
const PRODUCTION_VERSION_NAME = "Retained record-identity schema check";
const PRODUCTION_CONVERSATION_NAME =
  "Dental assistant record-identity schema check";
const LIVE_TOOL_DISPLAY_NAME = "Dental scheduling trial | Record identity result";
const LIVE_VERSION_NAME = "Retained exact record-identity tool check";
const INTEGRATION_SECRET_IDENTIFIER =
  "dentist_voice_assistant_trial_tool_secret";
const METADATA_PATH = "docs/telnyx-ai-assistant-trial-metadata.json";
const SCHEDULING_TOOL_NAMES = Object.freeze([
  "record_identity",
  "load_safe_case",
  "search_slots",
  "prepare_reschedule",
  "commit_reschedule",
  "prepare_cancellation",
  "commit_cancellation",
  "staff_follow_up",
]);

export const SCHEMA_CHAT_MESSAGE =
  "This is a fictional schema check. Do not use any tool. Reply with READY only.";

export const PRODUCTION_CHAT_MESSAGE =
  "This is a fictional scheduling-schema check. Do not use any tool. Reply with READY only.";

export const SCHEMA_TOOL_DRAFT = Object.freeze({
  display_name: TOOL_DISPLAY_NAME,
  type: "webhook",
  webhook: {
    async: false,
    body_parameters: {
      properties: {
        request_id: {
          description: "A fictional schema-check identifier.",
          maxLength: 64,
          type: "string",
        },
      },
      required: ["request_id"],
      type: "object",
    },
    description: "Schema-only diagnostic tool. Do not call it during chat connectivity checks.",
    headers: [],
    method: "POST",
    name: TOOL_NAME,
    timeout_ms: 1_000,
    url: "https://example.com/telnyx-assistant-schema-only",
  },
});

export const PRODUCTION_TOOL_DRAFT = Object.freeze({
  display_name: PRODUCTION_TOOL_DISPLAY_NAME,
  timeout_ms: 5_000,
  type: "webhook",
  webhook: {
    async: false,
    body_parameters: {
      additionalProperties: false,
      properties: {
        operationId: {
          description: "A unique retry key. Reuse it only when retrying the same action.",
          maxLength: 64,
          pattern: "^[A-Za-z0-9._:-]+$",
          type: "string",
        },
        result: {
          description: "The meaning of the caller's identity reply.",
          enum: ["confirmed", "denied", "wrong_person", "ambiguous"],
          type: "string",
        },
      },
      required: ["operationId", "result"],
      type: "object",
    },
    description:
      "Record the identity answer before loading appointment facts. Use ambiguous when the answer is unclear.",
    headers: [],
    method: "POST",
    name: "record_identity",
    timeout_ms: 5_000,
    url: "https://example.com/telnyx-assistant-record-identity",
  },
});

const SCHEMA_PROFILE = Object.freeze({
  chatMessage: SCHEMA_CHAT_MESSAGE,
  conversationName: CONVERSATION_NAME,
  metadataToolTest: "schema_only",
  toolDraft: SCHEMA_TOOL_DRAFT,
  versionName: VERSION_NAME,
});

const PRODUCTION_PROFILE = Object.freeze({
  chatMessage: PRODUCTION_CHAT_MESSAGE,
  conversationName: PRODUCTION_CONVERSATION_NAME,
  metadataToolTest: "record_identity_schema",
  toolDraft: PRODUCTION_TOOL_DRAFT,
  versionName: PRODUCTION_VERSION_NAME,
});

const ALLOWED_TOOL_NAMES = new Set([
  SCHEMA_TOOL_DRAFT.webhook.name,
  PRODUCTION_TOOL_DRAFT.webhook.name,
]);

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

function defaultSleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
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

function isToolId(value) {
  return /^tool-[A-Za-z0-9_-]{8,160}$/.test(value);
}

function getConfiguration(env) {
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const mainAssistantId = valueFromEnvironment(env, "TELNYX_AI_ASSISTANT_ID");
  const isolatedAssistantId = valueFromEnvironment(
    env,
    "TELNYX_SCHEMA_TEST_ASSISTANT_ID",
  );
  const publicBaseUrl = valueFromEnvironment(env, "VOICE_GATEWAY_PUBLIC_BASE_URL")
    .replace(/\/$/, "");
  const testToolToken = valueFromEnvironment(env, "VOICE_ASSISTANT_TEST_TOOL_TOKEN");

  if (!apiKey || /replace|placeholder/i.test(apiKey)) {
    throw new ValidationError("TELNYX_API_KEY is missing.");
  }
  if (!isAssistantId(mainAssistantId)) {
    throw new ValidationError("TELNYX_AI_ASSISTANT_ID is invalid.");
  }
  if (!isAssistantId(isolatedAssistantId)) {
    throw new ValidationError("TELNYX_SCHEMA_TEST_ASSISTANT_ID is invalid.");
  }
  if (mainAssistantId === isolatedAssistantId) {
    throw new ValidationError("The schema test assistant must differ from the main assistant.");
  }

  return {
    apiKey,
    isolatedAssistantId,
    mainAssistantId,
    publicBaseUrl,
    testToolToken,
  };
}

function liveProductionProfile(config) {
  if (!config.publicBaseUrl) {
    throw new ValidationError("VOICE_GATEWAY_PUBLIC_BASE_URL is missing.");
  }
  let publicUrl;
  try {
    publicUrl = new URL(config.publicBaseUrl);
  } catch {
    throw new ValidationError("VOICE_GATEWAY_PUBLIC_BASE_URL is invalid.");
  }
  if (publicUrl.protocol !== "https:") {
    throw new ValidationError("VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS.");
  }
  if (config.testToolToken.length < 32
    || /replace|placeholder/i.test(config.testToolToken)) {
    throw new ValidationError("VOICE_ASSISTANT_TEST_TOOL_TOKEN is missing.");
  }
  return Object.freeze({
    allowCreate: false,
    chatMessage: PRODUCTION_CHAT_MESSAGE,
    conversationName: "Dental assistant exact record-identity tool check",
    dynamicVariables: { tool_token: config.testToolToken },
    metadataToolTest: "record_identity_exact_tool",
    toolDraft: {
      ...PRODUCTION_TOOL_DRAFT,
      display_name: LIVE_TOOL_DISPLAY_NAME,
      webhook: {
        ...PRODUCTION_TOOL_DRAFT.webhook,
        headers: [
          {
            name: "Authorization",
            value: `Bearer {{#integration_secret}}${INTEGRATION_SECRET_IDENTIFIER}{{/integration_secret}}`,
          },
          { name: "X-Voice-Call-Control-ID", value: "{{call_control_id}}" },
        ],
        url: `${config.publicBaseUrl}/voice/assistant/tools/{{tool_token}}/identity`,
      },
    },
    versionName: LIVE_VERSION_NAME,
  });
}

function helpText() {
  return [
    "Test one shared webhook schema on the retained isolated Telnyx Assistant.",
    "",
    "Required environment:",
    "  TELNYX_AI_ASSISTANT_ID              Main assistant safety guard.",
    "  TELNYX_SCHEMA_TEST_ASSISTANT_ID      Retained isolated assistant.",
    "",
    "Usage:",
    "  pnpm test:telnyx:assistant-tool-schema -- --help",
    "  pnpm test:telnyx:assistant-tool-schema -- --dry-run",
    "  pnpm test:telnyx:assistant-tool-schema -- --verify",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm-production-shape",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm-production-tool",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm-production-set",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm-production-set-with-hangup",
    "  pnpm test:telnyx:assistant-tool-schema -- --confirm-main-dialogue",
    "",
    "Modes:",
    "  --dry-run  Validate local guards. Make no network request.",
    "  --verify   Read the isolated assistant and shared tool. Make no changes.",
    "  --confirm  Create or reuse one tool, attach it, and run one chat.",
    "  --confirm-production-shape",
    "             Test the production record-identity schema without phone variables.",
    "  --confirm-production-tool",
    "             Attach the existing exact production tool and run one chat.",
    "  --confirm-production-set",
    "             Attach all eight production webhooks without Hangup.",
    "  --confirm-production-set-with-hangup",
    "             Attach the eight webhooks and the existing Hangup tool.",
    "  --confirm-main-dialogue",
    "             Copy the corrected main dialogue into the retained assistant.",
    "",
    "The confirmed test makes no phone call, tunnel, or traffic change.",
  ].join("\n");
}

function safeDiagnosticText(value, config) {
  let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  for (const secret of [
    config.apiKey,
    config.testToolToken,
    SCHEMA_CHAT_MESSAGE,
    PRODUCTION_CHAT_MESSAGE,
  ]) {
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

function assertApprovedRequest(config, method, path) {
  const requestMethod = method.toUpperCase();
  const pathname = new URL(path, API_ORIGIN).pathname;
  const assistantPath = `/v2/ai/assistants/${config.isolatedAssistantId}`;
  const mainAssistantPath = `/v2/ai/assistants/${config.mainAssistantId}`;
  const approved = (
    (pathname === assistantPath && ["GET", "POST"].includes(requestMethod))
    || (pathname === mainAssistantPath && requestMethod === "GET")
    || (pathname === `${assistantPath}/chat` && requestMethod === "POST")
    || (pathname === "/v2/ai/tools" && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/tools\/tool-[A-Za-z0-9_-]{8,160}$/.test(pathname)
      && requestMethod === "GET")
    || (pathname === "/v2/ai/conversations" && requestMethod === "POST")
    || (/^\/v2\/ai\/conversations\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(pathname)
      && requestMethod === "DELETE")
    || (/^\/v2\/ai\/conversations\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/messages$/.test(pathname)
      && requestMethod === "GET")
  );
  if (!approved) {
    throw new ValidationError("The request is outside the approved schema experiment.");
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
  assertApprovedRequest(config, method, path);
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

function assistantToolNames(assistant) {
  if (!Array.isArray(assistant.tools)) return [];
  return assistant.tools
    .map((tool) => tool?.webhook?.name)
    .filter((name) => typeof name === "string");
}

function verifyRetainedAssistantBase(assistant, expectedId) {
  if (assistant?.id !== expectedId) {
    throw new VerificationError("Telnyx returned a different isolated assistant.");
  }
  if (assistant.name !== EXPECTED_ASSISTANT_NAME) {
    throw new VerificationError("The isolated assistant name differs from the approved baseline.");
  }
  if (assistant.privacy_settings?.data_retention !== true) {
    throw new VerificationError("The isolated assistant must keep data retention enabled.");
  }
  if (typeof assistant.version_id !== "string" || !assistant.version_id) {
    throw new VerificationError("The isolated assistant version is missing.");
  }
  return assistant;
}

function verifyAssistant(assistant, expectedId) {
  verifyRetainedAssistantBase(assistant, expectedId);
  const tools = Array.isArray(assistant.tools) ? assistant.tools : [];
  const toolIds = Array.isArray(assistant.tool_ids) ? assistant.tool_ids : [];
  const hasUnexpectedResolvedTool = tools.some(
    (tool) => tool?.type !== "webhook"
      || !ALLOWED_TOOL_NAMES.has(tool?.webhook?.name),
  );
  const hasUnresolvedAttachedTool = tools.length === 0 && toolIds.length > 0;
  if (tools.length > 1
    || toolIds.length > 1
    || hasUnexpectedResolvedTool
    || hasUnresolvedAttachedTool) {
    throw new VerificationError("The isolated assistant has an unexpected tool.");
  }
  return assistant;
}

async function readAssistant(input) {
  const result = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
  });
  return verifyAssistant(responseData(result), input.config.isolatedAssistantId);
}

function webhookDefinition(tool) {
  return tool?.tool_definition?.webhook
    ?? tool?.tool_definition
    ?? tool?.webhook;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifySharedTool(tool, profile) {
  const definition = webhookDefinition(tool);
  const expected = profile.toolDraft.webhook;
  if (!isToolId(tool?.id)
    || tool.display_name !== profile.toolDraft.display_name
    || tool.type !== "webhook"
    || definition?.name !== expected.name
    || definition?.description !== expected.description
    || definition?.url !== expected.url
    || definition?.method !== expected.method
    || definition?.async !== expected.async
    || definition?.timeout_ms !== expected.timeout_ms
    || !sameJson(definition?.headers ?? [], expected.headers)
    || !sameJson(definition?.body_parameters, expected.body_parameters)) {
    throw new VerificationError("The shared schema tool differs from the approved draft.");
  }
  return tool;
}

async function findSharedTool(input, profile) {
  const response = await telnyxRequest({
    ...input,
    path: "/v2/ai/tools?page[size]=100",
  });
  if (!Array.isArray(response?.data)) {
    throw new VerificationError("Telnyx returned an invalid shared tool list.");
  }
  const matches = response.data.filter(
    (tool) => tool?.display_name === profile.toolDraft.display_name,
  );
  if (matches.length > 1) {
    throw new VerificationError("The shared schema tool name is not unique.");
  }
  if (matches.length === 0) return null;
  const detail = await telnyxRequest({
    ...input,
    path: `/v2/ai/tools/${encodeURIComponent(matches[0].id)}`,
  });
  return verifySharedTool(responseData(detail), profile);
}

async function createSharedTool(input, profile) {
  const response = await telnyxRequest({
    ...input,
    body: profile.toolDraft,
    method: "POST",
    path: "/v2/ai/tools",
  });
  const created = responseData(response);
  if (!isToolId(created?.id)) {
    throw new VerificationError("Telnyx returned an invalid shared tool ID.");
  }
  const detail = await telnyxRequest({
    ...input,
    path: `/v2/ai/tools/${encodeURIComponent(created.id)}`,
  });
  return verifySharedTool(responseData(detail), profile);
}

function assistantHasOnlyTool(assistant, toolId, profile) {
  if (Array.isArray(assistant.tool_ids)) {
    return assistant.tool_ids.length === 1 && assistant.tool_ids[0] === toolId;
  }
  const tools = Array.isArray(assistant.tools) ? assistant.tools : [];
  return tools.length === 1
    && ((tools[0]?.id === toolId)
      || sameJson(tools[0]?.webhook, profile.toolDraft.webhook));
}

async function attachSharedTool(input, assistant, tool, profile) {
  if (assistantHasOnlyTool(assistant, tool.id, profile)) return assistant;
  const response = await telnyxRequest({
    ...input,
    body: {
      ...(profile.dynamicVariables
        ? { dynamic_variables: profile.dynamicVariables }
        : {}),
      promote_to_main: true,
      tool_ids: [tool.id],
      version_name: profile.versionName,
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
  });
  const updated = verifyAssistant(
    responseData(response),
    input.config.isolatedAssistantId,
  );
  if (!assistantHasOnlyTool(updated, tool.id, profile)) {
    throw new VerificationError("Telnyx did not attach the approved shared tool.");
  }
  if (updated.version_id === assistant.version_id) {
    throw new VerificationError("The isolated assistant version did not change.");
  }
  return updated;
}

async function createConversation(input, profile) {
  const response = await telnyxRequest({
    ...input,
    body: {
      metadata: {
        diagnostic: "fictional",
        telnyx_conversation_channel: "web_chat",
        tool_test: profile.metadataToolTest,
      },
      name: profile.conversationName,
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

async function sendChat(input, conversationId, profile) {
  const result = await telnyxRequest({
    ...input,
    body: {
      content: profile.chatMessage,
      conversation_id: conversationId,
      name: "Fictional test caller",
      stream: false,
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}/chat`,
  });
  const response = responseData(result);
  if (typeof response?.content !== "string" || !response.content.trim()) {
    throw new VerificationError("Telnyx returned an invalid chat response.");
  }
  return response.content;
}

function toolCallCount(messages) {
  return messages.reduce(
    (count, message) => count + (Array.isArray(message?.tool_calls)
      ? message.tool_calls.length
      : 0),
    0,
  );
}

async function verifyNoToolCalls(input, conversationId) {
  for (let attempt = 1; attempt <= input.timing.messageReadAttempts; attempt += 1) {
    const response = await telnyxRequest({
      ...input,
      path: `/v2/ai/conversations/${encodeURIComponent(conversationId)}/messages?page[size]=100&page[number]=1`,
    });
    if (!Array.isArray(response?.data)) {
      throw new VerificationError("Telnyx returned an invalid conversation message list.");
    }
    if (toolCallCount(response.data) > 0) {
      throw new VerificationError("The schema-only chat unexpectedly invoked a tool.");
    }
    const totalResults = Number(response?.meta?.total_results ?? response.data.length);
    if (response.data.length >= 2 || totalResults >= 2) return response.data.length;
    if (attempt < input.timing.messageReadAttempts) {
      await input.sleep(input.timing.messageReadDelayMs);
    }
  }
  throw new VerificationError("Conversation messages were not ready for tool-call verification.");
}

async function deleteConversation(input, conversationId) {
  await telnyxRequest({
    ...input,
    method: "DELETE",
    path: `/v2/ai/conversations/${encodeURIComponent(conversationId)}`,
  });
}

async function defaultReadMetadata() {
  return JSON.parse(await readFile(METADATA_PATH, "utf8"));
}

function productionToolRecords(metadata, config) {
  if (metadata?.assistant?.id !== config.mainAssistantId) {
    throw new VerificationError("The trial metadata has a different main assistant.");
  }
  if (!Array.isArray(metadata.tools)) {
    throw new VerificationError("The trial tool metadata is invalid.");
  }
  const scheduling = metadata.tools.filter((tool) => tool?.name !== "hangup");
  const hangup = metadata.tools.filter((tool) => tool?.name === "hangup");
  if (scheduling.length !== SCHEDULING_TOOL_NAMES.length || hangup.length !== 1) {
    throw new VerificationError("Expected eight scheduling tools and one Hangup record.");
  }
  const names = scheduling.map((tool) => tool?.name).sort();
  if (!sameJson(names, [...SCHEDULING_TOOL_NAMES].sort())) {
    throw new VerificationError("The scheduling tool names differ from the approved set.");
  }
  const ids = scheduling.map((tool) => tool?.id);
  if (ids.some((id) => !isToolId(id)) || new Set(ids).size !== ids.length) {
    throw new VerificationError("The scheduling tool IDs are invalid.");
  }
  if (!isToolId(hangup[0]?.id)) {
    throw new VerificationError("The Hangup tool ID is invalid.");
  }
  return { hangup: hangup[0], scheduling };
}

function verifyProductionTool(tool, record, config) {
  const definition = webhookDefinition(tool);
  const headers = definition?.headers ?? [];
  if (tool?.id !== record.id
    || tool.display_name !== record.displayName
    || tool.type !== "webhook"
    || definition?.name !== record.name
    || definition?.method !== "POST"
    || definition?.async !== false
    || definition?.timeout_ms !== 5_000
    || definition?.body_parameters?.type !== "object"
    || definition?.body_parameters?.additionalProperties !== false
    || headers[0]?.name !== "Authorization"
    || headers[0]?.value !== `Bearer {{#integration_secret}}${INTEGRATION_SECRET_IDENTIFIER}{{/integration_secret}}`
    || headers[1]?.name !== "X-Voice-Call-Control-ID"
    || headers[1]?.value !== "{{call_control_id}}"
    || !definition?.url?.startsWith(
      `${config.publicBaseUrl}/voice/assistant/tools/{{tool_token}}/`,
    )) {
    throw new VerificationError(`Production tool verification failed: ${record.name}.`);
  }
  return tool;
}

async function readProductionTools(input, records) {
  return Promise.all(records.map(async (record) => {
    const response = await telnyxRequest({
      ...input,
      path: `/v2/ai/tools/${encodeURIComponent(record.id)}`,
    });
    return verifyProductionTool(responseData(response), record, input.config);
  }));
}

async function readHangupTool(input, record) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/tools/${encodeURIComponent(record.id)}`,
  });
  const tool = responseData(response);
  if (tool?.id !== record.id
    || tool.display_name !== record.displayName
    || tool.type !== "hangup") {
    throw new VerificationError("The Hangup tool differs from its recorded identity.");
  }
  return tool;
}

function verifyToolSetAssistant(assistant, expectedId, includeHangup) {
  verifyRetainedAssistantBase(assistant, expectedId);
  const tools = Array.isArray(assistant.tools) ? assistant.tools : [];
  const names = assistantToolNames(assistant).sort();
  const hangupCount = tools.filter((tool) => tool?.type === "hangup").length;
  const expectedToolCount = SCHEDULING_TOOL_NAMES.length + (includeHangup ? 1 : 0);
  if (tools.length !== expectedToolCount
    || tools.filter((tool) => tool?.type === "webhook").length
      !== SCHEDULING_TOOL_NAMES.length
    || hangupCount !== (includeHangup ? 1 : 0)
    || !sameJson(names, [...SCHEDULING_TOOL_NAMES].sort())) {
    throw new VerificationError("The retained assistant does not have the eight-tool set.");
  }
  return assistant;
}

async function readRetainedAssistant(input) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
  });
  return responseData(response);
}

async function attachProductionToolSet(input, assistant, records, includeHangup) {
  const names = assistantToolNames(assistant).sort();
  const tools = Array.isArray(assistant.tools) ? assistant.tools : [];
  const hangupCount = tools.filter((tool) => tool?.type === "hangup").length;
  if (sameJson(names, [...SCHEDULING_TOOL_NAMES].sort())
    && hangupCount === (includeHangup ? 1 : 0)) {
    return verifyToolSetAssistant(
      assistant,
      input.config.isolatedAssistantId,
      includeHangup,
    );
  }
  const toolIds = records.scheduling.map((record) => record.id);
  if (includeHangup) toolIds.push(records.hangup.id);
  const response = await telnyxRequest({
    ...input,
    body: {
      dynamic_variables: { tool_token: input.config.testToolToken },
      promote_to_main: true,
      tool_ids: toolIds,
      version_name: includeHangup
        ? "Retained eight scheduling tools with Hangup"
        : "Retained eight scheduling tools without Hangup",
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
  });
  const updated = verifyToolSetAssistant(
    responseData(response),
    input.config.isolatedAssistantId,
    includeHangup,
  );
  if (updated.version_id === assistant.version_id) {
    throw new VerificationError("The eight-tool assistant version did not change.");
  }
  return updated;
}

async function runProductionToolSet({
  includeHangup,
  input,
  now,
  readMetadata,
  write,
}) {
  let assistant;
  let records;
  try {
    assistant = await readRetainedAssistant(input);
    verifyRetainedAssistantBase(assistant, input.config.isolatedAssistantId);
    records = productionToolRecords(await readMetadata(), input.config);
    await readProductionTools(input, records.scheduling);
    if (includeHangup) await readHangupTool(input, records.hangup);
    write(`Retained assistant version: ${assistant.version_id}.`);
    write("Verified production scheduling tools: 8.");
    write(`Hangup tools selected: ${includeHangup ? 1 : 0}.`);
    assistant = await attachProductionToolSet(
      input,
      assistant,
      records,
      includeHangup,
    );
    write(`Verified eight-tool assistant version: ${assistant.version_id}.`);
  } catch (error) {
    return exitForError(error, write);
  }

  const profile = {
    chatMessage: PRODUCTION_CHAT_MESSAGE,
    conversationName: includeHangup
      ? "Dental assistant nine-tool startup check"
      : "Dental assistant eight-tool startup check",
    metadataToolTest: includeHangup
      ? "eight_scheduling_tools_with_hangup"
      : "eight_scheduling_tools_no_hangup",
  };
  let conversationId;
  try {
    conversationId = await createConversation(input, profile);
  } catch (error) {
    return exitForError(error, write);
  }

  const startedAt = now();
  let exitCode = 0;
  try {
    const content = await sendChat(input, conversationId, profile);
    const messageCount = await verifyNoToolCalls(input, conversationId);
    write(`Chat succeeded in ${Math.max(0, now() - startedAt)} ms.`);
    write(`Response received: ${content.length} characters.`);
    write(`Conversation messages inspected: ${messageCount}.`);
    write("Tool calls observed: 0.");
  } catch (error) {
    exitCode = exitForError(error, write);
  } finally {
    try {
      await deleteConversation(input, conversationId);
      write("Disposable conversation deleted.");
    } catch (error) {
      write("Disposable conversation cleanup failed.");
      exitCode = exitCode || exitForError(error, write);
    }
  }
  return exitCode;
}

function correctedMainDialogue(mainAssistant, config) {
  if (mainAssistant?.id !== config.mainAssistantId
    || mainAssistant.name !== "Controlled dental scheduling trial") {
    throw new VerificationError("Telnyx returned a different main assistant.");
  }
  const instructions = String(mainAssistant.instructions ?? "");
  const correctedInstructions = instructions.replaceAll(
    "record_identity_result",
    "record_identity",
  );
  if (!correctedInstructions.includes("call record_identity.")) {
    throw new VerificationError("The corrected main instructions lack record_identity.");
  }
  const greeting = String(mainAssistant.greeting ?? "");
  if (!greeting.includes("{{clinic_name}}")
    || !greeting.includes("{{patient_first_name}}")) {
    throw new VerificationError("The main greeting lacks its safe variables.");
  }
  const dynamicVariables = { ...(mainAssistant.dynamic_variables ?? {}) };
  for (const key of [
    "clinic_current_date",
    "clinic_name",
    "clinic_time_zone",
    "patient_first_name",
  ]) {
    if (typeof dynamicVariables[key] !== "string" || !dynamicVariables[key]) {
      throw new VerificationError(`The main assistant lacks ${key}.`);
    }
  }
  dynamicVariables.tool_token = config.testToolToken;
  return { dynamicVariables, greeting, instructions: correctedInstructions };
}

function normalizedRecord(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function verifyDialogueAssistant(assistant, expectedId, dialogue) {
  verifyToolSetAssistant(assistant, expectedId, true);
  if (assistant.instructions !== dialogue.instructions
    || assistant.greeting !== dialogue.greeting
    || !sameJson(
      normalizedRecord(assistant.dynamic_variables),
      normalizedRecord(dialogue.dynamicVariables),
    )) {
    throw new VerificationError("The retained assistant dialogue differs from the approved copy.");
  }
  return assistant;
}

async function runMainDialogueExperiment({ input, now, readMetadata, write }) {
  let assistant;
  let dialogue;
  try {
    const [mainResponse, retainedResponse] = await Promise.all([
      telnyxRequest({
        ...input,
        path: `/v2/ai/assistants/${encodeURIComponent(input.config.mainAssistantId)}`,
      }),
      telnyxRequest({
        ...input,
        path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
      }),
    ]);
    const mainAssistant = responseData(mainResponse);
    assistant = responseData(retainedResponse);
    verifyToolSetAssistant(assistant, input.config.isolatedAssistantId, true);
    dialogue = correctedMainDialogue(mainAssistant, input.config);

    const records = productionToolRecords(await readMetadata(), input.config);
    await Promise.all([
      readProductionTools(input, records.scheduling),
      readHangupTool(input, records.hangup),
    ]);
    const alreadyMatches = assistant.instructions === dialogue.instructions
      && assistant.greeting === dialogue.greeting
      && sameJson(
        normalizedRecord(assistant.dynamic_variables),
        normalizedRecord(dialogue.dynamicVariables),
      );
    if (!alreadyMatches) {
      const previousVersion = assistant.version_id;
      const response = await telnyxRequest({
        ...input,
        body: {
          dynamic_variables: dialogue.dynamicVariables,
          greeting: dialogue.greeting,
          instructions: dialogue.instructions,
          promote_to_main: true,
          tool_ids: records.scheduling
            .map((record) => record.id)
            .concat(records.hangup.id),
          version_name: "Retained corrected main dialogue check",
        },
        method: "POST",
        path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
      });
      assistant = verifyDialogueAssistant(
        responseData(response),
        input.config.isolatedAssistantId,
        dialogue,
      );
      if (assistant.version_id === previousVersion) {
        throw new VerificationError("The retained dialogue version did not change.");
      }
    } else {
      verifyDialogueAssistant(assistant, input.config.isolatedAssistantId, dialogue);
    }
    write(`Verified corrected-dialogue version: ${assistant.version_id}.`);
    write("Retained data setting: enabled.");
    write("Fictional dialogue defaults: 5.");
  } catch (error) {
    return exitForError(error, write);
  }

  const profile = {
    chatMessage: PRODUCTION_CHAT_MESSAGE,
    conversationName: "Dental assistant corrected-dialogue startup check",
    metadataToolTest: "corrected_main_dialogue",
  };
  let conversationId;
  try {
    conversationId = await createConversation(input, profile);
  } catch (error) {
    return exitForError(error, write);
  }
  const startedAt = now();
  let exitCode = 0;
  try {
    const content = await sendChat(input, conversationId, profile);
    const messageCount = await verifyNoToolCalls(input, conversationId);
    write(`Chat succeeded in ${Math.max(0, now() - startedAt)} ms.`);
    write(`Response received: ${content.length} characters.`);
    write(`Conversation messages inspected: ${messageCount}.`);
    write("Tool calls observed: 0.");
  } catch (error) {
    exitCode = exitForError(error, write);
  } finally {
    try {
      await deleteConversation(input, conversationId);
      write("Disposable conversation deleted.");
    } catch (error) {
      write("Disposable conversation cleanup failed.");
      exitCode = exitCode || exitForError(error, write);
    }
  }
  return exitCode;
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
  write("Telnyx shared-tool schema test failed without a safe diagnostic.");
  return 1;
}

export async function runCommand({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  readMetadata = defaultReadMetadata,
  sleep = defaultSleep,
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
  let profile;
  try {
    config = getConfiguration(env);
    profile = command === "--confirm-production-tool"
      || command === "--confirm-production-set"
      || command === "--confirm-production-set-with-hangup"
      || command === "--confirm-main-dialogue"
      ? liveProductionProfile(config)
      : command === "--confirm-production-shape"
        ? PRODUCTION_PROFILE
        : SCHEMA_PROFILE;
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--dry-run") {
    write("Main and isolated assistant guards passed.");
    write("Dry run passed. No network request was made.");
    return 0;
  }

  const requestInput = { config, fetchImpl, sleep, timing };
  if (command === "--confirm-main-dialogue") {
    return runMainDialogueExperiment({
      input: requestInput,
      now,
      readMetadata,
      write,
    });
  }
  if (command === "--confirm-production-set"
    || command === "--confirm-production-set-with-hangup") {
    return runProductionToolSet({
      includeHangup: command === "--confirm-production-set-with-hangup",
      input: requestInput,
      now,
      readMetadata,
      write,
    });
  }
  let assistant;
  let tool;
  try {
    assistant = await readAssistant(requestInput);
    tool = await findSharedTool(requestInput, profile);
    write(`Isolated assistant version: ${assistant.version_id}.`);
    write(`Telephony feature: ${assistant.enabled_features?.includes("telephony") ? "enabled" : "disabled"}.`);
    write(`Attached schema tools: ${assistantToolNames(assistant).length}.`);
    write(`Shared schema tool: ${tool ? "present" : "absent"}.`);
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--verify") {
    write("Verification passed. No resource changed and no inference ran.");
    return 0;
  }

  try {
    if (!tool) {
      if (profile.allowCreate === false) {
        throw new VerificationError("The existing exact production tool is missing.");
      }
      tool = await createSharedTool(requestInput, profile);
      write("Created the shared schema tool.");
    } else {
      write("Reused the exact shared schema tool.");
    }
    assistant = await attachSharedTool(requestInput, assistant, tool, profile);
    write(`Verified attached tool ID: ${tool.id}.`);
    write(`Verified isolated assistant version: ${assistant.version_id}.`);
  } catch (error) {
    return exitForError(error, write);
  }

  let conversationId;
  try {
    conversationId = await createConversation(requestInput, profile);
  } catch (error) {
    return exitForError(error, write);
  }

  const startedAt = now();
  let exitCode = 0;
  try {
    const content = await sendChat(requestInput, conversationId, profile);
    const messageCount = await verifyNoToolCalls(requestInput, conversationId);
    write(`Chat succeeded in ${Math.max(0, now() - startedAt)} ms.`);
    write(`Response received: ${content.length} characters.`);
    write(`Conversation messages inspected: ${messageCount}.`);
    write("Tool calls observed: 0.");
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
