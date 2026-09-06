import { readFile, writeFile } from "node:fs/promises";
import { createTelnyxAssistantDraft } from "../src/voice-experiment/telnyx-candidate";
import { createTelnyxCandidateClient } from "../src/voice-experiment/telnyx-candidate-client";
import { synchronizeTelnyxCandidateAssistant } from "../src/voice-experiment/telnyx-candidate-sync";

async function readEnvFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function updateEnvFile(path: string, values: Record<string, string>) {
  const pending = new Map(Object.entries(values));
  const lines = (await readEnvFile(path)).split(/\r?\n/).map((line) => {
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

function required(value: unknown, name: string) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required.`);
  return value;
}

function explicitOptIn(name: string) {
  const value = process.env[name];
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false.`);
}

const publicBaseUrl = process.env.VOICE_GATEWAY_PUBLIC_BASE_URL;
if (!publicBaseUrl) throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL is required.");
if (new URL(publicBaseUrl).protocol !== "https:") {
  throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL must use HTTPS.");
}

const dataRetentionEnabled = explicitOptIn("VOICE_PROVIDER_DATA_RETENTION_ENABLED");
const recordingEnabled = explicitOptIn("VOICE_RECORDING_ENABLED");
const draft = createTelnyxAssistantDraft({
  dataRetentionEnabled,
  publicBaseUrl,
  recordingEnabled,
});
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({
    action: process.env.TELNYX_AI_ASSISTANT_ID ? "synchronize-assistant" : "create-new-assistant",
    apply: false,
    model: draft.model,
    name: draft.name,
    recording: draft.telephony_settings.recording_settings,
    retention: draft.privacy_settings,
    toolNames: draft.tools.flatMap((entry) => (
      "webhook" in entry ? [entry.webhook.name] : [entry.type]
    )),
    transcription: draft.transcription,
    voice: draft.voice_settings,
  }, null, 2));
  process.exit(0);
}

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) throw new Error("TELNYX_API_KEY is required.");
const client = createTelnyxCandidateClient({ apiKey });
const configuredAssistantId = process.env.TELNYX_AI_ASSISTANT_ID;
const result = configuredAssistantId
  ? await synchronizeTelnyxCandidateAssistant({
      assistantId: configuredAssistantId,
      dataRetentionEnabled,
      dependencies: client,
      publicBaseUrl,
      recordingEnabled,
    })
  : undefined;
const assistant = result
  ? { id: configuredAssistantId, version_id: result.versionId }
  : await client.createAssistant(draft);
const assistantId = required(assistant.id, "Telnyx assistant ID");
const versionId = required(assistant.version_id, "Telnyx assistant version ID");
await Promise.all([
  updateEnvFile(".env.local", {
    TELNYX_AI_ASSISTANT_ID: assistantId,
    TELNYX_AI_ASSISTANT_VERSION_ID: versionId,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  }),
  updateEnvFile(".voice-preflight.env", {
    TELNYX_AI_ASSISTANT_ID: assistantId,
    TELNYX_AI_ASSISTANT_VERSION_ID: versionId,
    VOICE_GATEWAY_PUBLIC_BASE_URL: publicBaseUrl,
  }),
]);
console.log(JSON.stringify({
  assistantId,
  changed: result?.changed ?? true,
  created: !result,
  versionId,
}, null, 2));
console.log(`TELNYX_AI_ASSISTANT_VERSION_ID=${versionId}`);
