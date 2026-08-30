import assert from "node:assert/strict";
import test from "node:test";

import {
  CALL_GREETING,
  CALL_INSTRUCTIONS,
  CALL_TOOLS,
  LOW_LATENCY_PROFILE,
  runCommand,
} from "./test-telnyx-assistant-call.mjs";

const MAIN_ASSISTANT_ID = "assistant-8b41cac9-9f80-4ca7-8d38-868f076abaaa";
const CONNECTION_ID = "3034196794511721614";
const PROFILE_ID = "3034196794511721700";
const CALL_CONTROL_ID = "v3:KBnLO0ZK3DhKM5s7bE9VluaSmKsOchKht_fUYvxcp8ysbmzCCtpkmA";
const CALL_LEG_ID = "2dc6fc34-f9e0-11ea-b68e-02420a0f7768";
const CALL_SESSION_ID = "2dc1b3c8-f9e0-11ea-bc5a-02420a0f7768";
const COMMAND_ID = "891510ac-f3e4-11e8-af5b-de00688a4901";

const TEST_ENV = Object.freeze({
  CALL_TO_NUMBER: "+919876543210",
  TELNYX_AI_ASSISTANT_ID: MAIN_ASSISTANT_ID,
  TELNYX_API_KEY: "test-telnyx-api-key",
  TELNYX_CONNECTION_ID: CONNECTION_ID,
  TELNYX_PHONE_NUMBER: "+14423790846",
  VOICE_GATEWAY_DEBUG_LOG_PATH: "/tmp/test-voice-gateway.jsonl",
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice-demo.example.test",
  VOICE_CALLS_ENABLED: "true",
  VOICE_DEMO_MODE: "true",
  VOICE_RUNTIME: "telnyx-ai-assistant",
});

const FAST_TIMING = Object.freeze({
  diagnosticDeadlineMs: 10,
  diagnosticPollIntervalMs: 0,
  httpTimeoutMs: 1_000,
  maxTransientReadFailures: 2,
  pollDeadlineMs: 100,
  pollIntervalMs: 0,
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
    enabled_features: ["telephony"],
    id: MAIN_ASSISTANT_ID,
    llm_api_key_ref: "dentist_voice_assistant_trial_openai_api_key",
    model: "openai/gpt-5.6-luna",
    name: "Controlled dental scheduling trial",
    interruption_settings: LOW_LATENCY_PROFILE.interruption_settings,
    privacy_settings: { data_retention: false },
    telephony_settings: {
      recording_settings: { enabled: false },
      send_message_history_updates: true,
    },
    transcription: LOW_LATENCY_PROFILE.transcription,
    tool_ids: Array.from({ length: 9 }, (_, index) => `tool-${index}-configured`),
    tools: Array.from({ length: 9 }, () => ({ type: "webhook" })),
    version_id: "20260824T084601538993",
    ...overrides,
  });
}

function connectionResponse() {
  return jsonResponse({
    data: {
      active: true,
      id: CONNECTION_ID,
      outbound: { outbound_voice_profile_id: PROFILE_ID },
    },
  });
}

function profileResponse() {
  return jsonResponse({ data: { enabled: true, id: PROFILE_ID } });
}

function numberResponse() {
  return jsonResponse({
    data: [{ phone_number: TEST_ENV.TELNYX_PHONE_NUMBER, status: "active" }],
  });
}

function createVerificationFetch(requests, assistant = assistantResponse()) {
  return async (url, options) => {
    const requestUrl = new URL(url);
    requests.push({
      body: options.body ? JSON.parse(options.body) : undefined,
      method: options.method,
      path: requestUrl.pathname,
    });
    if (requestUrl.pathname === `/v2/ai/assistants/${MAIN_ASSISTANT_ID}`) {
      return assistant;
    }
    if (requestUrl.pathname === `/v2/call_control_applications/${CONNECTION_ID}`) {
      return connectionResponse();
    }
    if (requestUrl.pathname === `/v2/outbound_voice_profiles/${PROFILE_ID}`) {
      return profileResponse();
    }
    if (requestUrl.pathname === "/v2/phone_numbers") {
      return numberResponse();
    }
    if (requestUrl.pathname === "/voice/assistant/diagnostics") {
      return jsonResponse({ runtime: "telnyx-ai-assistant", status: "ready" });
    }
    throw new Error(`Unexpected request: ${requestUrl.pathname}`);
  };
}

