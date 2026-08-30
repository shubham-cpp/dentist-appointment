import { createPublicKey, verify } from "node:crypto";

const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyObject(value: string) {
  if (value.includes("BEGIN PUBLIC KEY")) return createPublicKey(value);
  const raw = Buffer.from(value, /^[a-fA-F0-9]{64}$/.test(value) ? "hex" : "base64");
  if (raw.length !== 32) throw new Error("TELNYX_PUBLIC_KEY must contain one Ed25519 public key.");
  return createPublicKey({ format: "der", key: Buffer.concat([ed25519SpkiPrefix, raw]), type: "spki" });
}

export function verifyTelnyxWebhookSignature(input: {
  publicKey: string;
  rawBody: string;
  signature: string;
  timestamp: string;
}) {
  try {
    return verify(
      null,
      Buffer.from(`${input.timestamp}|${input.rawBody}`),
      publicKeyObject(input.publicKey),
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}
