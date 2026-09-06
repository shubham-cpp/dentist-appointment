import { randomUUID } from "node:crypto";
import {
  addVoiceCalendarDays,
  voiceAvailabilityHorizonDays,
  voiceClinicTimeZone,
  voiceLocalDateIso,
  type VoiceAppointment,
  type VoiceCallContext,
  type VoiceCallResult,
  type VoiceReplacementSlot,
} from "@/lib/voice-call-context";
import { z } from "zod";

export type VoiceSchedulingErrorCode =
  | "action_expired"
  | "action_not_found"
  | "attempt_terminal"
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

const operationId = z.string().min(1).max(100);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const callbackSchema = z.object({
  confirmed: z.boolean(),
  date: z.iso.date(),
  time: localTime,
  timeEnd: localTime.optional().describe("Optional end of a same-day callback window. Must be later than time."),
  timeZone: z.literal(voiceClinicTimeZone),
}).strict();

export type VoiceCallbackRequest = z.infer<typeof callbackSchema>;
const weekday = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const voiceStaffFollowUpReasonSchema = z.enum([
  "identity_problem",
  "clinical_question",
  "no_suitable_slot",
  "tool_failure",
  "caller_request",
]);

export type VoiceStaffFollowUpReason = z.infer<typeof voiceStaffFollowUpReasonSchema>;

export const voiceSchedulingToolNameSchema = z.enum([
  "verify_identity",
  "find_slots",
  "prepare_change",
  "commit_change",
  "request_staff_follow_up",
]);

export type VoiceSchedulingToolName = z.infer<typeof voiceSchedulingToolNameSchema>;

export const voiceSchedulingToolBodySchemas = {
  verify_identity: z.object({
    operationId,
    result: z.enum(["confirmed", "unclear", "wrong_person"]),
  }).strict(),
  find_slots: z.object({
    mode: z.enum(["search", "more", "repeat"]).optional().describe("search updates preferences; more advances; repeat returns the current batch unchanged."),
    clearConstraints: z.array(z.enum(["dateFrom", "dateTo", "excludedWeekdays", "minimumDaysEarlier", "timeFrom", "timeTo"])).optional().describe("Only constraints the caller explicitly withdrew. Omitted constraints remain active."),
    dateFrom: localDate.optional(),
    dateTo: localDate.optional(),
    excludedWeekdays: z.array(weekday).max(7).optional(),
    limit: z.number().int().min(1).max(3).optional(),
    minimumDaysEarlier: z.number().int().min(1).max(21).optional(),
    operationId,
    provider: z.enum(["any", "different", "same", "same_unless_earlier"]),
    timeFrom: localTime.optional(),
    timeTo: localTime.optional(),
  }).strict(),
  prepare_change: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("reschedule"),
      operationId,
      slotId: z.string().min(1),
    }).strict(),
    z.object({
      kind: z.literal("cancellation"),
      operationId,
    }).strict(),
  ]),
  commit_change: z.object({
    actionToken: z.string().min(1),
    confirmed: z.boolean(),
    operationId,
  }).strict(),
  request_staff_follow_up: z.object({
    callback: callbackSchema.optional(),
    operationId,
    reason: voiceStaffFollowUpReasonSchema,
  }).strict(),
} as const satisfies Record<VoiceSchedulingToolName, z.ZodType>;

export const voiceSchedulingToolDescriptions = {
  verify_identity: "Record whether the caller is the intended fictional patient. Use this before appointment facts.",
  find_slots: "Return up to three unused matching times within the next 21 clinic calendar days after identity confirmation. Fetch another batch only when asked for more or changed preferences. Use mode repeat to recover the current batch, more for another batch, search for changed preferences. Omitted constraints persist; clearConstraints removes withdrawn constraints.",
  prepare_change: "Prepare one server-side reschedule or cancellation. This does not change the appointment. Use the returned appointment details for readback and obtain fresh confirmation of this actionToken.",
  commit_change: "Commit only the prepared server-side action after the caller gives exact confirmation.",
  request_staff_follow_up: "Record staff follow-up. For a requested callback, use caller_request and include the future clinic date, time, optional timeEnd for a window, timezone, and explicit confirmation after readback. This demo records the request but does not schedule an actual call.",
} as const satisfies Record<VoiceSchedulingToolName, string>;

export type VoiceSchedulingCommand = {
  [Name in VoiceSchedulingToolName]: {
    name: Name;
  } & z.infer<(typeof voiceSchedulingToolBodySchemas)[Name]>;
}[VoiceSchedulingToolName];

