import { initialAppointments } from "@/lib/demo-data";
import {
  createVoiceCallContext,
  type VoiceCallContext,
  type VoiceCallResult,
} from "@/lib/voice-call-context";

export type DemoReschedulingCaseStatus =
  | "ready"
  | "calling"
  | "proposal-ready"
  | "staff-review"
  | "rescheduled"
  | "canceled";

export type DemoReschedulingEventTone =
  | "neutral"
  | "calling"
  | "success"
  | "attention";

export type DemoReschedulingSlot = {
  id: string;
  date: string;
  provider: string;
  providerId: string;
  time: string;
};

export type DemoReschedulingEvent = {
  id: string;
  label: string;
  tone: DemoReschedulingEventTone;
};

export type DemoReschedulingCase = {
  id: string;
  status: DemoReschedulingCaseStatus;
  appointmentId: string;
  providerId: string;
  provider: string;
  unavailableDate: string;
  patient: string;
  appointmentType: string;
  originalAppointment: string;
  durationMinutes: number;
  callingWindow: string;
  selectedSlotId?: string;
  slots: DemoReschedulingSlot[];
  activity: DemoReschedulingEvent[];
  lastVoiceAttemptId?: string;
  lastVoiceResult?: VoiceCallResult;
  voiceContext: VoiceCallContext;
};

export type DemoReschedulingAction =
  | "start-test-call"
  | "record-selected-slot"
  | "record-staff-handoff"
  | "reset-demo";

export type DemoReschedulingActionResult =
  | { ok: true; reschedulingCase: DemoReschedulingCase }
  | { ok: false; message: string; reschedulingCase: DemoReschedulingCase };

function getDemoAppointment() {
  const appointment = initialAppointments.find((item) => item.id === "olivia");

  if (!appointment) {
    throw new Error("The Olivia Garcia demo appointment is required.");
  }

  return appointment;
}

const demoAppointment = getDemoAppointment();

export function createInitialDemoReschedulingCase(now: Date = new Date()): DemoReschedulingCase {
  const voiceContext = createVoiceCallContext(now);
  const slots = voiceContext.availableSlots.slice(0, 6).map((slot) => ({
    date: slot.dateLabel,
    id: slot.id,
    provider: slot.provider.name,
    providerId: slot.provider.id,
    time: slot.time,
  }));

  return {
    id: "demo-rescheduling-olivia",
    status: "ready",
    appointmentId: demoAppointment.id,
    providerId: voiceContext.appointment.provider.id,
    provider: voiceContext.appointment.provider.name,
    unavailableDate: voiceContext.appointment.dateLabel,
    patient: voiceContext.patientName,
    appointmentType: voiceContext.appointment.type,
    originalAppointment: `${voiceContext.appointment.dateLabel} at ${voiceContext.appointment.time}`,
    durationMinutes: voiceContext.appointment.durationMinutes,
    callingWindow: "10:00 AM to 5:00 PM",
    slots,
    activity: [
      {
        id: "demo-rescheduling-olivia-event-1",
        label: "Demo case created. No appointment change has been made.",
        tone: "neutral",
      },
    ],
    voiceContext,
  };
}
