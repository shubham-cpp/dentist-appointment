import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { RelayStore, type StoredRelayAttempt } from "./store";

test("saved appointment and request identity survive closing and reopening SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relay-store-"));
  const path = join(directory, "test.sqlite");
  const context = createVoiceCallContext();
  const at = new Date().toISOString();
  const record: StoredRelayAttempt = { requestId: "request", context, token: "private-token", cooldownUntil: 1,
    view: { id: "voice_test", createdAt: at, updatedAt: at, events: [], outcome: "rescheduled",
      processInstanceId: "old-process", sessionStatus: "closed", transportStatus: "completed",
      result: { kind: "rescheduled", previousAppointment: context.appointment, replacement: context.availableSlots[0], confirmedAt: at } } };
  let store = new RelayStore(path);
  try {
    store.save(record);
    store.close();
    store = new RelayStore(path);
    assert.deepEqual(store.byRequest("request")?.view.result, record.view.result);
    assert.equal(store.get("voice_test")?.view.transportStatus, "completed");
  } finally {
    store.close();
    for (const file of [path, `${path}-wal`, `${path}-shm`]) await unlink(file).catch(() => {});
    await rmdir(directory);
  }
});
