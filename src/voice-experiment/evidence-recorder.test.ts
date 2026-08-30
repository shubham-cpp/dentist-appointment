import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectVoiceEvidenceAttempt, openVoiceEvidenceRecorder } from "./evidence-recorder";

test("records one correlated attempt without secrets or full phone numbers", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-evidence-"));
  const recorder = await openVoiceEvidenceRecorder({
    artifactsRoot,
    manifest: {
      attemptId: "voice_attempt_1",
      configuration: { bearerToken: "secret-bearer", language: "en-US" },
      correlation: { providerCallId: "CA123", requestId: "request-1" },
      greeting: "Hello from Willow.",
      model: "gpt-5.6-luna-fast",
      requestId: "request-1",
      route: "conversation-relay",
      runtime: "twilio-candidate",
      startedAt: "2026-08-28T10:00:00.000Z",
      voice: "Jessica",
    },
  });

  await recorder.record({
    channel: "events",
    monotonicMs: 25,
    observedAt: "2026-08-28T10:00:00.025Z",
    payload: {
      authorization: "Bearer another-secret",
      destination: "+919876543210",
      status: "answered",
    },
    source: "twilio",
    type: "call.answered",
  });

  await recorder.record({
    channel: "transcript",
    monotonicMs: 300,
    observedAt: "2026-08-28T10:00:00.300Z",
    payload: { final: true, text: "Tuesday afternoon works for me." },
    source: "caller",
    type: "transcript.final",
  });

  const manifest = await readFile(join(recorder.directory, "manifest.json"), "utf8");
  const events = await readFile(join(recorder.directory, "events.jsonl"), "utf8");
  const transcript = await readFile(join(recorder.directory, "transcript.jsonl"), "utf8");

  assert.match(manifest, /voice_attempt_1/);
  assert.match(events, /call\.answered/);
  assert.match(transcript, /Tuesday afternoon works for me/);
  assert.doesNotMatch(`${manifest}${events}${transcript}`, /secret-bearer|another-secret|\+919876543210/);
  assert.match(events, /\[REDACTED_PHONE\]/);
});

test("derives the agreed latency metrics from correlated audio and tool events", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-evidence-"));
  const recorder = await openVoiceEvidenceRecorder({
    artifactsRoot,
    manifest: {
      attemptId: "voice_attempt_2",
      configuration: { language: "en-US" },
      correlation: { requestId: "request-2" },
      greeting: "Hello from Willow.",
      model: "gpt-5.6-luna-fast",
      requestId: "request-2",
      route: "conversation-relay",
      runtime: "twilio-candidate",
      startedAt: "2026-08-28T10:00:00.000Z",
      voice: "Jessica",
    },
  });

  const events = [
    [100, "destination.answered", {}],
    [420, "audio.assistant.started", { segment: "greeting" }],
    [1_000, "audio.caller.ended", { turnId: "turn-1" }],
    [1_750, "audio.assistant.started", { turnId: "turn-1" }],
    [2_000, "audio.caller.started", { interruptionId: "interrupt-1" }],
    [2_180, "audio.assistant.stopped", { interruptionId: "interrupt-1" }],
    [3_000, "tool.started", { operationId: "operation-1" }],
    [3_025, "tool.completed", { operationId: "operation-1" }],
  ] as const;

  for (const [monotonicMs, type, payload] of events) {
    await recorder.record({
      channel: type.startsWith("tool.") ? "tools" : "events",
      monotonicMs,
      observedAt: "2026-08-28T10:00:00.000Z",
      payload,
      source: "test",
      type,
    });
  }

  const result = await recorder.finalize({
    dashboardOutcome: "rescheduled",
    finishedAt: "2026-08-28T10:01:00.000Z",
    schedulingOutcome: "rescheduled",
  });

  assert.deepEqual(result.metrics.greetingLatencyMs, [320]);
  assert.deepEqual(result.metrics.turnLatencyMs, [750]);
  assert.deepEqual(result.metrics.interruptionLatencyMs, [180]);
  assert.deepEqual(result.metrics.toolLatencyMs, [25]);
  assert.equal(result.metrics.summary.turnLatencyMs.p95Ms, 750);

  const storedMetrics = JSON.parse(await readFile(join(recorder.directory, "metrics.json"), "utf8"));
  const summary = await readFile(join(recorder.directory, "summary.md"), "utf8");
  assert.deepEqual(storedMetrics, result.metrics);
  assert.match(summary, /Scheduling outcome: rescheduled/);
  assert.match(summary, /Turn latency p95: 750 ms/);
});

