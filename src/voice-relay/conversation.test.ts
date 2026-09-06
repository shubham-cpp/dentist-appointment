import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext, type VoiceCallResult } from "@/lib/voice-call-context";
import { createVoiceSchedulingAuthority } from "@/voice-core/scheduling-authority";
import { SchedulingConversation } from "./conversation";
import type { Interpretation, Interpreter } from "./interpretation";

const now = new Date("2026-09-05T15:00:00Z");
const context = createVoiceCallContext(now);
function meaning(values: Partial<Interpretation>): Interpretation {
  return { callbackTiming: "unspecified", callbackDayOffset: null, identity: "unspecified", intent: "unclear", provider: null, providerEvidence: null, appointmentConstraintsEvidence: null, slotId: null, dateFrom: null,
    dateTo: null, timeFrom: null, timeTo: null, callback: null, clarification: null, clearConstraints: [], ...values };
}
function fixture() {
  let next = meaning({});
  const results: VoiceCallResult[] = [];
  const callbacks: unknown[] = [];
  const conversation = new SchedulingConversation({ context,
    interpreter: async () => next,
    scheduling: createVoiceSchedulingAuthority({ context, now: () => now,
      applyResult: result => { results.push(result); }, recordStaffFollowUp: result => { callbacks.push(result); } }),
  });
  return { conversation, results, callbacks, async say(values: Partial<Interpretation>, text = "caller reply") {
    next = meaning({ ...values, appointmentConstraintsEvidence: values.appointmentConstraintsEvidence ?? (values.dateFrom || values.dateTo || values.timeFrom || values.timeTo || values.clearConstraints?.length ? text : null), providerEvidence: values.providerEvidence ?? (values.provider ? text : null) }); return conversation.respond(text);
  } };
}

test("identity and provider in one reply search immediately and repeat preserves the batch", async () => {
  const f = fixture();
  assert.match(f.conversation.greeting().text, /Olivia/);
  const reply = await f.say({ identity: "confirmed", intent: "reschedule", provider: "same" });
  assert.match(reply!.text, /unavailable/);
  assert.match(reply!.text, /Option 3/);
  const first = f.conversation.snapshot().batch!.slots.map(s => s.id);
  await f.say({ intent: "repeat" });
  assert.deepEqual(f.conversation.snapshot().batch!.slots.map(s => s.id), first);
  await f.say({ intent: "more" });
  assert.ok(f.conversation.snapshot().batch!.slots.every(s => !first.includes(s.id)));
});

test("a selected slot requires delivered readback and a later approval", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "reschedule", provider: "different" });
  const slot = f.conversation.snapshot().batch!.slots[0];
  await f.say({ intent: "select", slotId: slot.id });
  assert.equal(f.results.length, 0);
  const repeated = await f.say({ intent: "confirm" });
  assert.equal(f.results.length, 0);
  f.conversation.readbackDelivered(repeated!.readbackVersion!);
  const done = await f.say({ intent: "confirm" });
  assert.equal(done!.terminal, true);
  assert.equal(f.results.length, 1);
  await f.say({ intent: "confirm" });
  assert.equal(f.results.length, 1);
});

test("interruption invalidates delivered evidence and old readback acknowledgments", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "reschedule", provider: "same" });
  const slots = f.conversation.snapshot().batch!.slots;
  const old = await f.say({ intent: "select", slotId: slots[0].id });
  f.conversation.readbackDelivered(old!.readbackVersion!);
  f.conversation.interrupt();
  const corrected = await f.say({ intent: "correct", slotId: slots[2].id });
  f.conversation.readbackDelivered(old!.readbackVersion!);
  await f.say({ intent: "confirm" });
  assert.equal(f.results.length, 0);
  assert.match(corrected!.text, /Doctor Aisha Patel/);
});

test("declining rescheduling never cancels without cancellation readback and approval", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed" });
  const offered = await f.say({ intent: "decline" });
  assert.match(offered!.text, /cancel/);
  assert.equal(f.results.length, 0);
  const readback = await f.say({ intent: "confirm" });
  assert.equal(f.results.length, 0);
  f.conversation.readbackDelivered(readback!.readbackVersion!);
  await f.say({ intent: "confirm" });
  assert.equal(f.results[0].kind, "canceled");
});

test("compound identity and callback retains timing and records only after confirmation", async () => {
  const f = fixture();
  const readback = await f.say({ identity: "confirmed", intent: "callback", callback: { date: "2026-09-06", time: "11:00", timeEnd: null } });
  assert.match(readback!.text, /2026-09-06 at 11:00/);
  assert.equal(f.callbacks.length, 0);
  f.conversation.readbackDelivered(readback!.readbackVersion!);
  const done = await f.say({ intent: "confirm" });
  assert.equal(done!.terminal, true);
  assert.equal(f.callbacks.length, 1);
  assert.equal(f.results.length, 0);
});

test("late model output cannot advance a newer turn", async () => {
  const pending: Array<(value: Interpretation) => void> = [];
  const interpreter: Interpreter = () => new Promise(resolve => pending.push(resolve));
  const conversation = new SchedulingConversation({ context, interpreter,
    scheduling: createVoiceSchedulingAuthority({ context, now: () => now }) });
  const first = conversation.respond("yes");
  const second = conversation.respond("wrong person");
  pending[1](meaning({ identity: "wrong_person" }));
  assert.equal((await second)!.terminal, true);
  pending[0](meaning({ identity: "confirmed" }));
  assert.equal(await first, undefined);
  assert.equal(conversation.snapshot().identity, false);
});

