import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { MemoryControlledCallLease } from "@/voice-gateway/controlled-call-lease";
import { VoiceAttemptStore } from "@/voice-gateway/attempt-store";
import { TwilioCandidatePreflightError } from "./twilio-candidate-preflight";
import { createTwilioCandidateCallController } from "./twilio-call-controller";

function config(artifactsRoot: string) {
  return {
    aiModel: "gpt-5.6-luna-fast" as const,
    artifactsRoot,
    callToNumber: "+12025550111",
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

test("creates one recorded fixed-destination call and correlates its evidence", async () => {
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
  assert.equal((requests[0] as { record: boolean }).record, true);
  assert.equal(started.callSid, callSid);
  const manifest = JSON.parse(await readFile(
    join(artifactsRoot, started.attemptId, "manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.correlation.providerCallId, callSid);
  assert.equal(manifest.correlation.requestId, "22222222-2222-4222-8222-222222222222");
});
