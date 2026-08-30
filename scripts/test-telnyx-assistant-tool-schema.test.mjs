import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_CHAT_MESSAGE,
  PRODUCTION_TOOL_DRAFT,
  SCHEMA_CHAT_MESSAGE,
  SCHEMA_TOOL_DRAFT,
  runCommand,
} from "./test-telnyx-assistant-tool-schema.mjs";

const MAIN_ASSISTANT_ID = "assistant-8b41cac9-9f80-4ca7-8d38-868f076abaaa";
const ISOLATED_ASSISTANT_ID = "assistant-7d3b9b8d-37f0-4670-a4f8-fe428ea5fe11";
const TOOL_ID = "tool-316bfbd0-61fb-4bc1-a248-a812e88456d0";
const PRODUCTION_TOOL_ID = "tool-6aa98f8a-5e3a-4d2e-a001-d9b18ce6b297";
const LIVE_TOOL_ID = "tool-a8e741cb-6903-4c39-b190-82070c76b8da";
const CONVERSATION_ID = "42b20469-1215-4a9a-8964-c36f66b406f4";
const TEST_ENV = Object.freeze({
  TELNYX_AI_ASSISTANT_ID: MAIN_ASSISTANT_ID,
  TELNYX_API_KEY: "test-telnyx-api-key",
  TELNYX_SCHEMA_TEST_ASSISTANT_ID: ISOLATED_ASSISTANT_ID,
});
const LIVE_TEST_TOKEN = "fictional_tool_token_1234567890_abcdef";
const LIVE_TEST_ENV = Object.freeze({
  ...TEST_ENV,
  VOICE_ASSISTANT_TEST_TOOL_TOKEN: LIVE_TEST_TOKEN,
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice-demo.example.test",
});
const SET_TOOL_NAMES = [
  "record_identity",
  "load_safe_case",
  "search_slots",
  "prepare_reschedule",
  "commit_reschedule",
  "prepare_cancellation",
  "commit_cancellation",
  "staff_follow_up",
];
const SET_TOOL_RECORDS = SET_TOOL_NAMES.map((name, index) => ({
  displayName: `Dental scheduling trial | Unit ${name}`,
  id: `tool-unit-${String(index + 1).padStart(8, "0")}`,
  name,
}));
const TEST_TIMING = Object.freeze({
  httpTimeoutMs: 1_000,
  messageReadAttempts: 2,
  messageReadDelayMs: 0,
});

