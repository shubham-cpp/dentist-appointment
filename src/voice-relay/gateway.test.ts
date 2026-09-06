import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { MemoryControlledCallLease } from "@/voice-core/controlled-call-lease";
import { createRelayGateway } from "./gateway";
import { RelayStore } from "./store";
import type { RelayConfig } from "./config";
import type { Interpretation } from "./interpretation";

const keys = generateKeyPairSync("ed25519");
const secret = "test-secret-".repeat(4);
const config: RelayConfig = {
  TELNYX_API_KEY: "test", TELNYX_APPLICATION_SID: "application", TELNYX_ACCOUNT_SID: "account", TELNYX_CONNECTION_ID: "connection",
  TELNYX_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  TELNYX_PHONE_NUMBER: "+15555550100", CALL_TO_NUMBER: "+15555550101", OPENROUTER_API_KEY: "test",
  VOICE_RELAY_MODEL: "test", VOICE_GATEWAY_INTERNAL_SECRET: secret, VOICE_GATEWAY_PUBLIC_BASE_URL: "https://probe.example",
  VOICE_GATEWAY_PORT: 3001, VOICE_RELAY_STORE_PATH: ":memory:", VOICE_CALLS_ENABLED: "true", VOICE_DEMO_MODE: "true",
};
function meaning(values: Partial<Interpretation>): Interpretation {
  return { appointmentConstraintsEvidence: null, callbackTiming: "unspecified", callbackDayOffset: null, providerEvidence: values.provider ? "dentist" : null, identity: "unspecified", intent: "unclear", provider: null, slotId: null, dateFrom: null, dateTo: null,
    timeFrom: null, timeTo: null, clearConstraints: [], callback: null, clarification: null, ...values };
}
async function fixture(options: { synthesize?: (text: string, signal: AbortSignal) => Promise<Buffer>; closingTimeoutMs?: number; providerAlive?: boolean; interpreterDelayMs?: number } = {}) {
  let next = meaning({});
  const requests: string[] = [];
  const store = new RelayStore(":memory:");
  const { app, reconcile } = await createRelayGateway(config, { store, synthesize: options.synthesize ?? (async () => Buffer.from("ID3test-audio")), closingTimeoutMs: options.closingTimeoutMs ?? 20, lease: new MemoryControlledCallLease(), interpreter: async () => { if (options.interpreterDelayMs) await delay(options.interpreterDelayMs); return next; },
    request: async path => { requests.push(path); return path.startsWith("calls/") && !path.includes("/actions/") ? { is_alive: options.providerAlive ?? false } : {}; } });
  const id = randomUUID();
  const headers = { "content-type": "application/json", "x-voice-gateway-secret": secret, "x-voice-request-id": id };
  const context = createVoiceCallContext();
  const start = await app.inject({ method: "POST", url: "/internal/controlled-attempt", headers, payload: JSON.stringify({ callContext: context }) });
  assert.equal(start.statusCode, 202);
  const record = store.byRequest(id)!;
  const prefix = `/telnyx/relay/${record.view.id}/${record.token}`;
  async function callback(path: string, values: Record<string, string>, method: "GET" | "POST" = "POST") {
    if (path === "action") path = "action/0";
    const payload = new URLSearchParams({ To: config.CALL_TO_NUMBER, CallSid: "signed-control-id", ...values }).toString();
    const timestamp = String(Math.floor(Date.now() / 1000));
    return app.inject({ method, url: `${prefix}/${path}${method === "GET" ? `?${payload}` : ""}`, ...(method === "POST" ? { payload } : {}), headers: {
      "content-type": "application/x-www-form-urlencoded", "telnyx-timestamp": timestamp,
      "telnyx-signature-ed25519": sign(null, Buffer.from(`${timestamp}|${payload}`), keys.privateKey).toString("base64"),
    } });
  }
  return { app, store, reconcile, prefix, record, headers, callback, requests, setMeaning(value: Partial<Interpretation>) { next = meaning(value); } };
}

