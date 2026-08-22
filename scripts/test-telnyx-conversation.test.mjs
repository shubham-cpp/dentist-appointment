import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_LINES,
  applyOliverTurn,
  classifyCallerIntent,
  classifyLocalOliverTurn,
  createConversationState,
  parseIntentReply,
  runCommand,
  formatTurnMetrics,
  speechPlaybackMs,
  splitSpeechChunks,
} from "./test-telnyx-conversation.mjs";

const ACCOUNT_SID = "61bf923e-5e4d-4595-a110-56190ea18a1b";
const APPLICATION_SID = "1293384261075731499";
const CALL_SID = "v3:KBnLO0ZK3DhKM5s7bE9VluaSmKsOchKht_fUYvxcp8ysbmzCCtpkmA";

const TEST_ENV = Object.freeze({
  CALL_TO_NUMBER: "+919876543210",
  TELNYX_ACCOUNT_SID: ACCOUNT_SID,
  TELNYX_API_KEY: "test-telnyx-api-key",
  TELNYX_APPLICATION_SID: APPLICATION_SID,
  TELNYX_PHONE_NUMBER: "+14423790846",
  TELNYX_PUBLIC_BASE_URL: "https://example.ngrok-free.app",
  VOICE_AI_BASE_URL: "http://127.0.0.1:18765/v1",
});

const FAST_TIMING = Object.freeze({
  httpTimeoutMs: 50,
  intentTimeoutMs: 1_500,
  pollIntervalMs: 0,
  pollDeadlineMs: 50,
  maxTransientReadFailures: 2,
});

function createOutput() {
  const lines = [];

  return {
    lines,
    write(line) {
      lines.push(String(line));
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createNumberListResponse({ connectionId = APPLICATION_SID } = {}) {
  return jsonResponse({
    data: [
      {
        connection_id: connectionId,
        phone_number: TEST_ENV.TELNYX_PHONE_NUMBER,
        status: "active",
      },
    ],
  });
}

function createApplicationResponse() {
  return jsonResponse({
    data: {
      id: APPLICATION_SID,
      outbound: { outbound_voice_profile_id: "1293384261075731400" },
    },
  });
}

function createConfirmFetch(finalStatus) {
  return async (url, options) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname === "/v2/phone_numbers") {
      return createNumberListResponse();
    }

    if (requestUrl.pathname === `/v2/texml_applications/${APPLICATION_SID}`) {
      return createApplicationResponse();
    }

    if (
      requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls`
      && options.method === "POST"
    ) {
      return jsonResponse({ sid: CALL_SID, status: "queued" });
    }

    if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}`) {
      return jsonResponse({ sid: CALL_SID, status: finalStatus });
    }

    throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
  };
}

function fakeRelayServer() {
  return {
    async close() {},
  };
}

function fakeTunnel(publicBaseUrl = TEST_ENV.TELNYX_PUBLIC_BASE_URL) {
  return {
    publicBaseUrl,
    async stop() {},
  };
}

function fakeProxy() {
  return {
    async stop() {},
  };
}

async function runIsolatedCommand(options) {
  return runCommand({
    classifyIntent: async () => "confirm",
    completeConversation: async () => ({ frames: ["setup", "prompt"], success: true }),
    sleep: async () => {},
    startProxy: async () => fakeProxy(),
    startRelayServer: async () => fakeRelayServer(),
    startTunnel: async () => fakeTunnel(),
    timing: FAST_TIMING,
    ...options,
  });
}

test("--help explains the conversation command modes without reading configuration", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--help"],
    env: {},
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("--help must not make a network request");
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.match(output.lines.join("\n"), /--confirm/);
});

test("--dry-run validates configuration without making a Telnyx request", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--dry-run"],
    env: TEST_ENV,
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("--dry-run must not make a network request");
    },
    write: output.write,
  });

  const text = output.lines.join("\n");

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(text.includes(TEST_ENV.TELNYX_PHONE_NUMBER), false);
  assert.equal(text.includes(TEST_ENV.CALL_TO_NUMBER), false);
});

