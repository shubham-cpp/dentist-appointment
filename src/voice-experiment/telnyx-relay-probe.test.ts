import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createTelnyxRelayProbe, type RelayProbeEvent } from "./telnyx-relay-probe";

const token = "a".repeat(40);
const path = `/relay-probe/${token}`;
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const destination = "+15555550101";
async function fixture(bindCall = true, timing: { idleTimeoutMs?: number; closingTimeoutMs?: number } = {}) {
  const events: RelayProbeEvent[] = [];
  const hangups: { callSid: string; commandId: string }[] = [];
  const probe = await createTelnyxRelayProbe({ token, publicKey, expectedTo: destination, publicBaseUrl: "https://probe.example", record: (event) => events.push(event), chunkDelayMs: 30, ...timing, hangup: async (callSid, commandId) => { hangups.push({ callSid, commandId }); } });
  const body = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "initiated" }).toString();
  if (bindCall) await probe.app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) });
  return { ...probe, events, hangups };
}
function signed(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { "content-type": "application/x-www-form-urlencoded", "telnyx-timestamp": timestamp, "telnyx-signature-ed25519": sign(null, Buffer.from(`${timestamp}|${body}`), keys.privateKey).toString("base64") };
}
const setup = { type: "setup", customParameters: { probeRunToken: token }, sessionId: "session", callSid: "call", to: destination };

test("signed call binding permits setup without optional display metadata", async () => {
  const { app, events } = await fixture();
  const body = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "initiated" }).toString();
  await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) });
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify({ ...setup, sessionId: null, to: null }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Yes I am", last: true }));
    await delay(25);
    assert.equal(events.filter((event) => event.kind === "setup").length, 1);
    assert.equal(events.filter((event) => event.kind === "final_transcript").length, 1);
  } finally { socket.terminate(); await app.close(); }
});

test("a final transcript causes probe instructions to be submitted", async () => {
  const { app, events } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Yes I am", last: true }));
    await delay(25);
    assert.ok(events.some((event) => event.kind === "outbound" && String(event.details.token).includes("Press 1")));
  } finally { socket.terminate(); await app.close(); }
});

test("setup waits for signed call correlation and greets once when it arrives", async () => {
  const { app, events } = await fixture(false);
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: token } }));
    await delay(15);
    assert.equal(events.filter((event) => event.kind === "outbound").length, 0);
    const body = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "in-progress" }).toString();
    await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) });
    await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) });
    assert.equal(events.filter((event) => event.kind === "setup").length, 1);
    assert.equal(events.filter((event) => event.kind === "outbound").length, 1);
  } finally { socket.terminate(); await app.close(); }
});

test("a setup from another run cannot replace the signed call binding", async () => {
  const { app, events } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify({ ...setup, customParameters: { probeRunToken: "another-run" } }));
    await delay(15);
    assert.equal(events.filter((event) => event.kind === "setup").length, 0);
    assert.equal(events.find((event) => event.kind === "relay_end_requested")?.details.reason, "unexpected_setup");
    assert.equal(events.filter((event) => event.kind === "outbound" && event.details.type === "text").length, 0);
  } finally { socket.terminate(); await app.close(); }
});

test("early caller speech survives a delayed signed callback", async () => {
  const { app, events } = await fixture(false);
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify({ type: "setup", customParameters: { probeRunToken: token } }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Hello, can you hear me?", last: true }));
    await delay(15);
    const body = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "in-progress" }).toString();
    await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) });
    await delay(15);
    assert.equal(events.filter((event) => event.kind === "relay_end_requested").length, 0);
    assert.equal(events.find((event) => event.kind === "final_transcript")?.details.text, "Hello, can you hear me?");
  } finally { socket.terminate(); await app.close(); }
});

