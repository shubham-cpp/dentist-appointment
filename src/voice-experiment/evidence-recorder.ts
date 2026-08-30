import { access, appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const attemptIdPattern = /^voice_[a-zA-Z0-9_-]+$/;
const phoneNumberPattern = /\+[1-9]\d{7,14}/g;
const sensitiveKeyPattern = /^(?:apiKey|authorization|authToken|bearerToken|password|relayToken|secret|signature|toolToken|webhookSecret)$/i;

export type VoiceEvidenceChannel = "events" | "model" | "tools" | "transcript";

export type VoiceEvidenceManifest = {
  attemptId: string;
  configuration: Record<string, unknown>;
  correlation: Record<string, unknown>;
  greeting: string;
  model: string;
  requestId: string;
  route: string;
  runtime: "telnyx-candidate" | "twilio-candidate";
  startedAt: string;
  voice: string;
};

export type VoiceEvidenceEvent = {
  channel: VoiceEvidenceChannel;
  monotonicMs: number;
  observedAt: string;
  payload: Record<string, unknown>;
  source: string;
  type: string;
};

export type VoiceEvidenceRecorder = {
  correlate(correlation: Record<string, unknown>): Promise<void>;
  directory: string;
  finalize(result: VoiceEvidenceFinalResult): Promise<VoiceEvidenceFinalized>;
  record(event: VoiceEvidenceEvent): Promise<void>;
  writeAudio(audio: VoiceEvidenceAudio): Promise<void>;
};

export type VoiceEvidenceAudio = {
  data: Uint8Array;
  extension: "mp3" | "pcmu" | "wav";
  track: "destination" | "provider-inbound" | "provider-outbound";
};

export type VoiceEvidenceFinalResult = {
  dashboardOutcome: string;
  finishedAt: string;
  schedulingOutcome: string;
};

type VoiceLatencyStatistics = {
  count: number;
  maxMs: number | null;
  meanMs: number | null;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

export type VoiceEvidenceMetrics = {
  greetingLatencyMs: number[];
  interruptionLatencyMs: number[];
  summary: {
    greetingLatencyMs: VoiceLatencyStatistics;
    interruptionLatencyMs: VoiceLatencyStatistics;
    toolLatencyMs: VoiceLatencyStatistics;
    turnLatencyMs: VoiceLatencyStatistics;
  };
  toolLatencyMs: number[];
  turnLatencyMs: number[];
};

export type VoiceEvidenceFinalized = {
  directory: string;
  metrics: VoiceEvidenceMetrics;
};

export type VoiceEvidenceInspection = {
  complete: boolean;
  missing: string[];
};

type StoredEvent = Omit<VoiceEvidenceEvent, "channel"> & { sequence: number };

function sanitize(value: unknown, key = ""): unknown {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED_SECRET]";
  if (typeof value === "string") return value.replace(phoneNumberPattern, "[REDACTED_PHONE]");
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => (
      [entryKey, sanitize(entryValue, entryKey)]
    )));
  }
  return value;
}

function nearestRank(sorted: number[], percentile: number) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
}

function statistics(values: number[]): VoiceLatencyStatistics {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null };
  }
  return {
    count: sorted.length,
    maxMs: sorted.at(-1)!,
    meanMs: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    minMs: sorted[0],
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
  };
}

function stringPayload(event: StoredEvent, key: string) {
  const value = event.payload[key];
  return typeof value === "string" ? value : undefined;
}

function pairedDurations(
  events: StoredEvent[],
  startType: string,
  endType: string,
  correlationKey: string,
) {
  const starts = new Map<string, number>();
  const durations: number[] = [];
  for (const event of events) {
    const correlation = stringPayload(event, correlationKey);
    if (!correlation) continue;
    if (event.type === startType) starts.set(correlation, event.monotonicMs);
    if (event.type === endType) {
      const startedAt = starts.get(correlation);
      if (startedAt !== undefined && event.monotonicMs >= startedAt) {
        durations.push(event.monotonicMs - startedAt);
        starts.delete(correlation);
      }
    }
  }
  return durations;
}

function deriveMetrics(events: StoredEvent[]): VoiceEvidenceMetrics {
  const answer = events.find((event) => event.type === "destination.answered");
  const greeting = events.find((event) => (
    event.type === "audio.assistant.started" && event.payload.segment === "greeting"
  ));
  const greetingLatencyMs = answer && greeting && greeting.monotonicMs >= answer.monotonicMs
    ? [greeting.monotonicMs - answer.monotonicMs]
    : [];
  const turnLatencyMs = pairedDurations(
    events,
    "audio.caller.ended",
    "audio.assistant.started",
    "turnId",
  );
  const interruptionLatencyMs = pairedDurations(
    events,
    "audio.caller.started",
    "audio.assistant.stopped",
    "interruptionId",
  );
  const toolLatencyMs = pairedDurations(events, "tool.started", "tool.completed", "operationId");
  return {
    greetingLatencyMs,
    interruptionLatencyMs,
    summary: {
      greetingLatencyMs: statistics(greetingLatencyMs),
      interruptionLatencyMs: statistics(interruptionLatencyMs),
      toolLatencyMs: statistics(toolLatencyMs),
      turnLatencyMs: statistics(turnLatencyMs),
    },
    toolLatencyMs,
    turnLatencyMs,
  };
}

