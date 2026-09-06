import type { Appointment, BookingRequest } from "./demo-data";

export type CalendarView = "day" | "week";
export type CalendarScope = "focus" | "team";
export type CalendarLayer = "schedule" | "capacity" | "requests";
export type CalendarLayers = Record<CalendarLayer, boolean>;
export type CalendarSelection = { kind: "appointment" | "request"; id: string } | null;
export type CalendarSelectionWire = `${Exclude<CalendarSelection, null>["kind"]}:${string}`;
export type CalendarNotificationState = "not_requested" | "queued" | "sent" | "failed";
export type CalendarAuditEvent = {
  id: string;
  operationId: string;
  occurredAtMs: number;
  summary: string;
  type: "committed" | "reverted";
};
type CalendarOperationBase = {
  id: string;
  notificationRequested: boolean;
  reversalSummary: string;
  summary: string;
};
export type CalendarOperation =
  | (CalendarOperationBase & {
    kind: "creation";
    appointment: Appointment;
  })
  | (CalendarOperationBase & {
    kind: "reschedule";
    appointmentId: string;
    fromProviderId: string;
    fromStartMinutes: number;
    reason: string;
    toProviderId: string;
    toStartMinutes: number;
  })
  | (CalendarOperationBase & {
    kind: "cancellation";
    appointmentId: string;
    previousStatus: Appointment["status"];
    reason: string;
  })
  | (CalendarOperationBase & {
    kind: "request-decision";
    action: "approve" | "decline" | "contact";
    createdAppointmentId?: string;
    previousProviderId?: string;
    previousStartMinutes?: number;
    previousStatus?: BookingRequest["status"];
    request: BookingRequest;
  });
type CalendarOperationWithAudit = { auditEvents: CalendarAuditEvent[] };
export type CalendarOperationState =
  | ({ status: "idle" } & CalendarOperationWithAudit)
  | ({ status: "previewing"; operation: CalendarOperation } & CalendarOperationWithAudit)
  | ({ status: "invalid"; issue: string; operation: CalendarOperation } & CalendarOperationWithAudit)
  | ({ status: "ready"; operation: CalendarOperation } & CalendarOperationWithAudit)
  | ({ status: "committing"; operation: CalendarOperation } & CalendarOperationWithAudit)
  | ({
    status: "committed";
    committedAtMs: number;
    notification: CalendarNotificationState;
    operation: CalendarOperation;
    undoUntilMs: number;
  } & CalendarOperationWithAudit)
  | ({
    status: "reverted";
    notification: CalendarNotificationState;
    operation: CalendarOperation;
    revertedAtMs: number;
  } & CalendarOperationWithAudit);

export const DEMO_CALENDAR_CLOCK = {
  nowMs: Date.UTC(2023, 7, 8, 10, 48),
  undoWindowMs: 5 * 60_000,
} as const;

export const CALENDAR_WEEK_DAYS = [
  { date: "2023-08-07", offset: -1, short: "Mon, 7 Aug", compact: "Mon 7 Aug", long: "Monday, 7 August 2023" },
  { date: "2023-08-08", offset: 0, short: "Tue, 8 Aug", compact: "Tue 8 Aug", long: "Tuesday, 8 August 2023" },
  { date: "2023-08-09", offset: 1, short: "Wed, 9 Aug", compact: "Wed 9 Aug", long: "Wednesday, 9 August 2023" },
  { date: "2023-08-10", offset: 2, short: "Thu, 10 Aug", compact: "Thu 10 Aug", long: "Thursday, 10 August 2023" },
  { date: "2023-08-11", offset: 3, short: "Fri, 11 Aug", compact: "Fri 11 Aug", long: "Friday, 11 August 2023" },
] as const;

export const PRACTICE_DAY = CALENDAR_WEEK_DAYS[1];
export const PRACTICE_TIME_MINUTES = 10 * 60 + 48;

const calendarLayers: CalendarLayer[] = ["schedule", "capacity", "requests"];

export function createIdleCalendarOperationState(
  auditEvents: CalendarAuditEvent[] = [],
): Extract<CalendarOperationState, { status: "idle" }> {
  return { status: "idle", auditEvents };
}

export function startCalendarOperationPreview(
  current: CalendarOperationState,
  operation: CalendarOperation,
): Extract<CalendarOperationState, { status: "previewing" }> {
  return { status: "previewing", operation, auditEvents: current.auditEvents };
}

export function resolveCalendarOperationPreview(
  current: Extract<CalendarOperationState, { status: "previewing" }>,
  validation: { ok: boolean; message: string },
): Extract<CalendarOperationState, { status: "invalid" | "ready" }> {
  if (!validation.ok) {
    return {
      status: "invalid",
      operation: current.operation,
      issue: validation.message,
      auditEvents: current.auditEvents,
    };
  }
  return { status: "ready", operation: current.operation, auditEvents: current.auditEvents };
}

export function beginCalendarOperationCommit(
  current: Extract<CalendarOperationState, { status: "ready" }>,
): Extract<CalendarOperationState, { status: "committing" }> {
  return { status: "committing", operation: current.operation, auditEvents: current.auditEvents };
}

