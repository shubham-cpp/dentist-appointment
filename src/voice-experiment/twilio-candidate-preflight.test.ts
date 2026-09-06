import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkTwilioVoiceVerification,
  createTwilioCandidatePreflight,
  runTwilioCandidatePreflight,
  TwilioCandidatePreflightError,
} from "./twilio-candidate-preflight";

test("passes only when every non-billable candidate dependency is ready", async () => {
  const result = await runTwilioCandidatePreflight({
    async checkAccount() {
      return { active: true, recordingAvailable: true, sourceNumberOwned: true };
    },
    async checkCallback() {
      return true;
    },
    async checkModel() {
      return true;
    },
    async checkVoice() {
      return true;
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.checks.map((check) => check.name), [
    "account-active",
    "source-number-owned",
    "recording-available",
    "callback-reachable",
    "model-ready",
    "voice-available",
  ]);
});

test("reports all failed checks and blocks Dial", async () => {
  const result = await runTwilioCandidatePreflight({
    async checkAccount() {
      return { active: true, recordingAvailable: false, sourceNumberOwned: false };
    },
    async checkCallback() {
      return false;
    },
    async checkModel() {
      return true;
    },
    async checkVoice() {
      return false;
    },
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.filter((check) => !check.passed).map((check) => check.name), [
    "source-number-owned",
    "recording-available",
    "callback-reachable",
    "voice-available",
  ]);
  assert.throws(
    () => result.assertReady(),
    (error: unknown) => (
      error instanceof TwilioCandidatePreflightError
      && error.failedChecks.includes("recording-available")
    ),
  );
});

test("accepts only a recent verification for the locked Jessica voice", async () => {
  const directory = await mkdtemp(join(tmpdir(), "twilio-voice-verification-"));
  const path = join(directory, "voice.json");
  await writeFile(path, JSON.stringify({
    voice: "g6xIsTj2HwM6VR4iXFCw-flash_v2_5-1.0_0.5_0.75",
    verifiedAt: "2026-08-28T10:00:00.000Z",
  }));

  assert.equal(await checkTwilioVoiceVerification({
    now: new Date("2026-08-28T20:00:00.000Z"),
    path,
  }), true);
  assert.equal(await checkTwilioVoiceVerification({
    now: new Date("2026-08-30T10:00:00.000Z"),
    path,
  }), false);
});

test("deduplicates concurrent preflight checks and caches success for 30 seconds", async () => {
  let nowMs = 1_000;
  let accountChecks = 0;
  const preflight = createTwilioCandidatePreflight({
    async checkAccount() {
      accountChecks += 1;
      return { active: true, recordingAvailable: true, sourceNumberOwned: true };
    },
    async checkCallback() {
      return true;
    },
    async checkModel() {
      return true;
    },
    async checkVoice() {
      return true;
    },
  }, () => nowMs);

  await Promise.all([preflight(), preflight()]);
  await preflight();
  assert.equal(accountChecks, 1);

  nowMs += 30_000;
  await preflight();
  assert.equal(accountChecks, 2);
});

test("caches a failed preflight for no more than one second", async () => {
  let nowMs = 1_000;
  let accountChecks = 0;
  const preflight = createTwilioCandidatePreflight({
    async checkAccount() {
      accountChecks += 1;
      return { active: false, recordingAvailable: true, sourceNumberOwned: true };
    },
    async checkCallback() {
      return true;
    },
    async checkModel() {
      return true;
    },
    async checkVoice() {
      return true;
    },
  }, () => nowMs);

  await assert.rejects(preflight(), TwilioCandidatePreflightError);
  await assert.rejects(preflight(), TwilioCandidatePreflightError);
  assert.equal(accountChecks, 1);

  nowMs += 1_000;
  await assert.rejects(preflight(), TwilioCandidatePreflightError);
  assert.equal(accountChecks, 2);
});
