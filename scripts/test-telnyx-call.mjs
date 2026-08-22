import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const API_ORIGIN = "https://api.telnyx.com";
const COMMANDS = new Set(["--help", "--dry-run", "--verify", "--confirm"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);
const SAY_VOICE = "Telnyx.NaturalHD.andersen_johan";
const TEST_TEXML = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<Response>",
  `<Say voice="${SAY_VOICE}">This is a Telnyx configuration test. Your outbound calling setup works. Goodbye.</Say>`,
  "<Hangup/>",
  "</Response>",
].join("");

const DEFAULT_TIMING = Object.freeze({
  httpTimeoutMs: 15_000,
  pollIntervalMs: 2_000,
  pollDeadlineMs: 90_000,
  maxTransientReadFailures: 2,
});

class ValidationError extends Error {}

class VerificationError extends Error {}

class TelnyxHttpError extends Error {
  constructor(status, code) {
    super("Telnyx returned an HTTP error.");
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isApplicationSid(value) {
  return /^\d{10,20}$/.test(value);
}

function isCallSid(value) {
  return typeof value === "string" && /^v3:[A-Za-z0-9_-]{8,}$/.test(value);
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
  const apiKey = valueFromEnvironment(env, "TELNYX_API_KEY");
  const accountSid = valueFromEnvironment(env, "TELNYX_ACCOUNT_SID");
  const applicationSid = valueFromEnvironment(env, "TELNYX_APPLICATION_SID");
  const from = valueFromEnvironment(env, "TELNYX_PHONE_NUMBER");
  const to = valueFromEnvironment(env, "CALL_TO_NUMBER");

  if (!apiKey) {
    throw new ValidationError("TELNYX_API_KEY must not be empty.");
  }

  if (!isAccountSid(accountSid)) {
    throw new ValidationError("TELNYX_ACCOUNT_SID must be a valid Telnyx account UUID.");
  }

  if (!isApplicationSid(applicationSid)) {
    throw new ValidationError("TELNYX_APPLICATION_SID must be a Telnyx TeXML application id.");
  }

  if (!isE164Number(from)) {
    throw new ValidationError("TELNYX_PHONE_NUMBER must use E.164 format.");
  }

  if (!isE164Number(to)) {
    throw new ValidationError("CALL_TO_NUMBER must use E.164 format.");
  }

  if (from === to) {
    throw new ValidationError("CALL_TO_NUMBER must differ from TELNYX_PHONE_NUMBER.");
  }

  return { accountSid, apiKey, applicationSid, from, to };
}

function authorizationHeader(config) {
  return `Bearer ${config.apiKey}`;
}

function createUrl(pathname, searchParameters) {
  const url = new URL(pathname, API_ORIGIN);

  for (const [key, value] of Object.entries(searchParameters ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

function readResponseErrorCode(payload) {
  const firstError = payload?.errors?.[0];
  const code = firstError?.code ?? payload?.code;
  return Number.isInteger(code) ? code : (typeof code === "string" && code ? code : undefined);
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new PollingError("Telnyx returned an invalid JSON response.");
  }
}

async function requestJson({ config, fetchImpl, url, method, timing, body }) {
  let response;

  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new PollingError("Telnyx could not be reached.", { cause: error });
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw new TelnyxHttpError(response.status, readResponseErrorCode(payload));
  }

  return payload;
}

async function verifyConfiguration({ config, fetchImpl, timing }) {
  const numbersUrl = createUrl("/v2/phone_numbers", {
    "filter[phone_number]": config.from,
    "page[size]": "1",
  });
  const numbersPayload = await requestJson({
    config,
    fetchImpl,
    url: numbersUrl,
    method: "GET",
    timing,
  });
  const number = numbersPayload.data?.find((candidate) => candidate.phone_number === config.from);

  if (!number) {
    throw new VerificationError("Telnyx does not list TELNYX_PHONE_NUMBER for this account.");
  }

  if (number.status && number.status !== "active") {
    throw new VerificationError("TELNYX_PHONE_NUMBER is not active.");
  }

  if (!number.connection_id) {
    throw new VerificationError("TELNYX_PHONE_NUMBER is not assigned to a Voice connection.");
  }

  const applicationUrl = createUrl(`/v2/texml_applications/${config.applicationSid}`);
  const applicationPayload = await requestJson({
    config,
    fetchImpl,
    url: applicationUrl,
    method: "GET",
    timing,
  });
  const application = applicationPayload.data ?? applicationPayload;

  if (String(application.id ?? "") !== config.applicationSid) {
    throw new VerificationError("TELNYX_APPLICATION_SID was not found on this account.");
  }

  if (!application.outbound?.outbound_voice_profile_id) {
    throw new VerificationError("TELNYX_APPLICATION_SID has no Outbound Voice Profile.");
  }
}

function readCreatedCallSid(payload) {
  const candidates = [
    payload?.sid,
    payload?.Sid,
    payload?.call_sid,
    payload?.data?.sid,
    payload?.data?.call_control_id,
  ];

  return candidates.find((value) => isCallSid(value));
}

async function createCall({ config, fetchImpl, timing }) {
  const url = createUrl(`/v2/texml/Accounts/${config.accountSid}/Calls`);
  let response;

  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ApplicationSid: config.applicationSid,
        From: config.from,
        Texml: TEST_TEXML,
        TimeLimit: 30,
        Timeout: 20,
        To: config.to,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(timing.httpTimeoutMs),
    });
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      { cause: error },
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new UnknownCallOutcomeError(
        "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
      );
    }

