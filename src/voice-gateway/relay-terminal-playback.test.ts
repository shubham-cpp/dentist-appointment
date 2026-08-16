import assert from "node:assert/strict";
import test from "node:test";
import { RelayTerminalPlayback } from "./relay-terminal-playback";

test("confirms one pending terminal playback", () => {
  const completions: Array<{ outcome: string; reason: string }> = [];
  const playback = new RelayTerminalPlayback(1_000, (outcome, reason) => {
    completions.push({ outcome, reason });
  });

  playback.recordSpeechSent();
  playback.begin("declined");

  assert.equal(playback.confirmPlayback(), true);
  assert.equal(playback.confirmPlayback(), false);
  assert.deepEqual(completions, [{ outcome: "declined", reason: "played" }]);
});

test("reports an unconfirmed terminal playback after its timeout", async () => {
  const completions: Array<{ outcome: string; reason: string }> = [];
  const playback = new RelayTerminalPlayback(1, (outcome, reason) => {
    completions.push({ outcome, reason });
  });

  playback.begin("staff_follow_up");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(completions, [{ outcome: "staff_follow_up", reason: "timeout" }]);
  assert.equal(playback.isPending, false);
});

test("waits for an earlier speech acknowledgement before confirming the terminal reply", () => {
  const completions: Array<{ outcome: string; reason: string }> = [];
  const playback = new RelayTerminalPlayback(1_000, (outcome, reason) => {
    completions.push({ outcome, reason });
  });

  playback.recordSpeechSent();
  playback.recordSpeechSent();
  playback.begin("staff_follow_up");

  assert.equal(playback.confirmPlayback(), false);
  assert.equal(playback.confirmPlayback(), true);
  assert.deepEqual(completions, [{ outcome: "staff_follow_up", reason: "played" }]);
});