test("silence gets one reminder then closes instead of waiting for the call limit", async () => {
  const { app, events } = await fixture(true, { idleTimeoutMs: 15, closingTimeoutMs: 15 });
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    await delay(80);
    assert.equal(events.filter((event) => event.kind === "idle_reminder").length, 1);
    assert.equal(events.find((event) => event.kind === "relay_end_requested")?.details.reason, "no_input");
  } finally { socket.terminate(); await app.close(); }
});

test("lost socket triggers a hangup watchdog without claiming disconnection", async () => {
  const { app, events, hangups } = await fixture(true, { closingTimeoutMs: 15 });
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    await once(socket, "message");
    socket.terminate();
    await delay(60);
    assert.equal(hangups.length, 1);
    assert.equal(hangups[0].callSid, "call");
    assert.equal(events.filter((event) => event.kind === "closing_deadline").length, 1);
    assert.equal(JSON.parse((await app.inject("/health")).body).completed, false);
  } finally { socket.terminate(); await app.close(); }
});

test("transport journey reaches signed completion after greeting, reply, interruption and goodbye", async () => {
  const { app, events, hangups } = await fixture(true, { closingTimeoutMs: 200 });
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    assert.match(JSON.parse((await once(socket, "message"))[0].toString()).token, /speaking with Alex/);
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Yes I am", last: true }));
    assert.match(JSON.parse((await once(socket, "message"))[0].toString()).token, /Press 1/);
    socket.send(JSON.stringify({ type: "dtmf", digit: "1" }));
    await once(socket, "message");
    socket.send(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: "This is a voice", durationUntilInterruptMs: 250 }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Actually Friday", last: true }));
    await once(socket, "message");
    socket.send(JSON.stringify({ type: "dtmf", digit: "9" }));
    assert.equal(JSON.parse((await once(socket, "message"))[0].toString()).type, "end");
    const action = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "in-progress" }).toString();
    const closing = await app.inject({ method: "POST", url: `${path}/action`, payload: action, headers: signed(action) });
    assert.match(closing.body, /Goodbye\.<\/Say><Hangup \/>/);
    const status = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "completed" }).toString();
    await app.inject({ method: "POST", url: `${path}/status`, payload: status, headers: signed(status) });
    assert.equal(JSON.parse((await app.inject("/health")).body).completed, true);
    assert.equal(hangups.length, 0);
    assert.equal(events.filter((event) => event.kind === "setup").length, 1);
    assert.equal(events.filter((event) => event.kind === "final_transcript").length, 2);
  } finally { socket.terminate(); await app.close(); }
});

test("probe serves interruptible Maeve TeXML with closing outside the relay", async () => {
  const { app } = await fixture();
  try {
    const response = await app.inject(`${path}/instructions`);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Telnyx.Ultra.02a924f6-bb49-4177-8fbb-52238c5056d6/);
    assert.match(response.body, /interruptible="any"/);
    assert.ok(response.body.includes(`<Parameter name="probeRunToken" value="${token}" />`));
    assert.match(response.body, /<\/Connect><Say.*Goodbye\.<\/Say><Hangup \/>/);
    assert.equal((await app.inject("/relay-probe/wrong/instructions")).statusCode, 404);
  } finally { await app.close(); }
});

test("partial and final transcripts never become delivery or mutation authorization", async () => {
  const { app, events } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes", last: false }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "yes you are", last: true }));
    socket.send(JSON.stringify({ type: "mark", name: "readback" }));
    await delay(20);
    assert.equal(events.filter((event) => event.kind === "final_transcript").length, 1);
    assert.deepEqual(events.find((event) => event.kind === "final_transcript")?.details, { text: "yes you are", deliveryVerified: false, mutationAllowed: false });
    assert.equal(events.filter((event) => event.kind === "outbound").length, 2);
    assert.equal(events.find((event) => event.kind === "unrecognized_frame")?.details.type, "mark");
  } finally { socket.terminate(); await app.close(); }
});

