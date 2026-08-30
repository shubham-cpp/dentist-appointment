import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTelnyxAssistantToolDrafts,
  createTelnyxAssistantTestToolDrafts,
  telnyxAssistantInstructions,
} from "../src/voice-gateway/telnyx-assistant-definition";
import {
  createTelnyxAssistantTestDrafts,
  telnyxAssistantTestExpectedToolSequences,
  telnyxAssistantTestScriptedCallerTurns,
  telnyxAssistantTestSuiteName,
} from "../src/voice-gateway/telnyx-assistant-test-definition";

const apiOrigin = "https://api.telnyx.com";
const metadataPath = "docs/telnyx-ai-assistant-trial-metadata.json";
const assistantName = "Controlled dental scheduling trial";
const oneCaseName = "Dental scheduling safety | identity-confirmed";
const terminalStatuses = new Set(["passed", "failed", "error"]);
const commands = new Set([
  "--help",
  "--dry-run",
  "--verify",
  "--restore-production",
  "--recover-error-runs",
  "--sync-public-url",
  "--confirm-prompt",
  "--confirm-tool-contracts",
  "--confirm-suite",
  "--resume-suite",
  "--confirm-one",
  "--confirm-cases",
  "--confirm",
]);
const schedulingToolNames = [
  "record_identity",
  "load_safe_case",
  "search_slots",
  "prepare_reschedule",
  "commit_reschedule",
  "prepare_cancellation",
  "commit_cancellation",
  "staff_follow_up",
] as const;

type JsonObject = Record<string, unknown>;
type Metadata = JsonObject & {
  assistant?: JsonObject;
  integrationSecret?: JsonObject;
  phase5BuiltInCorpus?: JsonObject;
  phase5EmergencyRestoration?: JsonObject;
  phase5PromptUpdate?: JsonObject;
  phase5PublicUrlSync?: JsonObject;
  phase5SelectedCases?: JsonObject;
  phase5SequentialCorpus?: JsonObject;
  phase5SequentialProgress?: JsonObject;
  phase5ToolContracts?: JsonObject;
  publicBaseUrl?: string;
  tools?: JsonObject[];
};
type Configuration = {
  apiKey: string;
  assistantId: string;
  integrationSecretIdentifier: string;
  internalSecret: string;
  internalUrl: string;
  publicBaseUrl: string;
  testToolToken: string;
};
type TestRun = JsonObject & {
  conversation_id?: string;
  detail_status?: Array<{ name?: string; status?: string }>;
  run_id: string;
  status: string;
  test_id: string;
};
type Timing = {
  httpTimeoutMs: number;
  pollDelayMs: number;
  pollTimeoutMs: number;
};

const defaultTiming: Timing = {
  httpTimeoutMs: 30_000,
  pollDelayMs: 2_000,
  pollTimeoutMs: 5 * 60_000,
};

class ValidationError extends Error {}
class VerificationError extends Error {}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly diagnostic: string,
  ) {
    super(`${method} ${path} failed with ${status}: ${diagnostic}`);
  }
}

function required(value: unknown, name: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^(?:replace|missing|placeholder|your[_-])/i.test(text)) {
    throw new ValidationError(`${name} is missing.`);
  }
  return text;
}

