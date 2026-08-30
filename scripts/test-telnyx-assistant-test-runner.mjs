import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set([
  "--help",
  "--dry-run",
  "--verify",
  "--confirm",
  "--confirm-main-retention-probe",
  "--confirm-main-tool-probe",
]);
const EXPECTED_ASSISTANT_NAME = "Dental chat isolation baseline";
const TEST_NAME = "Dental chat isolation | Private runner baseline";
const TEST_SUITE = "dental_chat_isolation_private_runner";
const MAIN_PROBE_TEST_NAME = "Dental scheduling | Main retention probe";
const MAIN_PROBE_TEST_SUITE = "dental_scheduling_main_retention_probe";
const TOOL_PROBE_TEST_NAME = "Dental scheduling safety | identity-confirmed";
const TOOL_PROBE_TEST_SUITE = "dental-scheduling-safety-v1";
const TERMINAL_STATUSES = new Set(["passed", "failed", "error"]);
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
const DEFAULT_TIMING = Object.freeze({
  httpTimeoutMs: 30_000,
  pollDelayMs: 2_000,
  pollTimeoutMs: 5 * 60_000,
});

class ValidationError extends Error {}
class VerificationError extends Error {}

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

function isAssistantId(value) {
  return /^assistant-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function isOpaqueId(value) {
  return /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function isConversationId(value) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function getConfiguration(env) {
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const mainAssistantId = valueFromEnvironment(env, "TELNYX_AI_ASSISTANT_ID");
  const isolatedAssistantId = valueFromEnvironment(
    env,
    "TELNYX_SCHEMA_TEST_ASSISTANT_ID",
  );
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
    throw new ValidationError("The test assistant must differ from the main assistant.");
  }
  return { apiKey, isolatedAssistantId, mainAssistantId, testToolToken };
}

function helpText() {
  return [
    "Test the Telnyx private Assistant Test runner with fictional data.",
    "",
    "Usage:",
    "  pnpm test:telnyx:assistant-test-runner -- --help",
    "  pnpm test:telnyx:assistant-test-runner -- --dry-run",
    "  pnpm test:telnyx:assistant-test-runner -- --verify",
    "  pnpm test:telnyx:assistant-test-runner -- --confirm",
    "  pnpm test:telnyx:assistant-test-runner -- --confirm-main-retention-probe",
    "  pnpm test:telnyx:assistant-test-runner -- --confirm-main-tool-probe",
    "",
    "Modes:",
    "  --dry-run  Validate local guards. Make no network request.",
    "  --verify   Read the retained assistant and test definition.",
    "  --confirm  Create or reuse one test, then run it once.",
    "  --confirm-main-retention-probe",
    "             Enable main retention for one fictional test, then disable it.",
    "  --confirm-main-tool-probe",
    "             Run identity-confirmed once with temporary retention.",
    "",
    "This command cannot place a phone call or change traffic routing.",
  ].join("\n");
}

function safeText(value, config) {
  let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (config.apiKey) text = text.replaceAll(config.apiKey, "[redacted]");
  if (config.testToolToken) {
    text = text.replaceAll(config.testToolToken, "[redacted]");
  }
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\+[1-9]\d{7,14}/g, "[redacted-phone]")
    .slice(0, 300);
}

