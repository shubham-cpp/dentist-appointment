import assert from "node:assert/strict";
import test from "node:test";
import { buildVoiceExperimentReport, renderVoiceExperimentReport } from "./evidence-report";

test("aggregates attempts and fails a runtime when one hard gate fails", () => {
  const report = buildVoiceExperimentReport([
    {
      attemptId: "voice_attempt_1",
      dashboardOutcome: "rescheduled",
      dialoguePassed: true,
      evidenceComplete: true,
      metrics: {
        greetingLatencyMs: [410],
        interruptionLatencyMs: [180],
        toolLatencyMs: [30],
        turnLatencyMs: [720, 810],
      },
      rollbackPassed: true,
      runtime: "twilio-candidate",
      safetyPassed: true,
      schedulingOutcome: "rescheduled",
      voicePassed: true,
    },
    {
      attemptId: "voice_attempt_2",
      dashboardOutcome: "rescheduled",
      dialoguePassed: true,
      evidenceComplete: true,
      metrics: {
        greetingLatencyMs: [520],
        interruptionLatencyMs: [220],
        toolLatencyMs: [25],
        turnLatencyMs: [850],
      },
      rollbackPassed: true,
      runtime: "twilio-candidate",
      safetyPassed: true,
      schedulingOutcome: "rescheduled",
      voicePassed: true,
    },
  ]);

  const twilio = report.runtimes["twilio-candidate"];
  assert.equal(twilio.metrics.greetingLatencyMs.p95Ms, 520);
  assert.equal(twilio.metrics.turnLatencyMs.p95Ms, 850);
  assert.equal(twilio.gates.greetingLatency, "fail");
  assert.equal(twilio.gates.turnLatency, "pass");
  assert.equal(twilio.gates.overall, "fail");

  const markdown = renderVoiceExperimentReport(report);
  assert.match(markdown, /Twilio candidate/);
  assert.match(markdown, /Greeting latency: FAIL/);
  assert.match(markdown, /Overall: FAIL/);
});

test("keeps unavailable human scores pending instead of passing them", () => {
  const report = buildVoiceExperimentReport([{
    attemptId: "voice_attempt_3",
    dashboardOutcome: "canceled",
    evidenceComplete: true,
    metrics: {
      greetingLatencyMs: [300],
      interruptionLatencyMs: [100],
      toolLatencyMs: [20],
      turnLatencyMs: [600],
    },
    rollbackPassed: true,
    runtime: "telnyx-candidate",
    safetyPassed: true,
    schedulingOutcome: "canceled",
  }]);

  const telnyx = report.runtimes["telnyx-candidate"];
  assert.equal(telnyx.gates.dialogue, "pending");
  assert.equal(telnyx.gates.voice, "pending");
  assert.equal(telnyx.gates.overall, "pending");
});
