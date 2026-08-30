export type TwilioCandidatePreflightCheckName =
  | "account-active"
  | "callback-reachable"
  | "model-ready"
  | "recording-available"
  | "source-number-owned"
  | "voice-available";

export type TwilioCandidatePreflightCheck = {
  name: TwilioCandidatePreflightCheckName;
  passed: boolean;
};

export class TwilioCandidatePreflightError extends Error {
  constructor(readonly failedChecks: TwilioCandidatePreflightCheckName[]) {
    super(`Twilio candidate preflight failed: ${failedChecks.join(", ")}.`);
    this.name = "TwilioCandidatePreflightError";
  }
}

export type TwilioCandidatePreflightResult = {
  assertReady(): void;
  checks: TwilioCandidatePreflightCheck[];
  passed: boolean;
};

export async function checkTwilioVoiceVerification(input: {
  now?: Date;
  path: string;
}) {
  try {
    const value = JSON.parse(await readFile(input.path, "utf8")) as {
      verifiedAt?: unknown;
      voice?: unknown;
    };
    if (value.voice !== twilioCandidateDefaults.voice || typeof value.verifiedAt !== "string") {
      return false;
    }
    const verifiedAt = new Date(value.verifiedAt).getTime();
    const age = (input.now ?? new Date()).getTime() - verifiedAt;
    return Number.isFinite(verifiedAt) && age >= 0 && age <= 24 * 60 * 60_000;
  } catch {
    return false;
  }
}

export async function runTwilioCandidatePreflight(checker: {
  checkAccount(): Promise<{
    active: boolean;
    recordingAvailable: boolean;
    sourceNumberOwned: boolean;
  }>;
  checkCallback(): Promise<boolean>;
  checkModel(): Promise<boolean>;
  checkVoice(): Promise<boolean>;
}): Promise<TwilioCandidatePreflightResult> {
  const [account, callbackReachable, modelReady, voiceAvailable] = await Promise.all([
    checker.checkAccount(),
    checker.checkCallback(),
    checker.checkModel(),
    checker.checkVoice(),
  ]);
  const checks: TwilioCandidatePreflightCheck[] = [
    { name: "account-active", passed: account.active },
    { name: "source-number-owned", passed: account.sourceNumberOwned },
    { name: "recording-available", passed: account.recordingAvailable },
    { name: "callback-reachable", passed: callbackReachable },
    { name: "model-ready", passed: modelReady },
    { name: "voice-available", passed: voiceAvailable },
  ];
  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  return {
    assertReady() {
      if (failedChecks.length > 0) throw new TwilioCandidatePreflightError(failedChecks);
    },
    checks,
    passed: failedChecks.length === 0,
  };
}
import { readFile } from "node:fs/promises";
import { twilioCandidateDefaults } from "./twilio-candidate";
