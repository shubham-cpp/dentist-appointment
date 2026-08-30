import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultLogPath = join(tmpdir(), "dentist-management-system-voice-gateway.jsonl");

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

function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  return {
    count: sorted.length,
    maxMs: sorted.at(-1),
    meanMs: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    minMs: sorted[0],
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

function parseEntries(source) {
  const entries = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      throw new Error(`Invalid JSON on log line ${index + 1}.`);
    }
  }
  return entries;
}

function traceIdentifier(data) {
  return data?.attemptId ?? data?.commandId ?? data?.traceId;
}

export function buildLatencyReport(entries, requestedTrace) {
  const traceIds = [...new Set(entries
    .map((entry) => traceIdentifier(entry.data))
    .filter((value) => typeof value === "string"))];
  const traceId = requestedTrace ?? traceIds.at(-1);
  const selected = traceId
    ? entries.filter((entry) => traceIdentifier(entry.data) === traceId)
    : entries;

  const stageValues = new Map();
  for (const entry of selected) {
    if (entry.event !== "voice.latency") continue;
    const stage = entry.data?.stage;
    const elapsedMs = entry.data?.elapsedMs;
    if (typeof stage !== "string" || !Number.isFinite(elapsedMs)) continue;
    const values = stageValues.get(stage) ?? [];
    values.push(elapsedMs);
    stageValues.set(stage, values);
  }
  if (!stageValues.has("user_history_to_first_assistant_text")) {
    let lastRole;
    let lastUserAtMs;
    const derived = [];
    for (const entry of selected) {
      if (entry.event !== "telnyx.standalone_assistant_diagnostic"
        || entry.data?.eventType !== "call.ai_gather.message_history_updated"
        || !Array.isArray(entry.data?.messageHistory)) {
        continue;
      }
      const occurredAtMs = Date.parse(entry.data.occurredAt);
      const role = entry.data.messageHistory.at(-1)?.role;
      if (!Number.isFinite(occurredAtMs) || typeof role !== "string") continue;
      if (role === "user") lastUserAtMs = occurredAtMs;
      if (role === "assistant" && lastRole === "user" && lastUserAtMs !== undefined) {
        derived.push(Math.max(0, occurredAtMs - lastUserAtMs));
      }
      lastRole = role;
    }
    if (derived.length > 0) {
      stageValues.set("user_history_to_first_assistant_text", derived);
    }
  }

  const toolValues = new Map();
  for (const entry of selected) {
    if (entry.event !== "telnyx.assistant_tool.completed") continue;
    const route = entry.data?.route;
    const durationMs = entry.data?.durationMs;
    if (typeof route !== "string" || !Number.isFinite(durationMs)) continue;
    const values = toolValues.get(route) ?? [];
    values.push(durationMs);
    toolValues.set(route, values);
  }

  const timelineEvents = new Set([
    "telnyx.assistant_tool.completed",
    "telnyx.assistant_tool.failed",
    "telnyx.assistant_tool.started",
    "voice.media.speech_ended",
    "voice.media.speech_started",
    "voice.turn.assistant_text_started",
    "voice.turn.user_text_update",
    "voice.latency",
  ]);
  return {
    availableTraceIds: traceIds,
    media: {
      frameCount: selected.filter((entry) => entry.event === "voice.media.frame").length,
      inboundFrameCount: selected.filter(
        (entry) => entry.event === "voice.media.frame" && entry.data?.track === "inbound",
      ).length,
      outboundFrameCount: selected.filter(
        (entry) => entry.event === "voice.media.frame" && entry.data?.track === "outbound",
      ).length,
    },
    stages: Object.fromEntries(
      [...stageValues.entries()].map(([stage, values]) => [stage, statistics(values)]),
    ),
    timeline: selected
      .filter((entry) => timelineEvents.has(entry.event))
      .map((entry) => ({
        data: Object.fromEntries(Object.entries(entry.data ?? {}).filter(([key]) => (
          !["messageHistory", "payload", "requestBody", "result"].includes(key)
        ))),
        event: entry.event,
        timestamp: entry.timestamp,
      })),
    tools: Object.fromEntries(
      [...toolValues.entries()].map(([route, values]) => [route, statistics(values)]),
    ),
    traceId,
  };
}

function rowsForStatistics(values) {
  return Object.entries(values).map(([name, stats]) => [
    name,
    String(stats.count),
    String(stats.minMs),
    String(stats.p50Ms),
    String(stats.p95Ms),
    String(stats.maxMs),
    String(stats.meanMs),
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
  const logPath = argument("--log")
    ?? process.env.VOICE_GATEWAY_DEBUG_LOG_PATH
    ?? defaultLogPath;
  const traceId = argument("--trace");
  const report = buildLatencyReport(parseEntries(await readFile(logPath, "utf8")), traceId);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Log: ${logPath}`);
  console.log(`Trace: ${report.traceId ?? "all"}`);
  console.log("\nLatency stages (milliseconds)");
  console.log(renderTable(
    ["stage", "n", "min", "p50", "p95", "max", "mean"],
    rowsForStatistics(report.stages),
  ));
  console.log("\nTool execution (milliseconds)");
  console.log(renderTable(
    ["route", "n", "min", "p50", "p95", "max", "mean"],
    rowsForStatistics(report.tools),
  ));
  console.log(`\nMedia frames: ${report.media.frameCount}`);
  console.log(`Inbound frames: ${report.media.inboundFrameCount}`);
  console.log(`Outbound frames: ${report.media.outboundFrameCount}`);
  console.log("\nTimeline");
  for (const entry of report.timeline) {
    console.log(`${entry.timestamp} ${entry.event} ${JSON.stringify(entry.data)}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
