import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "./test-telnyx-assistant-test-runner.mjs";

const MAIN_ASSISTANT_ID = "assistant-8b41cac9-9f80-4ca7-8d38-868f076abaaa";
const ISOLATED_ASSISTANT_ID = "assistant-7d3b9b8d-37f0-4670-a4f8-fe428ea5fe11";
const TEST_ID = "4d713ae1-c7c0-45dc-9ed7-f5ebc13482f4";
const RUN_ID = "1f71d599-882d-4b46-a7df-a0e706fce10d";
const TEST_ENV = Object.freeze({
  TELNYX_AI_ASSISTANT_ID: MAIN_ASSISTANT_ID,
  TELNYX_API_KEY: "test-telnyx-api-key",
  TELNYX_SCHEMA_TEST_ASSISTANT_ID: ISOLATED_ASSISTANT_ID,
});
const PROBE_TOOL_TOKEN = "fictional_probe_token_1234567890_abcdef";
const PROBE_ENV = Object.freeze({
  ...TEST_ENV,
  VOICE_ASSISTANT_TEST_TOOL_TOKEN: PROBE_TOOL_TOKEN,
});
const TEST_TIMING = Object.freeze({
  httpTimeoutMs: 1_000,
  pollDelayMs: 0,
  pollTimeoutMs: 1_000,
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

function assistantResponse() {
  return jsonResponse({
    id: ISOLATED_ASSISTANT_ID,
    name: "Dental chat isolation baseline",
    privacy_settings: { data_retention: true },
    tools: [{
      type: "webhook",
      webhook: {
        body_parameters: {
          additionalProperties: false,
          properties: {},
          required: ["operationId", "result"],
          type: "object",
        },
        headers: [],
        name: "record_identity",
        url: "https://example.com/telnyx-assistant-record-identity",
      },
    }],
    version_id: "20260826T042054327084",
  });
}

function toolSetAssistantResponse() {
  const names = [
    "record_identity",
    "load_safe_case",
    "search_slots",
    "prepare_reschedule",
    "commit_reschedule",
    "prepare_cancellation",
    "commit_cancellation",
    "staff_follow_up",
  ];
  return jsonResponse({
    id: ISOLATED_ASSISTANT_ID,
    name: "Dental chat isolation baseline",
    privacy_settings: { data_retention: true },
    tools: names.map((name) => ({
      type: "webhook",
      webhook: {
        headers: [
          {
            name: "Authorization",
            value: "Bearer {{#integration_secret}}fictional_secret{{/integration_secret}}",
          },
          { name: "X-Voice-Call-Control-ID", value: "{{call_control_id}}" },
        ],
        name,
        url: `https://voice-demo.example.test/voice/assistant/tools/{{tool_token}}/${name}`,
      },
    })),
    version_id: "eight-tools-v5",
  });
}

function mainAssistantResponse({
  dynamicVariables = {
    clinic_current_date: "2026-08-26",
    clinic_name: "Fictional Dental",
    clinic_time_zone: "America/New_York",
    patient_first_name: "Oliver",
  },
  instructions = "Interpret the reply, then call record_identity_result.",
  retention = false,
  version = "main-baseline-v1",
} = {}) {
  const tools = [
    "record_identity",
    "load_safe_case",
    "search_slots",
    "prepare_reschedule",
    "commit_reschedule",
    "prepare_cancellation",
    "commit_cancellation",
    "staff_follow_up",
  ].map((name) => ({ type: "webhook", webhook: { name } }));
  tools.push({ type: "hangup" });
  return jsonResponse({
    dynamic_variables: dynamicVariables,
    id: MAIN_ASSISTANT_ID,
    instructions,
    name: "Controlled dental scheduling trial",
    privacy_settings: { data_retention: retention },
    tools,
    version_id: version,
  });
}

test("--help describes the no-call boundary without reading configuration", async () => {
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
  assert.match(output.lines.join("\n"), /cannot place a phone call/);
});

test("--dry-run requires separate main and retained assistants", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: TEST_ENV,
    fetchImpl: async () => {
      throw new Error("Dry run must not make a network request.");
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.match(output.lines.join("\n"), /No network request was made/);
});

test("--confirm-main-retention-probe always restores disabled retention", async () => {
  const output = createOutput();
  const requests = [];
  let mainUpdateCount = 0;
  const exitCode = await runCommand({
    args: ["--confirm-main-retention-probe"],
    env: PROBE_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${MAIN_ASSISTANT_ID}`
        && options.method === "GET") {
        return mainAssistantResponse();
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${MAIN_ASSISTANT_ID}`
        && options.method === "POST") {
        mainUpdateCount += 1;
        return mainAssistantResponse({
          dynamicVariables: body.dynamic_variables,
          instructions: body.instructions,
          retention: body.privacy_settings.data_retention,
          version: `main-update-v${mainUpdateCount + 1}`,
        });
      }
      if (requestUrl.pathname === "/v2/ai/assistants/tests"
        && options.method === "GET") {
        return jsonResponse({ data: [] });
      }
      if (requestUrl.pathname === "/v2/ai/assistants/tests"
        && options.method === "POST") {
        return jsonResponse({ test_id: TEST_ID });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/tests/${TEST_ID}/runs`
        && options.method === "POST") {
        return jsonResponse({ run_id: RUN_ID, status: "pending" });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/tests/${TEST_ID}/runs/${RUN_ID}`) {
        return jsonResponse({
          conversation_id: "71d6ac29-15f1-4ee9-bada-3af7d670d7b4",
          detail_status: [{ name: "Ready without tool", status: "failed" }],
          run_id: RUN_ID,
          status: "failed",
        });
      }
      if (requestUrl.pathname.startsWith("/v2/ai/conversations/")
        && requestUrl.pathname.endsWith("/messages")
        && options.method === "GET") {
        return jsonResponse({
          data: [
            { role: "user", tool_calls: [] },
            {
              role: "assistant",
              tool_calls: [{ function: { name: "record_identity" } }],
            },
          ],
        });
      }
      if (requestUrl.pathname.startsWith("/v2/ai/conversations/")
        && options.method === "DELETE") {
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(mainUpdateCount, 2);
  const updates = requests.filter(
    (request) => request.path === `/v2/ai/assistants/${MAIN_ASSISTANT_ID}`
      && request.method === "POST",
  );
  assert.equal(updates[0].body.privacy_settings.data_retention, true);
  assert.equal(updates[1].body.privacy_settings.data_retention, false);
  assert.match(updates[0].body.instructions, /call record_identity\./);
  assert.doesNotMatch(updates[0].body.instructions, /record_identity_result/);
  assert.equal(updates[0].body.dynamic_variables.tool_token, PROBE_TOOL_TOKEN);
  assert.equal("tool_token" in updates[1].body.dynamic_variables, false);
  assert.equal(
    requests.some((request) => /calls|connections|phone_numbers/.test(request.path)),
    false,
  );
  assert.match(output.lines.join("\n"), /Restored disabled-retention version/);
  assert.match(output.lines.join("\n"), /Tool names: record_identity/);
});

test("--verify accepts Telnyx-added rubric fields", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return toolSetAssistantResponse();
      }
      return jsonResponse({
        data: [{
          destination: ISOLATED_ASSISTANT_ID,
          instructions: [
            "Act as a fictional test caller.",
            "Say that this is a private-runner check.",
            "Ask the assistant to reply with READY only.",
            "Do not ask the assistant to call a tool.",
          ].join(" "),
          name: "Dental chat isolation | Private runner baseline",
          rubric: [{
            criteria: "The assistant replies with READY and does not call a tool.",
            name: "Ready without tool",
            rubric_id: "telnyx-added-field",
          }],
          telnyx_conversation_channel: "web_chat",
          test_id: TEST_ID,
        }],
      });
    },
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.match(output.lines.join("\n"), /Private-runner test: present/);
});

test("--confirm creates one test and reports a passed private-runner result", async () => {
  const output = createOutput();
  const requests = [];
  let runReadCount = 0;
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ body, method: options.method, path: requestUrl.pathname });
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/assistants/tests"
        && options.method === "GET") {
        return jsonResponse({ data: [] });
      }
      if (requestUrl.pathname === "/v2/ai/assistants/tests"
        && options.method === "POST") {
        return jsonResponse({ test_id: TEST_ID });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/tests/${TEST_ID}/runs`
        && options.method === "POST") {
        return jsonResponse({ run_id: RUN_ID, status: "pending" });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/tests/${TEST_ID}/runs/${RUN_ID}`) {
        runReadCount += 1;
        return jsonResponse({
          conversation_id: "71d6ac29-15f1-4ee9-bada-3af7d670d7b4",
          detail_status: [{ name: "Ready without tool", status: "passed" }],
          run_id: RUN_ID,
          status: "passed",
        });
      }
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(runReadCount, 1);
  const create = requests.find(
    (request) => request.path === "/v2/ai/assistants/tests"
      && request.method === "POST",
  );
  assert.equal(create.body.destination, ISOLATED_ASSISTANT_ID);
  assert.equal(create.body.telnyx_conversation_channel, "web_chat");
  assert.match(create.body.test_suite, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(create.body.rubric, [{
    criteria: "The assistant replies with READY and does not call a tool.",
    name: "Ready without tool",
  }]);
  assert.equal(
    requests.some((request) => /calls|connections|phone_numbers/.test(request.path)),
    false,
  );
  assert.match(output.lines.join("\n"), /Conversation created: yes/);
});

test("--confirm reports an initialization error without exposing the API key", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname === `/v2/ai/assistants/${ISOLATED_ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/assistants/tests") {
        return options.method === "GET"
          ? jsonResponse({ data: [] })
          : jsonResponse({ test_id: TEST_ID });
      }
      return jsonResponse({
        errors: [{
          code: "10000",
          detail: `Private runner failed for ${TEST_ENV.TELNYX_API_KEY}`,
          title: "Bad Request",
        }],
      }, 400);
    },
    sleep: async () => {},
    timing: TEST_TIMING,
    write: output.write,
  });

  const text = output.lines.join("\n");
  assert.equal(exitCode, 1);
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.match(text, /Status: 400/);
});