export function completeCalendarOperationCommit(
  current: Extract<CalendarOperationState, { status: "committing" }>,
  committedAtMs = DEMO_CALENDAR_CLOCK.nowMs,
): Extract<CalendarOperationState, { status: "committed" }> {
  const auditEvent: CalendarAuditEvent = {
    id: `${current.operation.id}:committed`,
    operationId: current.operation.id,
    occurredAtMs: committedAtMs,
    summary: current.operation.summary,
    type: "committed",
  };
  return {
    status: "committed",
    operation: current.operation,
    committedAtMs,
    undoUntilMs: committedAtMs + DEMO_CALENDAR_CLOCK.undoWindowMs,
    notification: current.operation.notificationRequested ? "queued" : "not_requested",
    auditEvents: [...current.auditEvents, auditEvent],
  };
}

export function updateCalendarOperationNotification(
  current: Extract<CalendarOperationState, { status: "committed" | "reverted" }>,
  notification: Extract<CalendarNotificationState, "sent" | "failed">,
): typeof current {
  if (!current.operation.notificationRequested) return current;
  return { ...current, notification };
}

export function revertCalendarOperation(
  current: Extract<CalendarOperationState, { status: "committed" }>,
  revertedAtMs = DEMO_CALENDAR_CLOCK.nowMs,
):
  | { ok: true; state: Extract<CalendarOperationState, { status: "reverted" }> }
  | { ok: false; error: string; state: Extract<CalendarOperationState, { status: "committed" }> } {
  if (revertedAtMs > current.undoUntilMs) {
    return { ok: false, error: "The demo undo window has expired.", state: current };
  }
  const auditEvent: CalendarAuditEvent = {
    id: `${current.operation.id}:reverted`,
    operationId: current.operation.id,
    occurredAtMs: revertedAtMs,
    summary: current.operation.reversalSummary,
    type: "reverted",
  };
  return {
    ok: true,
    state: {
      status: "reverted",
      operation: current.operation,
      notification: current.notification,
      revertedAtMs,
      auditEvents: [...current.auditEvents, auditEvent],
    },
  };
}

export type CalendarWorkspaceContext = {
  dateOffset: number;
  focusedProviderId: string;
  layers: CalendarLayers;
  scope: CalendarScope;
  view: CalendarView;
  visibleProviderIds: string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseCalendarSelection(value: string | undefined): CalendarSelection {
  if (!value) return null;
  const match = /^(appointment|request):([a-z0-9][a-z0-9_-]*)$/.exec(value);
  if (!match) return null;
  return { kind: match[1] as Exclude<CalendarSelection, null>["kind"], id: match[2] };
}

export function formatCalendarSelection(selection: Exclude<CalendarSelection, null>): CalendarSelectionWire {
  return `${selection.kind}:${selection.id}`;
}

export function parseCalendarWorkspaceContext(
  params: SearchParams,
  validProviderIds: readonly string[],
): CalendarWorkspaceContext {
  const view = firstParam(params.view) === "week" ? "week" : "day";
  const scope = firstParam(params.scope) === "team" ? "team" : "focus";
  const requestedDate = firstParam(params.date);
  const dateOffset = CALENDAR_WEEK_DAYS.find((day) => day.date === requestedDate)?.offset ?? PRACTICE_DAY.offset;
  const requestedProvider = firstParam(params.provider);
  const focusedProviderId = validProviderIds.includes(requestedProvider ?? "")
    ? requestedProvider!
    : validProviderIds[0] ?? "";

  const requestedProviders = (firstParam(params.providers) ?? "")
    .split(",")
    .filter((providerId) => validProviderIds.includes(providerId));
  const visibleProviderIds = requestedProviders.length > 0
    ? Array.from(new Set(requestedProviders))
    : [...validProviderIds];

  const requestedLayers = firstParam(params.layers);
  const enabledLayers = requestedLayers === "none"
    ? []
    : (requestedLayers ?? "")
      .split(",")
      .filter((layer): layer is CalendarLayer => calendarLayers.includes(layer as CalendarLayer));
  const layers = Object.fromEntries(
    calendarLayers.map((layer) => [layer, requestedLayers === undefined || enabledLayers.includes(layer)]),
  ) as CalendarLayers;

  return { dateOffset, focusedProviderId, layers, scope, view, visibleProviderIds };
}

export function resolveCalendarSelection(
  selectedId: string | undefined,
  appointments: readonly Appointment[],
  requests: readonly BookingRequest[],
): { missing: boolean; selection: CalendarSelection } {
  if (!selectedId) return { missing: false, selection: null };

  const parsed = parseCalendarSelection(selectedId);
  if (!parsed) return { missing: true, selection: null };

  if (parsed.kind === "appointment" && appointments.some((item) => item.id === parsed.id)) {
    return { missing: false, selection: parsed };
  }
  if (parsed.kind === "request" && requests.some((item) => item.id === parsed.id)) {
    return { missing: false, selection: parsed };
  }

  return { missing: true, selection: null };
}

export function updateCalendarWorkspaceSearchParams(
  currentSearch: string,
  context: CalendarWorkspaceContext,
  selection?: CalendarSelection | undefined,
) {
  const params = new URLSearchParams(currentSearch);
  const activeDate = CALENDAR_WEEK_DAYS.find((day) => day.offset === context.dateOffset) ?? PRACTICE_DAY;
  const enabledLayers = calendarLayers.filter((layer) => context.layers[layer]);

  params.set("date", activeDate.date);
  params.set("view", context.view);
  params.set("scope", context.scope);
  params.set("provider", context.focusedProviderId);
  params.set("providers", context.visibleProviderIds.join(","));
  params.set("layers", enabledLayers.length > 0 ? enabledLayers.join(",") : "none");

  if (selection === null) params.delete("selected");
  if (selection) params.set("selected", formatCalendarSelection(selection));
  params.delete("new");

  return params.toString();
}