test("--dry-run allows a missing public tunnel URL because ngrok starts later", async () => {
  const output = createOutput();
  let requestCount = 0;
  let tunnelStarts = 0;
  let proxyStarts = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--dry-run"],
    env: { ...TEST_ENV, TELNYX_PUBLIC_BASE_URL: "" },
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("invalid configuration must not make a network request");
    },
    startProxy: async () => {
      proxyStarts += 1;
      return fakeProxy();
    },
    startTunnel: async () => {
      tunnelStarts += 1;
      return fakeTunnel();
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.equal(tunnelStarts, 0);
  assert.equal(proxyStarts, 0);
  assert.match(output.lines.join("\n"), /ngrok will start for port 3002/);
});

test("--no-ngrok rejects a missing public tunnel URL", async () => {
  const output = createOutput();
  let tunnelStarts = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--verify", "--no-ngrok"],
    env: { ...TEST_ENV, TELNYX_PUBLIC_BASE_URL: "" },
    fetchImpl: createConfirmFetch("completed"),
    startTunnel: async () => {
      tunnelStarts += 1;
      return fakeTunnel();
    },
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.equal(tunnelStarts, 0);
  assert.match(output.lines.join("\n"), /TELNYX_PUBLIC_BASE_URL/);
});

test("--verify starts the Codex proxy then ngrok, and stops both", async () => {
  const output = createOutput();
  const started = [];
  let proxyStops = 0;
  let tunnelStops = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--verify"],
    env: { ...TEST_ENV, TELNYX_PUBLIC_BASE_URL: "" },
    fetchImpl: createConfirmFetch("completed"),
    startProxy: async ({ aiBaseUrl }) => {
      started.push(`proxy:${aiBaseUrl}`);
      return {
        async stop() {
          proxyStops += 1;
        },
      };
    },
    startTunnel: async ({ port }) => {
      started.push(`tunnel:${port}`);
      return {
        publicBaseUrl: "https://runtime-tunnel.ngrok-free.app",
        async stop() {
          tunnelStops += 1;
        },
      };
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(started, ["proxy:http://127.0.0.1:18765/v1", "tunnel:3002"]);
  assert.equal(proxyStops, 1);
  assert.equal(tunnelStops, 1);
  assert.match(output.lines.join("\n"), /runtime-tunnel\.ngrok-free\.app/);
});

test("--skip-proxy does not start claude-code-proxy", async () => {
  const output = createOutput();
  let proxyStarts = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--verify", "--skip-proxy"],
    env: TEST_ENV,
    fetchImpl: createConfirmFetch("completed"),
    startProxy: async () => {
      proxyStarts += 1;
      return fakeProxy();
    },
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(proxyStarts, 0);
  assert.match(output.lines.join("\n"), /Using existing Codex proxy/);
});

test("--verify checks Telnyx resources and a spoken confirm variant", async () => {
  const output = createOutput();
  const classified = [];

  const exitCode = await runIsolatedCommand({
    args: ["--verify"],
    classifyIntent: async ({ text }) => {
      classified.push(text);
      return "confirm";
    },
    env: TEST_ENV,
    fetchImpl: createConfirmFetch("completed"),
    write: output.write,
  });

  assert.equal(exitCode, 0);
  assert.equal(classified[0], "Yeah I'm Oliver");
  assert.match(classified[1] ?? "", /later this week/);
  assert.match(output.lines.join("\n"), /Verification passed/);
});

test("--verify fails when the intent model does not treat a spoken variant as confirm", async () => {
  const output = createOutput();

  const exitCode = await runIsolatedCommand({
    args: ["--verify"],
    classifyIntent: async () => "unclear",
    env: TEST_ENV,
    fetchImpl: createConfirmFetch("completed"),
    write: output.write,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /local matcher/);
});

test("--confirm creates one ConversationRelay call", async () => {
  const output = createOutput();
  const requests = [];

  const exitCode = await runIsolatedCommand({
    args: ["--confirm"],
    env: { ...TEST_ENV, TELNYX_PUBLIC_BASE_URL: "https://stale-env.ngrok-free.app" },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return createConfirmFetch("completed")(url, options);
    },
    startTunnel: async () => fakeTunnel("https://runtime-tunnel.ngrok-free.app"),
    write: output.write,
  });

  const callRequest = requests.find(({ url, options }) => (
    new URL(url).pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls`
    && options.method === "POST"
  ));
  const body = JSON.parse(callRequest.options.body);

  assert.equal(exitCode, 0);
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 1);
  assert.equal(body.To, TEST_ENV.CALL_TO_NUMBER);
  assert.equal(body.From, TEST_ENV.TELNYX_PHONE_NUMBER);
  assert.match(body.Texml, /<Say voice="Telnyx\.Natural\.abbie">/);
  assert.match(body.Texml, /Am I speaking with Oliver/);
  assert.match(body.Texml, /ConversationRelay/);
  assert.equal(/welcomeGreeting=/.test(body.Texml), false);
  assert.match(body.Texml, /wss:\/\/runtime-tunnel.ngrok-free.app\/telnyx\/conversation/);
  assert.equal(body.Texml.includes("stale-env.ngrok-free.app"), false);
  assert.match(body.Texml, /language="en-IN"/);
  assert.match(output.lines.join("\n"), /Conversation frames/);
});

test("--confirm does not retry an uncertain create-call request", async () => {
  const output = createOutput();
  let createAttempts = 0;

  const exitCode = await runIsolatedCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);

      if (requestUrl.pathname === "/v2/phone_numbers") {
        return createNumberListResponse();
      }

      if (requestUrl.pathname === `/v2/texml_applications/${APPLICATION_SID}`) {
        return createApplicationResponse();
      }

      if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls` && options.method === "POST") {
        createAttempts += 1;
        throw new TypeError("socket closed");
      }

      throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
    },
    write: output.write,
  });

  assert.equal(exitCode, 2);
  assert.equal(createAttempts, 1);
  assert.match(output.lines.join("\n"), /outcome is unknown/i);
});

