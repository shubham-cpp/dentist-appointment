type ActiveProviderCall = {
  attemptId: string;
  providerCallId: string;
};

type TerminalShutdownAttemptStore = {
  getActiveProviderCallStops(): ActiveProviderCall[];
  markTerminationUncertain(attemptId: string): unknown;
};

type TerminalShutdownController = {
  stop(attemptId: string): Promise<void>;
};

export async function stopActiveCallsBeforeShutdown(options: {
  attempts: TerminalShutdownAttemptStore;
  controller: TerminalShutdownController;
  isFinalized(attemptId: string): boolean;
  now?: () => number;
  pollIntervalMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
}) {
  const activeCalls = options.attempts.getActiveProviderCallStops();
  if (activeCalls.length === 0) return;

  const now = options.now ?? Date.now;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 25);
  const sleep = options.sleep ?? ((delayMs: number) => (
    new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  ));
  const deadline = now() + Math.max(0, options.timeoutMs ?? 5_000);
  let results: PromiseSettledResult<void>[] | undefined;
  void Promise.allSettled(activeCalls.map((active) => (
    options.controller.stop(active.attemptId)
  ))).then((settled) => {
    results = settled;
  });

  while (!results) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      for (const active of activeCalls) {
        options.attempts.markTerminationUncertain(active.attemptId);
      }
      throw new Error("A provider call termination request did not finish in time.");
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  const settledResults = results;
  const failedStops = activeCalls.filter((_, index) => (
    settledResults[index]?.status === "rejected"
  ));
  if (failedStops.length > 0) {
    for (const active of failedStops) {
      options.attempts.markTerminationUncertain(active.attemptId);
    }
    throw new Error("A provider call termination request failed during shutdown.");
  }

  while (true) {
    const pending = activeCalls.filter((active) => (
      !options.isFinalized(active.attemptId)
    ));
    if (pending.length === 0) return;
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      for (const active of pending) {
        options.attempts.markTerminationUncertain(active.attemptId);
      }
      throw new Error("Shutdown did not receive a signed terminal callback in time.");
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}
