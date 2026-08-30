import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  createTelnyxAssistantDraft,
  createTelnyxAssistantToolDrafts,
} from "../src/voice-gateway/telnyx-assistant-definition";
import { telnyxAssistantTestSuiteName } from "../src/voice-gateway/telnyx-assistant-test-definition";

const apiBaseUrl = "https://api.telnyx.com/v2";
const diagnosticTestName = "Dental scheduling safety | identity-confirmed";
const metadataPath = "docs/telnyx-ai-assistant-trial-metadata.json";
const terminalStatuses = new Set(["passed", "failed", "error"]);
const toolDisplayPrefix = "Dental scheduling trial | ";
const sensitiveValues = new Set<string>();

type JsonObject = Record<string, unknown>;
type DiagnosticRecord = JsonObject & {
  completedAt?: string | null;
  dataRetention: boolean;
  runId?: string | null;
  status?: string;
  versionId: string;
  versionName: string;
};
type TestRun = {
  completed_at?: string;
  conversation_id?: string;
  detail_status?: Array<{ name: string; status: string }>;
  logs?: string;
  run_id: string;
  status: string;
  test_id: string;
};

function required(value: string | undefined, name: string) {
  if (!value || /^(?:replace|missing|placeholder|your[_-])/i.test(value)) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function asObject(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value as JsonObject;
}

function safeErrorBody(body: JsonObject) {
  if (!Array.isArray(body.errors)) return { error: "unexpected_response" };
  return body.errors.map((entry) => {
    const item = asObject(entry, "Telnyx error");
    return { code: item.code, detail: item.detail, title: item.title };
  });
}

function sanitizedMessage(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of sensitiveValues) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}