test("interruption cancels unsent old chunks while preserving final correction", async () => {
  const { app, events } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    await once(socket, "message");
    const first = once(socket, "message");
    socket.send(JSON.stringify({ type: "dtmf", digit: "1" }));
    await first;
    socket.send(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: "This is", durationUntilInterruptMs: 10 }));
    socket.send(JSON.stringify({ type: "prompt", voicePrompt: "Actually next Friday", last: true }));
    await delay(130);
    assert.equal(events.filter((event) => event.kind === "outbound" && String(event.details.token).includes("fictional option")).length, 0);
    assert.equal(events.filter((event) => event.kind === "outbound").length, 3);
    assert.equal(events.find((event) => event.kind === "final_transcript")?.details.text, "Actually next Friday");
    assert.equal(events.find((event) => event.kind === "generation_canceled")?.details.providerQueueCleared, "unverified");
  } finally { socket.terminate(); await app.close(); }
});

test("signed closing and completed callbacks distinguish relay exit from disconnection", async () => {
  const { app, events } = await fixture();
  try {
    const body = new URLSearchParams({ To: destination, CallSid: "call", CallStatus: "completed" }).toString();
    assert.equal((await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: { "content-type": "application/x-www-form-urlencoded" } })).statusCode, 403);
    const closing = await app.inject({ method: "POST", url: `${path}/action`, payload: body, headers: signed(body) });
    assert.equal(closing.statusCode, 200);
    assert.match(closing.body, /Goodbye\.<\/Say><Hangup \/>/);
    assert.equal(JSON.parse((await app.inject("/health")).body).completed, false);
    assert.equal((await app.inject({ method: "POST", url: `${path}/status`, payload: body, headers: signed(body) })).statusCode, 204);
    assert.equal(JSON.parse((await app.inject("/health")).body).completed, true);
    assert.equal(events.at(-1)?.kind, "call_status");
  } finally { await app.close(); }
});

test("ending sends an end frame and rejects a second session", async () => {
  const { app } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    socket.send(JSON.stringify(setup));
    await once(socket, "message");
    const ended = once(socket, "message");
    socket.send(JSON.stringify({ type: "dtmf", digit: "9" }));
    assert.equal(JSON.parse((await ended)[0].toString()).type, "end");
    const second = await app.injectWS(`${path}/socket`);
    second.terminate();
    assert.equal(JSON.parse((await app.inject("/health")).body).completed, false);
  } finally { socket.terminate(); await app.close(); }
});


test("relay identifiers can differ from the signed callback without suppressing the greeting", async () => {
  const { app, events } = await fixture();
  const socket = await app.injectWS(`${path}/socket`);
  try {
    // Reproduce the observed setup shape and rejection branch, without storing real call identifiers.
    socket.send(JSON.stringify({ type: "setup", sessionId: "session", to: null,
      callSid: "relay-call-alias", callControlId: "relay-control-alias",
      customParameters: { probeRunToken: token } }));
    await delay(20);
    assert.equal(events.some((event) => event.kind === "relay_end_requested"), false);
    const greetings = events.filter((event) => event.kind === "outbound" && String(event.details.token).includes("speaking with Alex"));
    assert.equal(greetings.length, 1);
    assert.equal(events.find((event) => event.kind === "setup")?.details.callSid, "call");
  } finally { socket.terminate(); await app.close(); }
});


for (const [label, frame] of [
  ["missing run parameter", { ...setup, customParameters: {} }],
  ["wrong destination", { ...setup, to: "+15555550102" }],
] as const) {
  test(`setup rejects ${label} without sending a greeting`, async () => {
    const { app, events } = await fixture();
    const socket = await app.injectWS(`${path}/socket`);
    try {
      socket.send(JSON.stringify(frame));
      await delay(15);
      assert.equal(events.find((event) => event.kind === "relay_end_requested")?.details.reason, "unexpected_setup");
      assert.equal(events.some((event) => event.kind === "outbound" && event.details.type === "text"), false);
    } finally { socket.terminate(); await app.close(); }
  });
}