function createOutput() {
  const lines = [];
  return {
    lines,
    write(message) {
      lines.push(String(message));
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function assistantResponse({
  attached = false,
  includeToolIds = true,
  telephony = false,
  toolDraft = SCHEMA_TOOL_DRAFT,
  toolId = TOOL_ID,
  version = "baseline-v1",
} = {}) {
  return jsonResponse({
    enabled_features: telephony ? ["telephony"] : [],
    id: ISOLATED_ASSISTANT_ID,
    model: "anthropic/claude-haiku-4-5",
    name: "Dental chat isolation baseline",
    privacy_settings: { data_retention: true },
    ...(includeToolIds ? { tool_ids: attached ? [toolId] : [] } : {}),
    tools: attached
      ? [{ id: toolId, type: "webhook", webhook: toolDraft.webhook }]
      : [],
    version_id: version,
  });
}

function sharedTool(toolDraft = SCHEMA_TOOL_DRAFT, toolId = TOOL_ID) {
  return {
    display_name: toolDraft.display_name,
    id: toolId,
    tool_definition: toolDraft.webhook,
    type: "webhook",
  };
}

function liveToolDraft() {
  return {
    ...PRODUCTION_TOOL_DRAFT,
    display_name: "Dental scheduling trial | Record identity result",
    webhook: {
      ...PRODUCTION_TOOL_DRAFT.webhook,
      headers: [
        {
          name: "Authorization",
          value: "Bearer {{#integration_secret}}dentist_voice_assistant_trial_tool_secret{{/integration_secret}}",
        },
        { name: "X-Voice-Call-Control-ID", value: "{{call_control_id}}" },
      ],
      url: "https://voice-demo.example.test/voice/assistant/tools/{{tool_token}}/identity",
    },
  };
}

function setTool(record) {
  return {
    display_name: record.displayName,
    id: record.id,
    tool_definition: {
      async: false,
      body_parameters: {
        additionalProperties: false,
        properties: {},
        required: [],
        type: "object",
      },
      headers: liveToolDraft().webhook.headers,
      method: "POST",
      name: record.name,
      timeout_ms: 5_000,
      url: `https://voice-demo.example.test/voice/assistant/tools/{{tool_token}}/${record.name}`,
    },
    type: "webhook",
  };
}

function toolSetAssistantResponse(version = "eight-tools-v5", includeHangup = false) {
  return jsonResponse({
    id: ISOLATED_ASSISTANT_ID,
    name: "Dental chat isolation baseline",
    privacy_settings: { data_retention: true },
    tools: SET_TOOL_RECORDS.map((record) => ({
      id: record.id,
      type: "webhook",
      webhook: setTool(record).tool_definition,
    })).concat(includeHangup ? [{ id: "tool-unit-hangup01", type: "hangup" }] : []),
    version_id: version,
  });
}

function mainAssistantResponse() {
  return jsonResponse({
    dynamic_variables: {
      clinic_current_date: "2026-08-26",
      clinic_name: "Fictional Dental",
      clinic_time_zone: "America/New_York",
      patient_first_name: "Oliver",
    },
    greeting: "Hello from {{clinic_name}}. Is this {{patient_first_name}}?",
    id: MAIN_ASSISTANT_ID,
    instructions: "Interpret the reply, then call record_identity_result.",
    name: "Controlled dental scheduling trial",
  });
}

function dialogueAssistantResponse(dialogue, version = "dialogue-v7") {
  const tools = SET_TOOL_RECORDS.map((record) => ({
    id: record.id,
    type: "webhook",
    webhook: setTool(record).tool_definition,
  })).concat({ id: "tool-unit-hangup01", type: "hangup" });
  return jsonResponse({
    dynamic_variables: dialogue.dynamic_variables,
    greeting: dialogue.greeting,
    id: ISOLATED_ASSISTANT_ID,
    instructions: dialogue.instructions,
    name: "Dental chat isolation baseline",
    privacy_settings: { data_retention: true },
    tools,
    version_id: version,
  });
}

test("--help explains the safety boundary without reading configuration", async () => {
  const output = createOutput();
  let requestCount = 0;
  const exitCode = await runCommand({
    args: ["--help"],
    env: {},
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("Help must not make a network request.");
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.match(output.lines.join("\n"), /no phone call, tunnel, or traffic change/);
});

test("--dry-run validates different main and isolated assistants", async () => {
  const output = createOutput();
  let requestCount = 0;
  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: TEST_ENV,
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("Dry run must not make a network request.");
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.equal(output.lines.join("\n").includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(output.lines.join("\n").includes(ISOLATED_ASSISTANT_ID), false);
});

test("--dry-run rejects the main assistant as the experiment target", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: {
      ...TEST_ENV,
      TELNYX_SCHEMA_TEST_ASSISTANT_ID: MAIN_ASSISTANT_ID,
    },
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /must differ from the main assistant/);
});

test("--verify reads the assistant and tool library without making changes", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      requests.push({ method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/tools") {
        return jsonResponse({ data: [] });
      }
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(requests, [
    { method: "GET", path: `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}` },
    { method: "GET", path: "/v2/ai/tools" },
  ]);
  assert.match(output.lines.join("\n"), /No resource changed and no inference ran/);
});

test("--verify reports telephony without using any telephony endpoint", async () => {
  const output = createOutput();
  const paths = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url) => {
      const requestUrl = new URL(url);
      paths.push(requestUrl.pathname);
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse({ telephony: true });
      }
      return jsonResponse({ data: [] });
    },
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(paths, [
    `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`,
    "/v2/ai/tools",
  ]);
  assert.match(output.lines.join("\n"), /Telephony feature: enabled/);
});

test("--verify rejects any unexpected built-in tool", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async () => jsonResponse({
      enabled_features: ["telephony"],
      id: ISOLATED_ASSISTANT_ID,
      name: "Dental chat isolation baseline",
      privacy_settings: { data_retention: true },
      tool_ids: ["tool-c197145f-507c-4aae-81af-e27119417232"],
      tools: [{ type: "hangup" }],
      version_id: "unexpected-tool-v1",
    }),
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /has an unexpected tool/);
});

