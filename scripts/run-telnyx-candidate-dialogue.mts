import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createVoiceCallContext } from "../src/lib/voice-call-context";
import { voiceScenarioCorpus } from "../src/voice-experiment/scenario-harness";
import { createTelnyxAssistantDraft, telnyxCallTimeVariables } from "../src/voice-experiment/telnyx-candidate";
import {
  TelnyxCandidateApiError,
  createTelnyxCandidateClient,
} from "../src/voice-experiment/telnyx-candidate-client";
import { loadTelnyxCandidateConfig } from "../src/voice-experiment/telnyx-candidate-config";
import { telnyxAssistantConfigurationMatches } from "../src/voice-experiment/telnyx-candidate-preflight";
import {
  TELNYX_DIALOGUE_TEST_SUITE,
  createTelnyxDialogueTestDrafts,
  evaluateTelnyxDialogueRun,
  sameTelnyxDialogueTest,
  telnyxDialogueTestApiBody,
} from "../src/voice-experiment/telnyx-dialogue-qualification";

const terminalStatuses = new Set(["completed", "error", "failed", "passed", "timeout"]);

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function qualificationAssistantMatches(
  assistant: Record<string, unknown>,
  draft: ReturnType<typeof createTelnyxAssistantDraft>,
) {
  return telnyxAssistantConfigurationMatches(assistant, draft)
    && sameJson(assistant.dynamic_variables, draft.dynamic_variables);
}

async function currentPublicBaseUrl() {
  const response = await fetch("http://127.0.0.1:4040/api/tunnels", {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("The ngrok inspector is unavailable.");
  const body = await response.json() as {
    tunnels?: Array<{ config?: { addr?: string }; public_url?: string }>;
  };
  const tunnel = body.tunnels?.find((entry) => (
    entry.public_url?.startsWith("https://") && /:3001$/.test(entry.config?.addr ?? "")
  ));
  return required(tunnel?.public_url, "Current ngrok URL");
}

async function localRequest(
  config: ReturnType<typeof loadTelnyxCandidateConfig>,
  path: string,
  init?: RequestInit,
) {
  const base = (process.env.VOICE_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-voice-gateway-secret": config.internalSecret,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status === 404 && path === "/internal/qualification-session" && init?.method === "POST") {
      throw new Error("Managed dialogue tests require the Telnyx gateway to run with VOICE_ASSISTANT_TEST_MODE=true and VOICE_ASSISTANT_TEST_TOOL_TOKEN configured. No hosted update has been requested during readiness validation.");
    }
    throw new Error(`Local qualification request failed with ${response.status}.`);
  }
  if (response.status === 204) return undefined;
  return response.json() as Promise<Record<string, unknown>>;
}

async function pollRun(options: {
  client: ReturnType<typeof createTelnyxCandidateClient>;
  runId: string;
  testId: string;
}) {
  async function readRun() {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await options.client.getAssistantTestRun(options.testId, options.runId);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof TelnyxCandidateApiError
          && (error.status === 429 || error.status >= 500);
        if (!retryable || attempt === 5) throw error;
        await new Promise((resolveSleep) => setTimeout(resolveSleep, attempt * 1_000));
      }
    }
    throw lastError;
  }
  const deadline = Date.now() + 5 * 60_000;
  let run = await readRun();
  while (!terminalStatuses.has(String(run.status))) {
    if (Date.now() >= deadline) throw new Error("A Telnyx Assistant Test exceeded five minutes.");
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 2_000));
    run = await readRun();
  }
  return run;
}

async function retryProviderRead<T>(read: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof TelnyxCandidateApiError
        && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt === 5) throw error;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, attempt * 1_000));
    }
  }
  throw lastError;
}

function idempotencyKey(versionId: string, testId: string) {
  return `willow-dialogue-${createHash("sha256").update(`${versionId}:${testId}`).digest("hex").slice(0, 32)}`;
}

