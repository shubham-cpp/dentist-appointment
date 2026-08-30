import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import { MemoryControlledCallLease } from "@/voice-gateway/controlled-call-lease";
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
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      connectionId: "connection-test",
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
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      connectionId: "connection-test",
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
  assert.equal(started.callControlId, "v3:call-control");
  assert.equal(attempts.getAttempt(started.attemptId)?.callSid, "v3:call-control");
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
    },
    config: {
      artifactsRoot: await mkdtemp(join(tmpdir(), "telnyx-controller-")),
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      callToNumber: "+12025550111",
      connectionId: "connection-test",
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
  assert.equal(attempts.getViewByRequestId(firstRequestId)?.transportStatus, "failed");

  const retried = await controller.start({
    context: createVoiceCallContext(),
    requestId: "44444444-4444-4444-8444-444444444444",
  });
  assert.equal(retried.callControlId, "v3:retry-call");
});
