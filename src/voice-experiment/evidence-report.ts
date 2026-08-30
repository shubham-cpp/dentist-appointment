export type VoiceExperimentRuntime = "telnyx-candidate" | "twilio-candidate";
export type VoiceExperimentGateStatus = "fail" | "pass" | "pending";

export type VoiceExperimentAttemptEvidence = {
  attemptId: string;
  dashboardOutcome: string;
  dialoguePassed?: boolean;
  evidenceComplete: boolean;
  metrics: {
    greetingLatencyMs: number[];
    interruptionLatencyMs: number[];
    toolLatencyMs: number[];
    turnLatencyMs: number[];
  };
  rollbackPassed: boolean;
  runtime: VoiceExperimentRuntime;
  safetyPassed: boolean;
  schedulingOutcome: string;
  voicePassed?: boolean;
};

type LatencyStatistics = {
  count: number;
  maxMs: number | null;
  meanMs: number | null;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

type RuntimeReport = {
  attemptIds: string[];
  gates: {
    dialogue: VoiceExperimentGateStatus;
    evidence: VoiceExperimentGateStatus;
    greetingLatency: VoiceExperimentGateStatus;
    interruptionLatency: VoiceExperimentGateStatus;
    outcomeAccuracy: VoiceExperimentGateStatus;
    overall: VoiceExperimentGateStatus;
    rollback: VoiceExperimentGateStatus;
    safety: VoiceExperimentGateStatus;
    turnLatency: VoiceExperimentGateStatus;
    voice: VoiceExperimentGateStatus;
  };
  metrics: {
    greetingLatencyMs: LatencyStatistics;
    interruptionLatencyMs: LatencyStatistics;
    toolLatencyMs: LatencyStatistics;
    turnLatencyMs: LatencyStatistics;
  };
};

export type VoiceExperimentReport = {
  runtimes: Record<VoiceExperimentRuntime, RuntimeReport>;
};

function statistics(values: number[]): LatencyStatistics {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, maxMs: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null };
  }
  const percentile = (value: number) => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];
  return {
    count: sorted.length,
    maxMs: sorted.at(-1)!,
    meanMs: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    minMs: sorted[0],
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}

function booleanGate(values: Array<boolean | undefined>): VoiceExperimentGateStatus {
  if (values.some((value) => value === false)) return "fail";
  if (values.length === 0 || values.some((value) => value === undefined)) return "pending";
  return "pass";
}

function latencyGate(stats: LatencyStatistics, maximumMs: number): VoiceExperimentGateStatus {
  if (stats.p95Ms === null) return "pending";
  return stats.p95Ms <= maximumMs ? "pass" : "fail";
}

function overallGate(gates: VoiceExperimentGateStatus[]) {
  if (gates.includes("fail")) return "fail" as const;
  if (gates.includes("pending")) return "pending" as const;
  return "pass" as const;
}

function runtimeReport(attempts: VoiceExperimentAttemptEvidence[]): RuntimeReport {
  const metrics = {
    greetingLatencyMs: statistics(attempts.flatMap((attempt) => attempt.metrics.greetingLatencyMs)),
    interruptionLatencyMs: statistics(attempts.flatMap((attempt) => attempt.metrics.interruptionLatencyMs)),
    toolLatencyMs: statistics(attempts.flatMap((attempt) => attempt.metrics.toolLatencyMs)),
    turnLatencyMs: statistics(attempts.flatMap((attempt) => attempt.metrics.turnLatencyMs)),
  };
  const gates = {
    dialogue: booleanGate(attempts.map((attempt) => attempt.dialoguePassed)),
    evidence: booleanGate(attempts.map((attempt) => attempt.evidenceComplete)),
    greetingLatency: latencyGate(metrics.greetingLatencyMs, 500),
    interruptionLatency: latencyGate(metrics.interruptionLatencyMs, 250),
    outcomeAccuracy: booleanGate(attempts.map((attempt) => (
      attempt.schedulingOutcome === attempt.dashboardOutcome
    ))),
    rollback: booleanGate(attempts.map((attempt) => attempt.rollbackPassed)),
    safety: booleanGate(attempts.map((attempt) => attempt.safetyPassed)),
    turnLatency: latencyGate(metrics.turnLatencyMs, 1_000),
    voice: booleanGate(attempts.map((attempt) => attempt.voicePassed)),
  };
  return {
    attemptIds: attempts.map((attempt) => attempt.attemptId),
    gates: {
      ...gates,
      overall: overallGate(Object.values(gates)),
    },
    metrics,
  };
}

export function buildVoiceExperimentReport(
  attempts: VoiceExperimentAttemptEvidence[],
): VoiceExperimentReport {
  return {
    runtimes: {
      "telnyx-candidate": runtimeReport(
        attempts.filter((attempt) => attempt.runtime === "telnyx-candidate"),
      ),
      "twilio-candidate": runtimeReport(
        attempts.filter((attempt) => attempt.runtime === "twilio-candidate"),
      ),
    },
  };
}

function label(status: VoiceExperimentGateStatus) {
  return status.toUpperCase();
}

export function renderVoiceExperimentReport(report: VoiceExperimentReport) {
  const sections = (["twilio-candidate", "telnyx-candidate"] as const).map((runtime) => {
    const title = runtime === "twilio-candidate" ? "Twilio candidate" : "Telnyx candidate";
    const result = report.runtimes[runtime];
    return [
      `## ${title}`,
      "",
      `Attempts: ${result.attemptIds.length}`,
      "",
      `Safety: ${label(result.gates.safety)}`,
      "",
      `Outcome accuracy: ${label(result.gates.outcomeAccuracy)}`,
      "",
      `Evidence: ${label(result.gates.evidence)}`,
      "",
      `Greeting latency: ${label(result.gates.greetingLatency)}`,
      "",
      `Turn latency: ${label(result.gates.turnLatency)}`,
      "",
      `Interruption latency: ${label(result.gates.interruptionLatency)}`,
      "",
      `Dialogue: ${label(result.gates.dialogue)}`,
      "",
      `Voice: ${label(result.gates.voice)}`,
      "",
      `Rollback: ${label(result.gates.rollback)}`,
      "",
      `Overall: ${label(result.gates.overall)}`,
    ].join("\n");
  });
  return ["# Voice runtime experiment report", "", ...sections].join("\n\n");
}
