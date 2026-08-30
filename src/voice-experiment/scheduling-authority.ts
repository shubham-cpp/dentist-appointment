import type {
  VoiceCallContext,
  VoiceAppointment,
  VoiceCallResult,
  VoiceReplacementSlot,
} from "@/lib/voice-call-context";

export type VoiceSchedulingErrorCode =
  | "action_not_found"
  | "confirmation_required"
  | "identity_required"
  | "invalid_request"
  | "operation_conflict"
  | "slot_not_offered";

export class VoiceSchedulingError extends Error {
  constructor(
    readonly code: VoiceSchedulingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceSchedulingError";
  }
}

type BaseCommand = { operationId: string };

export type VoiceSchedulingCommand =
  | (BaseCommand & {
    name: "verify_identity";
    result: "confirmed" | "unclear" | "wrong_person";
  })
  | (BaseCommand & {
    dateIso?: string;
    limit?: number;
    name: "find_slots";
    provider: "any" | "current";
    timePreference?: "afternoon" | "evening" | "morning";
  })
  | (BaseCommand & {
    kind: "reschedule";
    name: "prepare_change";
    slotId: string;
  })
  | (BaseCommand & {
    kind: "cancellation";
    name: "prepare_change";
  })
  | (BaseCommand & {
    actionToken: string;
    confirmed: boolean;
    name: "commit_change";
  })
  | (BaseCommand & {
    name: "request_staff_follow_up";
    reason: string;
  });

export type VoiceSchedulingResult =
  | { currentAppointment: VoiceAppointment; result: "confirmed"; type: "identity_recorded" }
  | { result: "unclear" | "wrong_person"; type: "identity_recorded" }
  | { slots: VoiceReplacementSlot[]; type: "slots_found" }
  | { actionToken: string; kind: "cancellation" | "reschedule"; type: "change_prepared" }
  | { result: VoiceCallResult; type: "change_committed" }
  | { reason: string; type: "staff_follow_up_recorded" };

export type VoiceSchedulingOutcome =
  | "cancelled"
  | "pending"
  | "rescheduled"
  | "staff_follow_up";

export type VoiceSchedulingAuthority = {
  execute(command: VoiceSchedulingCommand): Promise<VoiceSchedulingResult>;
  outcome(): VoiceSchedulingOutcome;
};

type PreparedChange =
  | { kind: "cancellation"; token: string }
  | { kind: "reschedule"; slot: VoiceReplacementSlot; token: string };

type OperationRecord = {
  fingerprint: string;
  result: VoiceSchedulingResult;
};

function requestFingerprint(command: VoiceSchedulingCommand) {
  return JSON.stringify(command, Object.keys(command).sort());
}

function timeMatches(time: string, preference: "afternoon" | "evening" | "morning") {
  const match = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(time);
  if (!match) return false;
  const hour = Number(match[1]) % 12 + (match[3]!.toUpperCase() === "PM" ? 12 : 0);
  if (preference === "morning") return hour < 12;
  if (preference === "afternoon") return hour >= 12 && hour < 17;
  return hour >= 17;
}

export function createVoiceSchedulingAuthority(options: {
  applyResult?: (result: VoiceCallResult) => Promise<void> | void;
  context: VoiceCallContext;
  now?: () => Date;
}): VoiceSchedulingAuthority {
  const operations = new Map<string, OperationRecord>();
  const offeredSlotIds = new Set<string>();
  const preparedChanges = new Map<string, PreparedChange>();
  let identity: "confirmed" | "unclear" | "unverified" | "wrong_person" = "unverified";
  let outcome: VoiceSchedulingOutcome = "pending";

  function requireOperationId(operationId: string) {
    if (!operationId || operationId.length > 100) {
      throw new VoiceSchedulingError("invalid_request", "A stable operation ID is required.");
    }
  }

  function requireIdentity() {
    if (identity !== "confirmed") {
      throw new VoiceSchedulingError(
        "identity_required",
        "Confirm the intended fictional patient before accessing appointment details.",
      );
    }
  }

  async function run(command: VoiceSchedulingCommand): Promise<VoiceSchedulingResult> {
    if (command.name === "verify_identity") {
      identity = command.result;
      return command.result === "confirmed"
        ? {
            currentAppointment: structuredClone(options.context.appointment),
            result: command.result,
            type: "identity_recorded",
          }
        : { result: command.result, type: "identity_recorded" };
    }

    if (command.name === "request_staff_follow_up") {
      outcome = "staff_follow_up";
      return { reason: command.reason, type: "staff_follow_up_recorded" };
    }

    requireIdentity();

    if (command.name === "find_slots") {
      const limit = Math.min(Math.max(command.limit ?? 3, 1), 6);
      const slots = options.context.availableSlots
        .filter((slot) => (
          command.provider === "any"
          || slot.provider.id === options.context.appointment.provider.id
        ))
        .filter((slot) => !command.dateIso || slot.dateIso === command.dateIso)
        .filter((slot) => !command.timePreference || timeMatches(slot.time, command.timePreference))
        .slice(0, limit);
      for (const slot of slots) offeredSlotIds.add(slot.id);
      return { slots: structuredClone(slots), type: "slots_found" };
    }

    if (command.name === "prepare_change") {
      const actionToken = `action_${command.operationId}`;
      if (command.kind === "reschedule") {
        const slot = options.context.availableSlots.find((item) => item.id === command.slotId);
        if (!slot || !offeredSlotIds.has(command.slotId)) {
          throw new VoiceSchedulingError(
            "slot_not_offered",
            "Select one replacement time returned by find_slots.",
          );
        }
        preparedChanges.set(actionToken, { kind: "reschedule", slot, token: actionToken });
      } else {
        preparedChanges.set(actionToken, { kind: "cancellation", token: actionToken });
      }
      return { actionToken, kind: command.kind, type: "change_prepared" };
    }

    if (!command.confirmed) {
      throw new VoiceSchedulingError(
        "confirmation_required",
        "An exact caller confirmation is required before the change.",
      );
    }
    const prepared = preparedChanges.get(command.actionToken);
    if (!prepared) {
      throw new VoiceSchedulingError("action_not_found", "The prepared action is unavailable.");
    }
    const result: VoiceCallResult = prepared.kind === "reschedule"
      ? {
          confirmedAt: (options.now ?? (() => new Date()))().toISOString(),
          kind: "rescheduled",
          previousAppointment: structuredClone(options.context.appointment),
          replacement: structuredClone(prepared.slot),
        }
      : {
          confirmedAt: (options.now ?? (() => new Date()))().toISOString(),
          kind: "canceled",
          previousAppointment: structuredClone(options.context.appointment),
        };
    await options.applyResult?.(result);
    outcome = result.kind === "canceled" ? "cancelled" : "rescheduled";
    return { result, type: "change_committed" };
  }

  return {
    async execute(command) {
      requireOperationId(command.operationId);
      const fingerprint = requestFingerprint(command);
      const existing = operations.get(command.operationId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new VoiceSchedulingError(
            "operation_conflict",
            "The operation ID was already used with different input.",
          );
        }
        return structuredClone(existing.result);
      }
      const result = await run(command);
      operations.set(command.operationId, { fingerprint, result: structuredClone(result) });
      return result;
    },
    outcome() {
      return outcome;
    },
  };
}
