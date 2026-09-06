import {
  access,
  appendFile,
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const attemptIdPattern = /^voice_[a-zA-Z0-9_-]+$/;
const phoneNumberPattern = /\+[1-9]\d{7,14}/g;
const directoryMode = 0o700;
const fileMode = 0o600;
const defaultRetentionMs = 7 * 24 * 60 * 60 * 1_000;
const metricSampleLimit = 512;
const metricPairLimit = 512;
const evidenceChannels = ["events", "model", "tools", "transcript"] as const;
const metricPayloadKeys = new Set([
  "attemptId",
  "commandId",
  "durationMs",
  "elapsedMs",
  "eventType",
  "interruptionId",
  "operationId",
  "providerCallId",
  "resultCode",
  "route",
  "segment",
  "stage",
  "status",
  "track",
  "turnId",
]);
const metricCorrelationKeys = new Set([
  "assistantId",
  "assistantVersionId",
  "conversationId",
  "providerCallId",
  "providerCallLegId",
  "providerCallSessionId",
  "relaySessionId",
  "requestId",
  "traceId",
]);
const sensitiveKeys = [
  "apikey",
  "authorization",
  "authtoken",
  "bearertoken",
  "password",
  "relaytoken",
  "secret",
  "signature",
  "tooltoken",
  "webhooksecret",
] as const;

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
  flush(): Promise<void>;
  record(event: VoiceEvidenceEvent): Promise<void>;
  recordAndWait(event: VoiceEvidenceEvent): Promise<void>;
  writeAudio(audio: VoiceEvidenceAudio): Promise<void>;
};

export type VoiceEvidenceRetentionOptions =
  | { expiresAt?: string; mode?: "metrics-only" }
  | { expiresAt: string; mode: "full" };

type VoiceEvidenceRetentionMetadata = {
  expiresAt: string;
  mode: "full" | "metrics-only";
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
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (sensitiveKeys.some((sensitiveKey) => normalizedKey.endsWith(sensitiveKey))) {
    return "[REDACTED_SECRET]";
  }
  if (typeof value === "string") return value.replace(phoneNumberPattern, "[REDACTED_PHONE]");
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => (
      [entryKey, sanitize(entryValue, entryKey)]
    )));
  }
  return value;
}

function selectedEntries(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
) {
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => (
    allowedKeys.has(key)
    && (entry === null
      || typeof entry === "string"
      || typeof entry === "boolean"
      || (typeof entry === "number" && Number.isFinite(entry)))
  )));
}

function retainedCorrelation(
  correlation: Record<string, unknown>,
  mode: VoiceEvidenceRetentionMetadata["mode"],
) {
  return mode === "full" ? correlation : selectedEntries(correlation, metricCorrelationKeys);
}

function retainedPayload(
  payload: Record<string, unknown>,
  mode: VoiceEvidenceRetentionMetadata["mode"],
) {
  return mode === "full" ? payload : selectedEntries(payload, metricPayloadKeys);
}

function resolveRetention(
  startedAt: string,
  retention: VoiceEvidenceRetentionOptions | undefined,
): VoiceEvidenceRetentionMetadata {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw new Error("Voice evidence start time is invalid.");
  const expiresAt = retention?.expiresAt
    ?? new Date(startedAtMs + defaultRetentionMs).toISOString();
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs) {
    throw new Error("Voice evidence expiry must be after the start time.");
  }
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    mode: retention?.mode ?? "metrics-only",
  };
}

