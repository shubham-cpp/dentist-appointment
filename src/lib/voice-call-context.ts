import { z } from "zod";

export const voiceClinicTimeZone = "America/New_York";
export const voiceAvailabilityHorizonDays = 21;

export type VoiceProvider = {
  id: string;
  name: string;
};

export type VoiceAppointment = {
  dateIso: string;
  dateLabel: string;
  durationMinutes: number;
  id: string;
  provider: VoiceProvider;
  time: string;
  type: string;
};

export type VoiceReplacementSlot = {
  dateIso: string;
  dateLabel: string;
  id: string;
  provider: VoiceProvider;
  time: string;
};

export type VoiceCallContext = {
  appointment: VoiceAppointment;
  availableSlots: VoiceReplacementSlot[];
  callStartedAt: string;
  clinicName: string;
  clinicTimeZone: typeof voiceClinicTimeZone;
  currentDateLabel: string;
  patientFirstName: string;
  patientName: string;
};

export type VoiceCallResult =
  | {
    confirmedAt: string;
    kind: "rescheduled";
    previousAppointment: VoiceAppointment;
    replacement: VoiceReplacementSlot;
  }
  | {
    confirmedAt: string;
    kind: "canceled";
    previousAppointment: VoiceAppointment;
  };

const voiceProviderSchema = z.object({ id: z.string().min(1), name: z.string().min(1) }).strict();
const voiceAppointmentSchema = z.object({
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateLabel: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  id: z.string().min(1),
  provider: voiceProviderSchema,
  time: z.string().min(1),
  type: z.string().min(1),
}).strict();
const voiceReplacementSlotSchema = z.object({
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateLabel: z.string().min(1),
  id: z.string().min(1),
  provider: voiceProviderSchema,
  time: z.string().min(1),
}).strict();

export const voiceCallContextSchema = z.object({
  appointment: voiceAppointmentSchema,
  availableSlots: z.array(voiceReplacementSlotSchema).min(1).max(64),
  callStartedAt: z.string().datetime(),
  clinicName: z.string().min(1).max(100),
  clinicTimeZone: z.literal(voiceClinicTimeZone),
  currentDateLabel: z.string().min(1),
  patientFirstName: z.string().min(1).max(100),
  patientName: z.string().min(1).max(200),
}).strict();

export const voiceCallResultSchema = z.discriminatedUnion("kind", [
  z.object({
    confirmedAt: z.string().datetime(),
    kind: z.literal("rescheduled"),
    previousAppointment: voiceAppointmentSchema,
    replacement: voiceReplacementSlotSchema,
  }).strict(),
  z.object({
    confirmedAt: z.string().datetime(),
    kind: z.literal("canceled"),
    previousAppointment: voiceAppointmentSchema,
  }).strict(),
]);

const currentProvider: VoiceProvider = { id: "patel", name: "Dr Aisha Patel" };
const alternateProvider: VoiceProvider = { id: "chen", name: "Dr Brian Chen" };

function zonedDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: voiceClinicTimeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return { day: value("day")!, month: value("month")!, year: value("year")! };
}

export function voiceLocalDateIso(now: Date) {
  const { day, month, year } = zonedDateParts(now);
  return `${year}-${month}-${day}`;
}

export function addVoiceCalendarDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatVoiceDate(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function weekday(dateIso: string) {
  return new Date(`${dateIso}T12:00:00.000Z`).getUTCDay();
}

function slotId(providerId: string, dateIso: string, time: string) {
  return `${providerId}-${dateIso}-${time.replace(/[^0-9]/g, "")}`;
}

function replacementSlot(
  provider: VoiceProvider,
  dateIso: string,
  time: string,
): VoiceReplacementSlot {
  return {
    dateIso,
    dateLabel: formatVoiceDate(dateIso),
    id: slotId(provider.id, dateIso, time),
    provider,
    time,
  };
}

function buildAvailableSlots(callDateIso: string, appointmentDateIso: string) {
  const slots: VoiceReplacementSlot[] = [];

  for (let offset = 1; offset <= voiceAvailabilityHorizonDays; offset += 1) {
    const dateIso = addVoiceCalendarDays(callDateIso, offset);
    if (dateIso === appointmentDateIso) continue;

    const day = weekday(dateIso);
    if ([1, 3, 5].includes(day)) {
      slots.push(replacementSlot(currentProvider, dateIso, day === 3 ? "2:00 PM" : "10:30 AM"));
    }
    if ([2, 4].includes(day)) {
      slots.push(replacementSlot(alternateProvider, dateIso, day === 2 ? "9:00 AM" : "3:00 PM"));
    }
  }

  return slots;
}

export function createVoiceCallContext(now: Date = new Date()): VoiceCallContext {
  const callDateIso = voiceLocalDateIso(now);
  const appointmentDateIso = addVoiceCalendarDays(callDateIso, 2);
  const appointment: VoiceAppointment = {
    dateIso: appointmentDateIso,
    dateLabel: formatVoiceDate(appointmentDateIso),
    durationMinutes: 60,
    id: "olivia",
    provider: currentProvider,
    time: "1:00 PM",
    type: "crown fitting",
  };

  return {
    appointment,
    availableSlots: buildAvailableSlots(callDateIso, appointmentDateIso),
    callStartedAt: now.toISOString(),
    clinicName: "Brightview Dental",
    clinicTimeZone: voiceClinicTimeZone,
    currentDateLabel: formatVoiceDate(callDateIso),
    patientFirstName: "Olivia",
    patientName: "Olivia Garcia",
  };
}

export function slotsForProvider(
  context: VoiceCallContext,
  providerId: string,
  limit = 3,
) {
  return context.availableSlots.filter((slot) => slot.provider.id === providerId).slice(0, limit);
}