function safeErrorDiagnostic(body, config) {
  const errors = Array.isArray(body?.errors)
    ? body.errors
    : Array.isArray(body?.data?.errors)
      ? body.data.errors
      : [];
  const first = errors[0] ?? {};
  return {
    code: /^[A-Za-z0-9_.:-]{1,80}$/.test(String(first.code ?? body?.code ?? ""))
      ? String(first.code ?? body?.code)
      : "unknown",
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

function assertApprovedRequest(config, method, path) {
  const requestMethod = method.toUpperCase();
  const url = new URL(path, API_ORIGIN);
  const pathname = url.pathname;
  const assistantPath = `/v2/ai/assistants/${config.isolatedAssistantId}`;
  const mainAssistantPath = `/v2/ai/assistants/${config.mainAssistantId}`;
  const approved = (
    (pathname === assistantPath && requestMethod === "GET")
    || (pathname === mainAssistantPath && ["GET", "POST"].includes(requestMethod))
    || (pathname === "/v2/ai/assistants/tests" && ["GET", "POST"].includes(requestMethod))
    || (/^\/v2\/ai\/assistants\/tests\/[A-Za-z0-9_-]{8,160}\/runs$/.test(pathname)
      && requestMethod === "POST")
    || (/^\/v2\/ai\/assistants\/tests\/[A-Za-z0-9_-]{8,160}\/runs\/[A-Za-z0-9_-]{8,160}$/.test(pathname)
      && requestMethod === "GET")
    || (/^\/v2\/ai\/conversations\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pathname)
      && requestMethod === "DELETE")
    || (/^\/v2\/ai\/conversations\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/messages$/i.test(pathname)
      && requestMethod === "GET")
  );
  if (!approved) {
    throw new ValidationError("The request is outside the private-runner experiment.");
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
      if (response.ok) throw new VerificationError("Telnyx returned invalid JSON.");
    }
  }
  if (!response.ok) {
    throw new TelnyxHttpError(response.status, safeErrorDiagnostic(result, config));
  }
  return result;
}

function verifyAssistant(assistant, expectedId) {
  if (assistant?.id !== expectedId || assistant.name !== EXPECTED_ASSISTANT_NAME) {
    throw new VerificationError("Telnyx returned a different retained assistant.");
  }
  if (assistant.privacy_settings?.data_retention !== true) {
    throw new VerificationError("The retained assistant must keep data retention enabled.");
  }
  if (typeof assistant.version_id !== "string" || !assistant.version_id) {
    throw new VerificationError("The retained assistant version is missing.");
  }
  const tools = Array.isArray(assistant.tools) ? assistant.tools : [];
  if (tools.length === SCHEDULING_TOOL_NAMES.length
    || tools.length === SCHEDULING_TOOL_NAMES.length + 1) {
    const webhooks = tools.filter((tool) => tool?.type === "webhook");
    const hangups = tools.filter((tool) => tool?.type === "hangup");
    const names = webhooks.map((tool) => tool?.webhook?.name).sort();
    const expectedNames = [...SCHEDULING_TOOL_NAMES].sort();
    const allExactWebhooks = webhooks.every((tool) => (
      hasExactPhoneTemplates(tool.webhook)
    ));
    if (JSON.stringify(names) !== JSON.stringify(expectedNames)
      || !allExactWebhooks
      || hangups.length !== tools.length - SCHEDULING_TOOL_NAMES.length) {
      throw new VerificationError("The retained assistant tool set is not approved.");
    }
    return assistant;
  }
  if (tools.length !== 1 || tools[0]?.type !== "webhook") {
    throw new VerificationError("The retained assistant has an unexpected tool count.");
  }
  const webhook = tools[0]?.webhook;
  const headers = webhook?.headers ?? [];
  const hasNoTemplates = headers.length === 0
    && !JSON.stringify(webhook).includes("{{");
  const required = webhook?.body_parameters?.required;
  if (webhook?.name !== "record_identity"
    || JSON.stringify(required) !== JSON.stringify(["operationId", "result"])
    || (!hasNoTemplates && !hasExactPhoneTemplates(webhook))) {
    throw new VerificationError("The retained assistant tool differs from the known-good schema.");
  }
  return assistant;
}