export type VoiceSchedulingResult =
  | { currentAppointment: VoiceAppointment; result: "confirmed"; type: "identity_recorded" }
  | { result: "unclear" | "wrong_person"; type: "identity_recorded" }
  | {
      constraints: {
        dateFrom?: string;
        dateTo?: string;
        excludedWeekdays: string[];
        minimumDaysEarlier?: number;
        provider: "any" | "different" | "same" | "same_unless_earlier";
        timeFrom?: string;
        timeTo?: string;
      };
      slots: Array<{
        dateLabel: string;
        id: string;
        providerName: string;
        timeLabel: string;
      }>;
      type: "slots_found";
    }
  | {
      actionToken: string;
      currentAppointment: VoiceAppointment;
      replacement?: VoiceReplacementSlot;
      timeZone: typeof voiceClinicTimeZone;
      expiresAt: string;
      kind: "cancellation" | "reschedule";
      type: "change_prepared";
    }
  | { result: VoiceCallResult; type: "change_committed" }
  | { callback?: VoiceCallbackRequest; reason: VoiceStaffFollowUpReason; type: "staff_follow_up_recorded" };

export type VoiceSchedulingOutcome =
  | "cancelled"
  | "committing"
  | "identity_failed"
  | "pending"
  | "rescheduled"
  | "staff_follow_up"
  | "uncertain";

export type VoiceSchedulingAuthority = {
  execute(command: VoiceSchedulingCommand): Promise<VoiceSchedulingResult>;
  outcome(): VoiceSchedulingOutcome;
};

type PreparedChange =
  & {
    commit?: Promise<Extract<VoiceSchedulingResult, { type: "change_committed" }>>;
    expiresAtMs: number;
  }
  & (
    | { kind: "cancellation"; token: string }
    | { kind: "reschedule"; slot: VoiceReplacementSlot; token: string }
  );

type OperationRecord = {
  fingerprint: string;
  result: Promise<VoiceSchedulingResult>;
};

function requestFingerprint(command: VoiceSchedulingCommand) {
  return JSON.stringify(command, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
    }
    return value;
  });
}

function slotTimeMinutes(time: string) {
  const match = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(time);
  if (!match) return undefined;
  return (Number(match[1]) % 12 + (match[3]!.toUpperCase() === "PM" ? 12 : 0)) * 60
    + Number(match[2]);
}

function localTimeMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour! * 60 + minute!;
}

function slotWeekday(dateIso: string) {
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date(`${dateIso}T12:00:00.000Z`).getUTCDay()]!;
}

function calendarDaysBetween(earlier: string, later: string) {
  return (
    new Date(`${later}T12:00:00.000Z`).getTime()
    - new Date(`${earlier}T12:00:00.000Z`).getTime()
  ) / 86_400_000;
}

function compareSlots(left: VoiceReplacementSlot, right: VoiceReplacementSlot) {
  return left.dateIso.localeCompare(right.dateIso)
    || (slotTimeMinutes(left.time) ?? 0) - (slotTimeMinutes(right.time) ?? 0)
    || left.provider.name.localeCompare(right.provider.name);
}

const preparedActionLifetimeMs = 2 * 60_000;