test("interpreter receives the current dentist as a fact beyond the recent history", async () => {
  let received: unknown;
  const conversation = new SchedulingConversation({ context,
    interpreter: async ({ state }) => { received = state; return meaning({ identity: "confirmed" }); },
    scheduling: createVoiceSchedulingAuthority({ context, now: () => now }) });
  await conversation.respond("Yes");
  assert.deepEqual((received as { appointment: unknown }).appointment, context.appointment);
});

test("ordinary separate turns ask the dentist choice before offering slots", async () => {
  const f = fixture();
  f.conversation.greeting();
  assert.match((await f.say({ identity: "confirmed" }, "Yes I'm"))!.text, /Would you like to reschedule/);
  const choice = await f.say({ intent: "reschedule" }, "Yes sure");
  assert.match(choice!.text, /current dentist.*another dentist/);
  assert.equal(f.conversation.snapshot().batch, undefined);
  assert.match((await f.say({ provider: "same" }, "My current dentist"))!.text, /Option 3/);
});

test("provider evidence from earlier assistant speech cannot skip the choice", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed" });
  const reply = await f.say({ intent: "reschedule", provider: "same", providerEvidence: "Aisha Patel" }, "Yes sure");
  assert.match(reply!.text, /Would you prefer your current dentist/);
  assert.equal(f.conversation.snapshot().provider, undefined);
});

test("a callback can be confirmed before identity without revealing appointment details", async () => {
  const f = fixture();
  const reply = await f.say({ intent: "callback", callback: { date: "2026-09-06", time: "11:00", timeEnd: null } });
  assert.doesNotMatch(reply!.text, /dentist|appointment|Olivia/);
  f.conversation.readbackDelivered(reply!.readbackVersion!);
  assert.equal((await f.say({ intent: "confirm" }))!.terminal, true);
  assert.equal(f.callbacks.length, 1);
  assert.equal(f.conversation.snapshot().identity, false);
});

test("caller can leave incomplete callback collection and resume scheduling", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "callback", callback: { date: "2026-09-06", time: null, timeEnd: null } });
  const reply = await f.say({ intent: "reschedule" }, "Actually I can reschedule now");
  assert.match(reply!.text, /current dentist.*another dentist/);
  assert.equal(f.conversation.snapshot().stage, "provider");
});

test("repeat preserves the pending appointment confirmation", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "reschedule", provider: "same" });
  const slot = f.conversation.snapshot().batch!.slots[2];
  const readback = await f.say({ intent: "select", slotId: slot.id });
  const repeat = await f.say({ intent: "repeat" });
  assert.equal(repeat!.text, readback!.text);
  assert.equal(f.conversation.snapshot().stage, "confirmation");
  f.conversation.readbackDelivered(repeat!.readbackVersion!);
  await f.say({ intent: "confirm" });
  assert.equal(f.results.length, 1);
});

test("provider correction takes precedence over selecting an old slot", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "reschedule", provider: "same" });
  const slot = f.conversation.snapshot().batch!.slots[2];
  await f.say({ intent: "correct", slotId: slot.id, provider: "different" }, "Option three, but another dentist");
  assert.equal(f.conversation.snapshot().prepared, undefined);
  assert.equal(f.conversation.snapshot().stage, "slots");
  assert.ok(f.conversation.snapshot().batch!.slots.every(candidate => candidate.providerName !== context.appointment.provider.name));
});

test("repeated empty availability ends with a bounded recovery", async () => {
  const f = fixture();
  const request = { intent: "reschedule" as const, provider: "same" as const, timeFrom: "23:00", timeTo: "23:30" };
  await f.say({ identity: "confirmed", ...request });
  await f.say(request);
  const reply = await f.say(request);
  assert.equal(reply!.terminal, true);
  assert.equal(f.results.length, 0);
});

test("background constraints cannot override an explicit offered slot selection", async () => {
  const f = fixture();
  await f.say({ identity: "confirmed", intent: "reschedule", provider: "different" });
  const slot = f.conversation.snapshot().batch!.slots[2];
  const reply = await f.say({ intent: "select", slotId: slot.id, timeFrom: "13:00", appointmentConstraintsEvidence: "after lunch" }, "Option three makes sense");
  assert.ok(reply!.readbackVersion);
  assert.equal(f.conversation.snapshot().prepared?.replacement?.id, slot.id);
  assert.deepEqual(f.conversation.snapshot().constraints, {});
});

test("a single callback time correction clears the previous time window", async () => {
  const f = fixture();
  await f.say({ intent: "callback", callback: { date: "2026-09-06", time: "13:00", timeEnd: "14:00" } });
  const reply = await f.say({ intent: "correct", callback: { date: null, time: "15:00", timeEnd: null }, callbackTiming: "explicit" });
  assert.match(reply!.text, /2026-09-06 at 15:00,/);
  assert.equal(f.conversation.snapshot().callback?.timeEnd, null);
});
