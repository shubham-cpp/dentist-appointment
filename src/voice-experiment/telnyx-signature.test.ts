import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifyTelnyxWebhookSignature } from "./telnyx-signature";

test("verifies the exact Telnyx timestamp and raw webhook body", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawBody = '{"data":{"event_type":"call.answered"}}';
  const timestamp = "1787918400";
  const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");

  assert.equal(verifyTelnyxWebhookSignature({ publicKey: publicKeyHex, rawBody, signature, timestamp }), true);
  assert.equal(verifyTelnyxWebhookSignature({ publicKey: publicKeyHex, rawBody: `${rawBody} `, signature, timestamp }), false);
});
