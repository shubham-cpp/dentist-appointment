import "server-only";

import {
  createInitialDemoReschedulingCase,
  type DemoReschedulingAction,
  type DemoReschedulingActionResult,
  type DemoReschedulingCase,
  type DemoReschedulingEventTone,
} from "@/lib/demo-rescheduling-types";
import type { VoiceCallResult } from "@/lib/voice-call-context";

type DemoReschedulingStore = {
  reschedulingCase: DemoReschedulingCase;
};

const demoGlobal = globalThis as typeof globalThis & {
  dentistManagementDemoReschedulingStore?: DemoReschedulingStore;
};

function getStore(): DemoReschedulingStore {
  if (!demoGlobal.dentistManagementDemoReschedulingStore) {
    demoGlobal.dentistManagementDemoReschedulingStore = {
      reschedulingCase: createInitialDemoReschedulingCase(),
    };
  }

  return demoGlobal.dentistManagementDemoReschedulingStore;
}

function snapshot(reschedulingCase: DemoReschedulingCase): DemoReschedulingCase {
  return structuredClone(reschedulingCase);
}

function withActivity(
  reschedulingCase: DemoReschedulingCase,
  label: string,
  tone: DemoReschedulingEventTone,
): DemoReschedulingCase {
  return {
    ...reschedulingCase,
    activity: [
      {
        id: `${reschedulingCase.id}-event-${reschedulingCase.activity.length + 1}`,
        label,
        tone,
      },
      ...reschedulingCase.activity,
    ],
  };
}

function save(reschedulingCase: DemoReschedulingCase): DemoReschedulingActionResult {
  getStore().reschedulingCase = reschedulingCase;
  return { ok: true, reschedulingCase: snapshot(reschedulingCase) };
}

function fail(message: string): DemoReschedulingActionResult {
  return { ok: false, message, reschedulingCase: snapshot(getStore().reschedulingCase) };
}

export function getDemoReschedulingCase(): DemoReschedulingCase {
  return snapshot(getStore().reschedulingCase);
}

export function applyVoiceCallResult(
  attemptId: string,
  result: VoiceCallResult,
): DemoReschedulingCase {
  const current = getStore().reschedulingCase;
  if (current.lastVoiceAttemptId === attemptId) return snapshot(current);
  if (result.previousAppointment.id !== current.appointmentId) return snapshot(current);

  if (result.kind === "rescheduled") {
    const slot = {
      date: result.replacement.dateLabel,
      id: result.replacement.id,
      provider: result.replacement.provider.name,
      providerId: result.replacement.provider.id,
      time: result.replacement.time,
    };
    const updated = withActivity({
      ...current,
      lastVoiceAttemptId: attemptId,
      lastVoiceResult: structuredClone(result),
      originalAppointment: `${slot.date} at ${slot.time}`,
      provider: slot.provider,
      providerId: slot.providerId,
      selectedSlotId: slot.id,
      slots: current.slots.some((candidate) => candidate.id === slot.id)
        ? current.slots
        : [slot, ...current.slots],
      status: "rescheduled",
    }, `Appointment moved to ${slot.date} at ${slot.time} with ${slot.provider}.`, "success");
    getStore().reschedulingCase = updated;
    return snapshot(updated);
  }

  const updated = withActivity({
    ...current,
    lastVoiceAttemptId: attemptId,
    lastVoiceResult: structuredClone(result),
    selectedSlotId: undefined,
    status: "canceled",
  }, `Appointment canceled. ${result.previousAppointment.dateLabel} at ${result.previousAppointment.time} is available again.`, "attention");
  getStore().reschedulingCase = updated;
  return snapshot(updated);
}

export function updateDemoReschedulingCase(
  action: DemoReschedulingAction,
  selectedSlotId?: string,
): DemoReschedulingActionResult {
  const current = getStore().reschedulingCase;

  if (action === "reset-demo") {
    return save(createInitialDemoReschedulingCase());
  }

  if (action === "start-test-call") {
    if (current.status !== "ready") {
      return fail("Reset the demo before starting another test call.");
    }

    return save(withActivity({
      ...current,
      status: "calling",
    }, "Test call simulation started. No patient call was placed.", "calling"));
  }

  if (action === "record-selected-slot") {
    if (current.status !== "calling") {
      return fail("Start the test call before recording a selected slot.");
    }

    const selectedSlot = current.slots.find((slot) => slot.id === selectedSlotId);
    if (!selectedSlot) {
      return fail("Choose one of the approved replacement times first.");
    }

    return save(withActivity({
      ...current,
      status: "proposal-ready",
      selectedSlotId: selectedSlot.id,
    }, `Simulated patient choice recorded for ${selectedSlot.date} at ${selectedSlot.time}. Staff review is still required.`, "success"));
  }

  if (action === "record-staff-handoff") {
    if (current.status !== "calling") {
      return fail("Start the test call before recording a staff handoff.");
    }

    return save(withActivity({
      ...current,
      status: "staff-review",
      selectedSlotId: undefined,
    }, "Simulated patient requested staff follow-up. No appointment change has been made.", "attention"));
  }

  return fail("The requested demo action is not available.");
}