function diagnosticLog() {
  return [
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-answered",
        eventType: "call.answered",
        occurredAt: "2026-08-24T12:00:00.000Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:00.050Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-conversation-created",
        eventType: "call.conversation.created",
        occurredAt: "2026-08-24T12:00:00.200Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:00.250Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-greeting",
        eventType: "call.ai_gather.message_history_updated",
        messageHistory: [{ content: CALL_GREETING, role: "assistant" }],
        occurredAt: "2026-08-24T12:00:00.400Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:00.450Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-user",
        eventType: "call.ai_gather.message_history_updated",
        messageHistory: [
          { content: CALL_GREETING, role: "assistant" },
          { content: "Yes, this is Oliver.", role: "user" },
        ],
        occurredAt: "2026-08-24T12:00:03.000Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:03.050Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-assistant-token",
        eventType: "call.ai_gather.message_history_updated",
        messageHistory: [
          { content: CALL_GREETING, role: "assistant" },
          { content: "Yes, this is Oliver.", role: "user" },
          { content: "Thank", role: "assistant" },
        ],
        occurredAt: "2026-08-24T12:00:03.800Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:03.850Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-assistant-sentence",
        eventType: "call.ai_gather.message_history_updated",
        messageHistory: [
          { content: CALL_GREETING, role: "assistant" },
          { content: "Yes, this is Oliver.", role: "user" },
          { content: "Thank you.", role: "assistant" },
        ],
        occurredAt: "2026-08-24T12:00:04.100Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:04.150Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-assistant-final",
        eventType: "call.ai_gather.message_history_updated",
        messageHistory: [
          { content: CALL_GREETING, role: "assistant" },
          { content: "Yes, this is Oliver.", role: "user" },
          { content: "Thank you. Can we reschedule your appointment?", role: "assistant" },
        ],
        occurredAt: "2026-08-24T12:00:04.600Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:04.650Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        delayMs: 2_500,
        eventId: "gateway-terminal-hangup-scheduled",
        eventType: "gateway.terminal_hangup.scheduled",
        generationSpanMs: 800,
        occurredAt: "2026-08-24T12:00:04.600Z",
        playbackEstimateMs: 3_360,
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:04.650Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "gateway-terminal-hangup-succeeded",
        eventType: "gateway.terminal_hangup.succeeded",
        occurredAt: "2026-08-24T12:00:05.400Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:05.450Z",
    },
    {
      data: {
        commandId: COMMAND_ID,
        eventId: "event-hangup",
        eventType: "call.hangup",
        hangupCause: "normal_clearing",
        hangupSource: "telnyx",
        occurredAt: "2026-08-24T12:00:05.500Z",
      },
      event: "telnyx.standalone_assistant_diagnostic",
      timestamp: "2026-08-24T12:00:05.550Z",
    },
  ].map((entry) => JSON.stringify(entry)).join("\n");
}

test("--help explains the call boundary without reading configuration", async () => {
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
  assert.match(output.lines.join("\n"), /one billable call/i);
  assert.match(output.lines.join("\n"), /does not exercise or change the scheduling workflow/i);
});

test("--dry-run validates and masks local settings without a request", async () => {
  const output = createOutput();
  let requestCount = 0;
  const exitCode = await runCommand({
    args: ["--", "--dry-run"],
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
  assert.equal(text.includes(TEST_ENV.TELNYX_PHONE_NUMBER), false);
  assert.equal(text.includes(TEST_ENV.CALL_TO_NUMBER), false);
  assert.equal(text.includes(MAIN_ASSISTANT_ID), false);
});

test("--dry-run rejects an invalid configured assistant", async () => {
  const output = createOutput();
  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: {
      ...TEST_ENV,
      TELNYX_AI_ASSISTANT_ID: "not-an-assistant",
    },
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /TELNYX_AI_ASSISTANT_ID/);
});

test("--dry-run requires the managed runtime and both call guards", async () => {
  for (const [key, value] of [
    ["VOICE_RUNTIME", "conversation-relay"],
    ["VOICE_CALLS_ENABLED", "false"],
    ["VOICE_DEMO_MODE", "false"],
  ]) {
    const output = createOutput();
    const exitCode = await runCommand({
      args: ["--dry-run"],
      env: { ...TEST_ENV, [key]: value },
      write: output.write,
    });
    assert.equal(exitCode, 1);
    assert.match(output.lines.join("\n"), new RegExp(key));
  }
});

test("--verify checks Telnyx and the public diagnostic receiver", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: createVerificationFetch(requests),
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [
    { method: "GET", path: `/v2/ai/assistants/${MAIN_ASSISTANT_ID}` },
    { method: "GET", path: `/v2/call_control_applications/${CONNECTION_ID}` },
    { method: "GET", path: `/v2/outbound_voice_profiles/${PROFILE_ID}` },
    { method: "GET", path: "/v2/phone_numbers" },
    { method: "GET", path: "/voice/assistant/diagnostics" },
  ]);
  assert.match(output.lines.join("\n"), /No call was made and no resource changed/);
});

