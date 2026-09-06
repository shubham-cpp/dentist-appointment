import assert from "node:assert/strict";
import test from "node:test";
import { stopActiveCallsBeforeShutdown } from "./terminal-call-shutdown";

test("shutdown fails on a terminal callback timeout and marks the attempt uncertain", async () => {
  let currentTime = 1_000;
  const stopRequests: string[] = [];
  const uncertainAttempts: string[] = [];

  await assert.rejects(stopActiveCallsBeforeShutdown({
    attempts: {
      getActiveProviderCallStops() {
        return [{ attemptId: "voice_timeout", providerCallId: "provider-call" }];
      },
      markTerminationUncertain(attemptId) {
        uncertainAttempts.push(attemptId);
      },
    },
    controller: {
      async stop(attemptId) {
        stopRequests.push(attemptId);
      },
    },
    isFinalized: () => false,
    now: () => currentTime,
    pollIntervalMs: 5,
    async sleep(delayMs) {
      currentTime += delayMs;
    },
    timeoutMs: 10,
  }), /signed terminal callback/);

  assert.deepEqual(stopRequests, ["voice_timeout"]);
  assert.deepEqual(uncertainAttempts, ["voice_timeout"]);
});

test("shutdown waits until the signed terminal callback completes finalization", async () => {
  let evidenceAvailable = true;

  await stopActiveCallsBeforeShutdown({
    attempts: {
      getActiveProviderCallStops() {
        return [{ attemptId: "voice_terminal", providerCallId: "provider-call" }];
      },
      markTerminationUncertain() {
        assert.fail("A confirmed terminal call must not become uncertain.");
      },
    },
    controller: {
      async stop() {},
    },
    isFinalized: () => !evidenceAvailable,
    async sleep() {
      evidenceAvailable = false;
    },
  });

  assert.equal(evidenceAvailable, false);
});

test("shutdown fails when the provider rejects the stop request", async () => {
  const uncertainAttempts: string[] = [];

  await assert.rejects(stopActiveCallsBeforeShutdown({
    attempts: {
      getActiveProviderCallStops() {
        return [{ attemptId: "voice_stop_failed", providerCallId: "provider-call" }];
      },
      markTerminationUncertain(attemptId) {
        uncertainAttempts.push(attemptId);
      },
    },
    controller: {
      async stop() {
        throw new Error("provider unavailable");
      },
    },
    isFinalized: () => false,
  }), /termination request failed/);

  assert.deepEqual(uncertainAttempts, ["voice_stop_failed"]);
});

test("shutdown bounds a provider stop request that never settles", async () => {
  let currentTime = 1_000;
  const uncertainAttempts: string[] = [];
  const shutdown = stopActiveCallsBeforeShutdown({
    attempts: {
      getActiveProviderCallStops() {
        return [{ attemptId: "voice_stop_timeout", providerCallId: "provider-call" }];
      },
      markTerminationUncertain(attemptId) {
        uncertainAttempts.push(attemptId);
      },
    },
    controller: {
      stop() {
        return new Promise<void>(() => undefined);
      },
    },
    isFinalized: () => false,
    now: () => currentTime,
    pollIntervalMs: 5,
    async sleep(delayMs) {
      currentTime += delayMs;
    },
    timeoutMs: 10,
  });

  await assert.rejects(Promise.race([
    shutdown,
    new Promise<void>((_, reject) => setTimeout(
      () => reject(new Error("test guard expired")),
      100,
    )),
  ]), /termination request.*time/i);
  assert.deepEqual(uncertainAttempts, ["voice_stop_timeout"]);
});
