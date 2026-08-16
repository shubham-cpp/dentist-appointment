import { z } from "zod";
import type { ControlledVoiceAttemptOutcome } from "@/lib/controlled-voice-attempt";
import {
  slotsForProvider,
  type VoiceCallContext,
  type VoiceCallResult,
  type VoiceReplacementSlot,
} from "@/lib/voice-call-context";

const voiceIntentValues = [
  "identity_confirmed",
  "identity_denied",
  "permission_granted",
  "permission_denied",
  "prefer_same_provider",
  "prefer_other_provider",
  "select_slot",
  "reject_slots",
  "request_time",
  "confirm",
  "decline",
  "cancel",
  "ask_reason",
  "clinical_question",
  "voicemail",
  "unknown",
] as const;

export const voiceIntentModelOutputSchema = z.object({
  intent: z.enum(voiceIntentValues),
  requestedDate: z.string(),
  slotId: z.string(),
  timePreference: z.string(),
}).strict();

export const voiceIntentSchema = voiceIntentModelOutputSchema.superRefine((value, context) => {
  if (value.intent === "select_slot" && value.slotId.length === 0) {
    context.addIssue({ code: "custom", message: "A selected slot requires a slot ID.", path: ["slotId"] });
  }
  if (value.intent !== "select_slot" && value.slotId.length > 0) {
    context.addIssue({ code: "custom", message: "Only a selected slot can include a slot ID.", path: ["slotId"] });
  }
  if (value.intent === "request_time" && value.requestedDate.length === 0 && value.timePreference.length === 0) {
    context.addIssue({ code: "custom", message: "A time request requires a date or time preference." });
  }
});

export type VoiceIntent = z.infer<typeof voiceIntentSchema>;
export type VoiceIntentModelOutput = z.infer<typeof voiceIntentModelOutputSchema>;
export type VoiceConversationPhase =
  | "verify_identity"
  | "permission"
  | "provider_preference"
  | "offer_slots"
  | "open_preference"
  | "confirm_reschedule"
  | "confirm_cancel"
  | "ended";

export type VoiceConversationState = {
  offeredSlotIds: string[];
  phase: VoiceConversationPhase;
  providerPreference?: "same" | "other";
  selectedSlotId?: string;
  unclearCount: number;
};

export type VoiceConversationReply = {
  end: boolean;
  nextState: VoiceConversationState;
  outcome?: Exclude<ControlledVoiceAttemptOutcome, "none">;
  result?: VoiceCallResult;
  text: string;
};

export const staffFollowUpText = "Our team will contact you. Goodbye.";
const processingFailureText = "I’m sorry, I could not process that response.";

function blankIntent(intent: VoiceIntent["intent"]): VoiceIntent {
  return { intent, requestedDate: "", slotId: "", timePreference: "" };
}

export function initialVoiceGreeting(context: VoiceCallContext) {
  return `Hello. This is ${context.clinicName}. Am I speaking with ${context.patientName}?`;
}

export function createVoiceConversationState(): VoiceConversationState {
  return { offeredSlotIds: [], phase: "verify_identity", unclearCount: 0 };
}

function endedReply(
  text: string,
  outcome: Exclude<ControlledVoiceAttemptOutcome, "none">,
  result?: VoiceCallResult,
): VoiceConversationReply {
  return {
    end: true,
    nextState: { offeredSlotIds: [], phase: "ended", unclearCount: 0 },
    outcome,
    result,
    text,
  };
}

function continueReply(
  state: VoiceConversationState,
  text: string,
  changes: Partial<VoiceConversationState>,
): VoiceConversationReply {
  return {
    end: false,
    nextState: { ...state, unclearCount: 0, ...changes },
    text,
  };
}

function unclearReply(
  state: VoiceConversationState,
  question: string,
  outcome: Exclude<ControlledVoiceAttemptOutcome, "none"> = "staff_follow_up",
): VoiceConversationReply {
  if (state.unclearCount >= 2) {
    return endedReply(`${processingFailureText} Our team will contact you`, outcome);
  }

  return {
    end: false,
    nextState: { ...state, unclearCount: state.unclearCount + 1 },
    text: `${processingFailureText} ${question}`,
  };
}

function slotById(context: VoiceCallContext, slotId: string | undefined) {
  return context.availableSlots.find((slot) => slot.id === slotId);
}

function providerQuestion(context: VoiceCallContext) {
  return `Your ${context.appointment.type} on ${context.appointment.dateLabel} at ${context.appointment.time} needs a new time because ${context.appointment.provider.name} is unavailable. Would you prefer to stay with ${context.appointment.provider.name}, which might mean a later appointment, or see another qualified dentist sooner?`;
}

function slotListQuestion(slots: VoiceReplacementSlot[]) {
  const choices = slots.map((slot, index) => {
    const order = ["First", "Second", "Third"][index] ?? `Option ${index + 1}`;
    return `${order}, ${slot.dateLabel} at ${slot.time} with ${slot.provider.name}.`;
  }).join(" ");
  return `I have ${slots.length} available ${slots.length === 1 ? "time" : "times"}. ${choices} Which time works best?`;
}