function isAssistantId(value: string) {
  return /^assistant-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function isOpaqueId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function isConversationId(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function dataObject(body: JsonObject) {
  return body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as JsonObject
    : body;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeDiagnostic(body: JsonObject) {
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const first = errors[0] && typeof errors[0] === "object"
    ? errors[0] as JsonObject
    : body;
  return JSON.stringify({
    code: String(first.code ?? "unknown").slice(0, 80),
    detail: String(first.detail ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 240),
    title: String(first.title ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 120),
  });
}

export function assertApprovedTelnyxRequest(method: string, path: string) {
  const pathname = new URL(path, apiOrigin).pathname;
  const requestMethod = method.toUpperCase();
  const approved = (
    (pathname === "/v2/ai/tools" && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/tools\/tool-[A-Za-z0-9_-]+$/.test(pathname)
      && ["GET", "PATCH"].includes(requestMethod))
    || (/^\/v2\/ai\/assistants\/assistant-[A-Za-z0-9_-]+$/.test(pathname)
      && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/assistants\/assistant-[A-Za-z0-9_-]+\/versions\/[A-Za-z0-9_-]+$/.test(pathname)
      && requestMethod === "GET")
    || (/^\/v2\/ai\/assistants\/assistant-[A-Za-z0-9_-]+\/tools\/tool-[A-Za-z0-9_-]+\/test$/.test(pathname)
      && requestMethod === "POST")
    || (pathname === "/v2/ai/assistants/tests" && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/assistants\/tests\/[A-Za-z0-9_-]+$/.test(pathname)
      && requestMethod === "PUT")
    || (/^\/v2\/ai\/assistants\/tests\/[A-Za-z0-9_-]+\/runs$/.test(pathname)
      && requestMethod === "POST")
    || (/^\/v2\/ai\/assistants\/tests\/[A-Za-z0-9_-]+\/runs\/[A-Za-z0-9_-]+$/.test(pathname)
      && requestMethod === "GET")
    || (/^\/v2\/ai\/assistants\/tests\/test-suites\/[A-Za-z0-9_-]+\/runs$/.test(pathname)
      && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/conversations\/[0-9a-f-]+$/i.test(pathname)
      && requestMethod === "DELETE")
    || (/^\/v2\/ai\/conversations\/[0-9a-f-]+\/messages$/i.test(pathname)
      && requestMethod === "GET")
  );
  if (!approved) {
    throw new ValidationError("The request is outside the Phase 5 Assistant Test allowlist.");
  }
}

function localResetUrl(input: string) {
  const url = new URL("/internal/assistant-test-session/reset", input);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new ValidationError("VOICE_GATEWAY_INTERNAL_URL must use a loopback host.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError("VOICE_GATEWAY_INTERNAL_URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

export function getConfiguration(
  env: Record<string, string | undefined>,
  metadata: Metadata,
): Configuration {
  if (env.VOICE_ASSISTANT_TEST_MODE !== "true") {
    throw new ValidationError("VOICE_ASSISTANT_TEST_MODE must be true for this fictional corpus.");
  }
  const assistantId = required(env.TELNYX_AI_ASSISTANT_ID, "TELNYX_AI_ASSISTANT_ID");
  if (!isAssistantId(assistantId)) {
    throw new ValidationError("TELNYX_AI_ASSISTANT_ID is invalid.");
  }
  if (metadata.assistant?.id !== assistantId) {
    throw new VerificationError("The trial metadata has a different assistant ID.");
  }
  const publicBaseUrl = required(env.VOICE_GATEWAY_PUBLIC_BASE_URL, "VOICE_GATEWAY_PUBLIC_BASE_URL")
    .replace(/\/$/, "");
  if (new URL(publicBaseUrl).protocol !== "https:" || metadata.publicBaseUrl !== publicBaseUrl) {
    throw new VerificationError("The public gateway URL differs from the trial metadata.");
  }
  const testToolToken = required(
    env.VOICE_ASSISTANT_TEST_TOOL_TOKEN,
    "VOICE_ASSISTANT_TEST_TOOL_TOKEN",
  );
  if (testToolToken.length < 43) {
    throw new ValidationError("VOICE_ASSISTANT_TEST_TOOL_TOKEN must have at least 43 characters.");
  }
  const internalUrl = required(
    env.VOICE_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:3001",
    "VOICE_GATEWAY_INTERNAL_URL",
  );
  localResetUrl(internalUrl);
  return {
    apiKey: required(env.TELNYX_API_KEY, "TELNYX_API_KEY"),
    assistantId,
    integrationSecretIdentifier: required(
      metadata.integrationSecret?.identifier,
      "integration secret identifier",
    ),
    internalSecret: required(env.VOICE_GATEWAY_INTERNAL_SECRET, "VOICE_GATEWAY_INTERNAL_SECRET"),
    internalUrl,
    publicBaseUrl,
    testToolToken,
  };
}

function helpText() {
  return [
    "Run the Telnyx Assistant Test safety corpus with fictional data.",
    "",
    "Usage:",
    "  pnpm voice:assistant:safety-corpus -- --dry-run",
    "  pnpm voice:assistant:safety-corpus -- --verify",
    "  pnpm voice:assistant:safety-corpus -- --restore-production",
    "  pnpm voice:assistant:safety-corpus -- --recover-error-runs",
    "  pnpm voice:assistant:safety-corpus -- --sync-public-url",
    "  pnpm voice:assistant:safety-corpus -- --confirm-prompt",
    "  pnpm voice:assistant:safety-corpus -- --confirm-tool-contracts",
    "  pnpm voice:assistant:safety-corpus -- --confirm-suite",
    "  pnpm voice:assistant:safety-corpus -- --resume-suite",
    "  pnpm voice:assistant:safety-corpus -- --confirm-one",
    "  pnpm voice:assistant:safety-corpus -- --confirm-cases <case-id,...>",
    "  pnpm voice:assistant:safety-corpus -- --confirm",
    "",
    "--dry-run      Validate local configuration. Make no network request.",
    "--verify       Verify the production baseline and existing remote resources.",
    "--restore-production",
    "               Restore the last known-safe version after an interrupted test.",
    "--recover-error-runs",
    "               Recover transient test polls and delete retained conversations.",
    "--sync-public-url",
    "               Update existing production and test webhooks to the reviewed public URL.",
    "--confirm-prompt",
    "               Apply the reviewed prompt and test definitions.",
    "--confirm-tool-contracts",
    "               Exercise every real webhook tool with fictional state.",
    "--confirm-suite Run all 52 built-in tests as one Telnyx suite.",
    "--resume-suite  Resume the recorded suite run without another write.",
    "--confirm-one  Run only identity-confirmed with isolated fictional state.",
    "--confirm-cases Run the listed case IDs with isolated fictional state.",
    "--confirm      Run all 52 cases in sequence with isolated fictional state.",
    "",
    "The runner cannot place calls or change traffic routing.",
  ].join("\n");
}

async function telnyxRequest(input: {
  body?: unknown;
  config: Configuration;
  fetchImpl: typeof fetch;
  method?: string;
  path: string;
  timing: Timing;
}) {
  const method = input.method ?? "GET";
  assertApprovedTelnyxRequest(method, input.path);
  const response = await input.fetchImpl(`${apiOrigin}${input.path}`, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    method,
    signal: AbortSignal.timeout(input.timing.httpTimeoutMs),
  });
  const text = await response.text();
  let body: JsonObject = {};
  if (text) {
    try {
      body = JSON.parse(text) as JsonObject;
    } catch {
      throw new VerificationError("Telnyx returned invalid JSON.");
    }
  }
  if (!response.ok) {
    throw new HttpError(response.status, method, input.path, safeDiagnostic(body));
  }
  return body;
}

function metadataToolRecords(metadata: Metadata) {
  if (!Array.isArray(metadata.tools)) {
    throw new VerificationError("The trial tool metadata is missing.");
  }
  const scheduling = metadata.tools.filter((tool) => tool.name !== "hangup");
  const hangup = metadata.tools.filter((tool) => tool.name === "hangup");
  const names = scheduling.map((tool) => tool.name).sort();
  if (scheduling.length !== schedulingToolNames.length
    || hangup.length !== 1
    || !sameJson(names, [...schedulingToolNames].sort())
    || scheduling.some((tool) => !isOpaqueId(tool.id))
    || !isOpaqueId(hangup[0]?.id)) {
    throw new VerificationError("The recorded production tool set is invalid.");
  }
  return {
    hangupId: hangup[0]!.id as string,
    productionIds: scheduling.map((tool) => tool.id as string),
  };
}

function attachedToolIds(assistant: JsonObject) {
  if (Array.isArray(assistant.tool_ids)) {
    return assistant.tool_ids.filter((id): id is string => typeof id === "string");
  }
  if (!Array.isArray(assistant.tools)) return [];
  return assistant.tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const item = tool as JsonObject;
    const id = item.id ?? item.tool_id;
    return typeof id === "string" ? [id] : [];
  });
}

function verifyBaselineAssistant(assistant: JsonObject, config: Configuration, toolIds: string[]) {
  if (assistant.id !== config.assistantId || assistant.name !== assistantName) {
    throw new VerificationError("Telnyx returned a different main assistant.");
  }
  if ((assistant.privacy_settings as JsonObject | undefined)?.data_retention !== false) {
    throw new VerificationError("The production assistant has data retention enabled.");
  }
  const instructions = required(assistant.instructions, "assistant instructions");
  if (instructions.includes("record_identity_result")
    || !instructions.includes("call record_identity.")) {
    throw new VerificationError("The production assistant has the old identity tool prompt.");
  }
  const attachedIds = attachedToolIds(assistant).sort();
  if (!sameJson(attachedIds, [...toolIds].sort())) {
    throw new VerificationError("The production assistant tool IDs differ from metadata.");
  }
  return {
    dynamicVariables: {
      ...((assistant.dynamic_variables as JsonObject | undefined) ?? {}),
    },
    greeting: required(assistant.greeting, "assistant greeting"),
    instructions,
    versionId: required(assistant.version_id, "assistant version ID"),
  };
}

const assistantTestVariableNames = [
  "clinic_current_date",
  "clinic_name",
  "clinic_time_zone",
  "patient_first_name",
] as const;

export function renderAssistantTestTemplate(template: string, variables: JsonObject) {
  let rendered = template;
  for (const name of assistantTestVariableNames) {
    const value = required(variables[name], `Assistant Test variable ${name}`);
    rendered = rendered.replaceAll(`{{${name}}}`, value);
  }
  if (assistantTestVariableNames.some((name) => rendered.includes(`{{${name}}}`))) {
    throw new VerificationError("The Assistant Test template has an unresolved variable.");
  }
  return rendered;
}

function webhookDefinition(tool: JsonObject) {
  const toolDefinition = tool.tool_definition as JsonObject | undefined;
  return (toolDefinition?.webhook as JsonObject | undefined)
    ?? toolDefinition
    ?? tool.webhook as JsonObject | undefined;
}

function sameWebhookTool(
  tool: JsonObject,
  draft: ReturnType<typeof createTelnyxAssistantTestToolDrafts>[number],
) {
  const actual = webhookDefinition(tool);
  const expected = draft.webhook as unknown as JsonObject;
  return isOpaqueId(tool.id)
    && tool.display_name === draft.display_name
    && tool.type === "webhook"
    && actual?.name === expected.name
    && actual?.description === expected.description
    && actual?.url === expected.url
    && actual?.method === expected.method
    && actual?.async === expected.async
    && actual?.timeout_ms === expected.timeout_ms
    && sameJson(actual?.headers ?? [], expected.headers)
    && sameJson(actual?.body_parameters, expected.body_parameters);
}

function verifyTestTool(tool: JsonObject, draft: ReturnType<typeof createTelnyxAssistantTestToolDrafts>[number]) {
  if (!sameWebhookTool(tool, draft)) {
    throw new VerificationError(`The test tool differs from its draft: ${draft.webhook.name}.`);
  }
  return tool.id as string;
}

async function prepareTestTools(input: {
  allowCreate: boolean;
  allowUpdate?: boolean;
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
  write: (message: string) => void;
}) {
  const drafts = createTelnyxAssistantTestToolDrafts({
    integrationSecretIdentifier: input.config.integrationSecretIdentifier,
    publicBaseUrl: input.config.publicBaseUrl,
    testToolToken: input.config.testToolToken,
  });
  const list = await telnyxRequest({
    ...input,
    path: "/v2/ai/tools?page[size]=100",
  });
  if (!Array.isArray(list.data)) {
    throw new VerificationError("Telnyx returned an invalid shared tool list.");
  }
  const ids: string[] = [];
  for (const draft of drafts) {
    const matches = list.data.filter((item) => (
      item && typeof item === "object"
      && (item as JsonObject).display_name === draft.display_name
    )) as JsonObject[];
    if (matches.length > 1) {
      throw new VerificationError(`The test tool name is not unique: ${draft.webhook.name}.`);
    }
    let id = matches[0]?.id;
    if (!id) {
      if (!input.allowCreate) {
        throw new VerificationError(`The test tool does not exist: ${draft.webhook.name}.`);
      }
      const created = dataObject(await telnyxRequest({
        ...input,
        body: draft,
        method: "POST",
        path: "/v2/ai/tools",
      }));
      id = created.id;
      input.write(`Created fictional test tool: ${draft.webhook.name}.`);
    }
    if (!isOpaqueId(id)) {
      throw new VerificationError(`Telnyx returned an invalid test tool ID: ${draft.webhook.name}.`);
    }
    let detail = dataObject(await telnyxRequest({
      ...input,
      path: `/v2/ai/tools/${encodeURIComponent(id as string)}`,
    }));
    if (!sameWebhookTool(detail, draft) && input.allowUpdate) {
      detail = dataObject(await telnyxRequest({
        ...input,
        body: draft,
        method: "PATCH",
        path: `/v2/ai/tools/${encodeURIComponent(id as string)}`,
      }));
      input.write(`Updated fictional test tool URL: ${draft.webhook.name}.`);
    }
    ids.push(verifyTestTool(detail, draft));
  }
  return ids;
}

async function syncProductionTools(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  metadata: Metadata;
  timing: Timing;
  write: (message: string) => void;
}) {
  if (!Array.isArray(input.metadata.tools)) {
    throw new VerificationError("The trial tool metadata is missing.");
  }
  const records = new Map(input.metadata.tools.map((tool) => [tool.name, tool]));
  const drafts = createTelnyxAssistantToolDrafts({
    integrationSecretIdentifier: input.config.integrationSecretIdentifier,
    publicBaseUrl: input.config.publicBaseUrl,
  }).map((draft) => ({
    ...draft,
    display_name: `Dental scheduling trial | ${draft.display_name}`,
  }));
  let updatedCount = 0;
  for (const draft of drafts) {
    const record = records.get(draft.webhook.name);
    if (!record
      || !isOpaqueId(record.id)
      || record.displayName !== draft.display_name) {
      throw new VerificationError(`The production tool metadata differs: ${draft.webhook.name}.`);
    }
    let detail = dataObject(await telnyxRequest({
      ...input,
      path: `/v2/ai/tools/${encodeURIComponent(record.id as string)}`,
    }));
    if (detail.id !== record.id
      || detail.display_name !== record.displayName
      || detail.type !== "webhook") {
      throw new VerificationError(`The production tool identity differs: ${draft.webhook.name}.`);
    }
    if (!sameWebhookTool(detail, draft)) {
      detail = dataObject(await telnyxRequest({
        ...input,
        body: draft,
        method: "PATCH",
        path: `/v2/ai/tools/${encodeURIComponent(record.id as string)}`,
      }));
      updatedCount += 1;
      input.write(`Updated production tool URL: ${draft.webhook.name}.`);
    }
    if (!sameWebhookTool(detail, draft) || detail.id !== record.id) {
      throw new VerificationError(`The production tool update failed: ${draft.webhook.name}.`);
    }
  }
  return { checkedCount: drafts.length, updatedCount };
}

function sameTest(existing: JsonObject, draft: JsonObject) {
  const existingRubric = Array.isArray(existing.rubric) ? existing.rubric as JsonObject[] : [];
  const draftRubric = Array.isArray(draft.rubric) ? draft.rubric as JsonObject[] : [];
  return existing.destination === draft.destination
    && existing.instructions === draft.instructions
    && existing.telnyx_conversation_channel === draft.telnyx_conversation_channel
    && existingRubric.length === draftRubric.length
    && existingRubric.every((item, index) => (
      item.name === draftRubric[index]?.name
      && item.criteria === draftRubric[index]?.criteria
    ));
}

async function prepareTests(input: {
  allowCreate: boolean;
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
  write: (message: string) => void;
}) {
  const drafts = createTelnyxAssistantTestDrafts(input.config.assistantId);
  const list = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/tests?test_suite=${encodeURIComponent(telnyxAssistantTestSuiteName)}&page[size]=100`,
  });
  if (!Array.isArray(list.data)) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test list.");
  }
  const tests: Array<{ draft: JsonObject; testId: string }> = [];
  for (const rawDraft of drafts) {
    const draft = rawDraft as unknown as JsonObject;
    const matches = list.data.filter((item) => (
      item && typeof item === "object" && (item as JsonObject).name === draft.name
    )) as JsonObject[];
    if (matches.length > 1) {
      throw new VerificationError(`The Assistant Test name is not unique: ${draft.name}.`);
    }
    let existing = matches[0];
    if (!existing) {
      if (!input.allowCreate) {
        throw new VerificationError(`The Assistant Test does not exist: ${draft.name}.`);
      }
      existing = dataObject(await telnyxRequest({
        ...input,
        body: draft,
        method: "POST",
        path: "/v2/ai/assistants/tests",
      }));
      input.write(`Created Assistant Test: ${draft.name}.`);
    } else if (!sameTest(existing, draft)) {
      if (!input.allowCreate || !isOpaqueId(existing.test_id)) {
        throw new VerificationError(`The Assistant Test differs from its draft: ${draft.name}.`);
      }
      existing = dataObject(await telnyxRequest({
        ...input,
        body: draft,
        method: "PUT",
        path: `/v2/ai/assistants/tests/${encodeURIComponent(existing.test_id as string)}`,
      }));
      input.write(`Updated Assistant Test: ${draft.name}.`);
    }
    if (!sameTest(existing, draft) || !isOpaqueId(existing.test_id)) {
      throw new VerificationError(`The Assistant Test differs from its draft: ${draft.name}.`);
    }
    tests.push({ draft, testId: existing.test_id as string });
  }
  if (tests.length !== 52) {
    throw new VerificationError(`Expected 52 Assistant Tests, but prepared ${tests.length}.`);
  }
  return tests;
}

async function readAssistant(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
}) {
  return dataObject(await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}`,
  }));
}