test("--verify rejects an assistant without telephony", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: createVerificationFetch(
      requests,
      assistantResponse({ enabled_features: [] }),
    ),
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.equal(requests.length, 1);
  assert.match(output.lines.join("\n"), /telephony enabled/);
});

test("--verify rejects the previous managed assistant model", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: createVerificationFetch(
      requests,
      assistantResponse({
        llm_api_key_ref: undefined,
        model: "anthropic/claude-haiku-4-5",
      }),
    ),
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.equal(requests.length, 1);
  assert.match(output.lines.join("\n"), /GPT-5\.6 Luna model/);
});

test("--verify rejects an assistant with recording enabled", async () => {
  const output = createOutput();
  const requests = [];
  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: createVerificationFetch(
      requests,
      assistantResponse({
        telephony_settings: { recording_settings: { enabled: true } },
      }),
    ),
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /disable recording/);
});

test("--confirm places one bounded Hangup-only assistant call", async () => {
  const output = createOutput();
  const requests = [];
  let writtenReport;
  let writtenReportPath;
  const verifyFetch = createVerificationFetch(requests);
  const exitCode = await runCommand({
    args: ["--confirm"],
    createId: () => COMMAND_ID,
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname === "/v2/calls" && options.method === "POST") {
        requests.push({
          body: JSON.parse(options.body),
          method: options.method,
          path: requestUrl.pathname,
        });
        return jsonResponse({
          data: {
            call_control_id: CALL_CONTROL_ID,
            call_leg_id: CALL_LEG_ID,
            call_session_id: CALL_SESSION_ID,
          },
        });
      }
      if (requestUrl.pathname === `/v2/calls/${CALL_CONTROL_ID}`) {
        requests.push({ method: options.method, path: requestUrl.pathname });
        return jsonResponse({
          data: {
            call_control_id: CALL_CONTROL_ID,
            call_duration: 18,
            is_alive: false,
          },
        });
      }
      return verifyFetch(url, options);
    },
    readDiagnosticLog: async () => diagnosticLog(),
    sleep: async () => {},
    timing: FAST_TIMING,
    write: output.write,
    writeDiagnosticReport: async (path, report) => {
      writtenReport = report;
      writtenReportPath = path;
    },
  });

  const callRequests = requests.filter(
    ({ method, path }) => method === "POST" && path === "/v2/calls",
  );
  const body = callRequests[0].body;
  assert.equal(exitCode, 0);
  assert.equal(callRequests.length, 1);
  assert.equal(body.to, TEST_ENV.CALL_TO_NUMBER);
  assert.equal(body.from, TEST_ENV.TELNYX_PHONE_NUMBER);
  assert.equal(body.connection_id, CONNECTION_ID);
  assert.equal(body.assistant.id, MAIN_ASSISTANT_ID);
  assert.equal(body.assistant.greeting, CALL_GREETING);
  assert.equal(body.assistant.instructions, CALL_INSTRUCTIONS);
  assert.deepEqual(body.assistant.tools, CALL_TOOLS);
  assert.deepEqual(body.assistant.tools.map(({ type }) => type), ["hangup"]);
  assert.equal(body.time_limit_secs, 60);
  assert.equal(body.timeout_secs, 20);
  assert.equal(body.retry_on_timeout, false);
  assert.equal(body.record, undefined);
  assert.equal(body.answering_machine_detection, undefined);
  assert.equal(
    body.webhook_url,
    "https://voice-demo.example.test/voice/assistant/diagnostics",
  );
  assert.equal(body.webhook_url_method, "POST");
  assert.equal(JSON.stringify(body).includes("assistant-7d3b9b8d"), false);
  assert.match(writtenReportPath, /\.voice-logs\/telnyx-assistant-call-/);
  assert.equal(writtenReport.telemetry_status, "captured");
  assert.equal(
    writtenReport.latency_proxies.greeting.answer_to_first_assistant_update_ms,
    400,
  );
  assert.equal(
    writtenReport.latency_proxies.greeting.answer_to_conversation_created_ms,
    200,
  );
  assert.equal(
    writtenReport.latency_proxies.greeting
      .conversation_created_to_first_assistant_update_ms,
    200,
  );
  assert.deepEqual(writtenReport.latency_proxies.turns, [{
    assistant_final_text_after_user_update_ms: 1_600,
    assistant_first_sentence_after_user_update_ms: 1_100,
    assistant_first_token_after_user_update_ms: 800,
    assistant_generation_span_ms: 800,
    assistant_message_index: 2,
    user_message_index: 1,
  }]);
  assert.deepEqual(writtenReport.latency_proxies.terminal, {
    automatic_hangup_method: "gateway_fallback",
    fallback_delay_ms: 2_500,
    fallback_generation_span_ms: 800,
    fallback_phase: "succeeded",
    fallback_playback_estimate_ms: 3_360,
    hangup_cause: "normal_clearing",
    hangup_source: "telnyx",
    last_assistant_update_to_hangup_ms: 900,
    last_assistant_update_to_long_silence_ms: null,
    long_silence_observed: false,
    long_silence_to_hangup_ms: null,
  });
  assert.deepEqual(writtenReport.transcript.map(({ content, role }) => ({ content, role })), [
    { content: CALL_GREETING, role: "assistant" },
    { content: "Yes, this is Oliver.", role: "user" },
    { content: "Thank you. Can we reschedule your appointment?", role: "assistant" },
  ]);
  assert.match(output.lines.join("\n"), /Automatic hangup method: gateway_fallback/);
  assert.match(output.lines.join("\n"), /Automatic hangup fallback: succeeded/);
  assert.match(output.lines.join("\n"), /does not validate scheduling tools/);
});