function hasExactPhoneTemplates(webhook) {
  const headers = webhook?.headers ?? [];
  return headers.length === 2
    && headers[0]?.name === "Authorization"
    && /^Bearer \{\{#integration_secret\}\}[A-Za-z0-9_-]+\{\{\/integration_secret\}\}$/.test(
      headers[0]?.value ?? "",
    )
    && headers[1]?.name === "X-Voice-Call-Control-ID"
    && headers[1]?.value === "{{call_control_id}}"
    && /\/voice\/assistant\/tools\/\{\{tool_token\}\}\/[A-Za-z0-9_/-]+$/.test(
      webhook?.url ?? "",
    );
}

async function readAssistant(input) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.isolatedAssistantId)}`,
  });
  return verifyAssistant(responseData(response), input.config.isolatedAssistantId);
}

function testDraft(assistantId, {
  name = TEST_NAME,
  suite = TEST_SUITE,
} = {}) {
  return {
    description: "Checks private Assistant Test conversation startup with fictional data.",
    destination: assistantId,
    instructions: [
      "Act as a fictional test caller.",
      "Say that this is a private-runner check.",
      "Ask the assistant to reply with READY only.",
      "Do not ask the assistant to call a tool.",
    ].join(" "),
    max_duration_seconds: 60,
    name,
    rubric: [{
      criteria: "The assistant replies with READY and does not call a tool.",
      name: "Ready without tool",
    }],
    telnyx_conversation_channel: "web_chat",
    test_suite: suite,
  };
}

function sameTest(existing, expected) {
  const existingRubric = Array.isArray(existing.rubric) ? existing.rubric : [];
  const expectedRubric = Array.isArray(expected.rubric) ? expected.rubric : [];
  const rubricMatches = existingRubric.length === expectedRubric.length
    && existingRubric.every((item, index) => (
      item.name === expectedRubric[index]?.name
      && item.criteria === expectedRubric[index]?.criteria
    ));
  return existing.destination === expected.destination
    && existing.instructions === expected.instructions
    && existing.telnyx_conversation_channel === expected.telnyx_conversation_channel
    && rubricMatches;
}

async function findTest(input, draft) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/tests?test_suite=${encodeURIComponent(draft.test_suite)}&page[size]=100`,
  });
  if (!Array.isArray(response?.data)) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test list.");
  }
  const matches = response.data.filter((item) => item?.name === draft.name);
  if (matches.length > 1) {
    throw new VerificationError("The private-runner test name is not unique.");
  }
  if (matches.length === 0) return null;
  if (!sameTest(matches[0], draft)) {
    throw new VerificationError("The stored private-runner test differs from its draft.");
  }
  if (!isOpaqueId(matches[0].test_id ?? "")) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test ID.");
  }
  return matches[0];
}

async function createTest(input, draft) {
  const response = await telnyxRequest({
    ...input,
    body: draft,
    method: "POST",
    path: "/v2/ai/assistants/tests",
  });
  const created = responseData(response);
  if (!isOpaqueId(created?.test_id ?? "")) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test ID.");
  }
  return created;
}

async function runTest(input, test, versionId) {
  let run = responseData(await telnyxRequest({
    ...input,
    body: { destination_version_id: versionId },
    method: "POST",
    path: `/v2/ai/assistants/tests/${encodeURIComponent(test.test_id)}/runs`,
  }));
  if (typeof run?.run_id !== "string" || !run.run_id) {
    throw new VerificationError("Telnyx returned an invalid Assistant Test run ID.");
  }

  const deadline = Date.now() + input.timing.pollTimeoutMs;
  while (!TERMINAL_STATUSES.has(run.status)) {
    if (Date.now() >= deadline) {
      throw new VerificationError("The Assistant Test did not finish within five minutes.");
    }
    await input.sleep(input.timing.pollDelayMs);
    run = responseData(await telnyxRequest({
      ...input,
      path: `/v2/ai/assistants/tests/${encodeURIComponent(test.test_id)}/runs/${encodeURIComponent(run.run_id)}`,
    }));
  }
  return run;
}

function correctedMainConfiguration(mainAssistant, config) {
  if (mainAssistant?.id !== config.mainAssistantId
    || mainAssistant.name !== "Controlled dental scheduling trial") {
    throw new VerificationError("Telnyx returned a different main assistant.");
  }
  if (mainAssistant.privacy_settings?.data_retention !== false) {
    throw new VerificationError("The main assistant retention baseline is not disabled.");
  }
  if (config.testToolToken.length < 32
    || /replace|placeholder/i.test(config.testToolToken)) {
    throw new ValidationError("VOICE_ASSISTANT_TEST_TOOL_TOKEN is missing.");
  }
  const tools = Array.isArray(mainAssistant.tools) ? mainAssistant.tools : [];
  const webhookNames = tools
    .filter((tool) => tool?.type === "webhook")
    .map((tool) => tool?.webhook?.name)
    .sort();
  if (tools.length !== 9
    || tools.filter((tool) => tool?.type === "hangup").length !== 1
    || JSON.stringify(webhookNames) !== JSON.stringify([...SCHEDULING_TOOL_NAMES].sort())) {
    throw new VerificationError("The main assistant tool set differs from the trial.");
  }
  const instructions = String(mainAssistant.instructions ?? "").replaceAll(
    "record_identity_result",
    "record_identity",
  );
  if (!instructions.includes("call record_identity.")) {
    throw new VerificationError("The corrected main instructions lack record_identity.");
  }
  const originalDynamicVariables = { ...(mainAssistant.dynamic_variables ?? {}) };
  const probeDynamicVariables = {
    ...originalDynamicVariables,
    tool_token: config.testToolToken,
  };
  return { instructions, originalDynamicVariables, probeDynamicVariables };
}