async function readAssistantVersion(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
  versionId: string;
}) {
  return dataObject(await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}/versions/${encodeURIComponent(input.versionId)}`,
  }));
}

async function updateMain(input: {
  config: Configuration;
  dynamicVariables: JsonObject;
  fetchImpl: typeof fetch;
  greeting: string;
  instructions: string;
  retention: boolean;
  timing: Timing;
  toolIds: string[];
  versionName: string;
}) {
  const assistant = dataObject(await telnyxRequest({
    ...input,
    body: {
      dynamic_variables: input.dynamicVariables,
      greeting: input.greeting,
      instructions: input.instructions,
      privacy_settings: { data_retention: input.retention },
      promote_to_main: true,
      tool_ids: input.toolIds,
      version_name: input.versionName,
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}`,
  }));
  if (assistant.greeting !== input.greeting
    || (assistant.privacy_settings as JsonObject | undefined)?.data_retention !== input.retention
    || !sameJson(attachedToolIds(assistant).sort(), [...input.toolIds].sort())) {
    throw new VerificationError("Telnyx did not apply the expected temporary main version.");
  }
  return required(assistant.version_id, "updated assistant version ID");
}

async function resetFictionalSession(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
}) {
  const response = await input.fetchImpl(localResetUrl(input.config.internalUrl), {
    headers: { "x-voice-gateway-secret": input.config.internalSecret },
    method: "POST",
    signal: AbortSignal.timeout(input.timing.httpTimeoutMs),
  });
  if (response.status !== 204) {
    throw new VerificationError(`The fictional session reset failed with ${response.status}.`);
  }
}