test("--confirm creates, attaches, tests, inspects, and cleans the schema tool", async () => {
  const output = createOutput();
  const requests = [];
  let now = 1_000;
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/tools" && options.method === "GET") {
        return jsonResponse({ data: [] });
      }
      if (requestUrl.pathname === "/v2/ai/tools" && options.method === "POST") {
        return jsonResponse({ id: TOOL_ID });
      }
      if (requestUrl.pathname === `/v2/ai/tools/${TOOL_ID}`) {
        return jsonResponse(sharedTool());
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return assistantResponse({ attached: true, version: "schema-v2" });
      }
      if (requestUrl.pathname === "/v2/ai/conversations" && options.method === "POST") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}/chat`) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: SCHEMA_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (requestUrl.pathname === `/v2/ai/conversations/${CONVERSATION_ID}`) {
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    now: () => {
      now += 125;
      return now;
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  const toolCreate = requests.find(
    (request) => request.path === "/v2/ai/tools" && request.method === "POST",
  );
  assert.deepEqual(toolCreate.body, SCHEMA_TOOL_DRAFT);
  assert.deepEqual(toolCreate.body.webhook.headers, []);
  assert.equal(JSON.stringify(toolCreate.body).includes("call_control_id"), false);
  assert.equal(JSON.stringify(toolCreate.body).includes("{{"), false);

  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.deepEqual(assistantUpdate.body, {
    promote_to_main: true,
    tool_ids: [TOOL_ID],
    version_name: "Retained one-tool schema baseline",
  });

  const chat = requests.find((request) => request.path.endsWith("/chat"));
  assert.equal(chat.body.content, SCHEMA_CHAT_MESSAGE);
  assert.equal(requests.at(-1).path, `/v2/ai/conversations/${CONVERSATION_ID}`);
  assert.match(output.lines.join("\n"), /Tool calls observed: 0/);
});

test("--confirm-production-shape replaces the baseline with the exact identity schema", async () => {
  const output = createOutput();
  const requests = [];
  const productionTool = sharedTool(PRODUCTION_TOOL_DRAFT, PRODUCTION_TOOL_ID);
  const exitCode = await runCommand({
    args: ["--confirm-production-shape"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return assistantResponse({ attached: true });
      }
      if (requestUrl.pathname === "/v2/ai/tools" && options.method === "GET") {
        return jsonResponse({ data: [productionTool] });
      }
      if (requestUrl.pathname === `/v2/ai/tools/${PRODUCTION_TOOL_ID}`) {
        return jsonResponse(productionTool);
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return assistantResponse({
          attached: true,
          includeToolIds: false,
          toolDraft: PRODUCTION_TOOL_DRAFT,
          toolId: PRODUCTION_TOOL_ID,
          version: "record-identity-v3",
        });
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: PRODUCTION_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(PRODUCTION_TOOL_DRAFT.webhook.headers, []);
  assert.equal(JSON.stringify(PRODUCTION_TOOL_DRAFT).includes("call_control_id"), false);
  assert.equal(JSON.stringify(PRODUCTION_TOOL_DRAFT).includes("{{"), false);
  assert.deepEqual(PRODUCTION_TOOL_DRAFT.webhook.body_parameters.required, [
    "operationId",
    "result",
  ]);
  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.deepEqual(assistantUpdate.body, {
    promote_to_main: true,
    tool_ids: [PRODUCTION_TOOL_ID],
    version_name: "Retained record-identity schema check",
  });
  const chat = requests.find((request) => request.path.endsWith("/chat"));
  assert.equal(chat.body.content, PRODUCTION_CHAT_MESSAGE);
});

test("--confirm-production-tool reuses the exact tool and adds a fictional token", async () => {
  const output = createOutput();
  const requests = [];
  const liveDraft = liveToolDraft();
  const liveTool = sharedTool(liveDraft, LIVE_TOOL_ID);
  const exitCode = await runCommand({
    args: ["--confirm-production-tool"],
    env: LIVE_TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return assistantResponse({
          attached: true,
          includeToolIds: false,
          toolDraft: PRODUCTION_TOOL_DRAFT,
          toolId: PRODUCTION_TOOL_ID,
          version: "record-identity-v3",
        });
      }
      if (requestUrl.pathname === "/v2/ai/tools" && options.method === "GET") {
        return jsonResponse({ data: [liveTool] });
      }
      if (requestUrl.pathname === `/v2/ai/tools/${LIVE_TOOL_ID}`) {
        return jsonResponse(liveTool);
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return assistantResponse({
          attached: true,
          toolDraft: liveDraft,
          toolId: LIVE_TOOL_ID,
          version: "exact-tool-v4",
        });
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: PRODUCTION_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(
    requests.some(
      (request) => request.path === "/v2/ai/tools" && request.method === "POST",
    ),
    false,
  );
  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.deepEqual(assistantUpdate.body, {
    dynamic_variables: { tool_token: LIVE_TEST_TOKEN },
    promote_to_main: true,
    tool_ids: [LIVE_TOOL_ID],
    version_name: "Retained exact record-identity tool check",
  });
  assert.equal(output.lines.join("\n").includes(LIVE_TEST_TOKEN), false);
});

test("--confirm-production-set attaches eight verified webhooks without Hangup", async () => {
  const output = createOutput();
  const requests = [];
  const byId = new Map(SET_TOOL_RECORDS.map((record) => [record.id, setTool(record)]));
  const exitCode = await runCommand({
    args: ["--confirm-production-set"],
    env: LIVE_TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return assistantResponse({
          attached: true,
          toolDraft: liveToolDraft(),
          toolId: LIVE_TOOL_ID,
          version: "exact-tool-v4",
        });
      }
      if (requestUrl.pathname.startsWith("/v2/ai/tools/")) {
        const id = requestUrl.pathname.slice("/v2/ai/tools/".length);
        return jsonResponse(byId.get(id));
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return toolSetAssistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: PRODUCTION_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    readMetadata: async () => ({
      assistant: { id: MAIN_ASSISTANT_ID },
      tools: [
        ...SET_TOOL_RECORDS,
        {
          displayName: "Default hangup",
          id: "tool-unit-hangup01",
          name: "hangup",
        },
      ],
    }),
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.deepEqual(assistantUpdate.body.tool_ids, SET_TOOL_RECORDS.map((record) => record.id));
  assert.equal(assistantUpdate.body.tool_ids.includes("tool-unit-hangup01"), false);
  assert.match(output.lines.join("\n"), /Hangup tools selected: 0/);
});

test("--confirm-production-set-with-hangup adds only the recorded Hangup tool", async () => {
  const output = createOutput();
  const requests = [];
  const hangupRecord = {
    displayName: "Default hangup",
    id: "tool-unit-hangup01",
    name: "hangup",
  };
  const byId = new Map(SET_TOOL_RECORDS.map((record) => [record.id, setTool(record)]));
  byId.set(hangupRecord.id, {
    display_name: hangupRecord.displayName,
    id: hangupRecord.id,
    type: "hangup",
  });
  const exitCode = await runCommand({
    args: ["--confirm-production-set-with-hangup"],
    env: LIVE_TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return toolSetAssistantResponse("eight-tools-v5");
      }
      if (requestUrl.pathname.startsWith("/v2/ai/tools/")) {
        const id = requestUrl.pathname.slice("/v2/ai/tools/".length);
        return jsonResponse(byId.get(id));
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return toolSetAssistantResponse("nine-tools-v6", true);
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: PRODUCTION_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    readMetadata: async () => ({
      assistant: { id: MAIN_ASSISTANT_ID },
      tools: [...SET_TOOL_RECORDS, hangupRecord],
    }),
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.equal(assistantUpdate.body.tool_ids.length, 9);
  assert.equal(assistantUpdate.body.tool_ids.at(-1), hangupRecord.id);
  assert.match(output.lines.join("\n"), /Hangup tools selected: 1/);
});

test("--confirm-main-dialogue copies corrected fictional defaults without privacy changes", async () => {
  const output = createOutput();
  const requests = [];
  const hangupRecord = {
    displayName: "Default hangup",
    id: "tool-unit-hangup01",
    name: "hangup",
  };
  const byId = new Map(SET_TOOL_RECORDS.map((record) => [record.id, setTool(record)]));
  byId.set(hangupRecord.id, {
    display_name: hangupRecord.displayName,
    id: hangupRecord.id,
    type: "hangup",
  });
  const exitCode = await runCommand({
    args: ["--confirm-main-dialogue"],
    env: LIVE_TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${MAIN_ASSISTANT_ID}`) {
        return mainAssistantResponse();
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "GET") {
        return toolSetAssistantResponse("nine-tools-v6", true);
      }
      if (requestUrl.pathname.startsWith("/v2/ai/tools/")) {
        const id = requestUrl.pathname.slice("/v2/ai/tools/".length);
        return jsonResponse(byId.get(id));
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
        && options.method === "POST") {
        return dialogueAssistantResponse(body);
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "READY" } });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [
            { role: "user", text: PRODUCTION_CHAT_MESSAGE, tool_calls: [] },
            { role: "assistant", text: "READY", tool_calls: [] },
          ],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    readMetadata: async () => ({
      assistant: { id: MAIN_ASSISTANT_ID },
      tools: [...SET_TOOL_RECORDS, hangupRecord],
    }),
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  const assistantUpdate = requests.find(
    (request) => request.path === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.match(assistantUpdate.body.instructions, /call record_identity\./);
  assert.doesNotMatch(assistantUpdate.body.instructions, /record_identity_result/);
  assert.equal(assistantUpdate.body.dynamic_variables.tool_token, LIVE_TEST_TOKEN);
  assert.equal(Object.keys(assistantUpdate.body.dynamic_variables).length, 5);
  assert.equal("privacy_settings" in assistantUpdate.body, false);
});