function offeredSlotsReply(
  context: VoiceCallContext,
  state: VoiceConversationState,
  providerPreference: "same" | "other",
  slots?: VoiceReplacementSlot[],
) {
  const providerId = providerPreference === "same"
    ? context.appointment.provider.id
    : context.availableSlots.find((slot) => slot.provider.id !== context.appointment.provider.id)?.provider.id;
  const offered = slots ?? (providerId ? slotsForProvider(context, providerId) : []);

  if (offered.length === 0 && providerPreference === "same") {
    return continueReply(
      state,
      `I could not find a time with ${context.appointment.provider.name} during the next three weeks. Would another qualified dentist be acceptable?`,
      { phase: "provider_preference", providerPreference: "same" },
    );
  }

  if (offered.length === 0) {
    return endedReply("I could not find an eligible time during the next three weeks. Our team will contact you. Goodbye.", "staff_follow_up");
  }

  return continueReply(state, slotListQuestion(offered), {
    offeredSlotIds: offered.map((slot) => slot.id),
    phase: "offer_slots",
    providerPreference,
  });
}

function confirmationQuestion(context: VoiceCallContext, slot: VoiceReplacementSlot) {
  return `To confirm, I will move your ${context.appointment.type} from ${context.appointment.dateLabel} at ${context.appointment.time} with ${context.appointment.provider.name}. The new appointment will be ${slot.dateLabel} at ${slot.time} with ${slot.provider.name}. Is that correct?`;
}

function cancellationQuestion(context: VoiceCallContext) {
  return `To confirm, you want to cancel your ${context.appointment.type} on ${context.appointment.dateLabel} at ${context.appointment.time} with ${context.appointment.provider.name}. You do not want another time. Is that correct?`;
}

function selectSlotReply(
  context: VoiceCallContext,
  state: VoiceConversationState,
  slotId: string,
) {
  const selected = slotById(context, slotId);
  if (!selected || !state.offeredSlotIds.includes(selected.id)) {
    return unclearReply(state, "Please choose the first, second, or third offered time.");
  }

  return continueReply(state, confirmationQuestion(context, selected), {
    phase: "confirm_reschedule",
    selectedSlotId: selected.id,
  });
}

function requestTimeReply(
  context: VoiceCallContext,
  state: VoiceConversationState,
  intent: VoiceIntent,
) {
  const providerId = state.providerPreference === "other"
    ? context.availableSlots.find((slot) => slot.provider.id !== context.appointment.provider.id)?.provider.id
    : context.appointment.provider.id;
  const matches = context.availableSlots.filter((slot) => (
    slot.provider.id === providerId
    && (!intent.requestedDate || slot.dateIso === intent.requestedDate)
    && matchesTimePreference(slot.time, intent.timePreference)
  )).slice(0, 3);

  if (matches.length > 0) {
    return offeredSlotsReply(context, state, state.providerPreference ?? "same", matches);
  }

  const nearest = context.availableSlots.filter((slot) => slot.provider.id === providerId).slice(0, 3);
  if (intent.requestedDate) {
    return continueReply(state, `That date is not available. ${slotListQuestion(nearest)}`, {
      offeredSlotIds: nearest.map((slot) => slot.id),
      phase: "offer_slots",
    });
  }

  return unclearReply(state, "What day or time during the next three weeks would suit you?");
}

function matchesTimePreference(slotTime: string, preference: string) {
  if (!preference) return true;
  const normalized = preference.trim().toLowerCase();
  const [clock, meridiem] = slotTime.split(" ");
  const [rawHour, minute] = clock!.split(":").map(Number);
  const hour = meridiem === "PM" && rawHour !== 12 ? rawHour + 12
    : meridiem === "AM" && rawHour === 12 ? 0
      : rawHour;
  if (normalized === "morning") return hour < 12;
  if (normalized === "afternoon") return hour >= 12 && hour < 17;
  if (normalized === "evening") return hour >= 17;
  const normalizedSlot = `${hour}:${String(minute).padStart(2, "0")}`;
  return slotTime.toLowerCase().includes(normalized) || normalized.includes(normalizedSlot);
}

