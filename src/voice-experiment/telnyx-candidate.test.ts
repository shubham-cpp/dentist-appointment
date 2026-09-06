import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import {
  TELNYX_MAEVE_VOICE,
  createTelnyxAssistantDraft,
  createTelnyxAssistantStartRequest,
  createTelnyxDialRequest,
  createTelnyxOpeningSpeakRequest,
  spokenTelnyxCandidateGreeting,
} from "./telnyx-candidate";

test("builds the locked Telnyx managed assistant with scheduling and native hangup tools", () => {
  const draft = createTelnyxAssistantDraft({
    publicBaseUrl: "https://voice.example.test",
  });

  assert.equal(draft.model, "openai/gpt-5.6-sol");
  assert.equal(draft.voice_settings.voice, TELNYX_MAEVE_VOICE);
  assert.equal(draft.voice_settings.expressive_mode, false);
  assert.deepEqual(draft.transcription, {
    language: "en",
    model: "deepgram/flux",
    settings: {
      eager_eot_threshold: 0.4,
      eot_threshold: 0.7,
      eot_timeout_ms: 600,
    },
  });
  assert.equal(draft.interruption_settings.enable, true);
  assert.equal(draft.interruption_settings.disable_greeting_interruption, false);
  assert.deepEqual(draft.telephony_settings.recording_settings, {
    channels: "dual",
    enabled: false,
    format: "mp3",
    stop_on_conversation_end: false,
  });
  assert.equal(draft.telephony_settings.send_message_history_updates, true);
  assert.equal(draft.telephony_settings.user_idle_reply_secs, 10);
  assert.equal(draft.privacy_settings.data_retention, false);
  assert.deepEqual(draft.tools.flatMap((entry) => (
    "webhook" in entry ? [entry.webhook.name] : []
  )), [
    "verify_identity",
    "find_slots",
    "prepare_change",
    "commit_change",
    "request_staff_follow_up",
  ]);
  const webhookTools = draft.tools.filter((entry) => "webhook" in entry);
  assert.ok(webhookTools.every((entry) => entry.webhook.async === false));
  assert.ok(webhookTools.every((entry) => entry.webhook.headers.some((header) => (
    header.name === "Authorization" && header.value === "Bearer {{tool_token}}"
  ))));
  assert.ok(webhookTools.every((entry) => entry.webhook.headers.every((header) => (
    !header.name.toLowerCase().startsWith("x-telnyx-")
  ))));
  assert.deepEqual((draft.tools as unknown[]).at(-1), {
    hangup: {
      description: "End the call after a brief closing when the change is committed, staff follow-up is recorded, identity fails, or the caller clearly asks to end it.",
    },
    type: "hangup",
  });
  assert.match(draft.instructions, /natural conversation/i);
  assert.match(draft.instructions, /new operationId for each distinct tool action/i);
  assert.match(draft.instructions, /clear, unclear, or wrong-person identity response/i);
  assert.match(draft.instructions, /Every provider returned by find_slots is qualified/i);
  assert.match(draft.instructions, /use the hangup tool/i);
  assert.match(draft.instructions, /opening identity greeting/i);
  assert.match(draft.instructions, /caller clearly asks to end the call/i);
  assert.match(draft.instructions, /Never claim that the call is ending unless/i);
  assert.match(draft.instructions, /only after request_staff_follow_up succeeds/i);
  assert.match(draft.instructions, /Do not ask for a phone number/i);
  assert.doesNotMatch(draft.instructions, /ask these questions in order|script/i);
});

test("uses the Telnyx webhook body schema contract for every scheduling tool", () => {
  const draft = createTelnyxAssistantDraft({
    publicBaseUrl: "https://voice.example.test",
  });

  for (const entry of draft.tools) {
    if (!("webhook" in entry)) continue;
    const bodyParameters = entry.webhook.body_parameters as Record<string, unknown>;
    assert.equal(bodyParameters.type, "object", `${entry.webhook.name} must declare an object body`);
    assert.ok(
      bodyParameters.properties && typeof bodyParameters.properties === "object",
      `${entry.webhook.name} must declare body properties`,
    );
  }
});

test("greets as Willow from the clinic and confirms the full patient name", () => {
  const draft = createTelnyxAssistantDraft({
    defaultDynamicVariables: {
      attempt_id: "managed-test",
      clinic_name: "Brightview Dental",
      patient_name: "Olivia Garcia",
      tool_token: "managed-test-token-1234",
    },
    publicBaseUrl: "https://voice.example.test",
  });

  assert.equal(
    draft.greeting,
    "Hello, I'm Willow, an automated assistant calling from {{clinic_name}}. Am I speaking with {{patient_name}}?",
  );
  assert.deepEqual(draft.dynamic_variables, {
    attempt_id: "managed-test",
    clinic_name: "Brightview Dental",
    patient_name: "Olivia Garcia",
    tool_token: "managed-test-token-1234",
  });
});