async function testAssistantTool(input: {
  argumentsValue: JsonObject;
  config: Configuration;
  fetchImpl: typeof fetch;
  timing: Timing;
  toolId: string;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = dataObject(await telnyxRequest({
        ...input,
        body: {
          arguments: input.argumentsValue,
          dynamic_variables: { tool_token: input.config.testToolToken },
        },
        method: "POST",
        path: `/v2/ai/assistants/${encodeURIComponent(input.config.assistantId)}/tools/${encodeURIComponent(input.toolId)}/test`,
      }));
      const statusCode = Number(response.status_code);
      let gatewayResponse: JsonObject = {};
      if (typeof response.response === "string" && response.response) {
        try {
          gatewayResponse = JSON.parse(response.response) as JsonObject;
        } catch {
          throw new VerificationError("The tool test returned an invalid gateway response.");
        }
      } else if (response.response && typeof response.response === "object") {
        gatewayResponse = response.response as JsonObject;
      }
      return {
        gatewayResponse,
        statusCode,
        success: response.success === true,
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof VerificationError
        || (error instanceof HttpError && (error.status === 429 || error.status >= 500));
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 500));
    }
  }
  throw lastError;
}

function schedulingResult(toolResult: Awaited<ReturnType<typeof testAssistantTool>>) {
  const result = toolResult.gatewayResponse.result;
  if (!toolResult.success
    || toolResult.statusCode < 200
    || toolResult.statusCode >= 300
    || !result
    || typeof result !== "object") {
    throw new VerificationError(
      `The webhook tool failed with gateway status ${toolResult.statusCode || "unknown"}.`,
    );
  }
  return result as JsonObject;
}

function assertSchedulingResult(result: JsonObject, expectedType: string) {
  if (result.type !== expectedType) {
    throw new VerificationError(`Expected ${expectedType}, but the webhook returned another result.`);
  }
  return result;
}

async function runToolContractSequences(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  testToolIds: string[];
  timing: Timing;
  write: (message: string) => void;
}) {
  const toolIds = new Map(schedulingToolNames.map((name, index) => (
    [name, input.testToolIds[index]!] as const
  )));
  const invoke = async (name: typeof schedulingToolNames[number], argumentsValue: JsonObject) => (
    testAssistantTool({
      argumentsValue,
      config: input.config,
      fetchImpl: input.fetchImpl,
      timing: input.timing,
      toolId: toolIds.get(name)!,
    })
  );
  const successful = async (
    name: typeof schedulingToolNames[number],
    argumentsValue: JsonObject,
    expectedType: string,
  ) => assertSchedulingResult(
    schedulingResult(await invoke(name, argumentsValue)),
    expectedType,
  );

  await resetFictionalSession(input);
  const preIdentityCase = await invoke("load_safe_case", { operationId: "phase5.guard.case" });
  if (preIdentityCase.success
    || preIdentityCase.statusCode !== 409
    || preIdentityCase.gatewayResponse.error !== "identity_required") {
    throw new VerificationError("The real tool boundary disclosed the case before identity.");
  }
  input.write("Verified pre-identity disclosure guard.");

  await successful(
    "record_identity",
    { operationId: "phase5.reschedule.identity", result: "confirmed" },
    "identity_recorded",
  );
  await successful(
    "load_safe_case",
    { operationId: "phase5.reschedule.case" },
    "case_loaded",
  );
  const slots = await successful(
    "search_slots",
    {
      limit: 3,
      operationId: "phase5.reschedule.search",
      provider: { kind: "any" },
    },
    "slots_found",
  );
  const firstSlot = Array.isArray(slots.slots) ? slots.slots[0] as JsonObject | undefined : undefined;
  const slotId = required(firstSlot?.id, "fictional returned slot ID");
  const rejectedSlot = await invoke("prepare_reschedule", {
    operationId: "phase5.reschedule.invalid-slot",
    slotId: "fictional-slot-not-offered",
  });
  if (rejectedSlot.success
    || rejectedSlot.statusCode !== 409
    || rejectedSlot.gatewayResponse.error !== "slot_not_offered") {
    throw new VerificationError("The real tool boundary accepted an unoffered slot.");
  }
  const prepared = await successful(
    "prepare_reschedule",
    { operationId: "phase5.reschedule.prepare", slotId },
    "reschedule_prepared",
  );
  const rescheduleToken = required(prepared.actionToken, "fictional reschedule action token");
  const unconfirmed = await invoke("commit_reschedule", {
    actionToken: rescheduleToken,
    confirmation: "not_confirmed",
    operationId: "phase5.reschedule.reject-unconfirmed",
  });
  if (unconfirmed.success
    || unconfirmed.statusCode !== 409
    || unconfirmed.gatewayResponse.error !== "confirmation_required") {
    throw new VerificationError("The real tool boundary accepted an unconfirmed reschedule.");
  }
  const commitArguments = {
    actionToken: rescheduleToken,
    confirmation: "confirmed",
    operationId: "phase5.reschedule.commit",
  };
  const committed = await successful(
    "commit_reschedule",
    commitArguments,
    "reschedule_committed",
  );
  const replayed = await successful(
    "commit_reschedule",
    commitArguments,
    "reschedule_committed",
  );
  if (!sameJson(committed, replayed)) {
    throw new VerificationError("The reschedule replay returned a different result.");
  }
  input.write("Verified the real reschedule tool sequence and idempotent replay.");

  await resetFictionalSession(input);
  await successful(
    "record_identity",
    { operationId: "phase5.cancel.identity", result: "confirmed" },
    "identity_recorded",
  );
  await successful(
    "load_safe_case",
    { operationId: "phase5.cancel.case" },
    "case_loaded",
  );
  const cancellation = await successful(
    "prepare_cancellation",
    { operationId: "phase5.cancel.prepare" },
    "cancellation_prepared",
  );
  const cancellationToken = required(
    cancellation.actionToken,
    "fictional cancellation action token",
  );
  const cancellationArguments = {
    actionToken: cancellationToken,
    confirmation: "confirmed",
    operationId: "phase5.cancel.commit",
  };
  const cancellationCommit = await successful(
    "commit_cancellation",
    cancellationArguments,
    "cancellation_committed",
  );
  const cancellationReplay = await successful(
    "commit_cancellation",
    cancellationArguments,
    "cancellation_committed",
  );
  if (!sameJson(cancellationCommit, cancellationReplay)) {
    throw new VerificationError("The cancellation replay returned a different result.");
  }
  input.write("Verified the real cancellation tool sequence and idempotent replay.");

  await resetFictionalSession(input);
  await successful(
    "record_identity",
    { operationId: "phase5.follow-up.identity", result: "confirmed" },
    "identity_recorded",
  );
  await successful(
    "staff_follow_up",
    { operationId: "phase5.follow-up.request", reason: "caller_request" },
    "staff_follow_up_recorded",
  );
  input.write("Verified the real staff follow-up tool sequence.");

  return {
    disclosureGuard: "passed",
    schedulingToolsExercised: schedulingToolNames.length,
    transactionSequences: ["reschedule", "cancellation", "staff_follow_up"],
  };
}

async function pollRun(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  testId: string;
  timing: Timing;
  versionId: string;
}) {
  const run = dataObject(await telnyxRequest({
    ...input,
    body: { destination_version_id: input.versionId },
    method: "POST",
    path: `/v2/ai/assistants/tests/${encodeURIComponent(input.testId)}/runs`,
  })) as TestRun;
  if (!isOpaqueId(run.run_id)) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test run ID.");
  }
  return pollExistingRun({ ...input, initialRun: run, runId: run.run_id });
}

async function readTestRun(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  runId: string;
  sleep: (milliseconds: number) => Promise<void>;
  testId: string;
  timing: Timing;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return dataObject(await telnyxRequest({
        ...input,
        path: `/v2/ai/assistants/tests/${encodeURIComponent(input.testId)}/runs/${encodeURIComponent(input.runId)}`,
      })) as TestRun;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof HttpError
        && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt === 5) throw error;
      await input.sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

