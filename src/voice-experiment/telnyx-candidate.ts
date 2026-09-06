import { voiceReschedulingConversationGuidance } from "@/voice-core/conversation-guidance";
import { addVoiceCalendarDays, voiceLocalDateIso, type VoiceCallContext } from "@/lib/voice-call-context";
import { z } from "zod";
import {
  voiceSchedulingToolBodySchemas,
  voiceSchedulingToolDescriptions,
  voiceSchedulingToolNameSchema,
} from "@/voice-core/scheduling-authority";

export const TELNYX_MAEVE_VOICE = "Telnyx.Ultra.02a924f6-bb49-4177-8fbb-52238c5056d6";
export const TELNYX_CANDIDATE_MODEL = "openai/gpt-5.6-sol";
export const TELNYX_CANDIDATE_GREETING =
  "Hello, I'm Willow, an automated assistant calling from {{clinic_name}}. Am I speaking with {{patient_name}}?";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTelnyxWebhookBodyParameters(schema: z.ZodType) {
  const generated = z.toJSONSchema(schema) as JsonObject;
  delete generated.$schema;
  if (generated.type === "object" && isJsonObject(generated.properties)) return generated;

  const alternatives = Array.isArray(generated.oneOf)
    ? generated.oneOf.filter(isJsonObject)
    : [];
  if (alternatives.length === 0 || alternatives.some((entry) => !isJsonObject(entry.properties))) {
    throw new Error("Telnyx webhook tools require an object body schema.");
  }

  const properties: JsonObject = {};
  const propertyNames = new Set(alternatives.flatMap((entry) => (
    Object.keys(entry.properties as JsonObject)
  )));
  for (const propertyName of propertyNames) {
    const variants = alternatives.flatMap((entry) => {
      const property = (entry.properties as JsonObject)[propertyName];
      return isJsonObject(property) ? [property] : [];
    });
    const first = variants[0];
    if (!first) continue;
    const constants = variants.flatMap((variant) => (
      typeof variant.const === "string" ? [variant.const] : []
    ));
    if (constants.length === variants.length) {
      const base = { ...first };
      delete base.const;
      properties[propertyName] = { ...base, enum: [...new Set(constants)] };
      continue;
    }
    if (variants.some((variant) => JSON.stringify(variant) !== JSON.stringify(first))) {
      throw new Error(`Telnyx cannot represent the ${propertyName} webhook parameter union.`);
    }
    properties[propertyName] = first;
  }

  const requiredLists = alternatives.map((entry) => (
    Array.isArray(entry.required) ? entry.required.filter((value): value is string => typeof value === "string") : []
  ));
  const required = requiredLists[0]?.filter((name) => (
    requiredLists.every((list) => list.includes(name))
  )) ?? [];
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object" as const,
  };
}

const toolDefinitions = voiceSchedulingToolNameSchema.options.map((name) => {
  return {
    bodyParameters: toTelnyxWebhookBodyParameters(voiceSchedulingToolBodySchemas[name]),
    description: voiceSchedulingToolDescriptions[name],
    name,
  };
});

/** Telnyx may serialize omitted optional arguments as null. Required values stay strict. */
export function parseTelnyxSchedulingToolBody(name: typeof voiceSchedulingToolNameSchema.options[number], input: unknown) {
  function normalize(value: unknown, schema: JsonObject): unknown {
    if (!isJsonObject(value) || !isJsonObject(schema.properties)) return value;
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    return Object.fromEntries(Object.entries(value).flatMap(([key, field]) => {
      const property = schema.properties as JsonObject;
      if (!isJsonObject(property[key])) return [[key, field]];
      if (field === null && !required.has(key)) return [];
      return [[key, normalize(field, property[key])]];
    }));
  }
  const definition = toolDefinitions.find((tool) => tool.name === name)!;
  return voiceSchedulingToolBodySchemas[name].safeParse(normalize(input, definition.bodyParameters));
}

export function createTelnyxCandidateInstructions() {
  return [
    "You are Willow, a scheduling assistant for a fictional dental clinic.",
    voiceReschedulingConversationGuidance(),
    "## Call context\nThe current clinic date is {{current_date}}. The clinic timezone is {{clinic_timezone}}. The call reference timestamp is {{call_reference}}. For this call, tomorrow at the same time resolves to {{tomorrow_same_time}} unless another time was explicitly referenced.",
    "After change_committed, complete the confirmation and closing, then use the hangup tool in the same turn.",
    "After staff_follow_up_recorded or wrong_person, briefly close, then use the hangup tool in the same turn.",
    "For voicemail, briefly close without appointment details, then use the hangup tool.",
    "When the caller clearly asks to end the call, briefly say goodbye, then use the hangup tool immediately.",
    "Do not ask for another confirmation after a clear request to end the call. If the caller declines further help, leave the appointment unchanged and close. Do not create staff follow-up merely to end the conversation.",
    "If the current channel does not expose a native hangup tool, say the final closing and stop your response. Never substitute verify_identity, commit_change, or request_staff_follow_up for an unavailable hangup tool.",
    "Never claim that the call is ending unless you use the hangup tool in the same turn.",
    "At every dead end, close the call. This includes failed staff follow-up, terminal tool errors, no acceptable slots after the caller declines alternatives, and refusal of both rescheduling and further help. Do not keep asking the same question or leave silence on an open call.",
    "If a tool returns terminal true, stop scheduling immediately. Say you could not complete the request, thank the caller for their time with {{clinic_name}}, say goodbye, then use hangup. Do not claim follow-up or an appointment change succeeded.",
    "For any final closing, use a short phrase such as: Thank you for your time with {{clinic_name}}. Goodbye. This is an outbound call, so do not thank the patient for contacting the clinic.",
  ].join("\n\n");
}