test("--confirm rejects an observed tool call and still deletes the conversation", async () => {
  const output = createOutput();
  const paths = [];
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      paths.push(requestUrl.pathname);
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse({ attached: true, version: "schema-v2" });
      }
      if (requestUrl.pathname === "/v2/ai/tools") {
        return jsonResponse({ data: [sharedTool()] });
      }
      if (requestUrl.pathname === `/v2/ai/tools/${TOOL_ID}`) {
        return jsonResponse(sharedTool());
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ id: CONVERSATION_ID });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ content: "Checking." });
      }
      if (requestUrl.pathname.endsWith("/messages")) {
        return jsonResponse({
          data: [{
            role: "assistant",
            tool_calls: [{
              function: { arguments: "{}", name: SCHEMA_TOOL_DRAFT.webhook.name },
              id: "call-1",
            }],
          }],
          meta: { total_results: 2 },
        });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.equal(paths.at(-1), `/v2/ai/conversations/${CONVERSATION_ID}`);
  assert.match(output.lines.join("\n"), /unexpectedly invoked a tool/);
});

test("--confirm deletes the conversation after a redacted chat error", async () => {
  const output = createOutput();
  const paths = [];
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      paths.push(requestUrl.pathname);
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse({ attached: true, version: "schema-v2" });
      }
      if (requestUrl.pathname === "/v2/ai/tools") {
        return jsonResponse({ data: [sharedTool()] });
      }
      if (requestUrl.pathname === `/v2/ai/tools/${TOOL_ID}`) {
        return jsonResponse(sharedTool());
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ id: CONVERSATION_ID });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({
          errors: [{
            code: "invalid_request",
            detail: `Failed for ${TEST_ENV.TELNYX_API_KEY}. ${SCHEMA_CHAT_MESSAGE}`,
          }],
        }, 400);
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  const text = output.lines.join("\n");
  assert.equal(exitCode, 1);
  assert.equal(paths.at(-1), `/v2/ai/conversations/${CONVERSATION_ID}`);
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(text.includes(SCHEMA_CHAT_MESSAGE), false);
});
