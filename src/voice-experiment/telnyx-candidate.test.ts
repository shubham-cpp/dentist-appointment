import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import {
  TELNYX_MAEVE_VOICE,
  createTelnyxAssistantDraft,
  createTelnyxDialRequest,
} from "./telnyx-candidate";

test("builds the locked Telnyx managed assistant with scheduling and native hangup tools", () => {
  const draft = createTelnyxAssistantDraft({
    publicBaseUrl: "https://voice.example.test",
  });

  assert.equal(draft.model, "openai/gpt-5.6-luna");
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
    enabled: true,
    format: "mp3",
    stop_on_conversation_end: true,
  });
  assert.equal(draft.telephony_settings.send_message_history_updates, true);
  assert.equal(draft.privacy_settings.data_retention, true);
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
      description: "End the call after a brief closing when the caller clearly asks to end it.",
    },
    type: "hangup",
  });
  assert.match(draft.instructions, /natural conversation/i);
  assert.match(draft.instructions, /new operationId for each distinct tool action/i);
  assert.match(draft.instructions, /clear, unclear, or wrong-person identity response/i);
  assert.match(draft.instructions, /Every provider returned by find_slots is qualified/i);
  assert.match(draft.instructions, /use the hangup tool/i);
  assert.match(draft.instructions, /caller clearly asks to end the call/i);
  assert.match(draft.instructions, /Never claim that the call is ending unless/i);
  assert.match(draft.instructions, /only after request_staff_follow_up succeeds/i);
  assert.match(draft.instructions, /Do not ask for a phone number/i);
  assert.doesNotMatch(draft.instructions, /ask these questions in order|script/i);
});

test("adds fictional defaults only for an explicit managed-test version", () => {
  const draft = createTelnyxAssistantDraft({
    defaultDynamicVariables: {
      attempt_id: "managed-test",
      clinic_name: "Brightview Dental",
      patient_name: "Olivia Garcia",
      tool_token: "managed-test-token-1234",
    },
    publicBaseUrl: "https://voice.example.test",
  });

  assert.deepEqual(draft.dynamic_variables, {
    attempt_id: "managed-test",
    clinic_name: "Brightview Dental",
    patient_name: "Olivia Garcia",
    tool_token: "managed-test-token-1234",
  });
});

test("builds one idempotent recorded Dial request to the fixed destination", () => {
  const attemptId = "voice_499b3361-eaee-45e9-a3e0-9fd1be607dfd";
  const request = createTelnyxDialRequest({
    assistantId: "assistant-11111111-1111-4111-8111-111111111111",
    attemptId,
    callToNumber: "+12025550111",
    commandId: "22222222-2222-4222-8222-222222222222",
    connectionId: "1234567890",
    context: createVoiceCallContext(),
    publicBaseUrl: "https://voice.example.test",
    telnyxPhoneNumber: "+12025550112",
    toolToken: "short-lived-tool-token",
  });

  assert.equal(request.to, "+12025550111");
  assert.equal(request.from, "+12025550112");
  assert.equal(request.command_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(request.assistant.id, "assistant-11111111-1111-4111-8111-111111111111");
  assert.equal(request.assistant.dynamic_variables.attempt_id, attemptId);
  assert.equal(request.assistant.dynamic_variables.patient_name, "Olivia Garcia");
  assert.equal(request.record, "record-from-answer");
  assert.equal(request.record_channels, "dual");
  assert.equal(request.record_track, "both");
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