test("spoken confirm variants advance Oliver through both turns", () => {
  let state = createConversationState();
  const afterIdentity = applyOliverTurn(state, parseIntentReply("confirm"));
  assert.equal(afterIdentity.text, AGENT_LINES.reschedule);
  assert.equal(afterIdentity.end, false);

  const afterReschedule = applyOliverTurn(afterIdentity.nextState, parseIntentReply("confirm"));
  assert.equal(afterReschedule.text, AGENT_LINES.closing);
  assert.match(afterReschedule.text, /rescheduled your visit to 26 August/i);
  assert.equal(afterReschedule.end, true);
  assert.equal(afterReschedule.nextState.success, true);
  assert.ok(speechPlaybackMs(afterReschedule.text) >= 2500);
});

test("classifyCallerIntent uses the local matcher for spoken yes variants", async () => {
  let modelCalls = 0;
  const classified = await classifyCallerIntent({
    completeIntent: async () => {
      modelCalls += 1;
      return "unclear";
    },
    config: {
      aiApiKey: "local-codex-proxy-placeholder",
      aiBaseUrl: "http://127.0.0.1:18765/v1",
      aiModel: "gpt-5.6-terra",
      aiTimeoutMs: 5_000,
    },
    phase: "identity",
    text: "Yeah I'm Oliver",
    timing: FAST_TIMING,
  });

  assert.equal(classified.intent, "confirm");
  assert.equal(classified.source, "local");
  assert.equal(modelCalls, 0);
});

