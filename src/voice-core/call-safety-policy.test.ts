import assert from "node:assert/strict";
import test from "node:test";
import {
  assertControlledCallSafetyPolicy,
  loadControlledCallSafetyPolicy,
} from "./call-safety-policy";

test("loads only the explicitly enabled controlled-call policy", () => {
  assert.deepEqual(loadControlledCallSafetyPolicy({
    VOICE_CALLS_ENABLED: "true",
    VOICE_DEMO_MODE: "true",
  }), { callsEnabled: true, demoMode: true });

  assert.throws(() => loadControlledCallSafetyPolicy({
    VOICE_CALLS_ENABLED: "false",
    VOICE_DEMO_MODE: "true",
  }), /VOICE_CALLS_ENABLED/);
  assert.throws(() => loadControlledCallSafetyPolicy({
    VOICE_CALLS_ENABLED: "true",
  }), /VOICE_DEMO_MODE/);
});

test("rechecks the policy immediately before a dial", () => {
  assert.doesNotThrow(() => assertControlledCallSafetyPolicy({
    callsEnabled: true,
    demoMode: true,
  }));
  assert.throws(() => assertControlledCallSafetyPolicy({
    callsEnabled: false,
    demoMode: true,
  }), /does not permit/);
});