function conversationToolCalls(messages: Array<Record<string, unknown>>) {
  return messages.flatMap((message) => {
    if (!Array.isArray(message.tool_calls)) return [];
    return message.tool_calls.flatMap((rawCall) => {
      if (!rawCall || typeof rawCall !== "object") return [];
      const call = rawCall as Record<string, unknown>;
      const functionValue = call.function && typeof call.function === "object"
        ? call.function as Record<string, unknown>
        : call;
      if (typeof functionValue.name !== "string") return [];
      let operationId: string | undefined;
      if (typeof functionValue.arguments === "string") {
        try {
          const parsed = JSON.parse(functionValue.arguments) as Record<string, unknown>;
          if (typeof parsed.operationId === "string") operationId = parsed.operationId;
        } catch {
          // Retain the tool name even when the provider stores malformed arguments.
        }
      }
      return [{ name: functionValue.name, operationId }];
    });
  });
}

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Use --apply to create an isolated fictional qualification assistant and run the Telnyx web-chat corpus. Use --limit=1 for calibration.");
    return;
  }
  const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
  const startArgument = process.argv.find((argument) => argument.startsWith("--start="));
  const casesArgument = process.argv.find((argument) => argument.startsWith("--cases="));
  const isolatedArgument = process.argv.find((argument) => argument.startsWith("--qualification-assistant="));
  const isolatedAssistantId = isolatedArgument?.slice("--qualification-assistant=".length);
  const runLimit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : voiceScenarioCorpus.length;
  const startCase = startArgument ? Number(startArgument.slice("--start=".length)) : 1;
  if (!Number.isInteger(runLimit) || runLimit < 1 || runLimit > voiceScenarioCorpus.length) {
    throw new Error(`--limit must be an integer from 1 through ${voiceScenarioCorpus.length}.`);
  }
  if (!Number.isInteger(startCase) || startCase < 1 || startCase > voiceScenarioCorpus.length) {
    throw new Error(`--start must be an integer from 1 through ${voiceScenarioCorpus.length}.`);
  }
  const caseNumbers = casesArgument
    ? casesArgument.slice("--cases=".length).split(",").map(Number)
    : undefined;
  if (caseNumbers && (
    caseNumbers.length === 0
    || caseNumbers.some((value) => !Number.isInteger(value) || value < 1 || value > voiceScenarioCorpus.length)
    || new Set(caseNumbers).size !== caseNumbers.length
  )) {
    throw new Error(`--cases must contain unique numbers from 1 through ${voiceScenarioCorpus.length}.`);
  }
  const publicBaseUrl = await currentPublicBaseUrl();
  const config = loadTelnyxCandidateConfig({
    ...process.env,
    VOICE_ASSISTANT_TEST_MODE: "true",
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
    VOICE_RUNTIME: "telnyx-candidate",
  });
  const testToolToken = required(config.testToolToken, "VOICE_ASSISTANT_TEST_TOOL_TOKEN");
  const client = createTelnyxCandidateClient({ apiKey: config.apiKey });
  const context = createVoiceCallContext(new Date());
  // Validate the local test route before changing any hosted assistant settings.
  await localRequest(config, "/internal/qualification-session", {
    body: JSON.stringify({ callContext: context, scenarioId: "qualification-readiness" }),
    method: "POST",
  });
  const assistantDraft = createTelnyxAssistantDraft({
    dataRetentionEnabled: true,
    defaultDynamicVariables: {
      ...telnyxCallTimeVariables(context),
      attempt_id: "managed-web-chat-test",
      clinic_name: context.clinicName,
      patient_name: context.patientName,
      tool_token: testToolToken,
    },
    publicBaseUrl,
  });
  // Chat does not resolve greeting/instruction templates like the voice start command.
  // Render only this fictional fixture, while webhook headers keep their normal templates.
  for (const [key, value] of Object.entries(assistantDraft.dynamic_variables ?? {})) {
    assistantDraft.instructions = assistantDraft.instructions.replaceAll(`{{${key}}}`, value);
    assistantDraft.greeting = assistantDraft.greeting.replaceAll(`{{${key}}}`, value);
  }
  if (isolatedAssistantId === config.assistantId) {
    throw new Error("Use a separate qualification assistant. Tests must not change live-call retention or tool tokens.");
  }
  const existingAssistant = isolatedAssistantId ? await client.getAssistant(isolatedAssistantId) : undefined;
  if (existingAssistant && !String(existingAssistant.name).startsWith("Willow isolated fictional")) {
    throw new Error("The selected assistant is not an isolated fictional qualification assistant.");
  }
  const assistant = existingAssistant
    ? qualificationAssistantMatches(existingAssistant, assistantDraft) ? existingAssistant
      : await client.updateAssistant(isolatedAssistantId!, { ...assistantDraft, name: "Willow isolated fictional dialogue qualification", promote_to_main: true, version_name: "Fictional dialogue qualification" })
    : await client.createAssistant({ ...assistantDraft, name: "Willow isolated fictional dialogue qualification" });
  const qualificationAssistantId = required(assistant.id as string | undefined, "Qualification assistant ID");
  const qualificationSuite = `${TELNYX_DIALOGUE_TEST_SUITE}-isolated`;
  console.log(`Qualification assistant: ${qualificationAssistantId}. Live phone assistant unchanged.`);
  const versionId = required(assistant.version_id as string | undefined, "Assistant version ID");
  console.log(`Qualification assistant version: ${versionId}.`);

  const drafts = createTelnyxDialogueTestDrafts(qualificationAssistantId).map((draft) => ({ ...draft, test_suite: qualificationSuite }));
  const existingTests = await client.listAssistantTests(qualificationSuite);
  const tests: Array<{ draft: typeof drafts[number]; testId: string }> = [];
  for (const draft of drafts) {
    const matches = existingTests.filter((entry) => entry.name === draft.name);
    if (matches.length > 1) throw new Error(`Assistant Test name is not unique: ${draft.name}.`);
    let providerTest = matches[0];
    if (providerTest && !sameTelnyxDialogueTest(providerTest, draft)) {
      providerTest = await client.updateAssistantTest(
        required(providerTest.test_id as string | undefined, "Assistant Test ID"),
        telnyxDialogueTestApiBody(draft),
      );
    }
    providerTest ??= await client.createAssistantTest(telnyxDialogueTestApiBody(draft));
    tests.push({
      draft,
      testId: required(providerTest.test_id as string | undefined, "Assistant Test ID"),
    });
  }
  console.log(`Prepared ${tests.length} Assistant Tests.`);
  if (process.argv.includes("--sync-only")) {
    console.log("Assistant and test definitions synced. No Assistant Test run started.");
    console.log(`ASSISTANT_VERSION_ID=${versionId}`);
    return;
  }

  const results: Array<Record<string, unknown>> = [];
  const selectedTests = caseNumbers
    ? caseNumbers.map((caseNumber) => tests[caseNumber - 1]!)
    : tests.slice(startCase - 1, startCase - 1 + runLimit);
  for (const [index, item] of selectedTests.entries()) {
    const scenario = voiceScenarioCorpus.find((entry) => entry.id === item.draft.scenarioId);
    if (!scenario) throw new Error(`Scenario is missing: ${item.draft.scenarioId}.`);
    await localRequest(config, "/internal/qualification-session", {
      body: JSON.stringify({ callContext: context, scenarioId: scenario.id }),
      method: "POST",
    });
    const started = await client.triggerAssistantTest({
      idempotencyKey: idempotencyKey(versionId, item.testId),
      testId: item.testId,
      versionId,
    });
    const runId = required(started.run_id as string | undefined, "Assistant Test run ID");
    const run = await pollRun({ client, runId, testId: item.testId });
    const session = await localRequest(config, "/internal/qualification-session");
    const conversationId = typeof run.conversation_id === "string" ? run.conversation_id : undefined;
    const messages = conversationId
      ? (await retryProviderRead(() => client.listConversationMessages(conversationId))).reverse()
      : [];
    const gatewayToolCalls = Array.isArray(session?.toolCalls)
      ? session.toolCalls.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      : [];
    const toolCalls = conversationToolCalls(messages);
    const evaluation = evaluateTelnyxDialogueRun({
      providerStatus: String(run.status),
      scenario,
      toolCalls,
    });
    results.push({
      conversationId: conversationId ?? null,
      detailStatus: run.detail_status ?? [],
      evaluation,
      logs: run.logs ?? null,
      messages,
      outcome: session?.outcome ?? null,
      providerStatus: run.status,
      result: session?.result ?? null,
      runId,
      scenarioId: scenario.id,
      testId: item.testId,
      gatewayToolCalls,
      toolCalls,
    });
    console.log(`[${index + 1}/${selectedTests.length}] ${scenario.id}: ${String(run.status)}; tool sequence ${evaluation.toolSequencePassed ? "passed" : "failed"}.`);
  }

  const counts = results.reduce<{
    providerPassed: number;
    qualified: number;
    toolSequencePassed: number;
  }>((summary, result) => {
    const evaluation = result.evaluation as { passed: boolean; providerPassed: boolean; toolSequencePassed: boolean };
    if (evaluation.providerPassed) summary.providerPassed += 1;
    if (evaluation.toolSequencePassed) summary.toolSequencePassed += 1;
    if (evaluation.passed) summary.qualified += 1;
    return summary;
  }, { providerPassed: 0, qualified: 0, toolSequencePassed: 0 });
  await mkdir(resolve(".voice-artifacts/qualification"), { recursive: true });
  const caseLabel = caseNumbers?.join("-") ?? `${startCase}-${startCase + results.length - 1}`;
  const artifactsFile = resolve(
    `.voice-artifacts/qualification/telnyx-managed-dialogue-${versionId}-cases-${caseLabel}.json`,
  );
  await writeFile(artifactsFile, `${JSON.stringify({
    assistantId: qualificationAssistantId,
    assistantVersionId: versionId,
    channel: "web_chat",
    completedAt: new Date().toISOString(),
    counts,
    publicBaseUrl,
    results,
    suite: qualificationSuite,
  }, null, 2)}\n`);
  console.log(`Qualification result: ${counts.qualified}/${results.length}.`);
  console.log(`Evidence: ${artifactsFile}.`);
  console.log(`ASSISTANT_VERSION_ID=${versionId}`);
  if (counts.qualified !== results.length) process.exitCode = 1;
}

await main();
