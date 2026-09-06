import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-core/attempt-store";
import { MemoryControlledCallLease } from "@/voice-core/controlled-call-lease";
import type { VoiceEvidenceRecorder } from "@/voice-core/evidence-recorder";
import { TelnyxCandidateApiError } from "./telnyx-candidate-client";
import { createTelnyxCandidateCallController } from "./telnyx-call-controller";

test("stops before Telnyx Dial when the candidate preflight fails", async () => {
  let dialed = false;
  const controller = createTelnyxCandidateCallController({
    attempts: new VoiceAttemptStore(() => Date.now(), 0),
    client: {
      async dial() {
        dialed = true;
        throw new Error("not used");
      },
      async hangup() {},
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {
      throw new Error("assistant mismatch");
    },
  });

  await assert.rejects(() => controller.start({
    context: createVoiceCallContext(),
    requestId: "11111111-1111-4111-8111-111111111111",
  }), /assistant mismatch/);
  assert.equal(dialed, false);
});

test("checks the call safety policy again before Telnyx creates a call", async () => {
  let dialCount = 0;
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const unsafeConfig = {
    artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
    assistantId: "assistant-test",
    assistantVersionId: "version-test",
    callToNumber: "+12025550111",
    callsEnabled: false,
    connectionId: "connection-test",
    demoMode: true,
    publicBaseUrl: "https://voice.example.test",
    telnyxPhoneNumber: "+12025550112",
  };
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        dialCount += 1;
        return { callControlId: "not-used", callLegId: "not-used", callSessionId: "not-used" };
      },
      async hangup() {},
      async speak() {},
      async startAiAssistant() {},
    },
    config: unsafeConfig as unknown as Parameters<
      typeof createTelnyxCandidateCallController
    >[0]["config"],
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });

  const requestId = "12121212-1212-4212-8212-121212121212";
  await assert.rejects(controller.start({
    context: createVoiceCallContext(),
    requestId,
  }), /safety policy/);
  assert.equal(dialCount, 0);
  const attempt = attempts.getViewByRequestId(requestId);
  assert.equal(attempt?.transportStatus, "failed");
  assert.equal(controller.evidence(attempt!.id), undefined);
});

test("creates one recorded embedded-assistant call and correlates all Dial IDs", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const requests: Array<Record<string, unknown>> = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial(request) {
        requests.push(request);
        return {
          callControlId: "v3:call-control",
          callLegId: "call-leg",
          callSessionId: "call-session",
        };
      },
      async hangup() {},
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });

  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(requests.length, 1);
  assert.equal("assistant" in requests[0]!, false);
  assert.equal(started.callControlId, "v3:call-control");
  assert.equal(attempts.getAttempt(started.attemptId)?.providerCallId, "v3:call-control");
  assert.ok(controller.evidence(started.attemptId));
});

test("releases a definite rejected Dial so the operator can retry", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  let dialCount = 0;
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        dialCount += 1;
        if (dialCount === 1) {
          throw new TelnyxCandidateApiError(422, "Telnyx API request failed with 422.");
        }
        return {
          callControlId: "v3:retry-call",
          callLegId: "retry-leg",
          callSessionId: "retry-session",
        };
      },
      async hangup() {},
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });

  const firstRequestId = "33333333-3333-4333-8333-333333333333";
  await assert.rejects(() => controller.start({
    context: createVoiceCallContext(),
    requestId: firstRequestId,
  }), TelnyxCandidateApiError);
  const rejected = attempts.getViewByRequestId(firstRequestId);
  assert.equal(rejected?.transportStatus, "failed");
  assert.equal(controller.evidence(rejected!.id), undefined);

  const retried = await controller.start({
    context: createVoiceCallContext(),
    requestId: "44444444-4444-4444-8444-444444444444",
  });
  assert.equal(retried.callControlId, "v3:retry-call");
});

test("requests an idempotent automatic hangup without marking the call canceled", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const lease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const hangups: Array<{ callControlId: string; commandId: string }> = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return {
          callControlId: "v3:automatic-hangup",
          callLegId: "automatic-hangup-leg",
          callSessionId: "automatic-hangup-session",
        };
      },
      async hangup(callControlId, commandId) {
        hangups.push({ callControlId, commandId });
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease,
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "66666666-6666-4666-8666-666666666666",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "answered");

  await controller.complete(started.attemptId);
  await controller.complete(started.attemptId);

  assert.deepEqual(hangups, [{
    callControlId: "v3:automatic-hangup",
    commandId: "66666666-6666-4666-8666-666666666666-automatic-hangup",
  }]);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "answered");
  await assert.rejects(lease.acquire("another-attempt"), /may still be active/);

  attempts.updateStatus(started.attemptId, started.callControlId, "completed");
  await controller.finalize(started.attemptId);

  assert.equal(controller.evidence(started.attemptId), undefined);
  await assert.rejects(lease.acquire("another-attempt"), /Wait four minutes/);
});

