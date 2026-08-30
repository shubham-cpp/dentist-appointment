import { readFile, writeFile } from "node:fs/promises";
import {
  createTelnyxAssistantTestDrafts,
  telnyxAssistantTestSuiteName,
} from "../src/voice-gateway/telnyx-assistant-test-definition";

const apiBaseUrl = "https://api.telnyx.com/v2";
const metadataPath = "docs/telnyx-ai-assistant-trial-metadata.json";
const terminalStatuses = new Set(["passed", "failed", "error"]);

type JsonObject = Record<string, unknown>;
type TestRun = {
  detail_status?: Array<{ name: string; status: string }>;
  run_id: string;
  status: string;
  test_id: string;
  test_suite_run_id?: string;
};

function required(value: string | undefined, name: string) {
  if (!value || /^(?:replace|missing|placeholder|your[_-])/i.test(value)) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

function safeErrorBody(body: JsonObject) {
  if (!Array.isArray(body.errors)) return { error: "unexpected_response" };
  return body.errors.map((entry) => {
    const item = entry as JsonObject;
    return { code: item.code, detail: item.detail, title: item.title };
  });
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
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as JsonObject : {};
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}: ${JSON.stringify(safeErrorBody(body))}`);
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

function sameTest(existing: JsonObject, draft: JsonObject) {
  const existingRubric = Array.isArray(existing.rubric) ? existing.rubric as JsonObject[] : [];
  const draftRubric = Array.isArray(draft.rubric) ? draft.rubric as JsonObject[] : [];
  const rubricMatches = existingRubric.length === draftRubric.length
    && existingRubric.every((item, index) => (
      item.name === draftRubric[index]?.name
      && item.criteria === draftRubric[index]?.criteria
    ));
  return existing.destination === draft.destination
    && existing.instructions === draft.instructions
    && existing.telnyx_conversation_channel === draft.telnyx_conversation_channel
    && rubricMatches;
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const apiKey = required(process.env.TELNYX_API_KEY, "TELNYX_API_KEY");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as JsonObject;
  const existingTestRun = metadata.testRun as JsonObject | undefined;
  if (existingTestRun?.completedAt) {
    throw new Error("The approved one-time Assistant Test run already completed.");
  }
  const assistant = metadata.assistant as JsonObject | undefined;
  const assistantId = required(assistant?.id as string | undefined, "assistant ID");
  const versionId = required(assistant?.versionId as string | undefined, "assistant version ID");
  const drafts = createTelnyxAssistantTestDrafts(assistantId);

  const list = await telnyxRequest<{ data: JsonObject[] }>(
    apiKey,
    `/ai/assistants/tests?test_suite=${encodeURIComponent(telnyxAssistantTestSuiteName)}&page[size]=100`,
  );
  const byName = new Map(list.data.map((test) => [test.name as string, test]));
  const testIds: string[] = [];

  for (const draft of drafts) {
    const existing = byName.get(draft.name);
    if (existing) {
      if (!sameTest(existing, draft as unknown as JsonObject)) {
        throw new Error(`Existing Assistant Test differs from its draft: ${draft.name}`);
      }
      testIds.push(required(existing.test_id as string | undefined, "test ID"));
      continue;
    }

    const created = await telnyxRequest<{ test_id: string }>(apiKey, "/ai/assistants/tests", {
      body: JSON.stringify(draft),
      method: "POST",
    });
    testIds.push(created.test_id);
    console.log(`Created Assistant Test: ${draft.name}`);
  }

  if (testIds.length !== drafts.length) {
    throw new Error(`Expected ${drafts.length} tests, but prepared ${testIds.length}.`);
  }

  const startedAt = existingTestRun?.startedAt as string | undefined
    ?? new Date().toISOString();
  let runs: TestRun[];
  if (existingTestRun) {
    const suiteRunId = required(
      existingTestRun.suiteRunId as string | undefined,
      "suite run ID",
    );
    const history = await retryTelnyxRead<{ data: TestRun[] }>(
      apiKey,
      `/ai/assistants/tests/test-suites/${encodeURIComponent(telnyxAssistantTestSuiteName)}/runs?test_suite_run_id=${encodeURIComponent(suiteRunId)}&page[size]=100`,
    );
    runs = history.data;
    console.log(`Resumed status polling for ${runs.length} Assistant Tests.`);
  } else {
    runs = await telnyxRequest<TestRun[]>(
      apiKey,
      `/ai/assistants/tests/test-suites/${encodeURIComponent(telnyxAssistantTestSuiteName)}/runs`,
      { body: JSON.stringify({ destination_version_id: versionId }), method: "POST" },
    );
  }
  if (runs.length !== drafts.length) {
    throw new Error(`Telnyx returned ${runs.length} runs for ${drafts.length} tests.`);
  }

  if (!existingTestRun) {
    metadata.testRun = {
      completedAt: null,
      counts: { pending: runs.length },
      startedAt,
      suite: telnyxAssistantTestSuiteName,
      suiteRunId: runs[0]?.test_suite_run_id ?? null,
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`Started ${runs.length} Assistant Tests once.`);
  }

  const pending = new Map(runs.map((run) => [run.run_id, run]));
  const deadline = Date.now() + 20 * 60 * 1_000;
  while ([...pending.values()].some((run) => !terminalStatuses.has(run.status))) {
    if (Date.now() >= deadline) break;
    await sleep(5_000);
    for (const [runId, run] of pending) {
      if (terminalStatuses.has(run.status)) continue;
      const current = await retryTelnyxRead<TestRun>(
        apiKey,
        `/ai/assistants/tests/${encodeURIComponent(run.test_id)}/runs/${encodeURIComponent(runId)}`,
      );
      pending.set(runId, current);
    }
    const counts = [...pending.values()].reduce<Record<string, number>>((result, run) => {
      result[run.status] = (result[run.status] ?? 0) + 1;
      return result;
    }, {});
    console.log(`Assistant Test status: ${JSON.stringify(counts)}`);
  }

  const finalRuns = [...pending.values()];
  const counts = finalRuns.reduce<Record<string, number>>((result, run) => {
    result[run.status] = (result[run.status] ?? 0) + 1;
    return result;
  }, {});
  const nameByTestId = new Map(testIds.map((id, index) => [id, drafts[index]!.name]));
  metadata.testRun = {
    completedAt: new Date().toISOString(),
    counts,
    results: finalRuns.map((run) => ({
      criteria: run.detail_status ?? [],
      name: nameByTestId.get(run.test_id) ?? run.test_id,
      status: run.status,
    })),
    startedAt,
    suite: telnyxAssistantTestSuiteName,
    suiteRunId: runs[0]?.test_suite_run_id ?? null,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`Final Assistant Test status: ${JSON.stringify(counts)}`);
  if (counts.passed !== drafts.length) process.exitCode = 1;
}

main().catch((error) => {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    process.env.TELNYX_API_KEY ?? "",
    process.env.VOICE_ASSISTANT_TOOL_SECRET ?? "",
    process.env.CALL_TO_NUMBER ?? "",
    process.env.TELNYX_PHONE_NUMBER ?? "",
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  console.error(message);
  process.exitCode = 1;
});