export function classifyLocalVoiceIntent(
  state: VoiceConversationState,
  callerText: string,
): VoiceIntent | undefined {
  const text = callerText.trim().toLowerCase().replace(/[.!?]+$/g, "");
  const yes = /^(yes|yes,? .+|correct|that is correct|that's correct|sounds good|okay|ok)$/i.test(text);
  const no = /^(no|nope|not now|that is not correct|that's not correct)$/i.test(text);

  if (/\b(cancel|cancel it|cancel the appointment)\b/i.test(text)) return blankIntent("cancel");

  if (state.phase === "verify_identity") {
    if (yes || /\b(this is|speaking|i am) olivia\b/i.test(text)) return blankIntent("identity_confirmed");
    if (no || /\bwrong (person|number)\b/i.test(text)) return blankIntent("identity_denied");
  }

  if (state.phase === "permission") {
    if (yes) return blankIntent("permission_granted");
    if (no) return blankIntent("permission_denied");
  }

  if (state.phase === "provider_preference") {
    if (/\b(same|current|dr patel|aisha patel|keep)\b/i.test(text)) return blankIntent("prefer_same_provider");
    if (/\b(other|another|different|earlier|sooner)\b/i.test(text) || yes && state.providerPreference === "same") {
      return blankIntent("prefer_other_provider");
    }
  }

  if (state.phase === "offer_slots") {
    const option = /\b(first|1st|one)\b/i.test(text) ? 0
      : /\b(second|2nd|two)\b/i.test(text) ? 1
        : /\b(third|3rd|three)\b/i.test(text) ? 2
          : -1;
    if (option >= 0 && state.offeredSlotIds[option]) {
      return { ...blankIntent("select_slot"), slotId: state.offeredSlotIds[option] };
    }
    if (no || /\b(none|neither|do not work|don't work)\b/i.test(text)) return blankIntent("reject_slots");
  }

  if (["confirm_reschedule", "confirm_cancel"].includes(state.phase)) {
    if (yes) return blankIntent("confirm");
    if (no) return blankIntent("decline");
  }

  return undefined;
}

export function applyVoiceIntent(
  context: VoiceCallContext,
  state: VoiceConversationState,
  intent: VoiceIntent,
  confirmedAt = new Date().toISOString(),
): VoiceConversationReply {
  if (state.phase === "ended") return endedReply(staffFollowUpText, "staff_follow_up");

  if (intent.intent === "voicemail") {
    return endedReply(`This is ${context.clinicName}. Please call our office when convenient. Goodbye.`, "voicemail_or_uncertain");
  }
  if (intent.intent === "clinical_question") {
    return endedReply("I cannot provide clinical advice. Our team will contact you. Goodbye.", "staff_follow_up");
  }
  if (intent.intent === "cancel" && state.phase !== "confirm_cancel") {
    return continueReply(state, cancellationQuestion(context), { phase: "confirm_cancel" });
  }

  if (state.phase === "verify_identity") {
    if (intent.intent === "identity_confirmed") {
      return continueReply(state, "Thank you. Is now a good time to choose a new appointment time?", { phase: "permission" });
    }
    if (intent.intent === "identity_denied") {
      return endedReply(`Thank you. Please ask the intended patient to contact ${context.clinicName}. Goodbye.`, "identity_failed");
    }
    return unclearReply(state, `Am I speaking with ${context.patientName}?`, "identity_failed");
  }

  if (state.phase === "permission") {
    if (intent.intent === "permission_granted") {
      return continueReply(state, providerQuestion(context), { phase: "provider_preference" });
    }
    if (intent.intent === "permission_denied") {
      return endedReply("Understood. Our team will contact you at another time. Goodbye.", "staff_follow_up");
    }
    if (intent.intent === "ask_reason") {
      return continueReply(state, `${context.appointment.provider.name} is unavailable for your current appointment. Is now a good time to choose a new time?`, {});
    }
    return unclearReply(state, "Is now a good time to choose a new appointment time?");
  }

  if (state.phase === "provider_preference") {
    if (intent.intent === "prefer_same_provider") return offeredSlotsReply(context, state, "same");
    if (intent.intent === "prefer_other_provider") return offeredSlotsReply(context, state, "other");
    if (intent.intent === "ask_reason") return continueReply(state, providerQuestion(context), {});
    return unclearReply(state, `Would you prefer ${context.appointment.provider.name}, or another qualified dentist sooner?`);
  }

  if (state.phase === "offer_slots") {
    if (intent.intent === "select_slot") return selectSlotReply(context, state, intent.slotId);
    if (intent.intent === "reject_slots") {
      return continueReply(state, "What day or time during the next three weeks would suit you?", { phase: "open_preference" });
    }
    if (intent.intent === "request_time") return requestTimeReply(context, state, intent);
    return unclearReply(state, "Please choose one of the three times, or tell me that none work.");
  }

  if (state.phase === "open_preference") {
    if (intent.intent === "request_time") return requestTimeReply(context, state, intent);
    return unclearReply(state, "What day or time during the next three weeks would suit you?");
  }

  if (state.phase === "confirm_cancel") {
    if (intent.intent === "confirm") {
      return endedReply("I’m sorry for the inconvenience. Your appointment has been canceled.", "canceled", {
        confirmedAt,
        kind: "canceled",
        previousAppointment: context.appointment,
      });
    }
    if (intent.intent === "decline") {
      return continueReply(state, providerQuestion(context), { phase: "provider_preference" });
    }
    return unclearReply(state, "Do you want to cancel this appointment?");
  }

  const selected = slotById(context, state.selectedSlotId);
  if (!selected) return endedReply(staffFollowUpText, "staff_follow_up");
  if (intent.intent === "confirm") {
    return endedReply(`Your appointment has been moved to ${selected.dateLabel} at ${selected.time} with ${selected.provider.name}. Goodbye.`, "rescheduled", {
      confirmedAt,
      kind: "rescheduled",
      previousAppointment: context.appointment,
      replacement: selected,
    });
  }
  if (intent.intent === "decline") {
    return offeredSlotsReply(context, state, state.providerPreference ?? "same");
  }
  return unclearReply(state, "Is that appointment change correct?");
}