    throw new TelnyxHttpError(response.status, readResponseErrorCode(payload));
  }

  const callSid = readCreatedCallSid(payload);

  if (!callSid) {
    throw new UnknownCallOutcomeError(
      "The call outcome is unknown. Do not retry. Check Telnyx Call Logs.",
    );
  }

  return callSid;
}

function isTransientReadError(error) {
  if (error instanceof PollingError) {
    return true;
  }

  return (
    error instanceof TelnyxHttpError
    && (error.status === 404 || error.status === 429 || error.status >= 500)
  );
}

async function readCallStatus({ config, callSid, fetchImpl, timing }) {
  const url = createUrl(`/v2/texml/Accounts/${config.accountSid}/Calls/${callSid}`);
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
      const status = call.status ?? call.data?.status;

      if (typeof status !== "string") {
        throw new PollingError("Telnyx returned a call without a status.");
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
        throw new PollingError("Call status is unavailable. Check Telnyx Call Logs.");
      }

      write("Call status is not available yet. Retrying status read.");
    }

    if (now() >= deadline) {
      break;
    }

    await sleep(timing.pollIntervalMs);
  }

  throw new PollingError("Timed out while waiting for the call status. Check Telnyx Call Logs.");
}

function helpText() {
  return [
    "Telnyx configuration test",
    "",
    "--dry-run  Validate local configuration. No network request is made.",
    "--verify   Verify the account owns an active Voice number and TeXML app. No call is made.",
    "--confirm  Place one billable test call to CALL_TO_NUMBER.",
    "",
    "The script only uses CALL_TO_NUMBER. It accepts no destination argument.",
    "Existing shell variables override .env.local values loaded by Node.",
    "Answer the call and hear the message before treating the test as passed.",
  ].join("\n");
}

function describeHttpError(error) {
  const codeSuffix = error.code ? `, Telnyx code ${error.code}` : "";
  return `Telnyx request failed with HTTP ${error.status}${codeSuffix}.`;
}

function exitForError(error, write) {
  if (error instanceof UnknownCallOutcomeError) {
    write(error.message);
    return 2;
  }

  if (error instanceof TelnyxHttpError) {
    write(describeHttpError(error));
    return 1;
  }

  if (error instanceof ValidationError || error instanceof VerificationError || error instanceof PollingError) {
    write(error.message);
    return 1;
  }

  write("Telnyx test failed without a safe diagnostic.");
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
