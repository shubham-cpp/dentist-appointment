import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { MemoryControlledCallLease } from "@/voice-core/controlled-call-lease";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { TwilioCandidatePreflightError } from "./twilio-candidate-preflight";
import { createTwilioCandidateCallController } from "./twilio-call-controller";

function config(artifactsRoot: string) {
  return {
    aiModel: "gpt-5.6-luna-fast" as const,
    artifactsRoot,
    callToNumber: "+12025550111",
    callsEnabled: true as const,
    demoMode: true as const,
    publicBaseUrl: "https://voice.example.test",
    twilioPhoneNumber: "+12025550112",
  };
}

test("stops before Dial when preflight fails", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-controller-"));
  let createCount = 0;
  const controller = createTwilioCandidateCallController({
    attempts: new VoiceAttemptStore(() => Date.now(), 0),
    client: {
      async createCall() {
        createCount += 1;
        return { sid: `CA${"1".repeat(32)}` };
      },
      async stopCall() {},
    },
    config: config(artifactsRoot),
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {
      throw new TwilioCandidatePreflightError(["voice-available"]);
    },
  });

  await assert.rejects(
    controller.start({
      context: createVoiceCallContext(),
      requestId: "11111111-1111-4111-8111-111111111111",
    }),
    TwilioCandidatePreflightError,
  );
  assert.equal(createCount, 0);
});

test("checks the call safety policy again before Twilio creates a call", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-controller-"));
  let createCount = 0;
  const unsafeConfig = { ...config(artifactsRoot), callsEnabled: false };
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall() {
        createCount += 1;
        return { sid: `CA${"1".repeat(32)}` };
      },
      async stopCall() {},
    },
    config: unsafeConfig as unknown as Parameters<
      typeof createTwilioCandidateCallController
    >[0]["config"],
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });

  const requestId = "12121212-1212-4212-8212-121212121212";
  await assert.rejects(controller.start({
    context: createVoiceCallContext(),
    requestId,
  }), /safety policy/);
  assert.equal(createCount, 0);
  const attempt = attempts.getViewByRequestId(requestId);
  assert.equal(attempt?.transportStatus, "failed");
  assert.equal(controller.evidence(attempt!.id), undefined);
});

test("creates one unrecorded fixed-destination call and correlates its evidence", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-controller-"));
  const requests: unknown[] = [];
  const callSid = `CA${"2".repeat(32)}`;
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall(request) {
        requests.push(request);
        return { sid: callSid };
      },
      async stopCall() {},
    },
    config: config(artifactsRoot),
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });

  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "22222222-2222-4222-8222-222222222222",
  });

  assert.equal(requests.length, 1);
  assert.equal((requests[0] as { to: string }).to, "+12025550111");
  assert.equal((requests[0] as { record: boolean }).record, false);
  assert.equal(started.callSid, callSid);
  const manifest = JSON.parse(await readFile(
    join(artifactsRoot, started.attemptId, "manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.correlation.providerCallId, callSid);
  assert.equal(manifest.correlation.requestId, "22222222-2222-4222-8222-222222222222");
});

test("bounds Dial and keeps an unconfirmed Twilio creation uncertain without retrying", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-controller-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  let createCount = 0;
  const controller = createTwilioCandidateCallController({
    attempts,
    callCreationTimeoutMs: 1,
    client: {
      createCall() {
        createCount += 1;
        return new Promise<{ sid: string }>(() => undefined);
      },
      async stopCall() {},
    },
    config: config(artifactsRoot),
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const requestId = "99999999-9999-4999-8999-999999999999";

  await assert.rejects(controller.start({
    context: createVoiceCallContext(),
    requestId,
  }), /did not confirm call creation in time/);

  assert.equal(attempts.getViewByRequestId(requestId)?.transportStatus, "creation_uncertain");
  await assert.rejects(controller.start({
    context: createVoiceCallContext(),
    requestId,
  }), /may still be active/);
  assert.equal(createCount, 1);
});

test("releases the terminal lease when evidence finalization fails", async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), "twilio-controller-"));
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const memoryLease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const released: string[] = [];
  const evidenceError = new Error("Evidence finalization failed.");
  const callSid = `CA${"3".repeat(32)}`;
  const controller = createTwilioCandidateCallController({
    attempts,
    client: {
      async createCall() {
        return { sid: callSid };
      },
      async stopCall() {},
    },
    config: config(artifactsRoot),
    lease: {
      acquire: (ownerId) => memoryLease.acquire(ownerId),
      cancel: (ownerId) => memoryLease.cancel(ownerId),
      async release(ownerId) {
        released.push(ownerId);
        await memoryLease.release(ownerId);
      },
      replaceOwner: (currentOwnerId, nextOwnerId) => (
        memoryLease.replaceOwner(currentOwnerId, nextOwnerId)
      ),
    },
    async openEvidenceRecorder() {
      return {
        async correlate() {},
        async finalize() {
          throw evidenceError;
        },
        async record() {},
      } as never;
    },
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "33333333-3333-4333-8333-333333333333",
  });
  attempts.updateStatus(started.attemptId, callSid, "completed", 1);

  await assert.rejects(controller.finalize(started.attemptId), (error) => error === evidenceError);
  assert.deepEqual(released, [started.attemptId]);
  assert.equal(controller.evidence(started.attemptId), undefined);

  await controller.finalize(started.attemptId);
  assert.deepEqual(released, [started.attemptId]);
});
