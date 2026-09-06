import { createPublicKey, verify } from "node:crypto";

const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
const defaultMaximumClockSkewMs = 5 * 60 * 1_000;

export function decodeTelnyxPublicKey(value: string) {
  if (value.includes("BEGIN PUBLIC KEY")) {
    const key = createPublicKey(value);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("TELNYX_PUBLIC_KEY must contain one Ed25519 public key.");
    return key;
  }
  const raw = Buffer.from(value, /^[a-fA-F0-9]{64}$/.test(value) ? "hex" : "base64");
  if (raw.length !== 32) throw new Error("TELNYX_PUBLIC_KEY must contain one Ed25519 public key.");
  return createPublicKey({ format: "der", key: Buffer.concat([ed25519SpkiPrefix, raw]), type: "spki" });
}

export function verifyTelnyxWebhookSignature(input: {
  maximumClockSkewMs?: number;
  now?: () => number;
  publicKey: string;
  rawBody: string;
  signature: string;
  timestamp: string;
}) {
  try {
    if (!/^\d+$/.test(input.timestamp)) return false;
    const timestampMs = Number(input.timestamp) * 1_000;
    const now = input.now?.() ?? Date.now();
    const maximumClockSkewMs = input.maximumClockSkewMs ?? defaultMaximumClockSkewMs;
    if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > maximumClockSkewMs) {
      return false;
    }
    return verify(
      null,
      Buffer.from(`${input.timestamp}|${input.rawBody}`),
      decodeTelnyxPublicKey(input.publicKey),
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}