function verifyMainVersion(assistant, config, retention, instructions) {
  if (assistant?.id !== config.mainAssistantId
    || assistant.name !== "Controlled dental scheduling trial"
    || assistant.privacy_settings?.data_retention !== retention
    || assistant.instructions !== instructions
    || typeof assistant.version_id !== "string"
    || !assistant.version_id) {
    throw new VerificationError("The main assistant retention version could not be verified.");
  }
  return assistant;
}

async function updateMainVersion(input, {
  dynamicVariables,
  instructions,
  retention,
  versionName,
}) {
  const response = await telnyxRequest({
    ...input,
    body: {
      dynamic_variables: dynamicVariables,
      instructions,
      privacy_settings: { data_retention: retention },
      promote_to_main: true,
      version_name: versionName,
    },
    method: "POST",
    path: `/v2/ai/assistants/${encodeURIComponent(input.config.mainAssistantId)}`,
  });
  return verifyMainVersion(
    responseData(response),
    input.config,
    retention,
    instructions,
  );
}

async function deleteProbeConversation(input, conversationId) {
  if (!isConversationId(conversationId)) return;
  await telnyxRequest({
    ...input,
    method: "DELETE",
    path: `/v2/ai/conversations/${encodeURIComponent(conversationId)}`,
  });
}