test("dashboard call survives setup aliases and delayed signed binding", async () => {
  const f = await fixture();
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    const greeting = once(socket, "message");
    socket.send(JSON.stringify({ type: "setup", callSid: "different-alias", callControlId: "signed-control-id", to: null,
      customParameters: { probeRunToken: f.record.token } }));
    await delay(10);
    await f.callback("status", { CallStatus: "in-progress" });
    assert.match(JSON.parse((await greeting)[0].toString()).token, /speaking with Olivia/);
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    const options = once(socket, "message");
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Yes, keep my dentist", last: true }));
    assert.match(JSON.parse((await options)[0].toString()).token, /Option 3/);
    assert.equal(f.requests.filter(p => p.endsWith("/Calls")).length, 1);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

for (const method of ["GET", "POST"] as const) test(`full protocol journey persists booking after signed ${method} confirmation`, async () => {
  const f = await fixture();
  await f.callback("status", { CallStatus: "initiated" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes same dentist", last: true }));
    await once(socket, "message");
    const state = f.store.get(f.record.view.id)!.state as { batch: { slots: Array<{ id: string }> } };
    f.setMeaning({ intent: "select", slotId: state.batch.slots[0].id });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "first one", last: true }));
    assert.equal(JSON.parse((await once(socket, "message"))[0].toString()).type, "end");
    const action = await f.callback("action", {});
    assert.match(action.body, /<\/Play><Gather input="speech"/);
    const token = action.body.match(/confirm\/([a-f0-9]+)/)![1];
    const audio = await f.app.inject({ url: `${f.prefix}/audio/${token}` });
    assert.equal(audio.statusCode, 200);
    assert.equal(audio.headers["content-type"], "audio/mpeg");
    assert.equal(f.store.get(f.record.view.id)!.view.result, undefined);
    f.setMeaning({ intent: "confirm" });
    const confirm = await f.callback(`confirm/${token}`, { SpeechResult: "Yes please" }, method);
    assert.equal(confirm.statusCode, 200);
    assert.match(confirm.body, /<Play>/);
    assert.match(confirm.body, /<Hangup \/>/);
    assert.equal(f.store.get(f.record.view.id)!.view.result?.kind, "rescheduled");
    const replay = await f.callback(`confirm/${token}`, { SpeechResult: "Yes please" });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body, confirm.body);
    assert.equal(f.store.get(f.record.view.id)!.view.events.filter(e => e.label.startsWith("Caller confirmation:")).length, 1);
    assert.equal((await f.app.inject({ url: `${f.prefix}/confirm/${token}?SpeechResult=Yes` })).statusCode, 403);
    assert.equal((await f.callback(`confirm/${token}`, { To: "+15555550199", SpeechResult: "Yes" }, "GET")).statusCode, 409);
    await f.callback("status", { CallStatus: "completed" });
    const view = await f.app.inject({ url: "/internal/controlled-attempt/current", headers: { "x-voice-gateway-secret": secret } });
    assert.equal(view.json().attempt.outcome, "rescheduled");
    assert.equal(view.json().attempt.transportStatus, "completed");
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("dashboard Stop calls provider hangup and does not claim disconnection", async () => {
  const f = await fixture();
  try {
    await f.callback("status", { CallStatus: "in-progress" });
    const response = await f.app.inject({ method: "POST", url: `/internal/controlled-attempt/${f.record.view.id}/stop`, headers: { "x-voice-gateway-secret": secret } });
    assert.equal(response.json().attempt.transportStatus, "cancel_requested");
    assert.equal(f.requests.filter(p => p.endsWith("/actions/hangup")).length, 1);
    await f.callback("status", { CallStatus: "completed" });
    assert.equal(f.store.get(f.record.view.id)!.view.transportStatus, "completed");
  } finally { await f.app.close(); f.store.close(); }
});

test("keypad 9 disconnects through the direct fallback and reconciles a lost terminal callback", async () => {
  const f = await fixture();
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    socket.send(JSON.stringify({ type: "dtmf", digit: "9" }));
    assert.match(JSON.parse((await once(socket, "message"))[0].toString()).token, /Goodbye/);
    await delay(35);
    assert.equal(f.requests.filter(p => p.endsWith("/actions/hangup")).length, 1);
    assert.equal(f.store.get(f.record.view.id)!.view.transportStatus, "cancel_requested");
    await f.reconcile();
    assert.equal(f.store.get(f.record.view.id)!.view.transportStatus, "completed");
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("reset rejects an active call and archives completed display results", async () => {
  const f = await fixture();
  try {
    const reset = () => f.app.inject({ method: "POST", url: "/internal/controlled-attempt/reset", headers: { "x-voice-gateway-secret": secret } });
    assert.equal((await reset()).statusCode, 409);
    await f.callback("status", { CallStatus: "completed" });
    assert.equal((await reset()).statusCode, 204);
    assert.equal((await f.app.inject({ url: "/internal/controlled-attempt/current", headers: { "x-voice-gateway-secret": secret } })).statusCode, 404);
    assert.ok(f.store.byRequest(f.record.requestId));
  } finally { await f.app.close(); f.store.close(); }
});

test("slot speech gets a speaking allowance before the caller silence timer", async () => {
  const f = await fixture();
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes same dentist", last: true }));
    await delay(10);
    const options = once(socket, "message");
    assert.match(JSON.parse((await options)[0].toString()).token, /Option 3/);
    await delay(25_100);
    assert.equal(f.store.get(f.record.view.id)!.view.events.some(e => e.label.includes("Are you still there")), false);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("confirmation audio must exist before leaving the working relay", async () => {
  let release!: (audio: Buffer) => void;
  const f = await fixture({ synthesize: () => new Promise(resolve => { release = resolve; }) });
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  const frames: Array<{ type: string; token?: string }> = [];
  socket.on("message", (raw: { toString(): string }) => frames.push(JSON.parse(raw.toString())));
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes same dentist", last: true }));
    await once(socket, "message");
    const state = f.store.get(f.record.view.id)!.state as { batch: { slots: Array<{ id: string }> } };
    f.setMeaning({ intent: "select", slotId: state.batch.slots[2].id });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "option three makes sense", last: true }));
    await delay(500);
    assert.equal(frames.some(frame => frame.type === "end"), false, "must not leave relay before speech is ready");
    release(Buffer.from("ID3test-audio"));
    await delay(30);
    assert.equal(frames.some(frame => frame.type === "end"), true);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("a trailing partial cannot erase an already received final utterance", async () => {
  const f = await fixture();
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes I am", last: true }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes I", last: false }));
    await delay(600);
    assert.ok(f.store.get(f.record.view.id)!.view.events.some(e => e.label.includes("Would you like to reschedule")));
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("a previous relay action and socket cannot disturb the resumed conversation", async () => {
  const f = await fixture();
  await f.callback("status", { CallStatus: "in-progress" });
  const oldSocket = await f.app.injectWS(`${f.prefix}/socket/0`);
  let newSocket: typeof oldSocket | undefined;
  try {
    oldSocket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(oldSocket, "message");
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    oldSocket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes same dentist", last: true }));
    await once(oldSocket, "message");
    const state = f.store.get(f.record.view.id)!.state as { batch: { slots: Array<{ id: string }> } };
    f.setMeaning({ intent: "select", slotId: state.batch.slots[0].id });
    oldSocket.send(JSON.stringify({ type: "prompt", voicePrompt: "first option", last: true }));
    await once(oldSocket, "message");
    const action = await f.callback("action", {});
    const token = action.body.match(/confirm\/([a-f0-9]+)/)![1];
    await f.app.inject({ url: `${f.prefix}/audio/${token}` });
    f.setMeaning({ intent: "decline" });
    const correction = await f.callback(`confirm/${token}`, { SpeechResult: "No, show the choices again" });
    assert.match(correction.body, /socket\/1/);
    newSocket = await f.app.injectWS(`${f.prefix}/socket/1`);
    newSocket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    assert.match(JSON.parse((await once(newSocket, "message"))[0].toString()).token, /Option 3/);
    const before = f.store.get(f.record.view.id)!;
    assert.equal((await f.callback("action/0", {})).body, action.body);
    oldSocket.send(JSON.stringify({ type: "error", description: "late provider error" }));
    oldSocket.send(JSON.stringify({ type: "dtmf", digit: "9" }));
    await delay(50);
    assert.equal(f.requests.some(path => path.endsWith("/actions/hangup")), false);
    assert.deepEqual(f.store.get(f.record.view.id)!.state, before.state);
    assert.equal(f.store.get(f.record.view.id)!.view.result, undefined);
    f.setMeaning({ intent: "repeat" });
    newSocket.send(JSON.stringify({ type: "prompt", voicePrompt: "repeat those please", last: true }));
    assert.match(JSON.parse((await once(newSocket, "message"))[0].toString()).token, /Option 3/);
  } finally { oldSocket.terminate(); newSocket?.terminate(); await f.app.close(); f.store.close(); }
});

test("provider reconciliation preserves the goodbye allowance", async () => {
  const f = await fixture({ closingTimeoutMs: 200, providerAlive: true });
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    socket.send(JSON.stringify({ type: "dtmf", digit: "9" }));
    assert.match(JSON.parse((await once(socket, "message"))[0].toString()).token, /Goodbye/);
    await f.reconcile();
    assert.equal(f.requests.some(path => path.endsWith("/actions/hangup")), false);
    await delay(230);
    assert.equal(f.requests.filter(path => path.endsWith("/actions/hangup")).length, 1);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("failed confirmation synthesis keeps relay speech available and never commits", async () => {
  const f = await fixture({ synthesize: async () => { throw new Error("speech unavailable"); } });
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  const frames: Array<{ type: string; token?: string }> = [];
  socket.on("message", (raw: { toString(): string }) => frames.push(JSON.parse(raw.toString())));
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed", intent: "reschedule", provider: "same" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes same dentist", last: true }));
    await once(socket, "message");
    const state = f.store.get(f.record.view.id)!.state as { batch: { slots: Array<{ id: string }> } };
    f.setMeaning({ intent: "select", slotId: state.batch.slots[2].id });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "third option", last: true }));
    assert.match(JSON.parse((await once(socket, "message"))[0].toString()).token, /Goodbye/);
    assert.equal(frames.some(frame => frame.type === "end"), false);
    assert.equal(f.store.get(f.record.view.id)!.view.result, undefined);
    await delay(40);
    assert.equal(f.requests.filter(path => path.endsWith("/actions/hangup")).length, 1);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});

test("a trailing partial does not cancel an in-flight response to a final transcript", async () => {
  const f = await fixture({ interpreterDelayMs: 250 });
  await f.callback("status", { CallStatus: "in-progress" });
  const socket = await f.app.injectWS(`${f.prefix}/socket/0`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: f.record.token } }));
    await once(socket, "message");
    f.setMeaning({ identity: "confirmed" });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes I am", last: true }));
    await delay(450);
    const response = once(socket, "message", { signal: AbortSignal.timeout(2_000) });
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes I", last: false }));
    assert.match(JSON.parse((await response)[0].toString()).token, /Would you like to reschedule/);
  } finally { socket.terminate(); await f.app.close(); f.store.close(); }
});