test("keeps the outbound call in the rescheduling workflow after identity confirmation", () => {
  const { instructions } = createTelnyxAssistantDraft({
    publicBaseUrl: "https://voice.example.test",
  });

  const orderedSteps = [
    /after verified identity, say this call is to reschedule because the current dentist .* is unavailable/i,
    /ask whether the caller wants to reschedule/i,
    /if the caller declines rescheduling, apologize for the inconvenience and offer cancellation/i,
    /keep the same dentist, which may mean a later appointment, or change dentists, which may mean an earlier appointment/i,
    /after the provider choice, use find_slots/i,
  ];
  let previousIndex = -1;
  for (const step of orderedSteps) {
    const match = instructions.match(step);
    assert.ok(match?.index !== undefined, `Missing workflow instruction: ${step}`);
    assert.ok(match.index > previousIndex, `Workflow instruction is out of order: ${step}`);
    previousIndex = match.index;
  }
  assert.match(instructions, /do not ask an open-ended question such as "How can I help you\?"/i);
  assert.match(instructions, /offer at most three times in one turn/i);
  assert.match(instructions, /only if the caller asks for more or changes their search preferences, call find_slots again/i);
  assert.match(instructions, /weekday or time that matches exactly one offered time/i);
  assert.match(instructions, /restate the current appointment and the new appointment/i);
  assert.match(instructions, /a confirmation message would follow in this demo/i);
  assert.match(instructions, /after change_committed, complete the confirmation and closing/i);
  assert.match(instructions, /there is no messaging tool/i);
  assert.match(instructions, /Declining rescheduling is not consent to cancel/i);
  assert.match(
    instructions,
    /Claim that staff follow-up was recorded only after request_staff_follow_up succeeds/i,
  );
  assert.match(instructions, /after staff_follow_up_recorded or wrong_person, briefly close, then use the hangup tool/i);
});

test("builds one idempotent unrecorded Dial request to the fixed destination", () => {
  const attemptId = "voice_499b3361-eaee-45e9-a3e0-9fd1be607dfd";
  const request = createTelnyxDialRequest({
    attemptId,
    callToNumber: "+12025550111",
    commandId: "22222222-2222-4222-8222-222222222222",
    connectionId: "1234567890",
    publicBaseUrl: "https://voice.example.test",
    telnyxPhoneNumber: "+12025550112",
  });

  assert.equal(request.to, "+12025550111");
  assert.equal(request.from, "+12025550112");
  assert.equal(request.command_id, "22222222-2222-4222-8222-222222222222");
  assert.equal("assistant" in request, false);
  assert.equal(request.answering_machine_detection, "disabled");
  assert.equal("record" in request, false);
  assert.equal(request.time_limit_secs, 180);
  assert.equal(request.timeout_secs, 20);
  assert.equal(request.webhook_url, `https://voice.example.test/voice-experiment/telnyx/events?attempt=${attemptId}`);
  assert.match(request.client_state, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
  assert.equal(request.client_state.length % 4, 0);
  assert.deepEqual(JSON.parse(Buffer.from(request.client_state, "base64").toString()), {
    attemptId,
  });
  assert.doesNotMatch(request.client_state, /short-lived-tool-token/);
});

test("speaks the canned greeting then attaches the assistant without a second greeting", () => {
  const context = createVoiceCallContext(new Date("2026-10-31T14:00:00Z"));
  const spoken = spokenTelnyxCandidateGreeting(context);
  assert.equal(
    spoken,
    "Hello, I'm Willow, an automated assistant calling from Brightview Dental. Am I speaking with Olivia Garcia?",
  );
  assert.deepEqual(createTelnyxOpeningSpeakRequest({
    commandId: "speak-1",
    payload: spoken,
  }), {
    command_id: "speak-1",
    language: "en-US",
    payload: spoken,
    payload_type: "text",
    service_level: "premium",
    voice: TELNYX_MAEVE_VOICE,
    voice_settings: { voice_speed: 1 },
  });
  assert.deepEqual(createTelnyxAssistantStartRequest({
    assistantId: "assistant-test",
    attemptId: "voice_opening",
    commandId: "start-1",
    context,
    openingGreeting: spoken,
    toolToken: "tool-token",
  }), {
    assistant: {
      greeting: "",
      dynamic_variables: {
        attempt_id: "voice_opening",
        clinic_name: "Brightview Dental",
        current_date: context.currentDateLabel,
        call_reference: "2026-10-31 10:00 America/New_York",
        tomorrow_same_time: "2026-11-01 10:00 America/New_York",
        clinic_timezone: context.clinicTimeZone,
        patient_name: "Olivia Garcia",
        tool_token: "tool-token",
      },
      id: "assistant-test",
    },
    command_id: "start-1",
    greeting: "",
    message_history: [{ content: spoken, role: "assistant" }],
  });
});

test("enables provider retention and recording only after explicit opt-in", () => {
  const draft = createTelnyxAssistantDraft({
    dataRetentionEnabled: true,
    publicBaseUrl: "https://voice.example.test",
    recordingEnabled: true,
  });
  const request = createTelnyxDialRequest({
    attemptId: "voice_recording_opt_in",
    callToNumber: "+12025550111",
    commandId: "22222222-2222-4222-8222-222222222222",
    connectionId: "1234567890",
    publicBaseUrl: "https://voice.example.test",
    recordingEnabled: true,
    telnyxPhoneNumber: "+12025550112",
  });

  assert.equal(draft.privacy_settings.data_retention, true);
  assert.equal(draft.telephony_settings.recording_settings.enabled, true);
  assert.equal(draft.telephony_settings.recording_settings.stop_on_conversation_end, true);
  assert.equal(request.record, "record-from-answer");
  assert.equal(request.record_channels, "dual");
  assert.equal(request.record_track, "both");
});
