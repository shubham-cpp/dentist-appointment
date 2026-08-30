import type { VoiceCallContext } from "@/lib/voice-call-context";

export const TELNYX_MAEVE_VOICE = "Telnyx.Ultra.02a924f6-bb49-4177-8fbb-52238c5056d6";
export const TELNYX_CANDIDATE_MODEL = "openai/gpt-5.6-luna";

const toolDefinitions = [
  {
    description: "Record whether the caller is the intended fictional patient before appointment facts are shared.",
    name: "verify_identity",
    properties: {
      operationId: { type: "string" },
      result: { enum: ["confirmed", "unclear", "wrong_person"], type: "string" },
    },
    required: ["operationId", "result"],
  },
  {
    description: "Return eligible fictional replacement times after identity confirmation.",
    name: "find_slots",
    properties: {
      dateIso: { type: "string" },
      limit: { maximum: 6, minimum: 1, type: "integer" },
      operationId: { type: "string" },
      provider: { enum: ["any", "current"], type: "string" },
      timePreference: { enum: ["morning", "afternoon", "evening"], type: "string" },
    },
    required: ["operationId", "provider"],
  },
  {
    description: "Prepare one server-side reschedule or cancellation without changing the appointment.",
    name: "prepare_change",
    properties: {
      kind: { enum: ["reschedule", "cancellation"], type: "string" },
      operationId: { type: "string" },
      slotId: { type: "string" },
    },
    required: ["kind", "operationId"],
  },
  {
    description: "Commit only the prepared action after the caller gives exact confirmation.",
    name: "commit_change",
    properties: {
      actionToken: { type: "string" },
      confirmed: { type: "boolean" },
      operationId: { type: "string" },
    },
    required: ["actionToken", "confirmed", "operationId"],
  },
  {
    description: "Record a staff follow-up when safe automation cannot continue.",
    name: "request_staff_follow_up",
    properties: {
      operationId: { type: "string" },
      reason: { type: "string" },
    },
    required: ["operationId", "reason"],
  },
] as const;

export function createTelnyxCandidateInstructions() {
  return [
    "You are Willow, a scheduling assistant for a fictional dental clinic.",
    "Use warm, concise American English and natural conversation.",
    "Respond directly to questions, corrections, silence, interruptions, and topic changes.",
    "Keep the caller's goal after an interruption. Do not repeat answered questions.",
    "Use verify_identity before you disclose appointment details.",
    "Call verify_identity for every clear, unclear, or wrong-person identity response.",
    "After verified identity, briefly state the current appointment returned by verify_identity.",
    "Use a new operationId for each distinct tool action. Reuse it only for an identical retry.",
    "Use find_slots for every availability claim. Never invent a date, time, or provider.",
    "Every provider returned by find_slots is qualified for this fictional appointment.",
    "Use prepare_change only after the caller selects a returned slot or asks to cancel.",
    "Ask for exact confirmation of the complete change before commit_change.",
    "Never claim the appointment changed unless commit_change returns change_committed.",
    "Do not give clinical advice. Refer clinical questions to clinic staff.",
    "Use request_staff_follow_up when identity or a tool fails, or safe automation cannot continue.",
    "Claim that staff follow-up was recorded only after request_staff_follow_up succeeds.",
    "Do not ask for a phone number. Staff must use the contact details already on file.",
    "When the caller clearly asks to end the call, briefly say goodbye, then use the hangup tool immediately.",
    "Do not ask for another confirmation after a clear request to end the call.",
    "Never claim that the call is ending unless you use the hangup tool in the same turn.",
    "Keep most replies under two short sentences. Ask one useful question at a time.",
  ].join(" ");
}

export function createTelnyxAssistantDraft(options: {
  defaultDynamicVariables?: {
    attempt_id: string;
    clinic_name: string;
    patient_name: string;
    tool_token: string;
  };
  publicBaseUrl: string;
}) {
  const base = new URL(options.publicBaseUrl);
  return {
    enabled_features: ["telephony"],
    ...(options.defaultDynamicVariables
      ? { dynamic_variables: options.defaultDynamicVariables }
      : {}),
    greeting: "Hello, this is Willow calling from {{clinic_name}}. Am I speaking with {{patient_name}}?",
    instructions: createTelnyxCandidateInstructions(),
    interruption_settings: {
      disable_greeting_interruption: false,
      enable: true,
    },
    model: TELNYX_CANDIDATE_MODEL,
    name: "Willow fictional scheduling experiment",
    privacy_settings: { data_retention: true },
    telephony_settings: {
      recording_settings: {
        channels: "dual",
        enabled: true,
        format: "mp3",
        stop_on_conversation_end: true,
      },
      send_message_history_updates: true,
      time_limit_secs: 180,
    },
    tools: [
      ...toolDefinitions.map((definition) => ({
        type: "webhook" as const,
        webhook: {
          async: false,
          body_parameters: {
            additionalProperties: false,
            properties: definition.properties,
            required: definition.required,
            type: "object",
          },
          description: definition.description,
          headers: [
            { name: "Authorization", value: "Bearer {{tool_token}}" },
          ],
          method: "POST" as const,
          name: definition.name,
          timeout_ms: 1_000,
          url: new URL(`/voice-experiment/telnyx/tools/${definition.name}`, base).toString(),
        },
      })),
      {
        hangup: {
          description: "End the call after a brief closing when the caller clearly asks to end it.",
        },
        type: "hangup" as const,
      },
    ],
    transcription: {
      language: "en",
      model: "deepgram/flux",
      settings: {
        eager_eot_threshold: 0.4,
        eot_threshold: 0.7,
        eot_timeout_ms: 600,
      },
    },
    voice_settings: {
      expressive_mode: false,
      voice: TELNYX_MAEVE_VOICE,
      voice_speed: 1,
    },
  };
}

export function createTelnyxDialRequest(options: {
  assistantId: string;
  attemptId: string;
  callToNumber: string;
  commandId: string;
  connectionId: string;
  context: VoiceCallContext;
  publicBaseUrl: string;
  telnyxPhoneNumber: string;
  toolToken: string;
}) {
  return {
    assistant: {
      dynamic_variables: {
        attempt_id: options.attemptId,
        clinic_name: options.context.clinicName,
        patient_name: options.context.patientName,
        tool_token: options.toolToken,
      },
      id: options.assistantId,
    },
    client_state: Buffer.from(JSON.stringify({ attemptId: options.attemptId })).toString("base64"),
    command_id: options.commandId,
    connection_id: options.connectionId,
    from: options.telnyxPhoneNumber,
    record: "record-from-answer" as const,
    record_channels: "dual" as const,
    record_format: "mp3" as const,
    record_track: "both" as const,
    time_limit_secs: 180,
    timeout_secs: 20,
    to: options.callToNumber,
    webhook_url: new URL(
      `/voice-experiment/telnyx/events?attempt=${encodeURIComponent(options.attemptId)}`,
      options.publicBaseUrl,
    ).toString(),
    webhook_url_method: "POST" as const,
  };
}
