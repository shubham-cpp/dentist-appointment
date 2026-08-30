import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CHAT_MESSAGE,
  runCommand,
} from "./test-telnyx-assistant-chat.mjs";

const ASSISTANT_ID = "assistant-8b41cac9-9f80-4ca7-8d38-868f076abaaa";
const CONVERSATION_ID = "42b20469-1215-4a9a-8964-c36f66b406f4";
const TEST_ENV = Object.freeze({
  TELNYX_AI_ASSISTANT_ID: ASSISTANT_ID,
  TELNYX_API_KEY: "test-telnyx-api-key",
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

function assistantResponse(overrides = {}) {
  return jsonResponse({
    id: ASSISTANT_ID,
    llm_api_key_ref: "dentist_voice_assistant_trial_openai_api_key",
    model: "openai/gpt-5.6-luna",
    privacy_settings: { data_retention: false },
    tools: Array.from({ length: 9 }, (_, index) => ({ id: `tool-${index}` })),
    version_id: "20260824T084601538993",
    ...overrides,
  });
}

test("--help explains all modes without reading configuration", async () => {
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
  assert.match(output.lines.join("\n"), /--confirm/);
  assert.match(output.lines.join("\n"), /never starts a tunnel or places a phone call/);
});

test("--dry-run validates settings without making a network request", async () => {
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

  const text = output.lines.join("\n");
  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(text.includes(ASSISTANT_ID), false);
});

test("--verify reads the assistant without creating a conversation", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      requests.push({ options, url: new URL(url) });
      return assistantResponse();
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, `/v2/ai/assistants/${ASSISTANT_ID}`);
  assert.equal(requests[0].options.method, "GET");
  assert.match(output.lines.join("\n"), /No conversation or inference was created/);
});

test("--verify rejects the previous managed assistant model", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async () => assistantResponse({
      llm_api_key_ref: undefined,
      model: "anthropic/claude-haiku-4-5",
    }),
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /GPT-5\.6 Luna model/);
});

test("--confirm creates one chat and always deletes its conversation", async () => {
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
      if (requestUrl.pathname === `/v2/ai/assistants/${ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/conversations" && options.method === "POST") {
        return jsonResponse({ id: CONVERSATION_ID });
      }
      if (requestUrl.pathname === `/v2/ai/assistants/${ASSISTANT_ID}/chat`) {
        return jsonResponse({ content: "Hello from the assistant." });
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
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    requests.map(({ method, path }) => [method, path]),
    [
      ["GET", `/v2/ai/assistants/${ASSISTANT_ID}`],
      ["POST", "/v2/ai/conversations"],
      ["POST", `/v2/ai/assistants/${ASSISTANT_ID}/chat`],
      ["DELETE", `/v2/ai/conversations/${CONVERSATION_ID}`],
    ],
  );
  assert.equal(requests[1].body.metadata.telnyx_conversation_channel, "web_chat");
  assert.equal(requests[1].body.metadata.diagnostic, "fictional");
  assert.equal(requests[2].body.content, DEFAULT_CHAT_MESSAGE);
  assert.equal(requests[2].body.conversation_id, CONVERSATION_ID);
  assert.equal(output.lines.join("\n").includes("Hello from the assistant."), false);
  assert.match(output.lines.join("\n"), /Disposable conversation deleted/);
});

test("--confirm accepts a data-wrapped conversation response", async () => {
  const paths = [];
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      paths.push(requestUrl.pathname);
      if (requestUrl.pathname === `/v2/ai/assistants/${ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ data: { id: CONVERSATION_ID } });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({ data: { content: "Connected." } });
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    write() {},
  });

  assert.equal(exitCode, 0);
  assert.equal(paths.at(-1), `/v2/ai/conversations/${CONVERSATION_ID}`);
});

test("--confirm redacts a chat error and still deletes the conversation", async () => {
  const output = createOutput();
  const paths = [];
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      paths.push(requestUrl.pathname);
      if (requestUrl.pathname === `/v2/ai/assistants/${ASSISTANT_ID}`) {
        return assistantResponse();
      }
      if (requestUrl.pathname === "/v2/ai/conversations") {
        return jsonResponse({ id: CONVERSATION_ID });
      }
      if (requestUrl.pathname.endsWith("/chat")) {
        return jsonResponse({
          errors: [{
            code: "invalid_request",
            detail: `Invalid tool schema for ${TEST_ENV.TELNYX_API_KEY}. ${DEFAULT_CHAT_MESSAGE}`,
            source: { pointer: "/tools/0", parameter: "body_parameters" },
            title: "Bad Request",
          }],
        }, 400);
      }
      if (options.method === "DELETE") return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    },
    write: output.write,
  });

  const text = output.lines.join("\n");
  assert.equal(exitCode, 1);
  assert.equal(paths.at(-1), `/v2/ai/conversations/${CONVERSATION_ID}`);
  assert.match(text, /Status: 400\. Code: invalid_request/);
  assert.match(text, /Detail: Invalid tool schema/);
  assert.match(text, /Source: \/tools\/0 body_parameters/);
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(text.includes(DEFAULT_CHAT_MESSAGE), false);
});

test("--confirm does not run chat after conversation creation fails", async () => {
  const output = createOutput();
  let requestCount = 0;
  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url) => {
      requestCount += 1;
      const requestUrl = new URL(url);
      if (requestUrl.pathname === `/v2/ai/assistants/${ASSISTANT_ID}`) {
        return assistantResponse();
      }
      return jsonResponse({ errors: [{ code: "conversation_invalid" }] }, 400);
    },
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.equal(requestCount, 2);
  assert.match(output.lines.join("\n"), /conversation_invalid/);
});
