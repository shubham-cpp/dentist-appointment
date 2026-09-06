import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { controlledCallLeasePath, FileControlledCallLease, MemoryControlledCallLease } from "./controlled-call-lease";

test("preserves the shared runtime lease namespace", () => {
  assert.equal(controlledCallLeasePath({ connectionId: "connection", from: "+12025550100", to: "+12025550101" }),
    join(tmpdir(), "dentist-voice-experiment-283f484d48afdbddcb5a7714.json"));
  assert.notEqual(controlledCallLeasePath({ connectionId: "ab", from: "c", to: "d" }),
    controlledCallLeasePath({ connectionId: "a", from: "bc", to: "d" }));
});

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
  await assert.rejects(restartedGateway.acquire("second-request"), /Wait four minutes/);
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

test("allows only one concurrent owner to replace a stale file-backed lease", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, "active-call.json");
  let now = 1_000;
  await new FileControlledCallLease(path, () => now, 100, 200).acquire("stale-owner");
  now = 1_201;

  const results = await Promise.allSettled([
    new FileControlledCallLease(path, () => now, 100, 200).acquire("first-contender"),
    new FileControlledCallLease(path, () => now, 100, 200).acquire("second-contender"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("recovers an expired operation lock left by a crashed process", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, "active-call.json");
  const now = 10_000;
  await writeFile(`${path}.operation-lock`, JSON.stringify({
    expiresAt: now - 1,
    ownerId: "orphaned-operation",
    pid: 2_147_483_647,
  }));

  const lease = new FileControlledCallLease(path, () => now, 100, 200);
  await lease.acquire("replacement-owner");
  await assert.rejects(lease.acquire("blocked-owner"), /may still be active/);
});

test("recovers a legacy empty operation lock after its safety window", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, "active-call.json");
  const operationLockPath = `${path}.operation-lock`;
  await writeFile(operationLockPath, "");
  await utimes(operationLockPath, new Date(0), new Date(0));

  const lease = new FileControlledCallLease(path);
  await lease.acquire("replacement-owner");
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
  await assert.rejects(lease.acquire("second-request"), /Wait four minutes/);
  now = 1_201;
  await lease.acquire("second-request");
});


test("default cooldown permits another completed call at four minutes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dentist-voice-lease-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  let now = 1_000;
  const leases = [
    new MemoryControlledCallLease(() => now),
    new FileControlledCallLease(join(directory, "active-call.json"), () => now),
  ];
  for (const lease of leases) {
    now = 1_000;
    await lease.acquire("first");
    await lease.release("first");
    now += 4 * 60 * 1000 - 1;
    await assert.rejects(lease.acquire("second"), /Wait four minutes/);
    now += 1;
    await lease.acquire("second");
  }
});
