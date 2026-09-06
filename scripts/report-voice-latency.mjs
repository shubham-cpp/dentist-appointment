import { opendir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const attemptIdLimit = 512;
const metricSampleLimit = 2_048;
const maxMetricsFileBytes = 1_048_576;
const metricNames = [
  "greetingLatencyMs",
  "interruptionLatencyMs",
  "toolLatencyMs",
  "turnLatencyMs",
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function percentile(sorted, percentage) {
  if (sorted.length === 0) return undefined;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentage) - 1),
  );
  return sorted[index];
}

class BoundedAttemptIds {
  #values = [];

  add(value) {
    if (this.#values.length === attemptIdLimit) this.#values.shift();
    this.#values.push(value);
  }

  values() {
    return [...this.#values];
  }
}

class OnlineStatistics {
  #count = 0;
  #maximum;
  #minimum;
  #sampleCount = 0;
  #samples = [];
  #total = 0;

  addSeries(values, summary) {
    const validValues = values.filter(Number.isFinite);
    const hasCompleteSummary = Number.isInteger(summary?.count)
      && summary.count >= validValues.length
      && (summary.count === 0 || (
        Number.isFinite(summary.meanMs)
        && Number.isFinite(summary.minMs)
        && Number.isFinite(summary.maxMs)
      ));
    const summaryCount = hasCompleteSummary
      ? summary.count
      : validValues.length;
    const summaryMean = hasCompleteSummary
      ? summary.meanMs
      : validValues.reduce((total, value) => total + value, 0) / Math.max(1, validValues.length);
    const summaryMinimum = hasCompleteSummary
      ? summary.minMs
      : validValues.length > 0 ? Math.min(...validValues) : undefined;
    const summaryMaximum = hasCompleteSummary
      ? summary.maxMs
      : validValues.length > 0 ? Math.max(...validValues) : undefined;
    if (summaryCount > 0) {
      this.#count += summaryCount;
      this.#total += summaryMean * summaryCount;
      this.#minimum = this.#minimum === undefined
        ? summaryMinimum
        : Math.min(this.#minimum, summaryMinimum);
      this.#maximum = this.#maximum === undefined
        ? summaryMaximum
        : Math.max(this.#maximum, summaryMaximum);
    }
    for (const value of validValues) this.#addSample(value);
  }

  result() {
    if (this.#count === 0) return undefined;
    const sorted = [...this.#samples].sort((left, right) => left - right);
    return {
      count: this.#count,
      maxMs: this.#maximum,
      meanMs: Math.round(this.#total / this.#count),
      minMs: this.#minimum,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
    };
  }

  #addSample(value) {
    this.#sampleCount += 1;
    if (this.#samples.length < metricSampleLimit) {
      this.#samples.push(value);
      return;
    }
    const candidate = (Math.imul(this.#sampleCount, 2_654_435_761) >>> 0) % this.#sampleCount;
    if (candidate < metricSampleLimit) this.#samples[candidate] = value;
  }
}

function validateMetrics(value, path) {
  if (!value || typeof value !== "object") throw new Error(`Invalid metrics file: ${path}`);
  for (const name of metricNames) {
    if (!Array.isArray(value[name]) || value[name].some((entry) => !Number.isFinite(entry))) {
      throw new Error(`Invalid ${name} in metrics file: ${path}`);
    }
  }
  return value;
}

async function* voiceArtifactMetrics(artifactsRoot) {
  const directory = await opendir(artifactsRoot);
  for await (const entry of directory) {
    if (!entry.isDirectory() || !entry.name.startsWith("voice_")) continue;
    const metricsPath = join(artifactsRoot, entry.name, "metrics.json");
    let fileStats;
    try {
      fileStats = await stat(metricsPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (fileStats.size > maxMetricsFileBytes) {
      throw new Error(`Metrics file exceeds ${maxMetricsFileBytes} bytes: ${metricsPath}`);
    }
    let metrics;
    try {
      metrics = JSON.parse(await readFile(metricsPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON in metrics file: ${metricsPath}`, { cause: error });
    }
    yield { attemptId: entry.name, metrics: validateMetrics(metrics, metricsPath) };
  }
}

export async function aggregateVoiceArtifactMetrics(attempts) {
  const attemptIds = new BoundedAttemptIds();
  const series = Object.fromEntries(metricNames.map((name) => [name, new OnlineStatistics()]));
  let attemptCount = 0;
  for await (const attempt of attempts) {
    attemptCount += 1;
    attemptIds.add(attempt.attemptId);
    for (const name of metricNames) {
      series[name].addSeries(attempt.metrics[name], attempt.metrics.summary?.[name]);
    }
  }
  return {
    attempts: { count: attemptCount, ids: attemptIds.values() },
    limits: {
      attemptIds: attemptIdLimit,
      maxMetricsFileBytes,
      metricSamples: metricSampleLimit,
    },
    metrics: Object.fromEntries(metricNames.map((name) => [name, series[name].result()])),
  };
}

export function buildLatencyReportFromArtifacts(artifactsRoot) {
  return aggregateVoiceArtifactMetrics(voiceArtifactMetrics(artifactsRoot));
}

function rowsForStatistics(metrics) {
  return Object.entries(metrics)
    .filter(([, values]) => values)
    .map(([name, values]) => [
      name,
      String(values.count),
      String(values.minMs),
      String(values.p50Ms),
      String(values.p95Ms),
      String(values.maxMs),
      String(values.meanMs),
    ]);
}

function renderTable(headers, rows) {
  if (rows.length === 0) return "(no measurements)";
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => row[index].length),
  ));
  const render = (row) => row.map((cell, index) => cell.padEnd(widths[index])).join(" | ");
  return [
    render(headers),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(render),
  ].join("\n");
}

async function main() {
  const artifactsRoot = argument("--artifacts")
    ?? process.env.VOICE_ARTIFACTS_ROOT
    ?? join(process.cwd(), ".voice-artifacts");
  const report = await buildLatencyReportFromArtifacts(artifactsRoot);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Artifacts: ${artifactsRoot}`);
  console.log(`Finalized attempts: ${report.attempts.count}`);
  console.log("\nLatency metrics (milliseconds)");
  console.log(renderTable(
    ["metric", "n", "min", "p50", "p95", "max", "mean"],
    rowsForStatistics(report.metrics),
  ));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