export function createTelnyxAssistantDraft(options: {
  dataRetentionEnabled?: boolean;
  defaultDynamicVariables?: Partial<ReturnType<typeof telnyxCallTimeVariables>> & {
    attempt_id: string;
    clinic_name: string;
    patient_name: string;
    tool_token: string;
  };
  publicBaseUrl: string;
  recordingEnabled?: boolean;
}) {
  const base = new URL(options.publicBaseUrl);
  return {
    enabled_features: ["telephony"],
    ...(options.defaultDynamicVariables
      ? {
          dynamic_variables: options.defaultDynamicVariables,
        }
      : {}),
    greeting: TELNYX_CANDIDATE_GREETING,
    instructions: createTelnyxCandidateInstructions(),
    interruption_settings: {
      disable_greeting_interruption: false,
      enable: true,
    },
    model: TELNYX_CANDIDATE_MODEL,
    name: "Willow fictional scheduling experiment",
    privacy_settings: { data_retention: options.dataRetentionEnabled ?? false },
    telephony_settings: {
      recording_settings: {
        channels: "dual",
        enabled: options.recordingEnabled ?? false,
        format: "mp3",
        stop_on_conversation_end: options.recordingEnabled ?? false,
      },
      send_message_history_updates: true,
      time_limit_secs: 180,
      user_idle_reply_secs: 10,
    },
    tools: [
      ...toolDefinitions.map((definition) => ({
        type: "webhook" as const,
        webhook: {
          async: false,
          body_parameters: definition.bodyParameters,
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
          description: "End the call after a brief closing when the change is committed, staff follow-up is recorded, identity fails, or the caller clearly asks to end it.",
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

export function spokenTelnyxCandidateGreeting(context: {
  clinicName: string;
  patientName: string;
}) {
  return TELNYX_CANDIDATE_GREETING
    .replaceAll("{{clinic_name}}", context.clinicName)
    .replaceAll("{{patient_name}}", context.patientName);
}

export function createTelnyxOpeningSpeakRequest(options: {
  commandId: string;
  payload: string;
}) {
  return {
    command_id: options.commandId,
    language: "en-US" as const,
    payload: options.payload,
    payload_type: "text" as const,
    service_level: "premium" as const,
    voice: TELNYX_MAEVE_VOICE,
    voice_settings: { voice_speed: 1 },
  };
}

export function telnyxCallTimeVariables(context: VoiceCallContext) {
  const reference = new Date(context.callStartedAt);
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.clinicTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(reference);
  const date = voiceLocalDateIso(reference);
  return {
    current_date: context.currentDateLabel,
    clinic_timezone: context.clinicTimeZone,
    call_reference: `${date} ${localTime} ${context.clinicTimeZone}`,
    tomorrow_same_time: `${addVoiceCalendarDays(date, 1)} ${localTime} ${context.clinicTimeZone}`,
  };
}

export function createTelnyxAssistantStartRequest(options: {
  assistantId: string;
  attemptId: string;
  commandId: string;
  context: VoiceCallContext;
  openingGreeting: string;
  toolToken: string;
}) {
  return {
    assistant: {
      greeting: "",
      dynamic_variables: {
        attempt_id: options.attemptId,
        clinic_name: options.context.clinicName,
        ...telnyxCallTimeVariables(options.context),
        patient_name: options.context.patientName,
        tool_token: options.toolToken,
      },
      id: options.assistantId,
    },
    command_id: options.commandId,
    greeting: "",
    message_history: [{ content: options.openingGreeting, role: "assistant" as const }],
  };
}

export function createTelnyxDialRequest(options: {
  attemptId: string;
  callToNumber: string;
  commandId: string;
  connectionId: string;
  publicBaseUrl: string;
  recordingEnabled?: boolean;
  telnyxPhoneNumber: string;
}) {
  return {
    answering_machine_detection: "disabled" as const,
    client_state: Buffer.from(JSON.stringify({ attemptId: options.attemptId })).toString("base64"),
    command_id: options.commandId,
    connection_id: options.connectionId,
    from: options.telnyxPhoneNumber,
    ...(options.recordingEnabled
      ? {
          record: "record-from-answer" as const,
          record_channels: "dual" as const,
          record_format: "mp3" as const,
          record_track: "both" as const,
        }
      : {}),
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