test("--confirm never retries an uncertain call creation", async () => {
  const output = createOutput();
  const requests = [];
  const verifyFetch = createVerificationFetch(requests);
  let createAttempts = 0;
  const exitCode = await runCommand({
    args: ["--confirm"],
    createId: () => COMMAND_ID,
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname === "/v2/calls") {
        createAttempts += 1;
        throw new TypeError("socket closed");
      }
      return verifyFetch(url, options);
    },
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 2);
  assert.equal(createAttempts, 1);
  assert.match(output.lines.join("\n"), /outcome is unknown/i);
});

test("--confirm treats a server response as an unknown call outcome", async () => {
  const output = createOutput();
  const requests = [];
  const verifyFetch = createVerificationFetch(requests);
  const exitCode = await runCommand({
    args: ["--confirm"],
    createId: () => COMMAND_ID,
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      if (new URL(url).pathname === "/v2/calls") {
        return jsonResponse({ errors: [{ code: "10015" }] }, 500);
      }
      return verifyFetch(url, options);
    },
    timing: FAST_TIMING,
    write: output.write,
  });

  assert.equal(exitCode, 2);
  assert.match(output.lines.join("\n"), /Do not retry/);
});

test("--confirm retries one eventually consistent status read", async () => {
  const output = createOutput();
  const requests = [];
  const verifyFetch = createVerificationFetch(requests);
  let statusReads = 0;
  const exitCode = await runCommand({
    args: ["--confirm"],
    createId: () => COMMAND_ID,
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname === "/v2/calls") {
        return jsonResponse({
          data: {
            call_control_id: CALL_CONTROL_ID,
            call_leg_id: CALL_LEG_ID,
            call_session_id: CALL_SESSION_ID,
          },
        });
      }
      if (requestUrl.pathname === `/v2/calls/${CALL_CONTROL_ID}`) {
        statusReads += 1;
        if (statusReads === 1) {
          return jsonResponse({ errors: [{ code: "10005" }] }, 404);
        }
        return jsonResponse({
          data: {
            call_control_id: CALL_CONTROL_ID,
            call_duration: 9,
            is_alive: false,
          },
        });
      }
      return verifyFetch(url, options);
    },
    readDiagnosticLog: async () => diagnosticLog(),
    sleep: async () => {},
    timing: FAST_TIMING,
    write: output.write,
    writeDiagnosticReport: async () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(statusReads, 2);
  assert.match(output.lines.join("\n"), /Retrying/);
});
