import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileControlledCallLease, MemoryControlledCallLease } from "./controlled-call-lease";

test("keeps a file-backed lock through a gateway restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, "active-call.json");
  let now = 1_000;
  const firstGateway = new FileControlledCallLease(path, () => now, 10_000, 20_000);
  const restartedGateway = new FileControlledCallLease(path, () => now, 10_000, 20_000);

  await firstGateway.acquire("first-request");
  await firstGateway.replaceOwner("first-request", "voice_attempt");
  await assert.rejects(restartedGateway.acquire("second-request"), /may still be active/);

  await restartedGateway.release("voice_attempt");
  await assert.rejects(restartedGateway.acquire("second-request"), /Wait ten minutes/);
  now = 21_001;
  await restartedGateway.acquire("second-request");
});

test("lets a stale file-backed lock expire after its cooldown", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, "active-call.json");
  let now = 1_000;
  const lease = new FileControlledCallLease(path, () => now, 100, 200);

  await lease.acquire("first-request");
  now = 1_201;
  await lease.acquire("second-request");
});

test("releases a provisional lease before a call starts", async () => {
  const lease = new MemoryControlledCallLease();
  await lease.acquire("first-request");
  await assert.rejects(lease.acquire("second-request"), /may still be active/);
  await lease.cancel("first-request");
  await lease.acquire("second-request");
});

test("keeps the memory lease useful for isolated gateway tests", async () => {
  let now = 1_000;
  const lease = new MemoryControlledCallLease(() => now, 100, 200);
  await lease.acquire("first-request");
  await lease.replaceOwner("first-request", "voice_attempt");
  await lease.release("voice_attempt");
  await assert.rejects(lease.acquire("second-request"), /Wait ten minutes/);
  now = 1_201;
  await lease.acquire("second-request");
});
