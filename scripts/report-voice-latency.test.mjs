import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  aggregateVoiceArtifactMetrics,
  buildLatencyReportFromArtifacts,
} from "./report-voice-latency.mjs";

function metrics(values) {
  return {
    greetingLatencyMs: values.greeting ?? [],
    interruptionLatencyMs: values.interruption ?? [],
    summary: {},
    toolLatencyMs: values.tool ?? [],
    turnLatencyMs: values.turn ?? [],
  };
}

test("aggregates current voice artifact metrics", async () => {
  const report = await aggregateVoiceArtifactMetrics([
    { attemptId: "voice_1", metrics: metrics({ greeting: [300], turn: [700, 900] }) },
    { attemptId: "voice_2", metrics: metrics({ greeting: [500], tool: [20], turn: [800] }) },
  ]);

  assert.deepEqual(report.metrics.greetingLatencyMs, {
    count: 2,
    maxMs: 500,
    meanMs: 400,
    minMs: 300,
    p50Ms: 300,
    p95Ms: 500,
  });
  assert.deepEqual(report.metrics.turnLatencyMs, {
    count: 3,
    maxMs: 900,
    meanMs: 800,
    minMs: 700,
    p50Ms: 800,
    p95Ms: 900,
  });
  assert.equal(report.attempts.count, 2);
});

test("streams finalized metrics files and skips unfinished attempts", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "voice-artifacts-"));
  const completeDirectory = join(artifactsRoot, "voice_complete");
  await mkdir(completeDirectory);
  await writeFile(
    join(completeDirectory, "metrics.json"),
    `${JSON.stringify(metrics({ interruption: [120], tool: [25] }))}\n`,
  );
  await mkdir(join(artifactsRoot, "voice_unfinished"));

  const report = await buildLatencyReportFromArtifacts(artifactsRoot);

  assert.equal(report.attempts.count, 1);
  assert.deepEqual(report.attempts.ids, ["voice_complete"]);
  assert.equal(report.metrics.interruptionLatencyMs.p95Ms, 120);
  assert.equal(report.metrics.toolLatencyMs.meanMs, 25);
});

test("bounds retained attempt IDs and percentile samples", async () => {
  async function* attempts() {
    for (let index = 0; index < 1_200; index += 1) {
      yield {
        attemptId: `voice_${index}`,
        metrics: metrics({ turn: [index + 1] }),
      };
    }
  }

  const report = await aggregateVoiceArtifactMetrics(attempts());

  assert.equal(report.attempts.count, 1_200);
  assert.equal(report.attempts.ids.length, 512);
  assert.equal(report.metrics.turnLatencyMs.count, 1_200);
  assert.deepEqual(report.limits, {
    attemptIds: 512,
    maxMetricsFileBytes: 1_048_576,
    metricSamples: 2_048,
  });
});
