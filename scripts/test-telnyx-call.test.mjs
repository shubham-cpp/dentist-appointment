import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "./test-telnyx-call.mjs";

const ACCOUNT_SID = "61bf923e-5e4d-4595-a110-56190ea18a1b";
const APPLICATION_SID = "1293384261075731499";
const CALL_SID = "v3:KBnLO0ZK3DhKM5s7bE9VluaSmKsOchKht_fUYvxcp8ysbmzCCtpkmA";

const TEST_ENV = Object.freeze({
  TELNYX_API_KEY: "test-telnyx-api-key",
  TELNYX_ACCOUNT_SID: ACCOUNT_SID,
  TELNYX_APPLICATION_SID: APPLICATION_SID,
  TELNYX_PHONE_NUMBER: "+14423790846",
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

function createNumberListResponse({
  phoneNumber = TEST_ENV.TELNYX_PHONE_NUMBER,
  status = "active",
  connectionId = APPLICATION_SID,
} = {}) {
  return jsonResponse({
    data: [
      {
        connection_id: connectionId,
        phone_number: phoneNumber,
        status,
      },
    ],
  });
}

function createApplicationResponse({
  id = APPLICATION_SID,
  outboundVoiceProfileId = "1293384261075731400",
} = {}) {
  return jsonResponse({
    data: {
      id,
      outbound: {
        outbound_voice_profile_id: outboundVoiceProfileId,
      },
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
      return jsonResponse({ from: TEST_ENV.TELNYX_PHONE_NUMBER, sid: CALL_SID, status: "queued" });
    }

    if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}`) {
      return jsonResponse({ sid: CALL_SID, status: finalStatus });
    }

    throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
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

test("--dry-run validates configuration without making a Telnyx request", async () => {
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
  assert.equal(text.includes(TEST_ENV.TELNYX_API_KEY), false);
  assert.equal(text.includes(TEST_ENV.TELNYX_PHONE_NUMBER), false);
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
    env: { ...TEST_ENV, TELNYX_ACCOUNT_SID: "not-an-account-sid" },
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("invalid configuration must not make a network request");
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 1);
  assert.equal(requestCount, 0);
  assert.match(output.lines.join("\n"), /TELNYX_ACCOUNT_SID/);
});

test("--verify confirms the account owns an active Voice number and TeXML app", async () => {
  const output = createOutput();
  const requests = [];

  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });

      if (new URL(url).pathname === "/v2/phone_numbers") {
        return createNumberListResponse();
      }

      return createApplicationResponse();
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  const numberRequest = requests.find(({ url }) => new URL(url).pathname === "/v2/phone_numbers");
  const applicationRequest = requests.find(({ url }) => (
    new URL(url).pathname === `/v2/texml_applications/${APPLICATION_SID}`
  ));

  assert.equal(exitCode, 0);
  assert.equal(requests.length, 2);
  assert.equal(new URL(numberRequest.url).searchParams.get("filter[phone_number]"), TEST_ENV.TELNYX_PHONE_NUMBER);
  assert.equal(numberRequest.options.method, "GET");
  assert.equal(numberRequest.options.redirect, "error");
  assert.equal(applicationRequest.options.method, "GET");
});

test("--verify rejects a number that is not assigned to a Voice connection", async () => {
  const output = createOutput();

  const exitCode = await runCommand({
    args: ["--verify"],
    env: TEST_ENV,
    fetchImpl: async (url) => {
      if (new URL(url).pathname === "/v2/phone_numbers") {
        return createNumberListResponse({ connectionId: null });
      }

      return createApplicationResponse();
    },
    write: output.write,
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 1);
  assert.match(output.lines.join("\n"), /Voice connection/);
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

  const callRequest = requests.find(({ url, options }) => (
    new URL(url).pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls`
    && options.method === "POST"
  ));
  const body = JSON.parse(callRequest.options.body);

  assert.equal(exitCode, 0);
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 1);
  assert.equal(body.To, TEST_ENV.CALL_TO_NUMBER);
  assert.equal(body.From, TEST_ENV.TELNYX_PHONE_NUMBER);
  assert.equal(body.ApplicationSid, APPLICATION_SID);
  assert.equal(body.Timeout, 20);
  assert.equal(body.TimeLimit, 30);
  assert.match(body.Texml, /Telnyx\.NaturalHD\.andersen_johan/);
  assert.match(body.Texml, /<Hangup\s*\/>/);
  assert.equal(body.Record, undefined);
  assert.equal(body.MachineDetection, undefined);
});

test("--confirm does not retry an uncertain create-call request", async () => {
  const output = createOutput();
  let createAttempts = 0;

  const exitCode = await runCommand({
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
    timing: FAST_TIMING,
  });

  assert.equal(exitCode, 2);
  assert.equal(createAttempts, 1);
  assert.match(output.lines.join("\n"), /outcome is unknown/i);
});

test("--confirm treats a create response without a CallSid as an unknown outcome", async () => {
  const output = createOutput();
  let createAttempts = 0;

  const exitCode = await runCommand({
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
        return jsonResponse({ from: TEST_ENV.TELNYX_PHONE_NUMBER, status: "queued" });
      }

      throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
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

      if (requestUrl.pathname === "/v2/phone_numbers") {
        return createNumberListResponse();
      }

      if (requestUrl.pathname === `/v2/texml_applications/${APPLICATION_SID}`) {
        return createApplicationResponse();
      }

      if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls` && options.method === "POST") {
        return jsonResponse({ sid: CALL_SID, status: "queued" });
      }

      if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}`) {
        statusReadAttempts += 1;

        if (statusReadAttempts === 1) {
          return jsonResponse({ errors: [{ code: "10005" }] }, 404);
        }

        return jsonResponse({ sid: CALL_SID, status: "completed" });
      }

      throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
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

      if (requestUrl.pathname === "/v2/phone_numbers") {
        return createNumberListResponse();
      }

      if (requestUrl.pathname === `/v2/texml_applications/${APPLICATION_SID}`) {
        return createApplicationResponse();
      }

      if (requestUrl.pathname === `/v2/texml/Accounts/${ACCOUNT_SID}/Calls` && options.method === "POST") {
        createAttempts += 1;
        return jsonResponse({ errors: [{ code: "10015" }] }, 500);
      }

      throw new Error(`Unexpected Telnyx request: ${requestUrl}`);
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