function retainedManifest(
  manifest: VoiceEvidenceManifest,
  retention: VoiceEvidenceRetentionMetadata,
) {
  return sanitize({
    ...manifest,
    configuration: retention.mode === "full" ? manifest.configuration : {},
    correlation: retainedCorrelation(manifest.correlation, retention.mode),
    greeting: retention.mode === "full" ? manifest.greeting : "[OMITTED_METRICS_ONLY]",
    retention,
  }) as VoiceEvidenceManifest & { retention: VoiceEvidenceRetentionMetadata };
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

class BoundedLatencySeries {
  private count = 0;
  private maximum: number | null = null;
  private minimum: number | null = null;
  private readonly samples: number[] = [];
  private total = 0;

  add(value: number) {
    if (!Number.isFinite(value)) return;
    this.count += 1;
    this.total += value;
    this.maximum = this.maximum === null ? value : Math.max(this.maximum, value);
    this.minimum = this.minimum === null ? value : Math.min(this.minimum, value);
    if (this.samples.length < metricSampleLimit) {
      this.samples.push(value);
      return;
    }
    const candidate = (Math.imul(this.count, 2_654_435_761) >>> 0) % this.count;
    if (candidate < metricSampleLimit) this.samples[candidate] = value;
  }

  statistics(): VoiceLatencyStatistics {
    if (this.count === 0) return statistics([]);
    const sampled = statistics(this.samples);
    return {
      count: this.count,
      maxMs: this.maximum,
      meanMs: Math.round(this.total / this.count),
      minMs: this.minimum,
      p50Ms: sampled.p50Ms,
      p95Ms: sampled.p95Ms,
    };
  }

  values() {
    return [...this.samples];
  }
}

function rememberBoundedStart(starts: Map<string, number>, key: string, monotonicMs: number) {
  starts.delete(key);
  starts.set(key, monotonicMs);
  while (starts.size > metricPairLimit) {
    const oldest = starts.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    starts.delete(oldest);
  }
}

class VoiceMetricTracker {
  private answerAt: number | undefined;
  private greetingAt: number | undefined;
  private greetingRecorded = false;
  private readonly greeting = new BoundedLatencySeries();
  private readonly interruption = new BoundedLatencySeries();
  private readonly interruptionStarts = new Map<string, number>();
  private readonly tool = new BoundedLatencySeries();
  private readonly toolStarts = new Map<string, number>();
  private readonly turn = new BoundedLatencySeries();
  private readonly turnStarts = new Map<string, number>();

  process(event: StoredEvent) {
    if (event.type === "destination.answered" && this.answerAt === undefined) {
      this.answerAt = event.monotonicMs;
      this.recordGreetingWhenReady();
    }
    if (event.type === "audio.assistant.started"
      && event.payload.segment === "greeting"
      && this.greetingAt === undefined) {
      this.greetingAt = event.monotonicMs;
      this.recordGreetingWhenReady();
    }
    this.processPair(
      event,
      "audio.caller.ended",
      "audio.assistant.started",
      "turnId",
      this.turnStarts,
      this.turn,
    );
    this.processPair(
      event,
      "audio.caller.started",
      "audio.assistant.stopped",
      "interruptionId",
      this.interruptionStarts,
      this.interruption,
    );
    this.processPair(
      event,
      "tool.started",
      "tool.completed",
      "operationId",
      this.toolStarts,
      this.tool,
    );
  }

  metrics(): VoiceEvidenceMetrics {
    return {
      greetingLatencyMs: this.greeting.values(),
      interruptionLatencyMs: this.interruption.values(),
      summary: {
        greetingLatencyMs: this.greeting.statistics(),
        interruptionLatencyMs: this.interruption.statistics(),
        toolLatencyMs: this.tool.statistics(),
        turnLatencyMs: this.turn.statistics(),
      },
      toolLatencyMs: this.tool.values(),
      turnLatencyMs: this.turn.values(),
    };
  }

  private processPair(
    event: StoredEvent,
    startType: string,
    endType: string,
    correlationKey: string,
    starts: Map<string, number>,
    series: BoundedLatencySeries,
  ) {
    const correlation = stringPayload(event, correlationKey);
    if (!correlation) return;
    if (event.type === startType) {
      rememberBoundedStart(starts, correlation, event.monotonicMs);
      return;
    }
    if (event.type !== endType) return;
    const startedAt = starts.get(correlation);
    starts.delete(correlation);
    if (startedAt !== undefined && event.monotonicMs >= startedAt) {
      series.add(event.monotonicMs - startedAt);
    }
  }

  private recordGreetingWhenReady() {
    if (this.greetingRecorded || this.answerAt === undefined || this.greetingAt === undefined) return;
    this.greetingRecorded = true;
    if (this.greetingAt >= this.answerAt) this.greeting.add(this.greetingAt - this.answerAt);
  }
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

  let retentionMode: VoiceEvidenceRetentionMetadata["mode"] = "full";
  try {
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
      retention?: { mode?: unknown };
    };
    if (manifest.retention?.mode === "metrics-only") retentionMode = "metrics-only";
  } catch {
    // The required-file check already reports an unreadable manifest.
  }

  if (retentionMode === "full") {
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
  }

  return { complete: missing.length === 0, missing };
}

