import assert from "node:assert/strict";
import test from "node:test";
import {
  createVoiceCallContext,
  slotsForProvider,
  voiceAvailabilityHorizonDays,
} from "./voice-call-context";

test("builds a rolling 21-day scheduling context in clinic time", () => {
  const context = createVoiceCallContext(new Date("2026-08-16T14:00:00.000Z"));

  assert.equal(context.currentDateLabel, "Sunday, August 16, 2026");
  assert.equal(context.clinicTimeZone, "America/New_York");
  assert.equal(context.appointment.dateIso, "2026-08-18");
  assert.ok(context.availableSlots.length > 3);
  assert.ok(context.availableSlots.every((slot) => {
    const offset = Math.round((Date.parse(`${slot.dateIso}T12:00:00Z`) - Date.parse("2026-08-16T12:00:00Z")) / 86_400_000);
    return offset >= 1 && offset <= voiceAvailabilityHorizonDays;
  }));
});

test("offers the next three times for the selected provider", () => {
  const context = createVoiceCallContext(new Date("2026-08-16T14:00:00.000Z"));
  const slots = slotsForProvider(context, context.appointment.provider.id);

  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((slot) => slot.dateIso), [
    "2026-08-17",
    "2026-08-19",
    "2026-08-21",
  ]);
});

test("does not expose another patient appointment in model context", () => {
  const context = createVoiceCallContext(new Date("2026-08-16T14:00:00.000Z"));
  const serialized = JSON.stringify(context);

  assert.doesNotMatch(serialized, /Emma Johnson|Daniel Kim|Michael Thompson/);
});
