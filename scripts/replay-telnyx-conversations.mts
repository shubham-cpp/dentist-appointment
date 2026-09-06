import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { addVoiceCalendarDays, voiceLocalDateIso, createVoiceCallContext } from "../src/lib/voice-call-context";
import { createTelnyxAssistantDraft, telnyxCallTimeVariables } from "../src/voice-experiment/telnyx-candidate";
import { createTelnyxCandidateClient } from "../src/voice-experiment/telnyx-candidate-client";

const cases = [
  { id: "current-dentist", outcome: "rescheduled", turns: ["Yes, this is Olivia Garcia.", "I'd like to reschedule with my current dentist.", "The first option works.", "Yes, that change is correct. Please book it."] },
  { id: "another-dentist", outcome: "rescheduled", turns: ["Yes, you are.", "Another dentist is fine. Please show me the earliest options.", "The second option works.", "Yes, please make that change."] },
  { id: "cancellation", outcome: "cancelled", turns: ["Speaking, this is Olivia.", "I would like to cancel the appointment.", "Yes, cancel that appointment."] },
  { id: "relative-callback", outcome: "staff_follow_up", turns: ["Yes, that's me, but I'm busy. Call me tomorrow at this same time.", "Yes, that callback time is correct."] },
  { id: "callback-window", outcome: "staff_follow_up", turns: ["Yes, this is Olivia.", "Not right now. Maybe tomorrow evening?", "Yes, that callback window works."] },
  { id: "repeat-and-correct", outcome: "rescheduled", turns: ["This is Olivia Garcia.", "A different dentist is fine, but only in the afternoon.", "Please repeat those same options.", "The first one, actually no, the last one please.", "Yes, please make that exact change."] },
  { id: "no-suitable-slot", outcome: "staff_follow_up", turns: ["Yes, this is Olivia.", "Reschedule with my current dentist, but I can only attend after 10 PM.", "I can't change that preference. Please record staff follow-up."] },
  { id: "decline-without-cancelling", outcome: "pending", turns: ["Yes, that's me.", "I don't want to reschedule.", "No, do not cancel anything. I don't need further help. Goodbye."] },
  { id: "wrong-person", outcome: "identity_failed", turns: ["No, Olivia isn't here. I'm her roommate."] },
  { id: "tool-failure-duplicate-staff-follow-up", outcome: "staff_follow_up", turns: ["Yes, this is Olivia.", "Please reschedule with my current dentist.", "The first option works.", "Yes, please make that change.", "Please record staff follow-up and end the conversation."] },
];

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Use --apply for isolated fictional managed-chat regression. No phone is dialed.");
    return;
  }
  const apiKey = process.env.TELNYX_API_KEY;
  const testToken = process.env.VOICE_ASSISTANT_TEST_TOOL_TOKEN;
  const internalSecret = process.env.VOICE_GATEWAY_INTERNAL_SECRET;
  assert.ok(apiKey && testToken && internalSecret, "Configure Telnyx and dedicated gateway test credentials.");
  const context = createVoiceCallContext();
  const base = process.env.VOICE_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:3001";
  async function local(method: string, body?: unknown) {
    const response = await fetch(`${base}/internal/qualification-session`, {
      method, headers: { "content-type": "application/json", "x-voice-gateway-secret": internalSecret! },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000),
    });
    assert.ok(response.ok, `Gateway test session returned ${response.status}. Start it with VOICE_ASSISTANT_TEST_MODE=true.`);
    return response.status === 204 ? undefined : response.json();
  }
  await local("POST", { callContext: context, scenarioId: "replay-readiness" });
  const tunnels = await (await fetch("http://127.0.0.1:4040/api/tunnels")).json() as { tunnels: Array<{ public_url: string; config: { addr: string } }> };
  const publicBaseUrl = tunnels.tunnels.find((tunnel) => tunnel.public_url.startsWith("https:") && /:3001$/.test(tunnel.config.addr))?.public_url;
  assert.ok(publicBaseUrl, "A gateway tunnel is required.");
  const draft = createTelnyxAssistantDraft({ publicBaseUrl, dataRetentionEnabled: true, defaultDynamicVariables: {
    ...telnyxCallTimeVariables(context), attempt_id: "isolated-replay", clinic_name: context.clinicName,
    patient_name: context.patientName, tool_token: testToken,
  } });
  const modelOverride = process.argv.find((arg) => arg.startsWith("--model="))?.slice(8);
  if (modelOverride) {
    assert.ok(["openai/gpt-5.6-luna", "openai/gpt-5.6-sol"].includes(modelOverride));
    draft.model = modelOverride;
  }
  for (const [key, value] of Object.entries(draft.dynamic_variables!)) {
    draft.instructions = draft.instructions.replaceAll(`{{${key}}}`, value);
    draft.greeting = draft.greeting.replaceAll(`{{${key}}}`, value);
  }
  const client = createTelnyxCandidateClient({ apiKey });
  const existingId = process.argv.find((arg) => arg.startsWith("--qualification-assistant="))?.split("=")[1];
  if (existingId) {
    assert.notEqual(existingId, process.env.TELNYX_AI_ASSISTANT_ID, "Do not use the phone assistant for retained chat tests.");
    const existing = await client.getAssistant(existingId);
    assert.ok(String(existing.name).startsWith("Willow isolated fictional"));
  }
  const assistant = existingId
    ? await client.updateAssistant(existingId, { ...draft, name: "Willow isolated fictional replay", promote_to_main: true })
    : await client.createAssistant({ ...draft, name: "Willow isolated fictional replay" });
  const assistantId = String(assistant.id);
  async function provider(path: string, body: unknown) {
    const response = await fetch(`https://api.telnyx.com/v2/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    assert.ok(response.ok, `Telnyx ${path} returned ${response.status}.`);
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return data.data ?? data;
  }
  const selectedIds = process.argv.find((arg) => arg.startsWith("--cases="))?.slice(8).split(",");
  const selected = selectedIds ? cases.filter((item) => selectedIds.includes(item.id)) : cases;
  assert.ok(selected.length > 0 && (!selectedIds || selected.length === selectedIds.length), "Unknown or duplicate case.");
  const results: Array<Record<string, unknown>> = [];
  await mkdir(resolve(".voice-artifacts/qualification"), { recursive: true });
  const evidencePath = resolve(`.voice-artifacts/qualification/telnyx-replay-${assistant.version_id}.json`);
  console.log(`Isolated assistant ${assistantId}, version ${assistant.version_id}.`);
  for (const item of selected) {
    await local("POST", { callContext: context, scenarioId: item.id });
    const conversation = await provider("ai/conversations", { name: `Fictional replay: ${item.id}` });
    await provider(`ai/conversations/${conversation.id}/message`, { role: "assistant", content: draft.greeting });
    const messages: Array<{ role: string; text: string }> = [{ role: "assistant", text: draft.greeting }];
    let error: string | undefined;
    try {
      for (const turn of item.turns) {
        messages.push({ role: "user", text: turn });
        const reply = await provider(`ai/assistants/${assistantId}/chat`, { conversation_id: conversation.id, content: turn });
        messages.push({ role: "assistant", text: String(reply.content ?? "") });
        const state = await local("GET");
        if (state.outcome !== "pending") break;
      }
    } catch (caught) { error = caught instanceof Error ? caught.message : "Replay failed"; }
    const state = await local("GET");
    const failedTools = state.toolCalls.filter((tool: { status: string }) => tool.status === "failed");
    const expectedFailure = item.id === "tool-failure-duplicate-staff-follow-up";
    const providerMessages = await client.listConversationMessages(conversation.id);
    const toolResults = providerMessages.filter((message) => message.role === "tool").flatMap((message) => {
      try { return [JSON.parse(String(message.text))]; } catch { return []; }
    });
    const callback = toolResults.find((result) => result.type === "staff_follow_up_recorded")?.callback;
    const slots = toolResults.find((result) => result.type === "slots_found")?.slots;
    const checks: Record<string, boolean> = {
      requestSucceeded: !error,
      outcome: state.outcome === item.outcome,
      tools: expectedFailure || failedTools.length === 0,
      closing: /goodbye/i.test(messages.at(-1)?.text ?? ""),
    };
    if (["rescheduled", "cancelled"].includes(item.outcome) || item.id === "relative-callback" || item.id === "callback-window") {
      checks.confirmationTurn = messages.filter((message) => message.role === "user").length === item.turns.length;
    }
    if (item.id === "current-dentist") checks.provider = state.result?.replacement?.provider?.id === context.appointment.provider.id;
    if (item.id === "another-dentist") checks.provider = Boolean(state.result?.replacement) && state.result.replacement.provider.id !== context.appointment.provider.id;
    if (item.id === "relative-callback" || item.id === "callback-window") {
      checks.callbackDate = callback?.date === addVoiceCalendarDays(voiceLocalDateIso(new Date(context.callStartedAt)), 1);
      checks.callbackConfirmed = callback?.confirmed === true;
      checks.callbackTime = item.id === "relative-callback"
        ? callback?.time === telnyxCallTimeVariables(context).tomorrow_same_time.split(" ")[1]
        : callback?.time === "17:00" && callback?.timeEnd === "20:00";
    }
    if (item.id === "repeat-and-correct") checks.correctedSlot = Boolean(slots?.length) && state.result?.replacement?.id === slots.at(-1).id;
    if (["rescheduled", "cancelled"].includes(item.outcome)) {
      checks.singleCommit = state.toolCalls.filter((tool: { name: string }) => tool.name === "commit_change").length === 1;
    }
    const passed = Object.values(checks).every(Boolean);
    results.push({ caseId: item.id, expectedOutcome: item.outcome, passed, checks, error, conversationId: conversation.id, messages, state, providerMessages });
    await writeFile(evidencePath, JSON.stringify({ assistantId, model: draft.model, versionId: assistant.version_id, channel: "managed_chat", results }, null, 2));
    console.log(`${item.id}: ${passed ? "PASS" : "FAIL"}; outcome=${state.outcome}; toolFailures=${failedTools.length}.`);
  }
  console.log(`Evidence: ${evidencePath}`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

await main();