async function inspectProbeConversation(input, conversationId) {
  if (!isConversationId(conversationId)) {
    throw new VerificationError("The probe conversation ID is invalid.");
  }
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/conversations/${encodeURIComponent(conversationId)}/messages?page[size]=100&page[number]=1`,
  });
  if (!Array.isArray(response?.data)) {
    throw new VerificationError("Telnyx returned invalid probe messages.");
  }
  const toolNames = response.data.flatMap((message) => (
    Array.isArray(message?.tool_calls)
      ? message.tool_calls.map((call) => (
        call?.function?.name ?? call?.name ?? "unknown"
      ))
      : []
  ));
  return {
    messageCount: response.data.length,
    roles: response.data.map((message) => message?.role ?? "unknown"),
    toolNames,
  };
}

async function findExistingToolProbeTest(input) {
  const response = await telnyxRequest({
    ...input,
    path: `/v2/ai/assistants/tests?test_suite=${encodeURIComponent(TOOL_PROBE_TEST_SUITE)}&page[size]=100`,
  });
  if (!Array.isArray(response?.data)) {
    throw new VerificationError("Telnyx returned an invalid safety-test list.");
  }
  const matches = response.data.filter((test) => test?.name === TOOL_PROBE_TEST_NAME);
  if (matches.length !== 1 || !isOpaqueId(matches[0]?.test_id ?? "")) {
    throw new VerificationError("Expected one existing identity-confirmed safety test.");
  }
  return matches[0];
}

async function runMainRetentionProbe(input, write, { toolProbe = false } = {}) {
  let baseline;
  let configuration;
  let probeWriteAttempted = false;
  let run;
  let resultCode = 1;
  try {
    const response = await telnyxRequest({
      ...input,
      path: `/v2/ai/assistants/${encodeURIComponent(input.config.mainAssistantId)}`,
    });
    baseline = responseData(response);
    configuration = correctedMainConfiguration(baseline, input.config);
    probeWriteAttempted = true;
    const probe = await updateMainVersion(input, {
      dynamicVariables: configuration.probeDynamicVariables,
      instructions: configuration.instructions,
      retention: true,
      versionName: "Main fictional retention probe",
    });
    if (probe.version_id === baseline.version_id) {
      throw new VerificationError("The main retention probe version did not change.");
    }
    write(`Temporary retained main version: ${probe.version_id}.`);

    let test;
    if (toolProbe) {
      test = await findExistingToolProbeTest(input);
      write("Reused the existing identity-confirmed safety test.");
    } else {
      const draft = testDraft(input.config.mainAssistantId, {
        name: MAIN_PROBE_TEST_NAME,
        suite: MAIN_PROBE_TEST_SUITE,
      });
      test = await findTest(input, draft);
      if (!test) {
        test = await createTest(input, draft);
        write("Created one main retention probe test.");
      } else {
        write("Reused the exact main retention probe test.");
      }
    }
    run = await runTest(input, test, probe.version_id);
    const criteriaCount = Array.isArray(run.detail_status)
      ? run.detail_status.length
      : 0;
    const initialized = Boolean(run.conversation_id)
      || criteriaCount > 0
      || run.status === "passed"
      || run.status === "failed";
    write(`Main probe status: ${run.status}.`);
    write(`Conversation created: ${run.conversation_id ? "yes" : "no"}.`);
    write(`Rubric results: ${criteriaCount}.`);
    if (run.conversation_id) {
      const inspection = await inspectProbeConversation(input, run.conversation_id);
      write(`Conversation messages: ${inspection.messageCount}.`);
      write(`Message roles: ${inspection.roles.join(",")}.`);
      write(`Tool calls: ${inspection.toolNames.length}.`);
      write(`Tool names: ${inspection.toolNames.join(",") || "none"}.`);
    }
    resultCode = initialized ? 0 : 1;
  } catch (error) {
    resultCode = exitForError(error, write);
  } finally {
    if (run?.conversation_id) {
      try {
        await deleteProbeConversation(input, run.conversation_id);
        write("Probe conversation deleted.");
      } catch (error) {
        write("Probe conversation cleanup failed.");
        resultCode = resultCode || exitForError(error, write);
      }
    }
    if (probeWriteAttempted && configuration) {
      try {
        const restored = await updateMainVersion(input, {
          dynamicVariables: configuration.originalDynamicVariables,
          instructions: configuration.instructions,
          retention: false,
          versionName: "Restore disabled retention after fictional probe",
        });
        write(`Restored disabled-retention version: ${restored.version_id}.`);
      } catch (error) {
        write("Main assistant retention restoration failed.");
        resultCode = exitForError(error, write);
      }
    }
  }
  return resultCode;
}

function exitForError(error, write) {
  if (error instanceof TelnyxHttpError) {
    write(`Telnyx request failed. Status: ${error.status}. Code: ${error.code}.`);
    if (error.title) write(`Title: ${error.title}.`);
    if (error.detail) write(`Detail: ${error.detail}.`);
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
  write("Telnyx private-runner check failed without a safe diagnostic.");
  return 1;
}

export async function runCommand({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
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
  try {
    config = getConfiguration(env);
  } catch (error) {
    return exitForError(error, write);
  }
  if (command === "--dry-run") {
    write("Main and retained assistant guards passed.");
    write("Dry run passed. No network request was made.");
    return 0;
  }

  const input = { config, fetchImpl, sleep, timing };
  if (command === "--confirm-main-retention-probe"
    || command === "--confirm-main-tool-probe") {
    return runMainRetentionProbe(input, write, {
      toolProbe: command === "--confirm-main-tool-probe",
    });
  }
  try {
    const assistant = await readAssistant(input);
    const draft = testDraft(config.isolatedAssistantId);
    let test = await findTest(input, draft);
    write(`Retained assistant version: ${assistant.version_id}.`);
    write(`Private-runner test: ${test ? "present" : "absent"}.`);
    if (command === "--verify") {
      write("Verification passed. No resource changed and no inference ran.");
      return 0;
    }
    if (!test) {
      test = await createTest(input, draft);
      write("Created one private-runner Assistant Test.");
    } else {
      write("Reused the exact private-runner Assistant Test.");
    }
    const run = await runTest(input, test, assistant.version_id);
    const criteriaCount = Array.isArray(run.detail_status)
      ? run.detail_status.length
      : 0;
    write(`Assistant Test status: ${run.status}.`);
    write(`Conversation created: ${run.conversation_id ? "yes" : "no"}.`);
    write(`Rubric results: ${criteriaCount}.`);
    return run.status === "passed" ? 0 : 1;
  } catch (error) {
    return exitForError(error, write);
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  process.exitCode = await runCommand({ args: process.argv.slice(2) });
}
