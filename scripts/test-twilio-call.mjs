import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const API_ORIGIN = "https://api.twilio.com";
const API_VERSION_PATH = "/2010-04-01";
const COMMANDS = new Set(["--help", "--dry-run", "--verify", "--confirm"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

const DEFAULT_TIMING = Object.freeze({
  httpTimeoutMs: 15_000,
  pollIntervalMs: 2_000,
  pollDeadlineMs: 90_000,
  maxTransientReadFailures: 2,
});

const TEST_TWIML = [
  "<Response>",
  "<Say>This is a Twilio configuration test. Your outbound calling setup works. Goodbye.</Say>",
  "<Hangup/>",
  "</Response>",
].join("");

class ValidationError extends Error {}

class VerificationError extends Error {}

class TwilioHttpError extends Error {
  constructor(status, code) {
    super("Twilio returned an HTTP error.");
    this.status = status;
    this.code = code;
  }
}

class UnknownCallOutcomeError extends Error {}

class PollingError extends Error {}

function defaultWrite(message) {
  console.log(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function valueFromEnvironment(env, key) {
  return String(env[key] ?? "").trim();
}

function isAccountSid(value) {
  return /^AC[0-9a-fA-F]{32}$/.test(value);
}

function isCallSid(value) {
  return /^CA[0-9a-fA-F]{32}$/.test(value);
}

function isE164Number(value) {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

function maskPhoneNumber(value) {
  return `${value.slice(0, 2)}••••${value.slice(-4)}`;
}

function maskAccountSid(value) {
  return `${value.slice(0, 2)}••••${value.slice(-4)}`;
}

function getConfiguration(env) {
  const accountSid = valueFromEnvironment(env, "TWILIO_ACCOUNT_SID");
  const authToken = valueFromEnvironment(env, "TWILIO_AUTH_TOKEN");
  const from = valueFromEnvironment(env, "TWILIO_PHONE_NUMBER");
  const to = valueFromEnvironment(env, "CALL_TO_NUMBER");

  if (!isAccountSid(accountSid)) {
    throw new ValidationError("TWILIO_ACCOUNT_SID must be a valid Twilio Account SID.");
  }

  if (!authToken) {
    throw new ValidationError("TWILIO_AUTH_TOKEN must not be empty.");
  }

  if (!isE164Number(from)) {
    throw new ValidationError("TWILIO_PHONE_NUMBER must use E.164 format.");
  }

  if (!isE164Number(to)) {
    throw new ValidationError("CALL_TO_NUMBER must use E.164 format.");
  }

  if (from === to) {
    throw new ValidationError("CALL_TO_NUMBER must differ from TWILIO_PHONE_NUMBER.");
  }

  return { accountSid, authToken, from, to };
}

function authorizationHeader(config) {
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  return `Basic ${credentials}`;
}

function createUrl(pathname, searchParameters) {
  const url = new URL(pathname, API_ORIGIN);

  for (const [key, value] of Object.entries(searchParameters ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

function accountPath(config, resourcePath) {
  return `${API_VERSION_PATH}/Accounts/${config.accountSid}${resourcePath}`;
}

function readResponseErrorCode(payload) {
  return Number.isInteger(payload?.code) ? payload.code : undefined;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new PollingError("Twilio returned an invalid JSON response.");
  }
}

async function requestJson({ config, fetchImpl, url, method, timing }) {
  let response;

  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
      },
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new PollingError("Twilio could not be reached.", { cause: error });
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw new TwilioHttpError(response.status, readResponseErrorCode(payload));
  }

  return payload;
}

async function verifyConfiguration({ config, fetchImpl, timing }) {
  const url = createUrl(
    accountPath(config, "/IncomingPhoneNumbers.json"),
    {
      PhoneNumber: config.from,
      PageSize: "1",
    },
  );
  const payload = await requestJson({
    config,
    fetchImpl,
    url,
    method: "GET",
    timing,
  });
  const number = payload.incoming_phone_numbers?.find(
    (candidate) => candidate.phone_number === config.from,
  );

  if (!number) {
    throw new VerificationError("Twilio does not list TWILIO_PHONE_NUMBER for this account.");
  }

  if (number.capabilities?.voice !== true) {
    throw new VerificationError("TWILIO_PHONE_NUMBER is not Voice-capable.");
  }
}

async function createCall({ config, fetchImpl, timing }) {
  const body = new URLSearchParams({
    To: config.to,
    From: config.from,
    Twiml: TEST_TWIML,
    Timeout: "20",
    TimeLimit: "30",
  });
  const url = createUrl(accountPath(config, "/Calls.json"));
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Twilio Call Logs.",
      { cause: error },
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Twilio Call Logs.",
      { cause: error },
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new UnknownCallOutcomeError(
        "The call outcome is unknown. Do not retry. Check Twilio Call Logs.",
      );
    }

    throw new TwilioHttpError(response.status, readResponseErrorCode(payload));
  }

  if (!isCallSid(payload?.sid)) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Twilio Call Logs.",
    );
  }

  return payload.sid;
}

function isTransientReadError(error) {
  if (error instanceof PollingError) {
    return true;
  }

  return (
    error instanceof TwilioHttpError &&
    (error.status === 404 || error.status === 429 || error.status >= 500)
  );
}

async function readCallStatus({ config, callSid, fetchImpl, timing }) {
  const url = createUrl(accountPath(config, `/Calls/${callSid}.json`));
  return requestJson({
    config,
    fetchImpl,
    url,
    method: "GET",
    timing,
  });
}

async function pollCall({
  config,
  callSid,
  fetchImpl,
  sleep,
  now,
  timing,
  write,
}) {
  const deadline = now() + timing.pollDeadlineMs;
  let transientReadFailures = 0;

  while (now() <= deadline) {
    try {
      const call = await readCallStatus({ config, callSid, fetchImpl, timing });
      const status = call.status;

      if (typeof status !== "string") {
        throw new PollingError("Twilio returned a call without a status.");
      }

      transientReadFailures = 0;
      write(`Call status: ${status}.`);

      if (TERMINAL_STATUSES.has(status)) {
        return status;
      }
    } catch (error) {
      if (!isTransientReadError(error)) {
        throw error;
      }

      transientReadFailures += 1;

      if (transientReadFailures > timing.maxTransientReadFailures) {
        throw new PollingError("Call status is unavailable. Check Twilio Call Logs.");
      }

      write("Call status is not available yet. Retrying status read.");
    }

    if (now() >= deadline) {
      break;
    }

    await sleep(timing.pollIntervalMs);
  }

  throw new PollingError("Timed out while waiting for the call status. Check Twilio Call Logs.");
}

function helpText() {
  return [
    "Twilio configuration test",
    "",
    "--dry-run  Validate local configuration. No network request is made.",
    "--verify   Verify the account owns a Voice-capable sender. No call is made.",
    "--confirm  Place one billable test call to CALL_TO_NUMBER.",
    "",
    "The script only uses CALL_TO_NUMBER. It accepts no destination argument.",
    "Existing shell variables override .env.local values loaded by Node.",
    "Answer the call and hear the message before treating the test as passed.",
  ].join("\n");
}

function describeHttpError(error) {
  const codeSuffix = error.code ? `, Twilio code ${error.code}` : "";
  return `Twilio request failed with HTTP ${error.status}${codeSuffix}.`;
}

function exitForError(error, write) {
  if (error instanceof UnknownCallOutcomeError) {
    write(error.message);
    return 2;
  }

  if (error instanceof TwilioHttpError) {
    write(describeHttpError(error));
    return 1;
  }

  if (error instanceof ValidationError || error instanceof VerificationError || error instanceof PollingError) {
    write(error.message);
    return 1;
  }

  write("Twilio test failed without a safe diagnostic.");
  return 1;
}

function writeConfigurationSummary(config, write) {
  write(`Account: ${maskAccountSid(config.accountSid)}.`);
  write(`From: ${maskPhoneNumber(config.from)}.`);
  write(`To: ${maskPhoneNumber(config.to)}.`);
  write("Note: exported shell variables override values from .env.local.");
}

export async function runCommand({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
  write = defaultWrite,
  sleep = delay,
  now = Date.now,
  timing = DEFAULT_TIMING,
}) {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  const [command] = commandArgs;

  if (commandArgs.length !== 1 || !COMMANDS.has(command)) {
    write("Use --help to see the supported command modes.");
    return 1;
  }

  if (command === "--help") {
    write(helpText());
    return 0;
  }

  let config;

  try {
    config = getConfiguration(env);
  } catch (error) {
    return exitForError(error, write);
  }

  if (command === "--dry-run") {
    writeConfigurationSummary(config, write);
    write("Dry run passed. No network request was made.");
    return 0;
  }

  try {
    await verifyConfiguration({ config, fetchImpl, timing });
    write(`Verified Voice-capable sender: ${maskPhoneNumber(config.from)}.`);

    if (command === "--verify") {
      write("Verification passed. No call was made.");
      return 0;
    }

    write(`Creating one test call from ${maskPhoneNumber(config.from)} to ${maskPhoneNumber(config.to)}.`);
    const callSid = await createCall({ config, fetchImpl, timing });
    write(`Call created. Call SID: ${callSid}.`);

    const terminalStatus = await pollCall({
      config,
      callSid,
      fetchImpl,
      sleep,
      now,
      timing,
      write,
    });

    if (terminalStatus === "completed") {
      write("Call completed. Answer the call and hear the message before treating this test as passed.");
      return 0;
    }

    write(`Call ended with ${terminalStatus}. The test did not pass.`);
    return 1;
  } catch (error) {
    return exitForError(error, write);
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const exitCode = await runCommand({ args: process.argv.slice(2) });
  process.exitCode = exitCode;
}
