import assert from "node:assert/strict";
import { createVoiceCallContext } from "../src/lib/voice-call-context";
import { SchedulingConversation } from "../src/voice-relay/conversation";
import { createVoiceSchedulingAuthority } from "../src/voice-core/scheduling-authority";
import { createOpenRouterInterpreter, type Interpretation } from "../src/voice-relay/interpretation";

if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required.");
const model = process.env.VOICE_RELAY_MODEL ?? "openai/gpt-4.1-mini";
const interpret = createOpenRouterInterpreter(process.env.OPENROUTER_API_KEY, model);
const state = { stage: "identity", identity: false, callStartedAt: "2026-09-05T15:00:00Z", clinicTimeZone: "America/New_York" };
const appointment = createVoiceCallContext(new Date(state.callStartedAt)).appointment;
const cases = [
  { text: "Aisha Patel makes sense", state: { ...state, identity: true, stage: "provider", appointment },
    check: (r: Awaited<ReturnType<typeof interpret>>) => assert.equal(r.provider, "same") },
  { text: "Yes. I confirm.", state: { ...state, identity: true, stage: "confirmation", appointment,
    history: [{ role: "assistant", text: "Please confirm: move your appointment to Thursday at 3 PM with Dr Brian Chen?" }] },
    check: (r: Awaited<ReturnType<typeof interpret>>) => assert.equal(r.intent, "confirm") },
  { text: "Yes, you are", state, check: (r: Awaited<ReturnType<typeof interpret>>) => assert.equal(r.identity, "confirmed") },
  { text: "Yes I'm", state, check: (r: Awaited<ReturnType<typeof interpret>>) => assert.equal(r.identity, "confirmed") },
  { text: "Yes, but call tomorrow at the same time", state, check: (r: Awaited<ReturnType<typeof interpret>>) => {
    assert.equal(r.intent, "callback"); assert.equal(r.identity, "confirmed");
    assert.equal(r.callback?.date, "2026-09-06"); assert.equal(r.callback?.time, "11:00"); assert.equal(r.callback?.timeEnd, null);
  } },
  { text: "Not right now. Maybe today evening?", state: { ...state, identity: true, stage: "reschedule" }, check: (r: Awaited<ReturnType<typeof interpret>>) => {
    assert.equal(r.intent, "callback"); assert.equal(r.callback?.date, "2026-09-05"); assert.equal(r.callback?.time, null);
  } },
  { text: "I'd rather not reschedule it", state: { ...state, identity: true, stage: "reschedule" }, check: (r: Awaited<ReturnType<typeof interpret>>) => assert.equal(r.intent, "decline") },
  { text: "Current dentist, after lunch please", state: { ...state, identity: true, stage: "provider" }, check: (r: Awaited<ReturnType<typeof interpret>>) => {
    assert.equal(r.provider, "same"); assert.ok(r.timeFrom && r.timeFrom >= "12:00");
  } },
];
let failed = false;
for (const entry of cases) {
  const start = Date.now();
  try {
    const result = await interpret({ text: entry.text, state: entry.state, signal: AbortSignal.timeout(10_000) });
    entry.check(result);
    console.log(JSON.stringify({ text: entry.text, passed: true, durationMs: Date.now() - start, model }));
  } catch (error) {
    failed = true;
    console.log(JSON.stringify({ text: entry.text, passed: false, error: error instanceof assert.AssertionError ? error.message : "Model request failed", model }));
  }
}
for (const providerChoice of ["My current dentist", "Another dentist please"]) {
  const context = createVoiceCallContext(new Date("2026-09-05T15:00:00Z"));
  let committed = false;
  let lastMeaning: Interpretation | undefined;
  const conversation = new SchedulingConversation({ context, interpreter: async input => { const result = await interpret(input); lastMeaning = result; return result; },
    scheduling: createVoiceSchedulingAuthority({ context, now: () => new Date(context.callStartedAt), applyResult: () => { committed = true; } }) });
  try {
    conversation.greeting();
    assert.match((await conversation.respond("Yes I'm"))!.text, /Would you like to reschedule/);
    assert.match((await conversation.respond("Yes sure"))!.text, /current dentist.*another dentist/);
    assert.equal(conversation.snapshot().batch, undefined);
    assert.equal(conversation.snapshot().provider, undefined);
    assert.deepEqual(conversation.snapshot().constraints, {});
    assert.match((await conversation.respond(providerChoice))!.text, /Option 3/);
    const offered = conversation.snapshot().batch!.slots[2];
    const readback = await conversation.respond("Option three makes sense");
    assert.equal(conversation.snapshot().prepared?.replacement?.id, offered.id);
    assert.ok(readback?.readbackVersion);
    conversation.readbackDelivered(readback!.readbackVersion!);
    assert.equal((await conversation.respond("I confirm"))!.terminal, true);
    assert.equal(committed, true);
    console.log(JSON.stringify({ workflow: providerChoice, passed: true, model }));
  } catch (error) {
    failed = true;
    console.log(JSON.stringify({ workflow: providerChoice, passed: false, error: error instanceof assert.AssertionError ? error.message : "Workflow failed", stage: conversation.snapshot().stage, lastMeaning, model }));
  }
}
for (const workflow of ["cancellation", "callback before identity"]) {
  const context = createVoiceCallContext(new Date("2026-09-05T15:00:00Z"));
  let saved = false;
  const conversation = new SchedulingConversation({ context, interpreter: interpret,
    scheduling: createVoiceSchedulingAuthority({ context, now: () => new Date(context.callStartedAt),
      applyResult: () => { saved = true; }, recordStaffFollowUp: () => { saved = true; } }) });
  try {
    conversation.greeting();
    let readback;
    if (workflow === "cancellation") {
      await conversation.respond("Yes you are");
      assert.match((await conversation.respond("I don't want to reschedule"))!.text, /cancel/);
      readback = await conversation.respond("Yes cancel it");
    } else {
      readback = await conversation.respond("Not right now, call tomorrow at the same time");
      assert.match(readback!.text, /2026-09-06 at 11:00/);
    }
    assert.ok(readback?.readbackVersion);
    conversation.readbackDelivered(readback!.readbackVersion!);
    assert.equal((await conversation.respond("Yes I confirm"))!.terminal, true);
    assert.equal(saved, true);
    console.log(JSON.stringify({ workflow, passed: true, model }));
  } catch (error) {
    failed = true;
    console.log(JSON.stringify({ workflow, passed: false, error: error instanceof assert.AssertionError ? error.message : "Workflow failed", stage: conversation.snapshot().stage, model }));
  }
}
if (failed) process.exitCode = 1;