export async function openVoiceEvidenceRecorder(options: {
  appendEvent?: (path: string, entry: string) => Promise<void>;
  artifactsRoot: string;
  manifest: VoiceEvidenceManifest;
  retention?: VoiceEvidenceRetentionOptions;
}): Promise<VoiceEvidenceRecorder> {
  if (!attemptIdPattern.test(options.manifest.attemptId)) {
    throw new Error("Voice evidence attempt ID is invalid.");
  }

  const directory = join(options.artifactsRoot, options.manifest.attemptId);
  const retention = resolveRetention(options.manifest.startedAt, options.retention);
  const appendEvent = options.appendEvent ?? ((path: string, entry: string) => (
    appendFile(path, entry, { mode: fileMode })
  ));
  let manifest = retainedManifest(options.manifest, retention);
  let manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const audioDirectory = join(directory, "audio");
  const channelPaths = Object.fromEntries(evidenceChannels.map((channel) => (
    [channel, join(directory, `${channel}.jsonl`)]
  ))) as Record<VoiceEvidenceChannel, string>;
  const manifestPath = join(directory, "manifest.json");
  await mkdir(audioDirectory, { mode: directoryMode, recursive: true });
  await Promise.all([
    chmod(directory, directoryMode),
    chmod(audioDirectory, directoryMode),
  ]);
  await Promise.all([
    writeFile(manifestPath, manifestText, { flag: "wx", mode: fileMode }),
    ...evidenceChannels.map((channel) => (
      writeFile(channelPaths[channel], "", { flag: "wx", mode: fileMode })
    )),
  ]);

  let sequence = 0;
  const metricTracker = new VoiceMetricTracker();
  const durablePaths = new Set([manifestPath, ...Object.values(channelPaths)]);
  let writeQueue = Promise.resolve();
  let writeFailure: unknown;
  let finalized: VoiceEvidenceFinalized | undefined;
  let finalizing: Promise<VoiceEvidenceFinalized> | undefined;

  function enqueue(write: () => Promise<void>) {
    const pending = writeQueue.then(write);
    writeQueue = pending.catch((error) => {
      if (writeFailure === undefined) writeFailure = error;
    });
    return pending;
  }

  async function syncPaths(paths: Iterable<string>) {
    await Promise.all([...paths].map(async (path) => {
      const handle = await open(path, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }));
  }

  async function flush() {
    await writeQueue;
    if (writeFailure !== undefined) throw writeFailure;
    await syncPaths(durablePaths);
  }

  function queueEvent(event: VoiceEvidenceEvent) {
    if (finalized || finalizing) {
      return Promise.reject(new Error("The voice evidence recorder is finalized."));
    }
    sequence += 1;
    const entry = sanitize({
      monotonicMs: event.monotonicMs,
      observedAt: event.observedAt,
      payload: retainedPayload(event.payload, retention.mode),
      sequence,
      source: event.source,
      type: event.type,
    }) as StoredEvent;
    return enqueue(async () => {
      await appendEvent(channelPaths[event.channel], `${JSON.stringify(entry)}\n`);
      metricTracker.process(entry);
    });
  }

  return {
    async correlate(correlation) {
      if (finalized || finalizing) throw new Error("The voice evidence recorder is finalized.");
      await enqueue(async () => {
        const nextManifest = sanitize({
          ...manifest,
          correlation: {
            ...manifest.correlation,
            ...retainedCorrelation(correlation, retention.mode),
          },
        }) as typeof manifest;
        const nextText = `${JSON.stringify(nextManifest, null, 2)}\n`;
        if (nextText === manifestText) return;
        await writeFile(manifestPath, nextText, { mode: fileMode });
        manifest = nextManifest;
        manifestText = nextText;
      });
      await flush();
    },
    directory,
    async finalize(result) {
      if (finalized) return finalized;
      if (finalizing) return finalizing;
      finalizing = (async () => {
        await flush();
        const metrics = metricTracker.metrics();
        const finalManifest = sanitize({
          ...manifest,
          dashboardOutcome: result.dashboardOutcome,
          finishedAt: result.finishedAt,
          schedulingOutcome: result.schedulingOutcome,
        });
        const metricsPath = join(directory, "metrics.json");
        const summaryPath = join(directory, "summary.md");
        const voiceScoresPath = join(directory, "voice-scores.json");
        await Promise.all([
          writeFile(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, { mode: fileMode }),
          writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, { mode: fileMode }),
          writeFile(summaryPath, summaryMarkdown(manifest, result, metrics), { mode: fileMode }),
          writeFile(voiceScoresPath, `${JSON.stringify({ status: "pending" }, null, 2)}\n`, { mode: fileMode }),
        ]);
        durablePaths.add(metricsPath);
        durablePaths.add(summaryPath);
        durablePaths.add(voiceScoresPath);
        await syncPaths([manifestPath, metricsPath, summaryPath, voiceScoresPath]);
        finalized = { directory, metrics };
        return finalized;
      })();
      try {
        return await finalizing;
      } catch (error) {
        finalizing = undefined;
        throw error;
      }
    },
    flush,
    record(event) {
      if (finalized || finalizing) {
        return Promise.reject(new Error("The voice evidence recorder is finalized."));
      }
      const pending = queueEvent(event);
      void pending.catch(() => undefined);
      return Promise.resolve();
    },
    recordAndWait(event) {
      return queueEvent(event);
    },
    async writeAudio(audio) {
      if (retention.mode === "metrics-only") return;
      const path = join(audioDirectory, `${audio.track}.${audio.extension}`);
      await enqueue(async () => {
        await writeFile(path, audio.data, { flag: "wx", mode: fileMode });
        durablePaths.add(path);
      });
    },
  };
}
