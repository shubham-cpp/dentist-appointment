import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  createTelnyxAssistantDraft,
  createTelnyxAssistantToolDrafts,
  hasApprovedTelnyxAssistantModel,
  telnyxAssistantMatchesDraft,
  telnyxAssistantLlmSecretIdentifier,
  telnyxAssistantModel,
} from "../src/voice-gateway/telnyx-assistant-definition";

const apiBaseUrl = "https://api.telnyx.com/v2";
const assistantName = "Controlled dental scheduling trial";
const integrationSecretIdentifier = "dentist_voice_assistant_trial_tool_secret";
const metadataPath = "docs/telnyx-ai-assistant-trial-metadata.json";
const model = telnyxAssistantModel;
const toolDisplayPrefix = "Dental scheduling trial | ";
const voice = "Telnyx.Ultra.02a924f6-bb49-4177-8fbb-52238c5056d6";
const sensitiveValues = new Set<string>();

type JsonObject = Record<string, unknown>;

function requireConfirmedCommand(args: string[]) {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  if (commandArgs.length !== 1 || commandArgs[0] !== "--confirm") {
    throw new Error(
      "Use --confirm to create secrets or promote an assistant version. This command never places a call.",
    );
  }
}

function required(value: unknown, name: string) {
  if (typeof value !== "string"
    || !value
    || /^(?:replace|missing|placeholder|your[_-])/i.test(value)) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sanitizedMessage(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}

function usableToolSecret(value: string | undefined) {
  return Boolean(value && value.length >= 32 && !/replace|placeholder/i.test(value));
}

function usableProviderKey(value: string | undefined) {
  return Boolean(value && value.length >= 20 && !/replace|placeholder|missing/i.test(value));
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function responseData(value: unknown) {
  const body = asObject(value);
  return asObject(body.data ?? body);
}

async function readMetadata() {
  const source = await readEnvFile(metadataPath);
  if (!source.trim()) return {};
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The Telnyx assistant metadata is invalid.");
  }
  return parsed as JsonObject;
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
    const errors = Array.isArray(body.errors)
      ? body.errors.map((entry) => {
        const item = entry as JsonObject;
        return { code: item.code, detail: item.detail, title: item.title };
      })
      : body;
    throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}: ${JSON.stringify(errors)}`);
  }
  return body as T;
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

async function main() {
  requireConfirmedCommand(process.argv.slice(2));
  const apiKey = required(process.env.TELNYX_API_KEY, "TELNYX_API_KEY");
  sensitiveValues.add(apiKey);
  const openAiApiKey = [
    process.env.TELNYX_OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
  ].find(usableProviderKey);
  if (openAiApiKey) sensitiveValues.add(openAiApiKey);
  const publicBaseUrl = required(
    argument("--public-base-url") ?? process.env.VOICE_GATEWAY_PUBLIC_BASE_URL,
    "VOICE_GATEWAY_PUBLIC_BASE_URL",
  ).replace(/\/$/, "");
  if (new URL(publicBaseUrl).protocol !== "https:") {
    throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS.");
  }

  const localEnv = await readEnvFile(".env.local");
  let toolSecret = envValue(localEnv, "VOICE_ASSISTANT_TOOL_SECRET")
    ?? process.env.VOICE_ASSISTANT_TOOL_SECRET;
  const hadUsableLocalToolSecret = usableToolSecret(toolSecret);
  if (!hadUsableLocalToolSecret) {
    toolSecret = randomBytes(32).toString("base64url");
  }
  const resolvedToolSecret = required(toolSecret, "VOICE_ASSISTANT_TOOL_SECRET");
  sensitiveValues.add(resolvedToolSecret);

  const secretList = await telnyxRequest<{ data: Array<{ id: string; identifier: string }> }>(
    apiKey,
    "/integration_secrets?page[size]=100",
  );
  const matchingSecrets = secretList.data.filter(
    (entry) => entry.identifier === integrationSecretIdentifier,
  );
  const matchingLlmSecrets = secretList.data.filter(
    (entry) => entry.identifier === telnyxAssistantLlmSecretIdentifier,
  );
  if (matchingSecrets.length > 1) {
    throw new Error("The trial integration secret identifier is not unique.");
  }
  if (matchingLlmSecrets.length > 1) {
    throw new Error("The OpenAI integration secret identifier is not unique.");
  }
  if (matchingSecrets.length === 1 && !hadUsableLocalToolSecret) {
    throw new Error("The Telnyx trial secret exists, but .env.local has no matching local token.");
  }
  if (matchingLlmSecrets.length === 0 && !openAiApiKey) {
    throw new Error(
      "TELNYX_OPENAI_API_KEY is missing. Add a paid OpenAI API key before the Luna migration.",
    );
  }

  const modelList = await telnyxRequest<unknown>(
    apiKey,
    "/ai/models",
  );
  const modelListBody = asObject(modelList);
  const modelEntries = Array.isArray(modelList)
    ? modelList
    : Array.isArray(modelListBody.data)
      ? modelListBody.data
      : [];
  const modelIsAvailable = modelEntries.some((entry) => {
    const candidate = asObject(entry);
    return candidate.id === model || candidate.model === model;
  });
  if (!modelIsAvailable) {
    throw new Error(`The Telnyx account does not list ${model}.`);
  }

  await updateEnvFile(".env.local", {
    VOICE_ASSISTANT_TOOL_SECRET: resolvedToolSecret,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });
  await updateEnvFile(".voice-preflight.env", {
    VOICE_ASSISTANT_TOOL_SECRET: resolvedToolSecret,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });

  let integrationSecret = matchingSecrets[0];
  if (!integrationSecret) {
    const created = await telnyxRequest<{ data: { id: string; identifier: string } }>(
      apiKey,
      "/integration_secrets",
      {
        body: JSON.stringify({
          identifier: integrationSecretIdentifier,
          token: resolvedToolSecret,
          type: "bearer",
        }),
        method: "POST",
      },
    );
    integrationSecret = created.data;
    console.log("Created the isolated Telnyx integration secret reference.");
  } else {
    console.log("Reused the isolated Telnyx integration secret reference.");
  }

  let llmIntegrationSecret = matchingLlmSecrets[0];
  if (!llmIntegrationSecret) {
    const created = await telnyxRequest<{ data: { id: string; identifier: string } }>(
      apiKey,
      "/integration_secrets",
      {
        body: JSON.stringify({
          identifier: telnyxAssistantLlmSecretIdentifier,
          token: openAiApiKey,
          type: "bearer",
        }),
        method: "POST",
      },
    );
    llmIntegrationSecret = created.data;
    console.log("Created the Telnyx OpenAI integration secret reference.");
  } else {
    console.log("Reused the Telnyx OpenAI integration secret reference.");
  }

  const toolDrafts = createTelnyxAssistantToolDrafts({
    integrationSecretIdentifier,
    publicBaseUrl,
  }).map((draft) => ({
    ...draft,
    display_name: `${toolDisplayPrefix}${draft.display_name}`,
  }));
  const toolList = await telnyxRequest<{ data: Array<{
    display_name?: string;
    id: string;
    tool_definition?: JsonObject;
    type: string;
  }> }>(apiKey, "/ai/tools?page[size]=100");

  const toolIds: string[] = [];
  for (const draft of toolDrafts) {
    const matches = toolList.data.filter((tool) => tool.display_name === draft.display_name);
    if (matches.length > 1) throw new Error(`Shared tool name is not unique: ${draft.display_name}`);
    const existing = matches[0];
    if (existing) {
      if (existing.type !== "webhook"
        || !JSON.stringify(existing.tool_definition).includes(draft.webhook.url)) {
        throw new Error(`Existing shared tool differs from the trial draft: ${draft.display_name}`);
      }
      toolIds.push(existing.id);
      continue;
    }

    const created = await telnyxRequest<{ id: string }>(apiKey, "/ai/tools", {
      body: JSON.stringify(draft),
      method: "POST",
    });
    toolIds.push(created.id);
    console.log(`Created shared tool: ${draft.display_name}`);
  }

  const hangupTools = toolList.data.filter(
    (tool) => tool.display_name === "Default hangup" && tool.type === "hangup",
  );
  if (hangupTools.length !== 1) {
    throw new Error("Expected one existing Default hangup shared tool.");
  }

  const draft = createTelnyxAssistantDraft({
    hangupToolId: hangupTools[0]!.id,
    llmApiKeyRef: llmIntegrationSecret.identifier,
    model,
    toolIds,
    voice,
  });
  const expectedToolNames = [
    ...toolDrafts.map((tool) => tool.webhook.name),
    "Default hangup",
  ];
  const assistantList = await telnyxRequest<{ data: Array<{
    id: string;
    name: string;
    version_id?: string;
  }> }>(apiKey, "/ai/assistants");
  const matchingAssistants = assistantList.data.filter((entry) => entry.name === assistantName);
  if (matchingAssistants.length > 1) {
    throw new Error("The isolated assistant name is not unique.");
  }

  let assistant = matchingAssistants[0];
  let previousAssistant: JsonObject | undefined;
  let assistantChanged = false;
  let modelChanged = false;
  if (!assistant) {
    assistant = responseData(await telnyxRequest<JsonObject>(
      apiKey,
      "/ai/assistants",
      { body: JSON.stringify(draft), method: "POST" },
    )) as { id: string; name: string; version_id?: string };
    console.log("Created the isolated Telnyx assistant.");
  } else {
    previousAssistant = responseData(await telnyxRequest<JsonObject>(
      apiKey,
      `/ai/assistants/${encodeURIComponent(assistant.id)}`,
    ));
    modelChanged = !hasApprovedTelnyxAssistantModel(previousAssistant);
    if (!telnyxAssistantMatchesDraft(previousAssistant, draft, expectedToolNames)) {
      assistant = responseData(await telnyxRequest<JsonObject>(
        apiKey,
        `/ai/assistants/${encodeURIComponent(assistant.id)}`,
        {
          body: JSON.stringify({
            ...draft,
            promote_to_main: true,
            version_name: "Low-latency Flux diagnostics",
          }),
          method: "POST",
        },
      )) as { id: string; name: string; version_id?: string };
      assistantChanged = true;
      console.log("Promoted the approved assistant configuration to main.");
    } else {
      console.log("Reused the existing approved assistant version.");
    }
  }

  const retrieved = responseData(await telnyxRequest<JsonObject>(
    apiKey,
    `/ai/assistants/${encodeURIComponent(assistant.id)}`,
  ));
  if (!hasApprovedTelnyxAssistantModel(retrieved)) {
    throw new Error("The main Telnyx assistant does not use the approved Luna configuration.");
  }
  if (!telnyxAssistantMatchesDraft(retrieved, draft, expectedToolNames)) {
    throw new Error("The main Telnyx assistant differs from the approved voice configuration.");
  }
  const versionId = required(retrieved.version_id ?? assistant.version_id, "assistant version ID");
  const previousVersionId = typeof previousAssistant?.version_id === "string"
    ? previousAssistant.version_id
    : undefined;
  if (assistantChanged && previousVersionId === versionId) {
    throw new Error("Telnyx did not create a new main assistant version.");
  }

  await updateEnvFile(".env.local", {
    TELNYX_AI_ASSISTANT_ID: assistant.id,
    VOICE_ASSISTANT_TOOL_SECRET: resolvedToolSecret,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });
  await updateEnvFile(".voice-preflight.env", {
    TELNYX_AI_ASSISTANT_ID: assistant.id,
    VOICE_ASSISTANT_TOOL_SECRET: resolvedToolSecret,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  });

  const existingMetadata = await readMetadata();
  const existingAssistant = asObject(existingMetadata.assistant);
  const existingSettings = asObject(existingMetadata.settings);
  const metadataVersionChanged = existingAssistant.versionId !== versionId;
  const toolMetadata = toolDrafts.map((tool, index) => ({
    displayName: tool.display_name,
    id: toolIds[index],
    name: tool.webhook.name,
  })).concat({
    displayName: "Default hangup",
    id: hangupTools[0]!.id,
    name: "hangup",
  });
  const metadata: JsonObject = {
    ...existingMetadata,
    assistant: {
      ...existingAssistant,
      id: assistant.id,
      llmApiKeyRef: llmIntegrationSecret.identifier,
      model,
      name: assistantName,
      versionId,
      versionNote: modelChanged
        ? "GPT-5.6 Luna promoted with the low-latency Flux diagnostic profile."
        : assistantChanged
          ? "Low-latency Flux settings and signed transcript diagnostics promoted."
          : metadataVersionChanged
            ? "Approved low-latency Flux assistant version verified and recorded."
            : existingAssistant.versionNote ?? "Initial controlled trial. No live traffic routing.",
      voice,
    },
    connection: existingMetadata.connection ?? {
      configured: false,
      reason: "The inspected active credential connection has no outbound voice profile.",
    },
    createdAt: existingMetadata.createdAt ?? new Date().toISOString(),
    integrationSecret: {
      id: integrationSecret.id,
      identifier: integrationSecret.identifier,
    },
    llmIntegrationSecret: {
      id: llmIntegrationSecret.id,
      identifier: llmIntegrationSecret.identifier,
    },
    publicBaseUrl,
    settings: {
      ...existingSettings,
      activeRuntime: process.env.VOICE_RUNTIME ?? "conversation-relay",
      dataRetention: false,
      memory: false,
      observability: false,
      postConversationProcessing: false,
      recording: false,
      trafficRoutingChanged: assistantChanged
        || existingSettings.trafficRoutingChanged === true,
    },
    tools: toolMetadata,
  };
  if (modelChanged && previousVersionId) {
    metadata.modelMigration = {
      completedAt: new Date().toISOString(),
      from: {
        model: previousAssistant?.model ?? "unknown",
        versionId: previousVersionId,
      },
      phoneCallsPlaced: 0,
      rollbackVersionId: previousVersionId,
      status: "promoted",
      to: { model, versionId },
    };
  }
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Assistant ID: ${assistant.id}`);
  console.log(`Assistant model: ${model}`);
  console.log(`Assistant version ID: ${versionId}`);
  console.log(`Attached shared tools: ${toolMetadata.length}`);
  console.log("No phone call occurred.");
}

main().catch((error) => {
  const secrets = [...sensitiveValues, ...[
    process.env.TELNYX_API_KEY ?? "",
    process.env.TELNYX_OPENAI_API_KEY ?? "",
    process.env.OPENAI_API_KEY ?? "",
    process.env.VOICE_ASSISTANT_TOOL_SECRET ?? "",
    process.env.CALL_TO_NUMBER ?? "",
    process.env.TELNYX_PHONE_NUMBER ?? "",
  ]];
  console.error(sanitizedMessage(error, secrets));
  process.exitCode = 1;
});