async function pollExistingRun(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  initialRun?: TestRun;
  runId: string;
  sleep: (milliseconds: number) => Promise<void>;
  testId: string;
  timing: Timing;
}) {
  let run = input.initialRun ?? await readTestRun(input);
  const deadline = Date.now() + input.timing.pollTimeoutMs;
  while (!terminalStatuses.has(run.status)) {
    if (Date.now() >= deadline) {
      throw new VerificationError("The Assistant Test did not finish within five minutes.");
    }
    await input.sleep(input.timing.pollDelayMs);
    run = await readTestRun(input);
  }
  return run;
}

async function runBuiltInSuite(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  onStarted?: (suiteRunId: string) => Promise<void>;
  sleep: (milliseconds: number) => Promise<void>;
  timing: Timing;
  versionId: string;
}) {
  const started = await telnyxRequest({
    ...input,
    body: { destination_version_id: input.versionId },
    method: "POST",
    path: `/v2/ai/assistants/tests/test-suites/${encodeURIComponent(telnyxAssistantTestSuiteName)}/runs`,
  });
  if (!Array.isArray(started) || started.length !== 52) {
    throw new VerificationError("Telnyx did not start all 52 Assistant Tests.");
  }
  const runs = started as unknown as TestRun[];
  const suiteRunId = required(runs[0]?.test_suite_run_id, "Assistant Test suite run ID");
  await input.onStarted?.(suiteRunId);
  return pollBuiltInSuite({ ...input, initialRuns: runs, suiteRunId });
}

async function readSuiteRuns(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  suiteRunId: string;
  timing: Timing;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const history = await telnyxRequest({
        ...input,
        path: `/v2/ai/assistants/tests/test-suites/${encodeURIComponent(telnyxAssistantTestSuiteName)}/runs?test_suite_run_id=${encodeURIComponent(input.suiteRunId)}&page[size]=100`,
      });
      if (!Array.isArray(history.data) || history.data.length !== 52) {
        throw new VerificationError("Telnyx returned an incomplete Assistant Test suite status.");
      }
      return history.data as TestRun[];
    } catch (error) {
      lastError = error;
      const retryable = error instanceof HttpError
        && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt === 5) throw error;
      await input.sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

async function pollBuiltInSuite(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  initialRuns?: TestRun[];
  sleep: (milliseconds: number) => Promise<void>;
  suiteRunId: string;
  timing: Timing;
}) {
  let runs = input.initialRuns ?? await readSuiteRuns(input);
  const deadline = Date.now() + 20 * 60_000;
  while (runs.some((run) => !terminalStatuses.has(run.status))) {
    if (Date.now() >= deadline) {
      throw new VerificationError("The Assistant Test suite did not finish within 20 minutes.");
    }
    await input.sleep(5_000);
    runs = await readSuiteRuns(input);
  }
  return { runs, suiteRunId: input.suiteRunId };
}

async function deleteConversation(input: {
  config: Configuration;
  conversationId: string | undefined;
  fetchImpl: typeof fetch;
  timing: Timing;
}) {
  if (!input.conversationId) return;
  if (!isConversationId(input.conversationId)) {
    throw new VerificationError("Telnyx returned an invalid test conversation ID.");
  }
  await telnyxRequest({
    ...input,
    method: "DELETE",
    path: `/v2/ai/conversations/${encodeURIComponent(input.conversationId)}`,
  });
}

