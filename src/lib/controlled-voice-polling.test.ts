import assert from "node:assert/strict";
import test from "node:test";
import { nextControlledVoicePollDelay } from "./controlled-voice-polling";

test("retries only a temporary controlled voice gateway failure", () => {
  assert.equal(nextControlledVoicePollDelay("gateway_unavailable", 0), 2_000);
  assert.equal(nextControlledVoicePollDelay("gateway_unavailable", 1), 4_000);
  assert.equal(nextControlledVoicePollDelay("gateway_unavailable", 2), 8_000);
  assert.equal(nextControlledVoicePollDelay("gateway_unavailable", 9), 8_000);
  assert.equal(nextControlledVoicePollDelay("not_found", 0), undefined);
  assert.equal(nextControlledVoicePollDelay("not_configured", 0), undefined);
  assert.equal(nextControlledVoicePollDelay("request_failed", 0), undefined);
});
