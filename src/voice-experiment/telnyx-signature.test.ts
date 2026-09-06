import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { decodeTelnyxPublicKey, verifyTelnyxWebhookSignature } from "./telnyx-signature";

test("normalizes supported Ed25519 encodings and rejects other keys", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  for (const encoding of [der.subarray(-32).toString("hex"), der.subarray(-32).toString("base64"), publicKey.export({ type: "spki", format: "pem" }).toString()]) {
    assert.deepEqual(decodeTelnyxPublicKey(encoding).export({ type: "spki", format: "der" }), der);
  }
  assert.throws(() => decodeTelnyxPublicKey(Buffer.alloc(31).toString("base64")), /Ed25519/);
  const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
  assert.throws(() => decodeTelnyxPublicKey(otherKey.export({ type: "spki", format: "pem" }).toString()), /Ed25519/);
});

test("verifies the exact Telnyx timestamp and raw webhook body", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawBody = '{"data":{"event_type":"call.answered"}}';
  const timestamp = "1787918400";
  const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");

  const now = () => Number(timestamp) * 1_000;
  assert.equal(verifyTelnyxWebhookSignature({ now, publicKey: publicKeyHex, rawBody, signature, timestamp }), true);
  assert.equal(verifyTelnyxWebhookSignature({ now, publicKey: publicKeyHex, rawBody: `${rawBody} `, signature, timestamp }), false);
});

test("rejects valid webhook signatures outside the allowed clock skew", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawBody = '{"data":{"event_type":"call.hangup"}}';
  const timestamp = "1787918400";
  const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");

  assert.equal(verifyTelnyxWebhookSignature({
    now: () => Number(timestamp) * 1_000 + 300_001,
    publicKey: publicKeyHex,
    rawBody,
    signature,
    timestamp,
  }), false);
  assert.equal(verifyTelnyxWebhookSignature({
    now: () => Number(timestamp) * 1_000 - 300_001,
    publicKey: publicKeyHex,
    rawBody,
    signature,
    timestamp,
  }), false);
});