async function inspectConversation(input: {
  config: Configuration;
  conversationId: string | undefined;
  fetchImpl: typeof fetch;
  scriptedCallerTurns: number;
  timing: Timing;
}) {
  if (!input.conversationId) {
    return {
      assistantTexts: [],
      messageCount: 0,
      overflowCallerTurns: 0,
      roles: [],
      toolNames: [],
      toolTexts: [],
    };
  }
  if (!isConversationId(input.conversationId)) {
    throw new VerificationError("Telnyx returned an invalid test conversation ID.");
  }
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/conversations/${encodeURIComponent(input.conversationId)}/messages?page[size]=100&page[number]=1`,
  });
  if (!Array.isArray(response.data)) {
    throw new VerificationError("Telnyx returned an invalid test conversation message list.");
  }
  const messages = response.data.filter((message): message is JsonObject => (
    Boolean(message) && typeof message === "object"
  )).reverse();
  let callerTurns = 0;
  const boundedMessages = messages.filter((message) => {
    if (message.role !== "user") return callerTurns <= input.scriptedCallerTurns;
    callerTurns += 1;
    return callerTurns <= input.scriptedCallerTurns;
  });
  const toolNames = boundedMessages.flatMap((message) => {
    if (!Array.isArray(message.tool_calls)) return [];
    return message.tool_calls.flatMap((call) => {
      if (!call || typeof call !== "object") return [];
      const item = call as JsonObject;
      const functionValue = item.function as JsonObject | undefined;
      const name = functionValue?.name ?? item.name;
      return typeof name === "string" ? [name] : [];
    });
  });
  return {
    assistantTexts: boundedMessages
      .filter((message) => message.role === "assistant")
      .map((message) => safeError(message.text ?? "", input.config).slice(0, 500))
      .filter(Boolean),
    messageCount: boundedMessages.length,
    overflowCallerTurns: Math.max(0, callerTurns - input.scriptedCallerTurns),
    roles: boundedMessages.map((message) => String(message.role ?? "unknown")),
    toolNames,
    toolTexts: boundedMessages
      .filter((message) => message.role === "tool")
      .map((message) => safeError(message.text ?? message.content ?? "", input.config).slice(0, 500))
      .filter(Boolean),
  };
}

async function collectSuiteResults(input: {
  config: Configuration;
  fetchImpl: typeof fetch;
  nameByTestId: Map<string, unknown>;
  runs: TestRun[];
  timing: Timing;
  write: (message: string) => void;
}) {
  const results: JsonObject[] = [];
  for (const [index, run] of input.runs.entries()) {
    const name = String(input.nameByTestId.get(run.test_id) ?? run.test_id);
    const inspection = await inspectConversation({
      config: input.config,
      conversationId: run.conversation_id,
      fetchImpl: input.fetchImpl,
      scriptedCallerTurns: telnyxAssistantTestScriptedCallerTurns(name),
      timing: input.timing,
    });
    await deleteConversation({
      config: input.config,
      conversationId: run.conversation_id,
      fetchImpl: input.fetchImpl,
      timing: input.timing,
    });
    results.push({
      criteria: run.detail_status ?? [],
      logs: run.logs ? safeError(run.logs, input.config).slice(0, 1_000) : undefined,
      messageCount: inspection.messageCount,
      name,
      overflowCallerTurns: inspection.overflowCallerTurns,
      roles: inspection.roles,
      runId: run.run_id,
      status: run.status,
      toolNames: inspection.toolNames,
      toolSequencePassed: telnyxAssistantTestExpectedToolSequences(name).some((sequence) => (
        sameJson(sequence, inspection.toolNames)
      )),
      toolTexts: inspection.toolTexts,
    });
    input.write(
      `[${index + 1}/52] Cleaned ${String(input.nameByTestId.get(run.test_id) ?? run.test_id)}.`,
    );
  }
  return results;
}

function safeError(error: unknown, config?: Configuration) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [
    config?.apiKey,
    config?.internalSecret,
    config?.testToolToken,
    process.env.VOICE_ASSISTANT_TOOL_SECRET,
    process.env.CALL_TO_NUMBER,
    process.env.TELNYX_PHONE_NUMBER,
  ]) {
    if (value) message = message.replaceAll(value, "[redacted]");
  }
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export async function runCommand(input: {
  args: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  readMetadata?: () => Promise<Metadata>;
  sleep?: (milliseconds: number) => Promise<void>;
  timing?: Timing;
  write?: (message: string) => void;
  writeMetadata?: (metadata: Metadata) => Promise<void>;
}) {
  const args = input.args[0] === "--" ? input.args.slice(1) : input.args;
  const [command] = args;
  const write = input.write ?? console.log;
  const validArgumentCount = command === "--confirm-cases"
    ? args.length === 2
    : args.length === 1;
  if (!validArgumentCount || !command || !commands.has(command)) {
    write("Use --help to see the supported command modes.");
    return 1;
  }
  if (command === "--help") {
    write(helpText());
    return 0;
  }

  const readMetadata = input.readMetadata
    ?? (async () => JSON.parse(await readFile(metadataPath, "utf8")) as Metadata);
  const writeMetadata = input.writeMetadata
    ?? (async (metadata) => writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`));
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const sleep = input.sleep ?? ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const timing = input.timing ?? defaultTiming;
  const now = input.now ?? (() => new Date());
  const metadata = await readMetadata();
  let config: Configuration | undefined;
  try {
    config = getConfiguration(input.env ?? process.env, metadata);
    const records = metadataToolRecords(metadata);
    const drafts = createTelnyxAssistantTestDrafts(config.assistantId);
    if (drafts.length !== 52) {
      throw new VerificationError(`Expected 52 local scenarios, but found ${drafts.length}.`);
    }
    if (telnyxAssistantInstructions.includes("record_identity_result")) {
      throw new VerificationError("The local assistant prompt has the old identity tool name.");
    }
    if (command === "--dry-run") {
      write("Local Phase 5 guards passed for 52 fictional scenarios.");
      write("No network request occurred.");
      return 0;
    }

    if (command === "--restore-production") {
      const startedAt = now().toISOString();
      const knownGoodVersionId = required(
        metadata.phase5PromptUpdate?.versionId ?? metadata.assistant?.versionId,
        "last known-safe assistant version ID",
      );
      let restoredVersionId: string | undefined;
      let restorationError: unknown;
      try {
        const knownGood = verifyBaselineAssistant(
          await readAssistantVersion({
            config,
            fetchImpl,
            timing,
            versionId: knownGoodVersionId,
          }),
          config,
          [...records.productionIds, records.hangupId],
        );
        restoredVersionId = await updateMain({
          config,
          dynamicVariables: knownGood.dynamicVariables,
          fetchImpl,
          greeting: knownGood.greeting,
          instructions: telnyxAssistantInstructions,
          retention: false,
          timing,
          toolIds: [...records.productionIds, records.hangupId],
          versionName: "Restore production after interrupted Phase 5",
        });
        const restored = verifyBaselineAssistant(
          await readAssistant({ config, fetchImpl, timing }),
          config,
          [...records.productionIds, records.hangupId],
        );
        if (restored.instructions !== telnyxAssistantInstructions) {
          throw new VerificationError("The restored assistant prompt differs from the reviewed prompt.");
        }
      } catch (error) {
        restorationError = error;
      }
      metadata.phase5EmergencyRestoration = {
        completedAt: now().toISOString(),
        error: restorationError ? safeError(restorationError, config) : null,
        knownGoodVersionId,
        passed: !restorationError,
        startedAt,
        versionId: restoredVersionId ?? null,
      };
      if (restoredVersionId) {
        metadata.assistant = {
          ...metadata.assistant,
          versionId: restoredVersionId,
          versionNote: "Production restored after interrupted Phase 5 testing.",
        };
      }
      await writeMetadata(metadata);
      if (restorationError) throw restorationError;
      write(`Restored production version: ${restoredVersionId}. Retention: disabled.`);
      return 0;
    }

    const baselineAssistant = await readAssistant({ config, fetchImpl, timing });
    const baseline = verifyBaselineAssistant(
      baselineAssistant,
      config,
      [...records.productionIds, records.hangupId],
    );
    const testDialogue = {
      greeting: renderAssistantTestTemplate(baseline.greeting, baseline.dynamicVariables),
      instructions: renderAssistantTestTemplate(baseline.instructions, baseline.dynamicVariables),
    };
    const allowCreate = command === "--confirm-tool-contracts"
      || command === "--confirm-prompt"
      || command === "--confirm-suite"
      || command === "--confirm-one"
      || command === "--confirm-cases"
      || command === "--confirm";
    const tests = await prepareTests({ allowCreate, config, fetchImpl, timing, write });
    const testToolIds = await prepareTestTools({
      allowCreate,
      allowUpdate: command === "--sync-public-url",
      config,
      fetchImpl,
      timing,
      write,
    });
    write(`Verified Assistant Tests: ${tests.length}.`);
    write(`Verified fictional test tools: ${testToolIds.length}.`);
    write(`Production retention: disabled. Version: ${baseline.versionId}.`);
    if (command === "--verify") return 0;

    if (command === "--sync-public-url") {
      const startedAt = now().toISOString();
      let syncError: unknown;
      let productionResult: JsonObject | undefined;
      try {
        productionResult = await syncProductionTools({
          config,
          fetchImpl,
          metadata,
          timing,
          write,
        });
      } catch (error) {
        syncError = error;
      }
      metadata.phase5PublicUrlSync = {
        completedAt: now().toISOString(),
        error: syncError ? safeError(syncError, config) : null,
        passed: !syncError,
        production: productionResult ?? null,
        publicBaseUrl: config.publicBaseUrl,
        startedAt,
        testToolsChecked: testToolIds.length,
      };
      await writeMetadata(metadata);
      if (syncError) throw syncError;
      write("Updated and verified all production and fictional test webhook URLs.");
      return 0;
    }

    if (command === "--recover-error-runs") {
      const storedResults = metadata.phase5SelectedCases?.results;
      if (!Array.isArray(storedResults)) {
        throw new VerificationError("The selected Assistant Test results are missing.");
      }
      const nameByTestId = new Map(tests.map((test) => [test.testId, test.draft.name]));
      const recovered = new Map<string, JsonObject>();
      for (const item of storedResults) {
        if (!item || typeof item !== "object") continue;
        const result = item as JsonObject;
        if (result.status !== "error" || typeof result.error !== "string") continue;
        const match = result.error.match(
          /GET \/v2\/ai\/assistants\/tests\/([A-Za-z0-9_-]+)\/runs\/([A-Za-z0-9_-]+) failed/,
        );
        if (!match || nameByTestId.get(match[1]!) !== result.name) {
          throw new VerificationError("A stored Assistant Test error has an invalid run path.");
        }
        const run = await pollExistingRun({
          config,
          fetchImpl,
          runId: match[2]!,
          sleep,
          testId: match[1]!,
          timing,
        });
        const inspection = await inspectConversation({
          config,
          conversationId: run.conversation_id,
          fetchImpl,
          scriptedCallerTurns: telnyxAssistantTestScriptedCallerTurns(String(result.name)),
          timing,
        });
        await deleteConversation({
          config,
          conversationId: run.conversation_id,
          fetchImpl,
          timing,
        });
        recovered.set(String(result.name), {
          criteria: run.detail_status ?? [],
          error: undefined,
          logs: run.logs ? safeError(run.logs, config).slice(0, 1_000) : undefined,
          messageCount: inspection.messageCount,
          name: result.name,
          overflowCallerTurns: inspection.overflowCallerTurns,
          recoveredFromRunId: match[2],
          roles: inspection.roles,
          runId: run.run_id,
          status: run.status,
          toolNames: inspection.toolNames,
          toolSequencePassed: telnyxAssistantTestExpectedToolSequences(
            String(result.name),
          ).some((sequence) => sameJson(sequence, inspection.toolNames)),
          toolTexts: inspection.toolTexts,
        });
        write(`Recovered and cleaned: ${String(result.name)}.`);
      }
      if (recovered.size === 0) {
        throw new VerificationError("No recoverable Assistant Test errors were recorded.");
      }
      const results = storedResults.map((item) => {
        if (!item || typeof item !== "object") return item;
        return recovered.get(String((item as JsonObject).name)) ?? item;
      });
      const counts = results.reduce<Record<string, number>>((result, item) => {
        const status = String((item as JsonObject | undefined)?.status ?? "error");
        result[status] = (result[status] ?? 0) + 1;
        return result;
      }, {});
      metadata.phase5SelectedCases = {
        ...metadata.phase5SelectedCases,
        counts,
        recoveredAt: now().toISOString(),
        results,
      };
      metadata.phase5RecoveredErrorRuns = {
        completedAt: now().toISOString(),
        recoveredCount: recovered.size,
        retainedConversationsDeleted: recovered.size,
      };
      await writeMetadata(metadata);
      write(`Recovered ${recovered.size} transient Assistant Test polls.`);
      return counts.error ? 1 : 0;
    }

    if (command === "--confirm-prompt") {
      const startedAt = now().toISOString();
      let versionId: string | undefined;
      let promptError: unknown;
      try {
        versionId = await updateMain({
          config,
          dynamicVariables: baseline.dynamicVariables,
          fetchImpl,
          greeting: baseline.greeting,
          instructions: telnyxAssistantInstructions,
          retention: false,
          timing,
          toolIds: [...records.productionIds, records.hangupId],
          versionName: "Phase 5 conversational safety prompt",
        });
        const updated = verifyBaselineAssistant(
          await readAssistant({ config, fetchImpl, timing }),
          config,
          [...records.productionIds, records.hangupId],
        );
        if (updated.instructions !== telnyxAssistantInstructions) {
          throw new VerificationError("Telnyx did not apply the reviewed assistant prompt.");
        }
      } catch (error) {
        promptError = error;
      }
      metadata.phase5PromptUpdate = {
        completedAt: now().toISOString(),
        error: promptError ? safeError(promptError, config) : null,
        passed: !promptError,
        startedAt,
        versionId: versionId ?? null,
      };
      if (versionId) {
        metadata.assistant = {
          ...metadata.assistant,
          versionId,
          versionNote: "Phase 5 conversational safety prompt.",
        };
      }
      await writeMetadata(metadata);
      if (promptError) throw promptError;
      write(`Applied the reviewed prompt in version: ${versionId}.`);
      return 0;
    }

    if (command === "--resume-suite") {
      const suiteRunId = required(
        metadata.phase5BuiltInCorpus?.suiteRunId,
        "recorded Assistant Test suite run ID",
      );
      const nameByTestId = new Map(tests.map((test) => [test.testId, test.draft.name]));
      const suite = await pollBuiltInSuite({
        config,
        fetchImpl,
        sleep,
        suiteRunId,
        timing,
      });
      const results = await collectSuiteResults({
        config,
        fetchImpl,
        nameByTestId,
        runs: suite.runs,
        timing,
        write,
      });
      const counts = results.reduce<Record<string, number>>((result, item) => {
        const status = String(item.status ?? "error");
        result[status] = (result[status] ?? 0) + 1;
        return result;
      }, {});
      metadata.phase5BuiltInCorpus = {
        ...metadata.phase5BuiltInCorpus,
        completedAt: now().toISOString(),
        counts,
        error: null,
        productionRestored: true,
        results,
        resumedAt: now().toISOString(),
      };
      await writeMetadata(metadata);
      const passed = results.filter((result) => result.status === "passed").length;
      write(`Resumed built-in Assistant Test result: ${passed}/52 passed.`);
      return passed === 52 ? 0 : 1;
    }

    if (command === "--confirm-tool-contracts") {
      const startedAt = now().toISOString();
      let temporaryVersionId: string | undefined;
      let restoredVersionId: string | undefined;
      let evidence: JsonObject | undefined;
      let contractError: unknown;
      let restorationError: unknown;
      try {
        temporaryVersionId = await updateMain({
          config,
          dynamicVariables: { ...baseline.dynamicVariables, tool_token: config.testToolToken },
          fetchImpl,
          greeting: testDialogue.greeting,
          instructions: testDialogue.instructions,
          retention: false,
          timing,
          toolIds: [...testToolIds, records.hangupId],
          versionName: "Phase 5 fictional webhook contract validation",
        });
        write(`Temporary webhook-test version: ${temporaryVersionId}.`);
        evidence = await runToolContractSequences({
          config,
          fetchImpl,
          testToolIds,
          timing,
          write,
        });
      } catch (error) {
        contractError = error;
      } finally {
        try {
          restoredVersionId = await updateMain({
            config,
            dynamicVariables: baseline.dynamicVariables,
            fetchImpl,
            greeting: baseline.greeting,
            instructions: baseline.instructions,
            retention: false,
            timing,
            toolIds: [...records.productionIds, records.hangupId],
            versionName: "Restore production after Phase 5 tools",
          });
          const restored = await readAssistant({ config, fetchImpl, timing });
          verifyBaselineAssistant(restored, config, [...records.productionIds, records.hangupId]);
          write(`Restored production version: ${restoredVersionId}. Retention: disabled.`);
        } catch (error) {
          restorationError = error;
          write(`Production restoration failed: ${safeError(error, config)}`);
        }
        metadata.phase5ToolContracts = {
          completedAt: now().toISOString(),
          data: "fictional",
          error: contractError ? safeError(contractError, config) : null,
          evidence: evidence ?? null,
          passed: !contractError && !restorationError,
          productionRestored: !restorationError,
          startedAt,
          temporaryVersionId: temporaryVersionId ?? null,
          versionIdAfterRestore: restoredVersionId ?? null,
        };
        if (restoredVersionId) {
          metadata.assistant = {
            ...metadata.assistant,
            versionId: restoredVersionId,
            versionNote: "Production restored after fictional Phase 5 webhook validation.",
          };
        }
        await writeMetadata(metadata);
      }
      if (contractError) throw contractError;
      if (restorationError) throw restorationError;
      write("All real Telnyx webhook tool contracts passed.");
      return 0;
    }

    if (command === "--confirm-suite") {
      const startedAt = now().toISOString();
      const nameByTestId = new Map(tests.map((test) => [test.testId, test.draft.name]));
      let temporaryVersionId: string | undefined;
      let restoredVersionId: string | undefined;
      let suiteRunId: string | undefined;
      const results: JsonObject[] = [];
      let suiteError: unknown;
      let restorationError: unknown;
      try {
        temporaryVersionId = await updateMain({
          config,
          dynamicVariables: { ...baseline.dynamicVariables, tool_token: config.testToolToken },
          fetchImpl,
          greeting: testDialogue.greeting,
          instructions: testDialogue.instructions,
          retention: true,
          timing,
          toolIds: [...testToolIds, records.hangupId],
          versionName: "Phase 5 built-in fictional safety suite",
        });
        write(`Temporary retained suite version: ${temporaryVersionId}.`);
        await resetFictionalSession({ config, fetchImpl, timing });
        const suite = await runBuiltInSuite({
          config,
          fetchImpl,
          onStarted: async (startedSuiteRunId) => {
            suiteRunId = startedSuiteRunId;
            metadata.phase5BuiltInCorpus = {
              completedAt: null,
              counts: {},
              data: "fictional",
              error: null,
              productionRestored: false,
              results: [],
              startedAt,
              suiteRunId,
              temporaryVersionId,
              versionIdAfterRestore: null,
            };
            await writeMetadata(metadata);
          },
          sleep,
          timing,
          versionId: temporaryVersionId,
        });
        suiteRunId = suite.suiteRunId;
        results.push(...await collectSuiteResults({
          config,
          fetchImpl,
          nameByTestId,
          runs: suite.runs,
          timing,
          write,
        }));
      } catch (error) {
        suiteError = error;
      } finally {
        try {
          restoredVersionId = await updateMain({
            config,
            dynamicVariables: baseline.dynamicVariables,
            fetchImpl,
            greeting: baseline.greeting,
            instructions: baseline.instructions,
            retention: false,
            timing,
            toolIds: [...records.productionIds, records.hangupId],
            versionName: "Restore production after Phase 5 suite",
          });
          const restored = await readAssistant({ config, fetchImpl, timing });
          verifyBaselineAssistant(restored, config, [...records.productionIds, records.hangupId]);
          write(`Restored production version: ${restoredVersionId}. Retention: disabled.`);
        } catch (error) {
          restorationError = error;
          write(`Production restoration failed: ${safeError(error, config)}`);
        }
        const counts = results.reduce<Record<string, number>>((result, item) => {
          const status = String(item.status ?? "error");
          result[status] = (result[status] ?? 0) + 1;
          return result;
        }, {});
        metadata.phase5BuiltInCorpus = {
          completedAt: now().toISOString(),
          counts,
          data: "fictional",
          error: suiteError ? safeError(suiteError, config) : null,
          productionRestored: !restorationError,
          results,
          startedAt,
          suiteRunId: suiteRunId ?? null,
          temporaryVersionId: temporaryVersionId ?? null,
          versionIdAfterRestore: restoredVersionId ?? null,
        };
        if (restoredVersionId) {
          metadata.assistant = {
            ...metadata.assistant,
            versionId: restoredVersionId,
            versionNote: "Production restored after the built-in fictional Phase 5 suite.",
          };
        }
        await writeMetadata(metadata);
      }
      if (suiteError) throw suiteError;
      if (restorationError) throw restorationError;
      const passed = results.filter((result) => result.status === "passed").length;
      write(`Built-in Assistant Test result: ${passed}/52 passed.`);
      return passed === 52 ? 0 : 1;
    }

    const selectedCaseIds = command === "--confirm-cases"
      ? args[1]!.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    if (selectedCaseIds.some((value) => !/^[a-z0-9-]+$/.test(value))
      || new Set(selectedCaseIds).size !== selectedCaseIds.length) {
      throw new ValidationError("The selected Assistant Test IDs are invalid.");
    }
    const selectedNames = new Set(selectedCaseIds.map((id) => `Dental scheduling safety | ${id}`));
    const selected = command === "--confirm-one"
      ? tests.filter((test) => test.draft.name === oneCaseName)
      : command === "--confirm-cases"
        ? tests.filter((test) => selectedNames.has(String(test.draft.name)))
        : tests;
    const expectedSelectedCount = command === "--confirm-one"
      ? 1
      : command === "--confirm-cases"
        ? selectedCaseIds.length
        : 52;
    if (selected.length !== expectedSelectedCount || expectedSelectedCount === 0) {
      throw new VerificationError("The selected Assistant Test count is invalid.");
    }

    const startedAt = now().toISOString();
    const results: JsonObject[] = [];
    let temporaryVersionId: string | undefined;
    let restoredVersionId: string | undefined;
    let restorationError: unknown;
    metadata.phase5SequentialProgress = {
      completedAt: null,
      completedCount: 0,
      data: "fictional",
      productionRestored: true,
      results: [],
      selectedCaseIds: command === "--confirm-cases" ? selectedCaseIds : undefined,
      startedAt,
    };
    await writeMetadata(metadata);
    try {
      temporaryVersionId = await updateMain({
        config,
        dynamicVariables: { ...baseline.dynamicVariables, tool_token: config.testToolToken },
        fetchImpl,
        greeting: testDialogue.greeting,
        instructions: testDialogue.instructions,
        retention: true,
        timing,
        toolIds: [...testToolIds, records.hangupId],
        versionName: "Phase 5 sequential fictional safety corpus",
      });
      write(`Temporary retained test version: ${temporaryVersionId}.`);
      metadata.phase5SequentialProgress = {
        ...metadata.phase5SequentialProgress,
        productionRestored: false,
        temporaryVersionId,
      };
      await writeMetadata(metadata);

      for (const [index, test] of selected.entries()) {
        await resetFictionalSession({ config, fetchImpl, timing });
        let run: TestRun | undefined;
        let runError: unknown;
        try {
          run = await pollRun({
            config,
            fetchImpl,
            sleep,
            testId: test.testId,
            timing,
            versionId: temporaryVersionId,
          });
        } catch (error) {
          runError = error;
        }
        let inspection = {
          assistantTexts: [] as string[],
          messageCount: 0,
          overflowCallerTurns: 0,
          roles: [] as string[],
          toolNames: [] as string[],
          toolTexts: [] as string[],
        };
        try {
          inspection = await inspectConversation({
            config,
            conversationId: run?.conversation_id,
            fetchImpl,
            scriptedCallerTurns: telnyxAssistantTestScriptedCallerTurns(String(test.draft.name)),
            timing,
          });
          await deleteConversation({
            config,
            conversationId: run?.conversation_id,
            fetchImpl,
            timing,
          });
        } catch (error) {
          throw new VerificationError(`Test conversation cleanup failed: ${safeError(error, config)}`);
        }
        const status = run?.status ?? "error";
        results.push({
          criteria: run?.detail_status ?? [],
          assistantTexts: inspection.assistantTexts,
          error: runError ? safeError(runError, config) : undefined,
          logs: run?.logs ? safeError(run.logs, config).slice(0, 1_000) : undefined,
          messageCount: inspection.messageCount,
          name: test.draft.name,
          overflowCallerTurns: inspection.overflowCallerTurns,
          roles: inspection.roles,
          runId: run?.run_id,
          status,
          toolNames: inspection.toolNames,
          toolSequencePassed: telnyxAssistantTestExpectedToolSequences(
            String(test.draft.name),
          ).some((sequence) => sameJson(sequence, inspection.toolNames)),
          toolTexts: inspection.toolTexts,
        });
        metadata.phase5SequentialProgress = {
          ...metadata.phase5SequentialProgress,
          completedCount: results.length,
          results: [...results],
        };
        await writeMetadata(metadata);
        write(`[${index + 1}/${selected.length}] ${String(test.draft.name)}: ${status}.`);
      }
    } finally {
      try {
        restoredVersionId = await updateMain({
          config,
          dynamicVariables: baseline.dynamicVariables,
          fetchImpl,
          greeting: baseline.greeting,
          instructions: baseline.instructions,
          retention: false,
          timing,
          toolIds: [...records.productionIds, records.hangupId],
          versionName: "Restore production after Phase 5 fictional corpus",
        });
        const restored = await readAssistant({ config, fetchImpl, timing });
        verifyBaselineAssistant(restored, config, [...records.productionIds, records.hangupId]);
        write(`Restored production version: ${restoredVersionId}. Retention: disabled.`);
      } catch (error) {
        restorationError = error;
        write(`Production restoration failed: ${safeError(error, config)}`);
      }

      const counts = results.reduce<Record<string, number>>((result, item) => {
        const status = String(item.status ?? "error");
        result[status] = (result[status] ?? 0) + 1;
        return result;
      }, {});
      const corpusRecord = {
        completedAt: now().toISOString(),
        counts,
        data: "fictional",
        mode: command === "--confirm-one"
          ? "one-case-probe"
          : command === "--confirm-cases"
            ? "selected-cases"
            : "full-corpus",
        productionRestored: !restorationError,
        results,
        selectedCaseIds: command === "--confirm-cases" ? selectedCaseIds : undefined,
        startedAt,
        temporaryVersionId: temporaryVersionId ?? null,
        versionIdAfterRestore: restoredVersionId ?? null,
      };
      if (command === "--confirm-cases") {
        const priorRuns = Array.isArray(metadata.phase5SelectedCaseRuns)
          ? metadata.phase5SelectedCaseRuns
          : [];
        if (metadata.phase5SelectedCases) {
          metadata.phase5SelectedCaseRuns = [...priorRuns, metadata.phase5SelectedCases];
        }
        metadata.phase5SelectedCases = corpusRecord;
      } else {
        metadata.phase5SequentialCorpus = corpusRecord;
      }
      metadata.phase5SequentialProgress = {
        ...metadata.phase5SequentialProgress,
        completedAt: now().toISOString(),
        completedCount: results.length,
        productionRestored: !restorationError,
        results: [...results],
        versionIdAfterRestore: restoredVersionId ?? null,
      };
      if (restoredVersionId) {
        metadata.assistant = {
          ...metadata.assistant,
          versionId: restoredVersionId,
          versionNote: "Production restored after sequential fictional Phase 5 Assistant Tests.",
        };
      }
      await writeMetadata(metadata);
    }

    if (restorationError) return 1;
    const passed = results.filter((result) => result.status === "passed").length;
    write(`Final Assistant Test result: ${passed}/${selected.length} passed.`);
    return passed === selected.length ? 0 : 1;
  } catch (error) {
    write(safeError(error, config));
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void runCommand({ args: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