function summaryMarkdown(
  manifest: VoiceEvidenceManifest,
  result: VoiceEvidenceFinalResult,
  metrics: VoiceEvidenceMetrics,
) {
  const value = (milliseconds: number | null) => milliseconds === null ? "not measured" : `${milliseconds} ms`;
  return [
    `# Voice evidence summary for ${manifest.attemptId}`,
    "",
    `Runtime: ${manifest.runtime}`,
    "",
    `Scheduling outcome: ${result.schedulingOutcome}`,
    "",
    `Dashboard outcome: ${result.dashboardOutcome}`,
    "",
    `Greeting latency p95: ${value(metrics.summary.greetingLatencyMs.p95Ms)}`,
    "",
    `Turn latency p95: ${value(metrics.summary.turnLatencyMs.p95Ms)}`,
    "",
    `Interruption latency p95: ${value(metrics.summary.interruptionLatencyMs.p95Ms)}`,
    "",
    `Tool latency p95: ${value(metrics.summary.toolLatencyMs.p95Ms)}`,
    "",
  ].join("\n");
}

export async function inspectVoiceEvidenceAttempt(
  directory: string,
): Promise<VoiceEvidenceInspection> {
  const requiredFiles = [
    "manifest.json",
    "events.jsonl",
    "transcript.jsonl",
    "model.jsonl",
    "tools.jsonl",
    "metrics.json",
    "voice-scores.json",
    "summary.md",
  ];
  const missing: string[] = [];
  for (const file of requiredFiles) {
    try {
      await access(join(directory, file));
    } catch {
      missing.push(file);
    }
  }

  let audioFiles: string[] = [];
  try {
    audioFiles = await readdir(join(directory, "audio"));
  } catch {
    missing.push("audio/");
  }
  for (const track of ["destination", "provider-inbound", "provider-outbound"] as const) {
    if (!audioFiles.some((file) => file.startsWith(`${track}.`))) {
      missing.push(`audio/${track}.*`);
    }
  }

  return { complete: missing.length === 0, missing };
}

export async function openVoiceEvidenceRecorder(options: {
  artifactsRoot: string;
  manifest: VoiceEvidenceManifest;
}): Promise<VoiceEvidenceRecorder> {
  if (!attemptIdPattern.test(options.manifest.attemptId)) {
    throw new Error("Voice evidence attempt ID is invalid.");
  }

  const directory = join(options.artifactsRoot, options.manifest.attemptId);
  let manifest = sanitize(options.manifest) as VoiceEvidenceManifest;
  await mkdir(join(directory, "audio"), { recursive: true });
  await Promise.all([
    writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" }),
    writeFile(join(directory, "events.jsonl"), "", { flag: "wx" }),
    writeFile(join(directory, "model.jsonl"), "", { flag: "wx" }),
    writeFile(join(directory, "tools.jsonl"), "", { flag: "wx" }),
    writeFile(join(directory, "transcript.jsonl"), "", { flag: "wx" }),
  ]);

  let sequence = 0;
  const recordedEvents: StoredEvent[] = [];

  return {
    async correlate(correlation) {
      manifest = sanitize({
        ...manifest,
        correlation: { ...manifest.correlation, ...correlation },
      }) as VoiceEvidenceManifest;
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    },
    directory,
    async finalize(result) {
      const metrics = deriveMetrics(recordedEvents);
      const finalManifest = sanitize({
        ...manifest,
        dashboardOutcome: result.dashboardOutcome,
        finishedAt: result.finishedAt,
        schedulingOutcome: result.schedulingOutcome,
      });
      await Promise.all([
        writeFile(join(directory, "manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`),
        writeFile(join(directory, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, { flag: "wx" }),
        writeFile(join(directory, "summary.md"), summaryMarkdown(manifest, result, metrics), { flag: "wx" }),
        writeFile(join(directory, "voice-scores.json"), `${JSON.stringify({ status: "pending" }, null, 2)}\n`, { flag: "wx" }),
      ]);
      return { directory, metrics };
    },
    async record(event) {
      sequence += 1;
      const entry = sanitize({
        monotonicMs: event.monotonicMs,
        observedAt: event.observedAt,
        payload: event.payload,
        sequence,
        source: event.source,
        type: event.type,
      }) as StoredEvent;
      recordedEvents.push(entry);
      await appendFile(join(directory, `${event.channel}.jsonl`), `${JSON.stringify(entry)}\n`);
    },
    async writeAudio(audio) {
      await writeFile(
        join(directory, "audio", `${audio.track}.${audio.extension}`),
        audio.data,
        { flag: "wx" },
      );
    },
  };
}