test("stores destination and provider audio under fixed evidence names", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-evidence-"));
  const recorder = await openVoiceEvidenceRecorder({
    artifactsRoot,
    manifest: {
      attemptId: "voice_attempt_3",
      configuration: {},
      correlation: {},
      greeting: "Hello from Willow.",
      model: "openai/gpt-5.6-luna",
      requestId: "request-3",
      route: "embedded-assistant-dial",
      runtime: "telnyx-candidate",
      startedAt: "2026-08-28T10:00:00.000Z",
      voice: "Maeve",
    },
  });

  await recorder.writeAudio({ data: Buffer.from([1, 2, 3]), extension: "wav", track: "destination" });
  await recorder.writeAudio({ data: Buffer.from([4, 5]), extension: "mp3", track: "provider-outbound" });

  assert.deepEqual(
    await readFile(join(recorder.directory, "audio", "destination.wav")),
    Buffer.from([1, 2, 3]),
  );
  assert.deepEqual(
    await readFile(join(recorder.directory, "audio", "provider-outbound.mp3")),
    Buffer.from([4, 5]),
  );
});

test("marks a finalized attempt complete only when every required evidence track exists", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-evidence-"));
  const recorder = await openVoiceEvidenceRecorder({
    artifactsRoot,
    manifest: {
      attemptId: "voice_attempt_4",
      configuration: {},
      correlation: { providerCallId: "call-4" },
      greeting: "Hello from Willow.",
      model: "openai/gpt-5.6-luna",
      requestId: "request-4",
      route: "embedded-assistant-dial",
      runtime: "telnyx-candidate",
      startedAt: "2026-08-28T10:00:00.000Z",
      voice: "Maeve",
    },
  });

  await recorder.record({
    channel: "events",
    monotonicMs: 1,
    observedAt: "2026-08-28T10:00:00.001Z",
    payload: { providerCallId: "call-4" },
    source: "telnyx",
    type: "call.initiated",
  });
  await recorder.writeAudio({ data: Buffer.from([1]), extension: "wav", track: "destination" });
  await recorder.finalize({
    dashboardOutcome: "unchanged",
    finishedAt: "2026-08-28T10:01:00.000Z",
    schedulingOutcome: "unchanged",
  });

  const incomplete = await inspectVoiceEvidenceAttempt(recorder.directory);
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missing, [
    "audio/provider-inbound.*",
    "audio/provider-outbound.*",
  ]);

  await recorder.writeAudio({ data: Buffer.from([2]), extension: "wav", track: "provider-inbound" });
  await recorder.writeAudio({ data: Buffer.from([3]), extension: "wav", track: "provider-outbound" });

  const complete = await inspectVoiceEvidenceAttempt(recorder.directory);
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.missing, []);
});

test("adds provider correlation IDs after the call starts", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-evidence-"));
  const recorder = await openVoiceEvidenceRecorder({
    artifactsRoot,
    manifest: {
      attemptId: "voice_attempt_5",
      configuration: {},
      correlation: { requestId: "request-5" },
      greeting: "Hello from Willow.",
      model: "gpt-5.6-luna-fast",
      requestId: "request-5",
      route: "conversation-relay",
      runtime: "twilio-candidate",
      startedAt: "2026-08-28T10:00:00.000Z",
      voice: "Jessica",
    },
  });

  await recorder.correlate({ providerCallId: "CA555", relaySessionId: "VX555" });

  const manifest = JSON.parse(await readFile(join(recorder.directory, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.correlation, {
    providerCallId: "CA555",
    relaySessionId: "VX555",
    requestId: "request-5",
  });
});
