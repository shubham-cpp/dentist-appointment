import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { controlledCallLeasePath, FileControlledCallLease } from "../src/voice-core/controlled-call-lease";
import { decodeTelnyxPublicKey } from "../src/voice-experiment/telnyx-signature";
import { loadControlledCallSafetyPolicy } from "../src/voice-core/call-safety-policy";
import { TELNYX_MAEVE_VOICE } from "../src/voice-experiment/telnyx-candidate";
import { createTelnyxCandidateClient } from "../src/voice-experiment/telnyx-candidate-client";
import { startRelayProbeTunnel } from "../src/voice-experiment/relay-probe-tunnel";
import { createTelnyxRelayProbe } from "../src/voice-experiment/telnyx-relay-probe";

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !["--serve", "--dial"].includes(arg))) throw new Error("Usage: run-telnyx-relay-probe.mts [--serve] [--dial]. With no flags, run read-only preflight.");
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
const apiKey = required("TELNYX_API_KEY");
const applicationId = required("TELNYX_APPLICATION_SID");
const request = async (path: string, body?: Record<string, unknown>) => {
  const response = await fetch(`https://api.telnyx.com/v2/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Telnyx probe request failed with HTTP ${response.status}.`);
  return response.json();
};
const client = createTelnyxCandidateClient({ apiKey });
const [voices, application, accountKey] = await Promise.all([
  client.listVoices(), request(`texml_applications/${encodeURIComponent(applicationId)}`), client.getPublicKey(),
]);
let publicKeyMatches = false;
try {
  publicKeyMatches = typeof accountKey.public === "string"
    && decodeTelnyxPublicKey(required("TELNYX_PUBLIC_KEY")).export({ type: "spki", format: "der" })
      .equals(decodeTelnyxPublicKey(accountKey.public).export({ type: "spki", format: "der" }));
} catch { /* Report the failed preflight without exposing key material. */ }
const voice = voices.find((entry) => entry.id === TELNYX_MAEVE_VOICE);
const preflight = {
  at: new Date().toISOString(), voicePresent: Boolean(voice), voiceName: voice?.name,
  applicationActive: application.data?.active === true,
  outboundProfilePresent: Boolean(application.data?.outbound?.outbound_voice_profile_id),
  publicKeyMatches,
  relayPlaybackVerified: false, interruptionVerified: false, deliveryVerified: false,
};
const runId = `relay-probe-${randomUUID()}`;
const directory = resolve(".voice-artifacts", runId);
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(join(directory, "preflight.json"), JSON.stringify(preflight, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ...preflight, artifacts: directory }, null, 2));
if (!preflight.voicePresent || !preflight.applicationActive || !preflight.outboundProfilePresent || !preflight.publicKeyMatches) throw new Error("Probe preflight failed.");

if (args.has("--serve") || args.has("--dial")) {
  const expectedTo = required("CALL_TO_NUMBER");
  const from = required("TELNYX_PHONE_NUMBER");
  if (![expectedTo, from].every((number) => /^\+[1-9]\d{7,14}$/.test(number)) || expectedTo === from) {
    throw new Error("Configure distinct valid E.164 caller and controlled destination numbers.");
  }
  const publicKey = required("TELNYX_PUBLIC_KEY");
  const accountId = required("TELNYX_ACCOUNT_SID");
  const connectionId = required("TELNYX_CONNECTION_ID");
  const port = Number(process.env.TELNYX_RELAY_PROBE_PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("TELNYX_RELAY_PROBE_PORT must be between 1 and 65535.");
  if (args.has("--dial")) loadControlledCallSafetyPolicy(process.env);
  const lease = new FileControlledCallLease(controlledCallLeasePath({ connectionId, from, to: expectedTo }));
  const controller = new AbortController();
  let stopRequested!: () => void;
  const stopped = new Promise<void>((resolve) => { stopRequested = resolve; });
  const signalStop = () => { controller.abort(); stopRequested(); };
  process.once("SIGINT", signalStop);
  process.once("SIGTERM", signalStop);
  let tunnel: Awaited<ReturnType<typeof startRelayProbeTunnel>> | undefined;
  let probe: Awaited<ReturnType<typeof createTelnyxRelayProbe>> | undefined;
  let dialAttempted = false;
  try {
    let publicBaseUrl = process.env.TELNYX_RELAY_PROBE_PUBLIC_URL?.trim();
    if (!publicBaseUrl) {
      tunnel = await startRelayProbeTunnel(port, { signal: controller.signal });
      publicBaseUrl = tunnel.publicBaseUrl;
      void tunnel.closed.then(() => {
        if (!controller.signal.aborted) {
          console.error("The probe tunnel stopped. Closing the probe server.");
          process.exitCode = 1;
          signalStop();
        }
      });
    }
    controller.signal.throwIfAborted();
    probe = await createTelnyxRelayProbe({
      token: randomBytes(32).toString("hex"), publicBaseUrl, expectedTo, publicKey,
      hangup: (callSid, commandId) => client.hangup(callSid, commandId),
      record(event) {
        appendFileSync(join(directory, "events.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 });
        if (dialAttempted && event.kind === "call_status" && ["completed", "failed", "busy", "no-answer", "canceled"].includes(String(event.details.status))) {
          void lease.release(runId).catch(() => console.error("Could not release the probe call lease."));
        }
      },
    });
    controller.signal.throwIfAborted();
    await probe.app.listen({ host: "127.0.0.1", port });
    const body = {
      ApplicationSid: applicationId, From: from, To: expectedTo, Url: probe.instructionsUrl,
      UrlMethod: "GET", StatusCallback: probe.statusUrl, StatusCallbackMethod: "POST",
      StatusCallbackEvent: "initiated ringing answered completed", TimeLimit: 150, Timeout: 25,
    };
    writeFileSync(join(directory, "private-call-request.json"), JSON.stringify(body, null, 2), { mode: 0o600 });
    writeFileSync(join(directory, "runtime.json"), JSON.stringify({ publicBaseUrl, port, ownsTunnel: Boolean(tunnel) }, null, 2), { mode: 0o600 });
    // Verify the unique path for both serve-only and dial modes.
    const reachable = await fetch(probe.instructionsUrl, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), redirect: "error",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    if (!reachable.ok || !(await reachable.text()).includes("<ConversationRelay")) throw new Error("The public URL does not reach this probe.");
    console.log(`Probe ready at ${publicBaseUrl}, forwarding to 127.0.0.1:${port}. Ctrl+C stops this run.`);
    if (args.has("--dial")) {
      controller.signal.throwIfAborted();
      await lease.acquire(runId);
      if (controller.signal.aborted) {
        await lease.cancel(runId);
        controller.signal.throwIfAborted();
      }
      dialAttempted = true;
      // Never retry an uncertain dial. Provider TimeLimit bounds a lost connection.
      await request(`texml/Accounts/${encodeURIComponent(accountId)}/Calls`, body);
      probe.record("dial_accepted", { maximumCallSeconds: 150 });
      console.log("One probe call accepted for the configured controlled destination.");
    } else console.log("No call placed. Use --dial to place one controlled probe call.");
    await stopped;
  } catch (error) {
    probe?.record("runner_stopped", { dialAttempted, canceled: controller.signal.aborted });
    if (!controller.signal.aborted) throw error;
  } finally {
    controller.abort();
    process.removeListener("SIGINT", signalStop);
    process.removeListener("SIGTERM", signalStop);
    try { await probe?.app.close(); } finally { await tunnel?.stop(); }
  }
}
