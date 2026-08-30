import assert from "node:assert/strict";
import test from "node:test";
import { buildLatencyReport } from "./report-voice-latency.mjs";

test("summarizes one trace without exposing transcript or audio payloads", () => {
  const entries = [
    {
      data: { attemptId: "voice_1", elapsedMs: 2_100, stage: "user_history_to_first_assistant_text" },
      event: "voice.latency",
      timestamp: "2026-08-26T12:00:00.000Z",
    },
    {
      data: { attemptId: "voice_1", elapsedMs: 1_900, stage: "user_history_to_first_assistant_text" },
      event: "voice.latency",
      timestamp: "2026-08-26T12:00:01.000Z",
    },
    {
      data: { attemptId: "voice_1", durationMs: 25, requestBody: { private: true }, route: "slots/search" },
      event: "telnyx.assistant_tool.completed",
      timestamp: "2026-08-26T12:00:02.000Z",
    },
    {
      data: { attemptId: "voice_1", payload: "raw-audio", track: "inbound" },
      event: "voice.media.frame",
      timestamp: "2026-08-26T12:00:03.000Z",
    },
  ];

  const report = buildLatencyReport(entries, "voice_1");
  assert.deepEqual(report.stages.user_history_to_first_assistant_text, {
    count: 2,
    maxMs: 2_100,
    meanMs: 2_000,
    minMs: 1_900,
    p50Ms: 1_900,
    p95Ms: 2_100,
  });
  assert.equal(report.tools["slots/search"].meanMs, 25);
  assert.equal(report.media.inboundFrameCount, 1);
  assert.doesNotMatch(JSON.stringify(report.timeline), /private|raw-audio/);
});
