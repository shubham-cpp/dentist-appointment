import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "./test-twilio-call.mjs";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const CALL_SID = `CA${"b".repeat(32)}`;

const TEST_ENV = Object.freeze({
  TWILIO_ACCOUNT_SID: ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: "test-auth-token",
  TWILIO_PHONE_NUMBER: "+14423790846",
  CALL_TO_NUMBER: "+919876543210",
});

const FAST_TIMING = Object.freeze({
  httpTimeoutMs: 50,
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

function createVerificationResponse({ voice = true } = {}) {
  return jsonResponse({
    incoming_phone_numbers: [
      {
        phone_number: TEST_ENV.TWILIO_PHONE_NUMBER,
        capabilities: { voice },
      },
    ],
  });
}

function createConfirmFetch(finalStatus) {
  return async (url, options) => {
    const requestUrl = new URL(url);

    if (requestUrl.pathname.endsWith("/IncomingPhoneNumbers.json")) {
      return createVerificationResponse();
    }

    if (requestUrl.pathname.endsWith("/Calls.json") && options.method === "POST") {
      return jsonResponse({ sid: CALL_SID }, 201);
    }

    if (requestUrl.pathname.endsWith(`/Calls/${CALL_SID}.json`)) {
      return jsonResponse({ sid: CALL_SID, status: finalStatus });
    }

    throw new Error(`Unexpected Twilio request: ${requestUrl}`);
  };
}

test("--help explains the safe command modes without reading configuration", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runCommand({
    args: ["--help"],
    env: {},
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("--help must not make a network request");
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.match(output.lines.join("\n"), /--confirm/);
});

test("--dry-run validates configuration without making a Twilio request", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: TEST_ENV,
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("--dry-run must not make a network request");
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  const text = output.lines.join("\n");

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
  assert.equal(text.includes(TEST_ENV.TWILIO_AUTH_TOKEN), false);
  assert.equal(text.includes(TEST_ENV.TWILIO_PHONE_NUMBER), false);
  assert.equal(text.includes(TEST_ENV.CALL_TO_NUMBER), false);
});

test("--dry-run accepts the package-manager argument separator", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runCommand({
    args: ["--", "--dry-run"],
    env: TEST_ENV,
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("--dry-run must not make a network request");
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 0);
  assert.equal(requestCount, 0);
});

test("--dry-run rejects malformed configuration before a network request", async () => {
  const output = createOutput();
  let requestCount = 0;

  const exitCode = await runCommand({
    args: ["--dry-run"],
    env: { ...TEST_ENV, TWILIO_ACCOUNT_SID: "not-an-account-sid" },
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("invalid configuration must not make a network request");
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 1);
  assert.equal(requestCount, 0);
  assert.match(output.lines.join("\n"), /TWILIO_ACCOUNT_SID/);
});

test("--verify confirms the configured account owns a Voice-capable number", async () => {
  const output = createOutput();
  const requests = [];

  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return createVerificationResponse();
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  const [request] = requests;
  const requestUrl = new URL(request.url);

  assert.equal(exitCode, 0);
  assert.equal(requests.length, 1);
  assert.equal(
    requestUrl.pathname,
    `/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json`,
  );
  assert.equal(requestUrl.searchParams.get("PhoneNumber"), TEST_ENV.TWILIO_PHONE_NUMBER);
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.redirect, "error");
});

test("--verify rejects a number without Voice capability", async () => {
  const output = createOutput();

  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async () => createVerificationResponse({ voice: false }),
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /Voice-capable/);
});

test("--confirm creates one bounded call and succeeds after completion", async () => {
  const output = createOutput();
  const requests = [];

  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return createConfirmFetch("completed")(url, options);
    },
    write: output.write,
    sleep: async () => {},
    timing: FAST_TIMING,
  });

  const callRequest = requests.find(({ url, options }) =>
    new URL(url).pathname.endsWith("/Calls.json") && options.method === "POST",
  );
  const body = new URLSearchParams(callRequest.options.body);

  assert.equal(exitCode, 0);
  assert.match(new URL(requests[0].url).pathname, /IncomingPhoneNumbers\.json$/);
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 1);
  assert.equal(body.get("To"), TEST_ENV.CALL_TO_NUMBER);
  assert.equal(body.get("From"), TEST_ENV.TWILIO_PHONE_NUMBER);
  assert.equal(body.get("Timeout"), "20");
  assert.equal(body.get("TimeLimit"), "30");
  assert.match(body.get("Twiml"), /<Hangup\s*\/>/);
  assert.equal(body.has("Record"), false);
  assert.equal(body.has("MachineDetection"), false);
});

test("--confirm does not retry an uncertain create-call request", async () => {
  const output = createOutput();
  let createAttempts = 0;

  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);

      if (requestUrl.pathname.endsWith("/IncomingPhoneNumbers.json")) {
        return createVerificationResponse();
      }

      if (requestUrl.pathname.endsWith("/Calls.json") && options.method === "POST") {
        createAttempts += 1;
        throw new TypeError("socket closed");
      }

      throw new Error(`Unexpected Twilio request: ${requestUrl}`);
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 2);
  assert.equal(createAttempts, 1);
  assert.match(output.lines.join("\n"), /outcome is unknown/i);
});

test("--confirm retries an eventually consistent call-status read", async () => {
  const output = createOutput();
  let statusReadAttempts = 0;

  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);

      if (requestUrl.pathname.endsWith("/IncomingPhoneNumbers.json")) {
        return createVerificationResponse();
      }

      if (requestUrl.pathname.endsWith("/Calls.json") && options.method === "POST") {
        return jsonResponse({ sid: CALL_SID }, 201);
      }

      if (requestUrl.pathname.endsWith(`/Calls/${CALL_SID}.json`)) {
        statusReadAttempts += 1;

        if (statusReadAttempts === 1) {
          return jsonResponse({ code: 20404 }, 404);
        }

        return jsonResponse({ sid: CALL_SID, status: "completed" });
      }

      throw new Error(`Unexpected Twilio request: ${requestUrl}`);
    },
    write: output.write,
    sleep: async () => {},
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 0);
  assert.equal(statusReadAttempts, 2);
  assert.match(output.lines.join("\n"), /Retrying status read/);
});

test("--confirm treats a server error during call creation as an unknown outcome", async () => {
  const output = createOutput();
  let createAttempts = 0;

  const exitCode = await runCommand({
    args: ["--confirm"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);

      if (requestUrl.pathname.endsWith("/IncomingPhoneNumbers.json")) {
        return createVerificationResponse();
      }

      if (requestUrl.pathname.endsWith("/Calls.json") && options.method === "POST") {
        createAttempts += 1;
        return jsonResponse({ code: 20500 }, 500);
      }

      throw new Error(`Unexpected Twilio request: ${requestUrl}`);
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 2);
  assert.equal(createAttempts, 1);
  assert.match(output.lines.join("\n"), /outcome is unknown/i);
});

for (const terminalStatus of ["busy", "failed", "no-answer", "canceled"]) {
  test(`--confirm reports ${terminalStatus} as a failed call`, async () => {
    const output = createOutput();

    const exitCode = await runCommand({
      args: ["--confirm"],
      env: TEST_ENV,
      fetchImpl: createConfirmFetch(terminalStatus),
      write: output.write,
      sleep: async () => {},
      timing: FAST_TIMING,
    });

    assert.equal(exitCode, 1);
    assert.match(output.lines.join("\n"), new RegExp(terminalStatus));
  });
}