test("retries automatic hangup with one command ID and marks an exhausted attempt uncertain", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const commandIds: string[] = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return {
          callControlId: "v3:uncertain-hangup",
          callLegId: "uncertain-hangup-leg",
          callSessionId: "uncertain-hangup-session",
        };
      },
      async hangup(_callControlId, commandId) {
        commandIds.push(commandId);
        throw new Error("provider unavailable");
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    hangupRetry: {
      delaysMs: [0, 0],
      async sleep() {},
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "77777777-7777-4777-8777-777777777777",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "answered");

  await assert.rejects(() => controller.complete(started.attemptId), /provider unavailable/);

  assert.deepEqual(commandIds, [
    "77777777-7777-4777-8777-777777777777-automatic-hangup",
    "77777777-7777-4777-8777-777777777777-automatic-hangup",
    "77777777-7777-4777-8777-777777777777-automatic-hangup",
  ]);
  assert.equal(attempts.getAttempt(started.attemptId)?.transportStatus, "unknown");
});

test("records a stop request while Telnyx call creation is uncertain", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        throw new Error("Dial result timed out.");
      },
      async hangup() {
        throw new Error("A call ID is required.");
      },
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const requestId = "88888888-8888-4888-8888-888888888888";
  await assert.rejects(controller.start({
    context: createVoiceCallContext(),
    requestId,
  }), /timed out/);
  const attempt = attempts.getAttempt(attempts.getViewByRequestId(requestId)!.id)!;
  assert.equal(attempt.transportStatus, "creation_uncertain");

  await controller.stop(attempt.id);

  assert.equal(attempts.getAttempt(attempt.id)?.transportStatus, "cancel_requested");
  assert.equal(attempts.hasActiveRelayAuthority(attempt.id, attempt.relayToken), false);
});

test("releases the call lease when evidence finalization fails", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const lease = new MemoryControlledCallLease(() => Date.now(), 60_000);
  const recorder = {
    async correlate() {},
    directory: "/tmp/not-used",
    async finalize() { throw new Error("evidence finalize failed"); },
    async flush() {},
    async record() {},
    async recordAndWait() {},
    async writeAudio() {},
  } as VoiceEvidenceRecorder;
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return {
          callControlId: "v3:evidence-failure",
          callLegId: "evidence-failure-leg",
          callSessionId: "evidence-failure-session",
        };
      },
      async hangup() {},
      async speak() {},
      async startAiAssistant() {},
    },
    config: {
      artifactsRoot: "/tmp/not-used",
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease,
    async openEvidenceRecorder() {
      return recorder;
    },
    async preflight() {},
  });
  const started = await controller.start({
    context: createVoiceCallContext(),
    requestId: "93939393-9393-4393-8393-939393939393",
  });
  attempts.updateStatus(started.attemptId, started.callControlId, "completed");

  await assert.rejects(controller.finalize(started.attemptId), /evidence finalize failed/);

  assert.equal(controller.evidence(started.attemptId), undefined);
  await assert.rejects(lease.acquire("next-attempt"), /Wait four minutes/);
});

test("speaks the opening greeting on answer and attaches the assistant after playback", async () => {
  const attempts = new VoiceAttemptStore(() => Date.now(), 0);
  const speaks: Array<{ body: Record<string, unknown>; callControlId: string }> = [];
  const starts: Array<{ body: Record<string, unknown>; callControlId: string }> = [];
  const controller = createTelnyxCandidateCallController({
    attempts,
    client: {
      async dial() {
        return {
          callControlId: "v3:opening-speak",
          callLegId: "opening-leg",
          callSessionId: "opening-session",
        };
      },
      async hangup() {},
      async speak(callControlId, body) {
        speaks.push({ body, callControlId });
      },
      async startAiAssistant(callControlId, body) {
        starts.push({ body, callControlId });
      },
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      callsEnabled: true,
      connectionId: "connection-test",
      demoMode: true,
      publicBaseUrl: "https://voice.example.test",
      telnyxPhoneNumber: "+12025550112",
    },
    lease: new MemoryControlledCallLease(() => Date.now(), 60_000),
    async preflight() {},
  });
  const context = createVoiceCallContext();
  const started = await controller.start({
    context,
    requestId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  });

  await controller.playOpeningGreeting(started.attemptId);
  await controller.playOpeningGreeting(started.attemptId);
  assert.equal(speaks.length, 1);
  assert.equal(speaks[0]?.callControlId, "v3:opening-speak");
  assert.equal(
    speaks[0]?.body.payload,
    "Hello, I'm Willow, an automated assistant calling from Brightview Dental. Am I speaking with Olivia Garcia?",
  );
  assert.equal(speaks[0]?.body.voice, "Telnyx.Ultra.02a924f6-bb49-4177-8fbb-52238c5056d6");

  await controller.attachAssistant(started.attemptId);
  await controller.attachAssistant(started.attemptId);
  assert.equal(starts.length, 1);
  assert.equal(starts[0]?.callControlId, "v3:opening-speak");
  assert.equal(starts[0]?.body.greeting, "");
  assert.deepEqual(starts[0]?.body.message_history, [{
    content: "Hello, I'm Willow, an automated assistant calling from Brightview Dental. Am I speaking with Olivia Garcia?",
    role: "assistant",
  }]);
});