export function createVoiceSchedulingAuthority(options: {
  applyResult?: (result: VoiceCallResult) => Promise<void> | void;
  recordStaffFollowUp?: (result: Extract<VoiceSchedulingResult, { type: "staff_follow_up_recorded" }>) => Promise<void> | void;
  context: VoiceCallContext;
  now?: () => Date;
}): VoiceSchedulingAuthority {
  const now = options.now ?? (() => new Date());
  const operations = new Map<string, OperationRecord>();
  const offeredSlotIds = new Set<string>();
  const preparedChanges = new Map<string, PreparedChange>();
  let lastSearch: Extract<VoiceSchedulingCommand, { name: "find_slots" }> | undefined;
  let lastBatch: Extract<VoiceSchedulingResult, { type: "slots_found" }> | undefined;
  let identity: "confirmed" | "unclear" | "unverified" | "wrong_person" = "unverified";
  let outcome: VoiceSchedulingOutcome = "pending";

  function invalidatePreparedChanges() {
    for (const [token, prepared] of preparedChanges) {
      if (!prepared.commit) preparedChanges.delete(token);
    }
  }

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

  function requirePendingOutcome() {
    if (outcome !== "pending") {
      throw new VoiceSchedulingError(
        "attempt_terminal",
        "This scheduling attempt already has a terminal result.",
      );
    }
  }

  async function run(command: VoiceSchedulingCommand): Promise<VoiceSchedulingResult> {
    if (command.name === "commit_change" && command.confirmed) {
      const committed = preparedChanges.get(command.actionToken)?.commit;
      if (committed) return committed;
    }
    requirePendingOutcome();

    if (command.name === "verify_identity") {
      identity = command.result;
      if (command.result === "wrong_person") outcome = "identity_failed";
      return command.result === "confirmed"
        ? {
            currentAppointment: structuredClone(options.context.appointment),
            result: command.result,
            type: "identity_recorded",
          }
        : { result: command.result, type: "identity_recorded" };
    }

    if (command.name === "request_staff_follow_up") {
      if (command.callback) {
        const callback = callbackSchema.safeParse(command.callback);
        if (!callback.success || command.reason !== "caller_request") {
          throw new VoiceSchedulingError("invalid_request", "Use a valid clinic callback time with caller_request.");
        }
        if (!callback.data.confirmed) {
          throw new VoiceSchedulingError("confirmation_required", "Confirm the callback date, time, and timezone first.");
        }
        if (callback.data.timeEnd && callback.data.timeEnd <= callback.data.time) {
          throw new VoiceSchedulingError("invalid_request", "The callback window end must follow its start on the same day.");
        }
        const current = now();
        const currentTime = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: voiceClinicTimeZone,
        }).format(current);
        if (`${callback.data.date}T${callback.data.time}` <= `${voiceLocalDateIso(current)}T${currentTime}`) {
          throw new VoiceSchedulingError("invalid_request", "The requested callback time must be in the future.");
        }
      }
      const result = {
        ...(command.callback ? { callback: structuredClone(command.callback) } : {}),
        reason: command.reason,
        type: "staff_follow_up_recorded" as const,
      };
      outcome = "committing";
      try {
        await options.recordStaffFollowUp?.(result);
      } catch (error) {
        outcome = "uncertain";
        throw error;
      }
      outcome = "staff_follow_up";
      return result;
    }

    requireIdentity();

    if (command.name === "find_slots") {
      if (command.mode === "repeat") {
        if (!lastBatch) throw new VoiceSchedulingError("invalid_request", "No slot batch exists yet. Search with the caller's preferences first.");
        return structuredClone(lastBatch);
      }
      const previous = { ...lastSearch };
      for (const key of command.clearConstraints ?? []) delete previous[key];
      const merged = { ...previous, ...command };
      // Transport controls are not preferences and must not persist into later searches.
      delete merged.mode;
      delete merged.clearConstraints;
      const search = merged;

      if (search.dateFrom && search.dateTo && search.dateFrom > search.dateTo) {
        throw new VoiceSchedulingError("invalid_request", "The start date must not follow the end date.");
      }
      if (search.timeFrom && search.timeTo
        && localTimeMinutes(search.timeFrom) > localTimeMinutes(search.timeTo)) {
        throw new VoiceSchedulingError("invalid_request", "The start time must not follow the end time.");
      }
      const preferencesChanged = lastSearch && requestFingerprint({ ...lastSearch, operationId: "search", limit: undefined })
        !== requestFingerprint({ ...search, operationId: "search", limit: undefined });
      if (preferencesChanged) offeredSlotIds.clear();
      invalidatePreparedChanges();
      lastSearch = structuredClone(search);
      const excludedWeekdays = new Set(search.excludedWeekdays ?? []);
      const callDate = voiceLocalDateIso(new Date(options.context.callStartedAt));
      const horizonDate = addVoiceCalendarDays(callDate, voiceAvailabilityHorizonDays);
      const eligibleSlots = options.context.availableSlots
        .filter((slot) => slot.dateIso > callDate && slot.dateIso <= horizonDate)
        .filter((slot) => !search.dateFrom || slot.dateIso >= search.dateFrom)
        .filter((slot) => !search.dateTo || slot.dateIso <= search.dateTo)
        .filter((slot) => !excludedWeekdays.has(slotWeekday(slot.dateIso) as never))
        .filter((slot) => {
          const minutes = slotTimeMinutes(slot.time);
          if (minutes === undefined) return false;
          return (!search.timeFrom || minutes >= localTimeMinutes(search.timeFrom))
            && (!search.timeTo || minutes <= localTimeMinutes(search.timeTo));
        })
        .sort(compareSlots);
      const currentProviderId = options.context.appointment.provider.id;
      let providerSlots: VoiceReplacementSlot[];
      if (search.provider === "same") {
        providerSlots = eligibleSlots.filter((slot) => slot.provider.id === currentProviderId);
      } else if (search.provider === "different") {
        providerSlots = eligibleSlots.filter((slot) => slot.provider.id !== currentProviderId);
      } else if (search.provider === "same_unless_earlier") {
        const same = eligibleSlots.filter((slot) => slot.provider.id === currentProviderId);
        const different = eligibleSlots.filter((slot) => slot.provider.id !== currentProviderId);
        const minimumDaysEarlier = search.minimumDaysEarlier ?? 7;
        providerSlots = same[0] && different[0]
          && calendarDaysBetween(different[0].dateIso, same[0].dateIso) >= minimumDaysEarlier
          ? different
          : same.length > 0 ? same : different;
      } else {
        providerSlots = eligibleSlots;
      }
      const limit = Math.min(search.limit ?? 3, 3);
      const selectedSlots = providerSlots
        .filter((slot) => !offeredSlotIds.has(slot.id))
        .slice(0, limit);
      for (const slot of selectedSlots) offeredSlotIds.add(slot.id);
      const slots = selectedSlots.map((slot) => ({
        dateLabel: slot.dateLabel,
        id: slot.id,
        providerName: slot.provider.name,
        timeLabel: slot.time,
      }));
      lastBatch = {
        constraints: {
          ...(search.dateFrom ? { dateFrom: search.dateFrom } : {}),
          ...(search.dateTo ? { dateTo: search.dateTo } : {}),
          excludedWeekdays: [...excludedWeekdays],
          ...(search.provider === "same_unless_earlier"
            ? { minimumDaysEarlier: search.minimumDaysEarlier ?? 7 }
            : {}),
          provider: search.provider,
          ...(search.timeFrom ? { timeFrom: search.timeFrom } : {}),
          ...(search.timeTo ? { timeTo: search.timeTo } : {}),
        },
        slots: structuredClone(slots),
        type: "slots_found",
      };
      return structuredClone(lastBatch);
    }

    if (command.name === "prepare_change") {
      invalidatePreparedChanges();
      const actionToken = `action_${randomUUID()}`;
      const expiresAtMs = now().getTime() + preparedActionLifetimeMs;
      if (command.kind === "reschedule") {
        const slot = options.context.availableSlots.find((item) => item.id === command.slotId);
        if (!slot || !offeredSlotIds.has(command.slotId)) {
          throw new VoiceSchedulingError(
            "slot_not_offered",
            "Select one replacement time returned by find_slots.",
          );
        }
        preparedChanges.set(actionToken, {
          expiresAtMs,
          kind: "reschedule",
          slot,
          token: actionToken,
        });
      } else {
        preparedChanges.set(actionToken, { expiresAtMs, kind: "cancellation", token: actionToken });
      }
      return {
        actionToken,
        currentAppointment: structuredClone(options.context.appointment),
        ...(command.kind === "reschedule"
          ? { replacement: structuredClone(options.context.availableSlots.find((slot) => slot.id === command.slotId)!) }
          : {}),
        timeZone: options.context.clinicTimeZone,
        expiresAt: new Date(expiresAtMs).toISOString(),
        kind: command.kind,
        type: "change_prepared",
      };
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
    if (!prepared.commit && now().getTime() > prepared.expiresAtMs) {
      throw new VoiceSchedulingError(
        "action_expired",
        "The prepared action expired. Check availability again before confirming.",
      );
    }
    if (!prepared.commit) {
      prepared.commit = (async () => {
        outcome = "committing";
        const result: VoiceCallResult = prepared.kind === "reschedule"
          ? {
              confirmedAt: now().toISOString(),
              kind: "rescheduled",
              previousAppointment: structuredClone(options.context.appointment),
              replacement: structuredClone(prepared.slot),
            }
          : {
              confirmedAt: now().toISOString(),
              kind: "canceled",
              previousAppointment: structuredClone(options.context.appointment),
            };
        try {
          await options.applyResult?.(result);
          outcome = result.kind === "canceled" ? "cancelled" : "rescheduled";
          return { result, type: "change_committed" };
        } catch (error) {
          outcome = "uncertain";
          throw error;
        }
      })();
    }
    return prepared.commit;
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
        return structuredClone(await existing.result);
      }
      const result = run(command).then((value) => structuredClone(value));
      operations.set(command.operationId, { fingerprint, result });
      return structuredClone(await result);
    },
    outcome() {
      return outcome;
    },
  };
}