test("classifyCallerIntent uses the model only when the local matcher is unclear", async () => {
  const classified = await classifyCallerIntent({
    completeIntent: async ({ text }) => {
      assert.match(text, /later this week/);
      return "unclear";
    },
    config: {
      aiApiKey: "local-codex-proxy-placeholder",
      aiBaseUrl: "http://127.0.0.1:18765/v1",
      aiModel: "gpt-5.6-terra",
      aiTimeoutMs: 5_000,
    },
    phase: "reschedule",
    text: "Hmm I think maybe later this week if that is still possible",
    timing: FAST_TIMING,
  });

  assert.equal(classified.intent, "unclear");
  assert.equal(classified.source, "model");
});

test("classifyCallerIntent includes the HTTP status when the model rejects the request", async () => {
  await assert.rejects(
    () => classifyCallerIntent({
      completeIntent: async () => {
        const error = new Error("bad request");
        error.statusCode = 400;
        error.responseBody = JSON.stringify({
          error: { message: "This model is only supported in v1/responses" },
        });
        throw error;
      },
      config: {
        aiApiKey: "local-codex-proxy-placeholder",
        aiBaseUrl: "http://127.0.0.1:18765/v1",
        aiModel: "gpt-5.6-terra",
        aiTimeoutMs: 5_000,
      },
      phase: "reschedule",
      text: "Hmm I think maybe later this week if that is still possible",
      timing: FAST_TIMING,
    }),
    /HTTP 400.*v1\/responses/,
  );
});

test("Oliver local matcher accepts spoken confirmations", () => {
  assert.equal(classifyLocalOliverTurn("identity", "Yeah I'm Oliver"), "confirm");
  assert.equal(classifyLocalOliverTurn("identity", "Yes"), "confirm");
  assert.equal(classifyLocalOliverTurn("reschedule", "Okay understandable, I'm ok with the 26th"), "confirm");
  assert.equal(classifyLocalOliverTurn("reschedule", "No"), "deny");
  assert.equal(classifyLocalOliverTurn("identity", "Hmm maybe later"), "unclear");
});

test("parseIntentReply accepts model JSON and plain confirm words", () => {
  assert.equal(parseIntentReply("confirm"), "confirm");
  assert.equal(parseIntentReply('{"intent":"confirm"}'), "confirm");
  assert.equal(parseIntentReply("deny"), "deny");
  assert.equal(parseIntentReply("I am not sure"), "unclear");
});

test("a deny on identity ends without offering a reschedule", () => {
  const reply = applyOliverTurn(createConversationState(), "deny");
  assert.equal(reply.text, AGENT_LINES.identityDenied);
  assert.equal(reply.end, true);
  assert.equal(reply.nextState.success, false);
});

test("two unclear replies end the call safely", () => {
  const first = applyOliverTurn(createConversationState(), "unclear");
  assert.equal(first.text, AGENT_LINES.identityRetry);
  assert.equal(first.end, false);

  const second = applyOliverTurn(first.nextState, "unclear");
  assert.equal(second.text, AGENT_LINES.failed);
  assert.equal(second.end, true);
});

test("turn metrics label dead air separately from classifier time", () => {
  const text = formatTurnMetrics({
    deadAirMs: 4206,
    eotMs: 400,
    finality: "partial",
    intentMs: 3806,
    phase: "identity",
    sinceAgentMs: 1926,
    ttsSendMs: 1,
  });

  assert.match(text, /TURN identity partial/);
  assert.match(text, /dead_air_ms=4206/);
  assert.match(text, /intent_ms=3806/);
  assert.match(text, /eot_ms=400/);
});

test("speech is split so Conversation Relay can start TTS before the last clause", () => {
  const chunks = splitSpeechChunks(AGENT_LINES.reschedule);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.some((chunk) => chunk.includes("Dr Patel")), true);
  assert.equal(chunks.at(-1)?.includes("26 August"), true);
});