async function telnyxRequest<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as JsonObject : {};
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed with ${response.status}: ${JSON.stringify(safeErrorBody(body))}`,
    );
  }
  return body as T;
}

async function retryTelnyxRead<T>(apiKey: string, path: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await telnyxRequest<T>(apiKey, path);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/failed with (?:429|5\d\d):/.test(message) || attempt === 5) throw error;
      await sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

async function readEnvFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function envValue(source: string, name: string) {
  const line = source.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function updateEnvFile(path: string, values: Record<string, string>) {
  const source = await readEnvFile(path);
  const pending = new Map(Object.entries(values));
  const lines = source.split(/\r?\n/).map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) return line;
    const name = line.slice(0, separator);
    const value = pending.get(name);
    if (value === undefined) return line;
    pending.delete(name);
    return `${name}=${value}`;
  });
  while (lines.at(-1) === "") lines.pop();
  for (const [name, value] of pending) lines.push(`${name}=${value}`);
  await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}

async function writeMetadata(metadata: JsonObject) {
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function diagnosticRecords(batch: JsonObject) {
  if (!Array.isArray(batch.runs)) batch.runs = [];
  const records = batch.runs as DiagnosticRecord[];
  if (records.length > 2) {
    throw new Error("The approved diagnostic limit of two runs was already exceeded.");
  }
  return records;
}

function toolMetadata(metadata: JsonObject) {
  if (!Array.isArray(metadata.tools)) throw new Error("Trial tool metadata is invalid.");
  const tools = metadata.tools.map((entry) => asObject(entry, "Trial tool metadata"));
  const schedulingTools = tools.filter((tool) => tool.name !== "hangup");
  const hangupTools = tools.filter((tool) => tool.name === "hangup");
  if (schedulingTools.length !== 8 || hangupTools.length !== 1) {
    throw new Error("Expected eight scheduling tools and one Hangup tool in metadata.");
  }
  return { hangup: hangupTools[0]!, scheduling: schedulingTools };
}

async function updateSchedulingTools(input: {
  apiKey: string;
  integrationSecretIdentifier: string;
  metadata: JsonObject;
  publicBaseUrl: string;
}) {
  const recorded = toolMetadata(input.metadata).scheduling;
  const drafts = createTelnyxAssistantToolDrafts({
    integrationSecretIdentifier: input.integrationSecretIdentifier,
    publicBaseUrl: input.publicBaseUrl,
  }).map((draft) => ({
    ...draft,
    display_name: `${toolDisplayPrefix}${draft.display_name}`,
  }));
  const byName = new Map(recorded.map((tool) => [tool.name as string, tool]));

  for (const draft of drafts) {
    const stored = byName.get(draft.webhook.name);
    if (!stored
      || stored.displayName !== draft.display_name
      || typeof stored.id !== "string") {
      throw new Error(`Recorded tool identity differs: ${draft.display_name}`);
    }
    const toolPath = `/ai/tools/${encodeURIComponent(stored.id)}`;
    const current = await retryTelnyxRead<{
      display_name?: string;
      id: string;
      type: string;
    }>(input.apiKey, toolPath);
    if (current.id !== stored.id
      || current.type !== "webhook"
      || current.display_name !== stored.displayName) {
      throw new Error(`Remote tool identity differs: ${draft.display_name}`);
    }
    const updated = await telnyxRequest<{
      display_name?: string;
      id: string;
      tool_definition?: JsonObject;
      type: string;
    }>(input.apiKey, toolPath, {
      body: JSON.stringify(draft),
      method: "PATCH",
    });
    if (updated.id !== stored.id
      || updated.type !== "webhook"
      || updated.display_name !== draft.display_name
      || !JSON.stringify(updated.tool_definition).includes(draft.webhook.url)) {
      throw new Error(`Remote tool update could not be verified: ${draft.display_name}`);
    }
  }
  console.log("Updated and verified eight isolated webhook tools.");
}

async function createDiagnosticVersion(input: {
  apiKey: string;
  assistantId: string;
  dataRetention: boolean;
  hangupToolId: string;
  llmApiKeyRef?: string;
  metadata: JsonObject;
  model: string;
  records: DiagnosticRecord[];
  testToolToken: string;
  toolIds: string[];
  versionName: string;
  voice: string;
}) {
  const existing = input.records.find((record) => (
    record.dataRetention === input.dataRetention
  ));
  if (existing) return existing;
  if (input.records.length >= 2) {
    throw new Error("The approved diagnostic limit of two versions was reached.");
  }

  const baseDraft = createTelnyxAssistantDraft({
    hangupToolId: input.hangupToolId,
    llmApiKeyRef: input.llmApiKeyRef,
    model: input.model,
    toolIds: input.toolIds,
    voice: input.voice,
  });
  const created = await telnyxRequest<{ version_id?: string }>(
    input.apiKey,
    `/ai/assistants/${encodeURIComponent(input.assistantId)}`,
    {
      body: JSON.stringify({
        ...baseDraft,
        dynamic_variables: {
          ...baseDraft.dynamic_variables,
          tool_token: input.testToolToken,
        },
        privacy_settings: { data_retention: input.dataRetention },
        promote_to_main: false,
        version_name: input.versionName,
      }),
      method: "POST",
    },
  );
  const versionId = required(created.version_id, "diagnostic version ID");
  const record: DiagnosticRecord = {
    completedAt: null,
    createdAt: new Date().toISOString(),
    dataRetention: input.dataRetention,
    runId: null,
    status: "version_created",
    versionId,
    versionName: input.versionName,
  };
  input.records.push(record);
  await writeMetadata(input.metadata);
  console.log(`Created non-main diagnostic version: ${input.versionName}.`);
  return record;
}

function summarizeRun(run: TestRun) {
  const criteriaCount = run.detail_status?.length ?? 0;
  const initializationSucceeded = Boolean(run.conversation_id)
    || criteriaCount > 0
    || run.status === "passed"
    || run.status === "failed";
  const logs = run.logs ?? "";
  return {
    completedAt: run.completed_at ?? new Date().toISOString(),
    conversationCreated: Boolean(run.conversation_id),
    conversationId: run.conversation_id ?? null,
    criteriaCount,
    initializationError: !initializationSucceeded && /400/.test(logs)
      && /assistant|conversation/i.test(logs)
      ? "assistant_conversation_http_400"
      : null,
    initializationSucceeded,
    status: run.status,
  };
}

async function executeDiagnosticRun(input: {
  apiKey: string;
  metadata: JsonObject;
  record: DiagnosticRecord;
  testId: string;
}) {
  if (input.record.completedAt && terminalStatuses.has(input.record.status ?? "")) {
    return input.record;
  }

  let run: TestRun;
  if (input.record.runId) {
    run = await retryTelnyxRead<TestRun>(
      input.apiKey,
      `/ai/assistants/tests/${encodeURIComponent(input.testId)}/runs/${encodeURIComponent(input.record.runId)}`,
    );
  } else {
    run = await telnyxRequest<TestRun>(
      input.apiKey,
      `/ai/assistants/tests/${encodeURIComponent(input.testId)}/runs`,
      {
        body: JSON.stringify({ destination_version_id: input.record.versionId }),
        method: "POST",
      },
    );
    input.record.runId = run.run_id;
    input.record.startedAt = new Date().toISOString();
    input.record.status = run.status;
    await writeMetadata(input.metadata);
    console.log(`Started one ${diagnosticTestName} run.`);
  }

  const deadline = Date.now() + 20 * 60 * 1_000;
  while (!terminalStatuses.has(run.status) && Date.now() < deadline) {
    await sleep(5_000);
    run = await retryTelnyxRead<TestRun>(
      input.apiKey,
      `/ai/assistants/tests/${encodeURIComponent(input.testId)}/runs/${encodeURIComponent(run.run_id)}`,
    );
  }
  if (!terminalStatuses.has(run.status)) {
    input.record.status = run.status;
    input.record.pollingStoppedAt = new Date().toISOString();
    await writeMetadata(input.metadata);
    throw new Error("The diagnostic run did not finish within 20 minutes.");
  }

  Object.assign(input.record, summarizeRun(run));
  await writeMetadata(input.metadata);
  console.log(
    `Diagnostic result: status=${input.record.status}, initializationSucceeded=${String(input.record.initializationSucceeded)}.`,
  );
  return input.record;
}

async function main() {
  const apiKey = required(process.env.TELNYX_API_KEY, "TELNYX_API_KEY");
  sensitiveValues.add(apiKey);
  const publicBaseUrl = required(
    argument("--public-base-url") ?? process.env.VOICE_GATEWAY_PUBLIC_BASE_URL,
    "VOICE_GATEWAY_PUBLIC_BASE_URL",
  ).replace(/\/$/, "");
  if (new URL(publicBaseUrl).protocol !== "https:") {
    throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS.");
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as JsonObject;
  const assistant = asObject(metadata.assistant, "Assistant metadata");
  const assistantId = required(assistant.id as string | undefined, "assistant ID");
  const mainVersionId = required(assistant.versionId as string | undefined, "main version ID");
  const model = required(assistant.model as string | undefined, "assistant model");
  const llmApiKeyRef = typeof assistant.llmApiKeyRef === "string"
    ? assistant.llmApiKeyRef
    : undefined;
  const voice = required(assistant.voice as string | undefined, "assistant voice");
  const integrationSecret = asObject(metadata.integrationSecret, "Integration secret metadata");
  const integrationSecretIdentifier = required(
    integrationSecret.identifier as string | undefined,
    "integration secret identifier",
  );
  const { hangup, scheduling } = toolMetadata(metadata);
  const toolIds = scheduling.map((tool) => required(tool.id as string | undefined, "tool ID"));
  const hangupToolId = required(hangup.id as string | undefined, "Hangup tool ID");

  const localEnv = await readEnvFile(".env.local");
  const testToolToken = envValue(localEnv, "VOICE_ASSISTANT_TEST_TOOL_TOKEN")
    ?? `diag_${randomBytes(32).toString("base64url")}`;
  sensitiveValues.add(testToolToken);
  await updateEnvFile(".env.local", {
    VOICE_ASSISTANT_TEST_TOOL_TOKEN: testToolToken,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });
  await updateEnvFile(".voice-preflight.env", {
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });

  let batch: JsonObject;
  if (metadata.diagnosticBatch) {
    batch = asObject(metadata.diagnosticBatch, "Diagnostic batch metadata");
    if (batch.publicBaseUrl !== publicBaseUrl) {
      throw new Error("The diagnostic batch already uses a different public URL.");
    }
  } else {
    batch = {
      approvedScope: "Two web_chat runs. No phone calls or traffic changes.",
      mainVersionId,
      publicBaseUrl,
      runs: [],
      startedAt: new Date().toISOString(),
      testName: diagnosticTestName,
    };
    metadata.diagnosticBatch = batch;
    await writeMetadata(metadata);
  }
  const records = diagnosticRecords(batch);

  await updateSchedulingTools({
    apiKey,
    integrationSecretIdentifier,
    metadata,
    publicBaseUrl,
  });
  metadata.publicBaseUrl = publicBaseUrl;
  batch.toolsUpdatedAt = new Date().toISOString();
  await writeMetadata(metadata);

  const testList = await retryTelnyxRead<{ data: JsonObject[] }>(
    apiKey,
    `/ai/assistants/tests?test_suite=${encodeURIComponent(telnyxAssistantTestSuiteName)}&page[size]=100`,
  );
  const tests = testList.data.filter((test) => test.name === diagnosticTestName);
  if (tests.length !== 1) throw new Error("Expected one identity-confirmed Assistant Test.");
  const testId = required(tests[0]!.test_id as string | undefined, "test ID");

  const first = await createDiagnosticVersion({
    apiKey,
    assistantId,
    dataRetention: false,
    hangupToolId,
    llmApiKeyRef,
    metadata,
    model,
    records,
    testToolToken,
    toolIds,
    versionName: "Diag default tool token",
    voice,
  });
  const firstResult = await executeDiagnosticRun({ apiKey, metadata, record: first, testId });
  if (firstResult.initializationSucceeded === true) {
    batch.completedAt = new Date().toISOString();
    batch.outcome = "default_tool_token_initialized";
    await writeMetadata(metadata);
    console.log("Stopped after the first run. Data retention remains disabled.");
    return;
  }

  const second = await createDiagnosticVersion({
    apiKey,
    assistantId,
    dataRetention: true,
    hangupToolId,
    llmApiKeyRef,
    metadata,
    model,
    records,
    testToolToken,
    toolIds,
    versionName: "Diag retained fictional data",
    voice,
  });
  const secondResult = await executeDiagnosticRun({ apiKey, metadata, record: second, testId });
  batch.completedAt = new Date().toISOString();
  batch.outcome = secondResult.initializationSucceeded === true
    ? "retention_initialized"
    : "both_initialization_checks_failed";
  await writeMetadata(metadata);
  console.log("Stopped after the second approved run.");
}

main().catch((error) => {
  for (const value of [
    process.env.TELNYX_API_KEY ?? "",
    process.env.VOICE_ASSISTANT_TOOL_SECRET ?? "",
    process.env.VOICE_ASSISTANT_TEST_TOOL_TOKEN ?? "",
    process.env.CALL_TO_NUMBER ?? "",
    process.env.TELNYX_PHONE_NUMBER ?? "",
  ]) {
    if (value) sensitiveValues.add(value);
  }
  console.error(sanitizedMessage(error));
  process.exitCode = 1;
});
