import assert from "node:assert/strict";
import test from "node:test";
import { constantTimeEqualSecrets } from "./voice-gateway-internal";

test("compares internal secrets without accepting missing or partial values", () => {
  assert.equal(constantTimeEqualSecrets("shared-secret", "shared-secret"), true);
  assert.equal(constantTimeEqualSecrets("shared", "shared-secret"), false);
  assert.equal(constantTimeEqualSecrets(undefined, "shared-secret"), false);
});
