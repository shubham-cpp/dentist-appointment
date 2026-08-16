"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  initialAppointments,
  initialRequests,
  minutesToTime,
  providers,
  weekCapacity,
  type Appointment,
  type BookingRequest,
  type Provider,
} from "@/lib/demo-data";
import { Icon } from "./icon";
import { MarkdownNoteEditor } from "./markdown-note-editor";

type CalendarView = "day" | "week";
type CalendarScope = "focus" | "team";
type CalendarMotionIntent = "none" | "previous" | "next" | "range" | "scope" | "context";
type CalendarLayer = "schedule" | "capacity" | "requests";
type CalendarLayers = Record<CalendarLayer, boolean>;
type Selection = { kind: "appointment" | "request"; id: string } | null;
type DetailMode = "selection" | "new" | "find-slot" | "cancel";
type RequestDecision = "approve" | "decline" | "contact";
type ScheduleCheck = { ok: true; message: string } | { ok: false; message: string };
type PendingMove = {
  appointmentId: string;
  fromProviderId: string;
  toProviderId: string;
  fromStartMinutes: number;
  toStartMinutes: number;
};
type LastCancellation = { appointmentId: string; previousStatus: Appointment["status"]; reason: string; notifyPatient: boolean };
type LastRequestDecision = {
  action: RequestDecision;
  request: BookingRequest;
  createdAppointmentId?: string;
  previousStatus?: BookingRequest["status"];
  previousProviderId?: string;
  previousStartMinutes?: number;
  summary: string;
};

const DAY_START = 480;
const DAY_END = 1020;
const PIXELS_PER_MINUTE = 1.18;
const TIMELINE_HEIGHT = (DAY_END - DAY_START) * PIXELS_PER_MINUTE;
const ROOT_FONT_PIXELS = 16;
const HOUR_MARKS = Array.from({ length: 10 }, (_, index) => DAY_START + index * 60);
const WEEK_DAYS = [
  { offset: -3, short: "Mon, 7 Aug", compact: "Mon 7 Aug", long: "Monday, 7 August 2023" },
  { offset: -2, short: "Tue, 8 Aug", compact: "Tue 8 Aug", long: "Tuesday, 8 August 2023" },
  { offset: -1, short: "Wed, 9 Aug", compact: "Wed 9 Aug", long: "Wednesday, 9 August 2023" },
  { offset: 0, short: "Thu, 10 Aug", compact: "Thu 10 Aug", long: "Thursday, 10 August 2023" },
  { offset: 1, short: "Fri, 11 Aug", compact: "Fri 11 Aug", long: "Friday, 11 August 2023" },
] as const;

type TimelineStyle = CSSProperties & {
  "--block-top": string;
  "--block-height": string;
};

function remFromPixels(value: number) {
  return `${Number((value / ROOT_FONT_PIXELS).toFixed(4))}rem`;
}

function blockStyle(startMinutes: number, duration: number): TimelineStyle {
  return {
    "--block-top": remFromPixels((startMinutes - DAY_START) * PIXELS_PER_MINUTE),
    "--block-height": remFromPixels(Math.max(duration * PIXELS_PER_MINUTE - 2, 28)),
  };
}

function statusCopy(status: Appointment["status"]) {
  const labels: Record<Appointment["status"], string> = {
    confirmed: "Confirmed",
    "checked-in": "Checked in",
    "in-treatment": "In treatment",
    "awaiting-approval": "Awaiting approval",
    completed: "Completed",
    cancelled: "Cancelled",
    "no-show": "No-show",
  };
  return labels[status];
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatInputTime(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clampStart(total: number, duration: number) {
  return Math.min(Math.max(total, DAY_START), DAY_END - duration);
}

function offsetForDay(day?: string) {
  return WEEK_DAYS.find((item) => item.short === day)?.offset ?? 0;
}

function dayForOffset(offset: number) {
  return WEEK_DAYS.find((item) => item.offset === offset) ?? WEEK_DAYS[3];
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function providerCanPerform(providerId: string, appointmentType: string) {
  if (appointmentType.startsWith("Root canal")) return providerId === "nguyen" || providerId === "patel";
  if (appointmentType === "Crown fitting") return providerId === "patel" || providerId === "chen";
  return true;
}

function validateSchedule(candidate: Appointment, appointments: Appointment[], excludeId?: string): ScheduleCheck {
  const candidateEnd = candidate.startMinutes + candidate.duration + (candidate.bufferAfter ?? 0);
  if (candidate.startMinutes < DAY_START || candidateEnd > DAY_END) {
    return { ok: false, message: "The visit and buffer must fit inside 8:00 AM–5:00 PM working hours." };
  }
  if (!providerCanPerform(candidate.providerId, candidate.type)) {
    return { ok: false, message: "The selected provider is not eligible for this appointment type." };
  }
  if (intervalsOverlap(candidate.startMinutes, candidateEnd, 720, 765)) {
    return { ok: false, message: "The visit overlaps the provider’s 12:00–12:45 PM lunch block." };
  }
  if (candidate.providerId === "lee" && intervalsOverlap(candidate.startMinutes, candidateEnd, 780, DAY_END)) {
    return { ok: false, message: "Dr Jason Lee is marked unavailable from 1:00–5:00 PM." };
  }
  const conflict = appointments.find((appointment) => {
    const candidateDay = candidate.day ?? "Thu, 10 Aug";
    const appointmentDay = appointment.day ?? "Thu, 10 Aug";
    if (appointmentDay !== candidateDay || appointment.id === excludeId || appointment.providerId !== candidate.providerId || appointment.status === "cancelled") return false;
    const existingEnd = appointment.startMinutes + appointment.duration + (appointment.bufferAfter ?? 0);
    return intervalsOverlap(candidate.startMinutes, candidateEnd, appointment.startMinutes, existingEnd);
  });
  if (conflict) {
    return { ok: false, message: `Conflicts with ${conflict.patient} at ${minutesToTime(conflict.startMinutes)}, including required buffers.` };
  }
  return { ok: true, message: "Working hours, provider eligibility, time off, existing visits, and buffers are clear." };
}

function createInitialCalendarAppointments() {
  const base = initialAppointments.map((appointment) => ({ ...appointment, day: appointment.day ?? "Thu, 10 Aug" }));
  const extraDays = WEEK_DAYS.filter((day) => day.offset !== 0);
  const generated = providers.flatMap((provider, providerIndex) => {
    const providerAppointments = base.filter((appointment) => appointment.providerId === provider.id).slice(0, 3);
    return extraDays.flatMap((day, dayIndex) => providerAppointments.map((appointment, appointmentIndex) => ({
      ...appointment,
      id: `${day.offset}-${appointment.id}`,
      day: day.short,
      startMinutes: [480, 570, 780, 930][appointmentIndex] + ((dayIndex + providerIndex) % 2) * 15,
      status: "confirmed" as const,
    })));
  });
  return [...base, ...generated];
}

function freeWindows(providerId: string, appointments: Appointment[], day: string) {
  const occupied = appointments
    .filter((appointment) => (appointment.day ?? "Thu, 10 Aug") === day && appointment.providerId === providerId && appointment.status !== "cancelled")
    .map((appointment) => ({
      start: appointment.startMinutes,
      end: appointment.startMinutes + appointment.duration + (appointment.bufferAfter ?? 0),
    }));
  occupied.push({ start: 720, end: 765 });
  if (providerId === "lee") occupied.push({ start: 780, end: DAY_END });
  occupied.sort((a, b) => a.start - b.start);

  const windows: Array<{ start: number; end: number }> = [];
  let cursor = DAY_START;
  for (const block of occupied) {
    if (block.start - cursor >= 30) windows.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (DAY_END - cursor >= 30) windows.push({ start: cursor, end: DAY_END });
  return windows;
}

function CalendarToolbar({
  view,
  scope,
  dateOffset,
  motionIntent,
  filtersOpen,
  layers,
  visibleProviderIds,
  focusedProviderId,
  onViewChange,
  onScopeChange,
  onDateChange,
  onToggleFilters,
  onLayerChange,
  onProviderVisibilityChange,
  onApplyPreset,
  onNew,
}: {
  view: CalendarView;
  scope: CalendarScope;
  dateOffset: number;
  motionIntent: CalendarMotionIntent;
  filtersOpen: boolean;
  layers: CalendarLayers;
  visibleProviderIds: Set<string>;
  focusedProviderId: string;
  onViewChange: (view: CalendarView) => void;
  onScopeChange: (scope: CalendarScope) => void;
  onDateChange: (offset: number) => void;
  onToggleFilters: () => void;
  onLayerChange: (layer: CalendarLayer, checked: boolean) => void;
  onProviderVisibilityChange: (providerId: string, checked: boolean) => void;
  onApplyPreset: (preset: "my-week" | "team-capacity" | "all") => void;
  onNew: () => void;
}) {
  const date = dayForOffset(dateOffset);
  const dateLabel = view === "week" ? "Mon 7 – Fri 11 August 2023" : date.long;
  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!filterRootRef.current?.contains(event.target as Node)) onToggleFilters();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onToggleFilters();
      filterTriggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [filtersOpen, onToggleFilters]);

  return (
    <header className="calendar-toolbar-v2">
      <div className="calendar-date-controls">
        <button type="button" className="button button-quiet button-small" onClick={() => onDateChange(0)}>Today</button>
        <div className="button-group" aria-label="Date navigation">
          <button type="button" className="icon-button" aria-label="Previous day" disabled={view === "week" || dateOffset <= -3} onClick={() => onDateChange(dateOffset - 1)}><Icon name="chevron-left" size={17} /></button>
          <button type="button" className="icon-button" aria-label="Next day" disabled={view === "week" || dateOffset >= 1} onClick={() => onDateChange(dateOffset + 1)}><Icon name="chevron-right" size={17} /></button>
        </div>
        <strong className="calendar-date"><Icon name="calendar" size={17} /><span className="calendar-date-label" data-motion={motionIntent} key={dateLabel}>{dateLabel}</span></strong>
      </div>
      <div className="calendar-mode-controls">
        <div className="view-switcher calendar-view-switcher" data-position={view === "day" ? "start" : "end"} aria-label="Calendar range">
          {(["day", "week"] as CalendarView[]).map((item) => <button key={item} type="button" data-active={view === item ? "true" : "false"} aria-pressed={view === item} onClick={() => onViewChange(item)}>{item === "day" ? "Day" : "Week"}</button>)}
        </div>
        <div className="view-switcher calendar-scope-switcher" data-position={scope === "focus" ? "start" : "end"} aria-label="Provider scope">
          {(["focus", "team"] as CalendarScope[]).map((item) => <button key={item} type="button" data-active={scope === item ? "true" : "false"} aria-pressed={scope === item} onClick={() => onScopeChange(item)}>{item === "focus" ? "Focus" : "Team"}</button>)}
        </div>
        <div className="calendar-filter-anchor" ref={filterRootRef}>
          <button ref={filterTriggerRef} type="button" className="button button-secondary button-small calendar-filter-trigger" aria-expanded={filtersOpen} aria-controls="calendar-filter-panel" onClick={onToggleFilters}><Icon name="filter" size={15} /><span>Filters</span><Icon name={filtersOpen ? "chevron-left" : "chevron-right"} size={13} /></button>
          {filtersOpen ? (
            <div className="calendar-filter-panel" id="calendar-filter-panel" role="region" aria-label="Calendar filters">
              <fieldset className="filter-presets"><legend>Presets</legend>
                <button type="button" onClick={() => onApplyPreset("my-week")}><span className="filter-radio" />My week</button>
                <button type="button" onClick={() => onApplyPreset("team-capacity")}><span className="filter-radio" />Team availability</button>
                <button type="button" onClick={() => onApplyPreset("all")}><span className="filter-radio" />All activity</button>
              </fieldset>
              <fieldset><legend>Providers</legend>
                {providers.map((provider) => <label key={provider.id}><input type="checkbox" checked={visibleProviderIds.has(provider.id)} onChange={(event) => onProviderVisibilityChange(provider.id, event.target.checked)} /><span className={`provider-dot tone-${provider.tone}`} />{provider.name}{provider.id === focusedProviderId ? <small>Focused</small> : null}</label>)}
              </fieldset>
              <fieldset><legend>Layers</legend>
                {(["schedule", "capacity", "requests"] as CalendarLayer[]).map((layer) => <label key={layer}><input type="checkbox" checked={layers[layer]} onChange={(event) => onLayerChange(layer, event.target.checked)} />{layer[0].toUpperCase() + layer.slice(1)}</label>)}
              </fieldset>
            </div>
          ) : null}
        </div>
        <button type="button" className="button button-primary button-small" onClick={onNew}><Icon name="plus" size={16} />New appointment</button>
      </div>
    </header>
  );
}

function ProviderSelector({ value, onChange }: { value: string; onChange: (providerId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = providers.find((provider) => provider.id === value) ?? providers[0];
  const initials = selected.name.replace(/^Dr\s+/i, "").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const matches = providers.filter((provider) => `${provider.name} ${provider.specialty}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function selectProvider(providerId: string) {
    onChange(providerId);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function focusOption(index: number) {
    const count = matches.length;
    if (count === 0) return;
    optionRefs.current[(index + count) % count]?.focus();
  }

  return (
    <div className="provider-selector" ref={rootRef}>
      <span className="provider-selector-label">Provider</span>
      <button ref={triggerRef} type="button" className="provider-selector-trigger" aria-label={`Change focused provider, currently ${selected.name}`} aria-haspopup="listbox" aria-expanded={open} aria-controls="focused-provider-options" onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); window.requestAnimationFrame(() => focusOption(0)); } }}>
        <span className={`provider-avatar tone-${selected.tone}`} aria-hidden="true">{initials}</span><span><strong>{selected.name}</strong><small>{selected.specialty}</small></span><Icon name={open ? "chevron-left" : "chevron-right"} size={15} />
      </button>
      {open ? (
        <div className="provider-selector-menu">
          <label><Icon name="search" size={15} /><span className="sr-only">Search providers</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); focusOption(0); } }} placeholder="Search providers" /></label>
          <div id="focused-provider-options" role="listbox" aria-label="Focused provider options">
            {matches.map((provider, index) => <button ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={provider.id === value} key={provider.id} onClick={() => selectProvider(provider.id)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); } if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index - 1); } if (event.key === "Home") { event.preventDefault(); focusOption(0); } if (event.key === "End") { event.preventDefault(); focusOption(matches.length - 1); } }}><span className={`provider-dot tone-${provider.tone}`} /><span><strong>{provider.name}</strong><small>{provider.specialty}</small></span>{provider.id === value ? <Icon name="check" size={16} /> : null}</button>)}
            {matches.length === 0 ? <p className="provider-selector-empty">No providers match that search.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RequestRail({
  requests,
  appointments,
  selected,
  open,
  onSelect,
  onToggle,
  onOpenFilters,
}: {
  requests: BookingRequest[];
  appointments: Appointment[];
  selected: Selection;
  open: boolean;
  onSelect: (request: BookingRequest) => void;
  onToggle: () => void;
  onOpenFilters: () => void;
}) {
  const dueToday = requests.filter((request) => request.requestedDay === "Thu, 10 Aug").length;
  const conflicts = requests.filter((request) => !validateSchedule({ ...request, id: `preview-${request.id}`, day: request.requestedDay, status: "awaiting-approval" }, appointments).ok).length;

  return (
    <aside className="request-rail-v2" data-open={open ? "true" : "false"} aria-label="Booking requests">
      <div className="rail-heading">
        <div><h2>Requests</h2><span className="count-badge">{requests.length}</span></div>
        <button type="button" className="icon-button" onClick={onToggle} aria-label={open ? "Collapse request queue" : "Expand request queue"} aria-expanded={open}><Icon name="chevron-left" size={16} /></button>
      </div>
      <div className="request-list" aria-hidden={!open} inert={!open}>
        {requests.length === 0 ? <div className="rail-empty"><Icon name="check" /><strong>Queue cleared</strong><p>New booking requests will appear here.</p></div> : requests.map((request) => {
          const provider = providers.find((item) => item.id === request.providerId);
          const active = selected?.kind === "request" && selected.id === request.id;
          return <button type="button" className="request-card" data-active={active ? "true" : "false"} key={request.id} onClick={() => onSelect(request)}><span className="request-card-top"><strong>{request.patient}</strong><span className="status-label" data-tone={request.status === "contacted" ? "neutral" : "pending"}>{request.status === "contacted" ? "Contacted" : "New"}</span></span><span>{request.type}</span><span className="request-time"><Icon name="clock" size={14} />{request.requestedDay} · {minutesToTime(request.startMinutes)}</span><span className="request-provider">{provider?.shortName}</span><span className="request-action">Review <Icon name="chevron-right" size={14} /></span></button>;
        })}
      </div>
      <div className="request-rail-summary" aria-label={`${requests.length} requests, ${dueToday} due today, ${conflicts} conflicts`} aria-hidden={open} inert={open}>
        <button type="button" onClick={onToggle} data-label={`${requests.length} requests · ${dueToday} due today`}><Icon name="clipboard" size={18} /><strong>{requests.length}</strong></button>
        <span data-tone="new"><i />New<strong>{Math.max(requests.length - dueToday, 0)}</strong></span>
        <span data-tone="due"><i />Due<strong>{dueToday}</strong></span>
        <span data-tone="conflict"><i />Conflict<strong>{conflicts}</strong></span>
      </div>
      <button type="button" className="rail-footer-action" onClick={onOpenFilters} aria-label={open ? "Open waitlist and filters" : "Open filters"}><Icon name="filter" size={15} /><span className="rail-footer-label" aria-hidden="true">Waitlist and filters</span></button>
    </aside>
  );
}

function AppointmentBlock({ appointment, provider, selected, onSelect, onDragStart }: {
  appointment: Appointment;
  provider: Provider;
  selected: boolean;
  onSelect: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" className={`appointment-block tone-${provider.tone}`} data-selected={selected ? "true" : "false"} data-status={appointment.status} data-compact={appointment.duration <= 60 ? "true" : "false"} data-short={appointment.duration <= 45 ? "true" : "false"} style={blockStyle(appointment.startMinutes, appointment.duration)} onClick={onSelect} draggable={Boolean(onDragStart)} onDragStart={onDragStart} aria-label={`${appointment.patient}, ${appointment.type}, ${minutesToTime(appointment.startMinutes)}, ${provider.shortName}, ${statusCopy(appointment.status)}`}>
      <span className="appointment-time">{minutesToTime(appointment.startMinutes)} · {appointment.duration} min</span><strong>{appointment.patient}</strong><span className="appointment-type">{appointment.type}</span><span className="appointment-state"><Icon name={appointment.status === "confirmed" ? "check" : "clock"} size={13} />{statusCopy(appointment.status)}</span>
    </button>
  );
}

function TimeRuler() {
  return <div className="time-ruler">{HOUR_MARKS.map((minutes) => <time key={minutes} style={{ top: remFromPixels((minutes - DAY_START) * PIXELS_PER_MINUTE) }}>{minutesToTime(minutes).replace(":00", "")}</time>)}</div>;
}

function ProviderTrack({ provider, appointments, selected, selectedRequest, onSelectAppointment, onDropAppointment }: {
  provider: Provider;
  appointments: Appointment[];
  selected: Selection;
  selectedRequest: BookingRequest | null;
  onSelectAppointment: (appointment: Appointment) => void;
  onDropAppointment: (appointmentId: string, providerId: string, startMinutes: number) => void;
}) {
  return (
    <div className="provider-track" aria-label={`${provider.name} schedule`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const appointmentId = event.dataTransfer.getData("text/appointment-id"); const bounds = event.currentTarget.getBoundingClientRect(); const minutesPerPixel = (DAY_END - DAY_START) / bounds.height; const rawMinutes = DAY_START + (event.clientY - bounds.top) * minutesPerPixel; onDropAppointment(appointmentId, provider.id, Math.round(rawMinutes / 15) * 15); }}>
      <div className="lunch-block" style={blockStyle(720, 45)}><span>Lunch</span></div>
      {provider.id === "lee" ? <div className="time-off-block" style={blockStyle(780, 240)}><span>Time off</span></div> : null}
      {appointments.map((appointment) => <div className="appointment-position" key={appointment.id}><AppointmentBlock appointment={appointment} provider={provider} selected={selected?.kind === "appointment" && selected.id === appointment.id} onSelect={() => onSelectAppointment(appointment)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/appointment-id", appointment.id); }} />{appointment.bufferAfter ? <div className="buffer-block" style={blockStyle(appointment.startMinutes + appointment.duration, appointment.bufferAfter)}><span>Buffer · {appointment.bufferAfter}m</span></div> : null}</div>)}
      {selectedRequest?.providerId === provider.id ? <div className="request-preview-block" style={blockStyle(selectedRequest.startMinutes, selectedRequest.duration)} aria-hidden="true"><span>{minutesToTime(selectedRequest.startMinutes)} · Pending</span><strong>{selectedRequest.patient}</strong><span>{selectedRequest.type}</span></div> : null}
    </div>
  );
}

function CurrentTimeLine() {
  return <div className="current-time-line" style={{ top: remFromPixels((648 - DAY_START) * PIXELS_PER_MINUTE) }}><span>10:48 AM</span></div>;
}

function CapacityMap({ providersToShow, appointments, activeDay }: { providersToShow: Provider[]; appointments: Appointment[]; activeDay: string }) {
  return (
    <section className="capacity-map" aria-labelledby="capacity-map-heading">
      <div className="capacity-map-heading"><h2 id="capacity-map-heading">Capacity</h2><span><i data-state="available" />Available</span><span><i data-state="conflict" />Conflict</span><span><i data-state="blocked" />Blocked</span></div>
      <div className="capacity-map-grid" style={{ "--timeline-height": remFromPixels(TIMELINE_HEIGHT) } as CSSProperties}>
        {providersToShow.map((provider) => <div className="capacity-provider" key={provider.id}><header><span className={`provider-dot tone-${provider.tone}`} /><span><strong>{provider.name}</strong><small>{provider.specialty}</small></span></header><div className="capacity-track">{freeWindows(provider.id, appointments, activeDay).map((window) => <div className="capacity-window" key={`${window.start}-${window.end}`} style={blockStyle(window.start, window.end - window.start)}><strong>{minutesToTime(window.start)}–{minutesToTime(window.end)}</strong><span>{window.end - window.start} min available</span></div>)}<div className="capacity-lunch" style={blockStyle(720, 45)}>Lunch</div>{provider.id === "lee" ? <div className="capacity-timeoff" style={blockStyle(780, 240)}>Time off</div> : null}</div></div>)}
        <CurrentTimeLine />
      </div>
    </section>
  );
}

function FocusDayView({ focusProvider, appointments, activeDay, selected, selectedRequest, showSchedule, showCapacity, visibleProviders, onSelectAppointment, onDropAppointment }: {
  focusProvider: Provider;
  appointments: Appointment[];
  activeDay: string;
  selected: Selection;
  selectedRequest: BookingRequest | null;
  showSchedule: boolean;
  showCapacity: boolean;
  visibleProviders: Provider[];
  onSelectAppointment: (appointment: Appointment) => void;
  onDropAppointment: (appointmentId: string, providerId: string, startMinutes: number) => void;
}) {
  const focusAppointments = appointments.filter((appointment) => appointment.providerId === focusProvider.id && (appointment.day ?? "Thu, 10 Aug") === activeDay);
  const capacityProviders = visibleProviders.filter((provider) => provider.id !== focusProvider.id);
  return (
    <div className="focus-day-view" data-capacity={showCapacity && capacityProviders.length > 0 ? "true" : "false"}>
      <section className="focused-timeline" aria-label={`${focusProvider.name} focused schedule`}>
        <header><span className={`provider-dot tone-${focusProvider.tone}`} /><span><strong>{focusProvider.name}</strong><small>{focusProvider.specialty}</small></span></header>
        {showSchedule ? <div className="focused-timeline-grid" style={{ "--timeline-height": remFromPixels(TIMELINE_HEIGHT) } as CSSProperties}><TimeRuler /><ProviderTrack provider={focusProvider} appointments={focusAppointments} selected={selected} selectedRequest={selectedRequest?.requestedDay === activeDay ? selectedRequest : null} onSelectAppointment={onSelectAppointment} onDropAppointment={onDropAppointment} /><CurrentTimeLine /></div> : <div className="calendar-layer-empty"><Icon name="calendar" /><strong>Schedule hidden</strong><p>Enable Schedule in Filters to restore appointment detail.</p></div>}
      </section>
      {showCapacity && capacityProviders.length > 0 ? <CapacityMap providersToShow={capacityProviders} appointments={appointments} activeDay={activeDay} /> : null}
    </div>
  );
}

function TeamDayView({ appointments, visibleProviders, activeDay, selected, selectedRequest, onSelectAppointment, onDropAppointment }: {
  appointments: Appointment[];
  visibleProviders: Provider[];
  activeDay: string;
  selected: Selection;
  selectedRequest: BookingRequest | null;
  onSelectAppointment: (appointment: Appointment) => void;
  onDropAppointment: (appointmentId: string, providerId: string, startMinutes: number) => void;
}) {
  return (
    <div className="team-day-view">
      <div className="day-grid-header"><div className="time-header">Time</div>{visibleProviders.map((provider) => <div className="provider-header" key={provider.id}><span className={`provider-dot tone-${provider.tone}`} /><span><strong>{provider.name}</strong><small>{provider.specialty}</small></span></div>)}</div>
      <div className="timeline-grid" style={{ "--timeline-height": remFromPixels(TIMELINE_HEIGHT), "--provider-count": visibleProviders.length } as CSSProperties}><TimeRuler />{visibleProviders.map((provider) => <ProviderTrack key={provider.id} provider={provider} appointments={appointments.filter((appointment) => appointment.providerId === provider.id && (appointment.day ?? "Thu, 10 Aug") === activeDay)} selected={selected} selectedRequest={selectedRequest?.requestedDay === activeDay ? selectedRequest : null} onSelectAppointment={onSelectAppointment} onDropAppointment={onDropAppointment} />)}<CurrentTimeLine /></div>
    </div>
  );
}

function WeekFocusView({ provider, appointments, selected, selectedRequest, onSelectAppointment }: {
  provider: Provider;
  appointments: Appointment[];
  selected: Selection;
  selectedRequest: BookingRequest | null;
  onSelectAppointment: (appointment: Appointment) => void;
}) {
  return (
    <div className="week-focus-view">
      <div className="week-focus-header"><div>Time</div>{WEEK_DAYS.map((day) => <strong key={day.short}>{day.compact}</strong>)}</div>
      <div className="week-focus-grid" style={{ "--timeline-height": remFromPixels(TIMELINE_HEIGHT) } as CSSProperties}><TimeRuler />{WEEK_DAYS.map((day) => <div className="week-day-track" key={day.short}><div className="lunch-block" style={blockStyle(720, 45)}>Lunch</div>{appointments.filter((appointment) => appointment.providerId === provider.id && (appointment.day ?? "Thu, 10 Aug") === day.short).map((appointment) => <AppointmentBlock key={appointment.id} appointment={appointment} provider={provider} selected={selected?.kind === "appointment" && selected.id === appointment.id} onSelect={() => onSelectAppointment(appointment)} />)}{selectedRequest?.providerId === provider.id && selectedRequest.requestedDay === day.short ? <div className="request-preview-block" style={blockStyle(selectedRequest.startMinutes, selectedRequest.duration)} aria-hidden="true"><span>{minutesToTime(selectedRequest.startMinutes)} · Pending</span><strong>{selectedRequest.patient}</strong><span>{selectedRequest.type}</span></div> : null}</div>)}<CurrentTimeLine /></div>
    </div>
  );
}

function TeamWeekView({ visibleProviders, onFocusProvider }: { visibleProviders: Provider[]; onFocusProvider?: (providerId: string) => void }) {
  return (
    <div className="capacity-view capacity-view-v2"><div className="capacity-heading"><div><h2>Team availability</h2><p>Week of 7–11 August · {onFocusProvider ? "select a cell to focus that provider" : "focused provider capacity"}</p></div><span>Working hours only</span></div><div className="capacity-table" role="table" aria-label="Provider capacity by day"><div className="capacity-row capacity-header" role="row"><span role="columnheader">Provider</span>{weekCapacity.map((day) => <span role="columnheader" key={day.day}>{day.day}</span>)}</div>{visibleProviders.map((provider) => { const providerIndex = providers.findIndex((item) => item.id === provider.id); return <div className="capacity-row" role="row" key={provider.id}><span role="rowheader"><span className={`provider-dot tone-${provider.tone}`} />{provider.shortName}</span>{weekCapacity.map((day) => { const value = day.values[providerIndex]; const content = <><strong>{value}%</strong><span>{Math.round((value / 100) * 14)}/14 slots</span></>; return onFocusProvider ? <button type="button" key={day.day} className="capacity-cell" data-load={value >= 90 ? "high" : value >= 75 ? "medium" : "low"} onClick={() => onFocusProvider(provider.id)} aria-label={`Focus ${provider.name}, ${day.day}, ${value}% capacity`}>{content}</button> : <div key={day.day} className="capacity-cell" data-load={value >= 90 ? "high" : value >= 75 ? "medium" : "low"} aria-label={`${provider.name}, ${day.day}, ${value}% capacity`}>{content}</div>; })}</div>; })}</div></div>
  );
}

function TeamWeekScheduleView({ visibleProviders, appointments, onFocusProvider }: { visibleProviders: Provider[]; appointments: Appointment[]; onFocusProvider: (providerId: string) => void }) {
  return <div className="capacity-view capacity-view-v2 team-week-schedule"><div className="capacity-heading"><div><h2>Team schedule</h2><p>Week of 7–11 August · confirmed visits by provider</p></div><span>Schedule layer</span></div><div className="capacity-table" role="table" aria-label="Provider appointments by day"><div className="capacity-row capacity-header" role="row"><span role="columnheader">Provider</span>{WEEK_DAYS.map((day) => <span role="columnheader" key={day.short}>{day.compact}</span>)}</div>{visibleProviders.map((provider) => <div className="capacity-row" role="row" key={provider.id}><span role="rowheader"><span className={`provider-dot tone-${provider.tone}`} />{provider.shortName}</span>{WEEK_DAYS.map((day) => { const dayAppointments = appointments.filter((appointment) => appointment.providerId === provider.id && (appointment.day ?? "Thu, 10 Aug") === day.short); return <button type="button" key={day.short} className="capacity-cell schedule-cell" onClick={() => onFocusProvider(provider.id)} aria-label={`Focus ${provider.name}, ${day.long}, ${dayAppointments.length} appointments`}><strong>{dayAppointments.length} visits</strong><span>{dayAppointments.slice(0, 2).map((appointment) => minutesToTime(appointment.startMinutes)).join(" · ") || "Open day"}</span></button>; })}</div>)}</div></div>;
}

function AgendaView({ days, appointments, requests, onSelectAppointment, onSelectRequest }: {
  days: readonly { short: string; long: string }[];
  appointments: Appointment[];
  requests: BookingRequest[];
  onSelectAppointment: (appointment: Appointment) => void;
  onSelectRequest: (request: BookingRequest) => void;
}) {
  return <div className="mobile-calendar-view">{days.map((day) => { const dayAppointments = appointments.filter((appointment) => (appointment.day ?? "Thu, 10 Aug") === day.short); const dayRequests = requests.filter((request) => request.requestedDay === day.short); const items = [...dayAppointments.map((value) => ({ kind: "appointment" as const, value })), ...dayRequests.map((value) => ({ kind: "request" as const, value }))].sort((a, b) => a.value.startMinutes - b.value.startMinutes); return <section className="agenda-view" key={day.short}><div className="agenda-date"><strong>{day.long.replace(", 2023", "")}</strong><span>{dayAppointments.length} appointments · {dayRequests.length} {dayRequests.length === 1 ? "request" : "requests"}</span></div>{items.map((item) => { const provider = providers.find((candidate) => candidate.id === item.value.providerId); if (item.kind === "request") return <button type="button" className="agenda-row agenda-request" key={item.value.id} onClick={() => onSelectRequest(item.value)}><time>{minutesToTime(item.value.startMinutes)}</time><span className="agenda-marker"><Icon name="clock" size={15} /></span><span><strong>{item.value.patient}</strong><small>{item.value.type} · Pending request · {provider?.shortName}</small></span><Icon name="chevron-right" size={16} /></button>; return <button type="button" className="agenda-row" key={item.value.id} onClick={() => onSelectAppointment(item.value)}><time>{minutesToTime(item.value.startMinutes)}</time><span className="agenda-marker"><Icon name={item.value.status === "confirmed" ? "check" : "clock"} size={15} /></span><span><strong>{item.value.patient}</strong><small>{item.value.type} · {statusCopy(item.value.status)} · {provider?.shortName}</small></span><Icon name="chevron-right" size={16} /></button>; })}</section>; })}</div>;
}

function MobileCapacitySummary({ days, providersToShow, appointments }: { days: readonly { short: string; long: string }[]; providersToShow: Provider[]; appointments: Appointment[] }) {
  return <div className="mobile-calendar-view mobile-capacity-summary" aria-label="Provider capacity">{days.map((day) => <section className="agenda-view" key={day.short}><div className="agenda-date"><strong>{day.long.replace(", 2023", "")} capacity</strong><span>Capacity layer</span></div>{providersToShow.map((provider) => { const windows = freeWindows(provider.id, appointments, day.short); const next = windows[0]; return <div className="agenda-row capacity-agenda-row" key={provider.id}><span className={`provider-dot tone-${provider.tone}`} /><span><strong>{provider.name}</strong><small>{next ? `Next opening ${minutesToTime(next.start)} · ${windows.length} windows` : "No safe openings"}</small></span></div>; })}</section>)}</div>;
}

function FindSlotPanel({ selectedRequest, appointments, activeDay, onClose, onChoose }: {
  selectedRequest: BookingRequest | null;
  appointments: Appointment[];
  activeDay: string;
  onClose: () => void;
  onChoose: (providerId: string, startMinutes: number) => void;
}) {
  const [type, setType] = useState(selectedRequest?.type ?? "Crown fitting");
  const [duration, setDuration] = useState(selectedRequest?.duration ?? 60);
  const [pending, setPending] = useState<{ provider: Provider; start: number; minutes: number } | null>(null);
  const suggestions = providers.flatMap((provider) => freeWindows(provider.id, appointments, activeDay).filter((window) => window.end - window.start >= duration + 15 && providerCanPerform(provider.id, type)).slice(0, 1).map((window) => ({ provider, start: window.start, minutes: window.end - window.start }))).slice(0, 3);
  if (pending) return <div className="detail-content find-slot-panel"><section className="detail-section"><h3>Review proposed time</h3><p className="detail-copy">No request data changes until you send this proposal.</p></section><dl className="detail-list"><div><dt>Date</dt><dd>{activeDay}</dd></div><div><dt>Time</dt><dd>{minutesToTime(pending.start)} · {duration} min</dd></div><div><dt>Provider</dt><dd>{pending.provider.name}</dd></div><div><dt>Buffer</dt><dd>15 min after</dd></div><div><dt>Channel</dt><dd>{selectedRequest?.email ? "Email and text" : "Text or phone"}</dd></div></dl><div className="inline-validation"><Icon name="check" size={16} /><span><strong>Schedule clear</strong><small>{pending.minutes} minutes are clear, including the required buffer.</small></span></div><div className="detail-actions"><button type="button" className="button button-secondary" onClick={() => setPending(null)}>Back</button><button type="button" className="button button-primary" onClick={() => onChoose(pending.provider.id, pending.start)}>Send proposal</button></div></div>;
  return <div className="detail-content find-slot-panel"><section className="detail-section"><h3>Find a slot</h3><p className="detail-copy">Ranked openings account for provider eligibility, duration, working hours, and buffers.</p></section><div className="form-stack"><label>Appointment type<select value={type} onChange={(event) => { setType(event.target.value); setPending(null); }}><option>Crown fitting</option><option>Exam + X-ray</option><option>Hygiene visit</option><option>Root canal</option></select></label><label>Duration<select value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setPending(null); }}><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label></div><div className="slot-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion.provider.id} onClick={() => setPending(suggestion)}><span className={`provider-dot tone-${suggestion.provider.tone}`} /><span><strong>{activeDay} · {minutesToTime(suggestion.start)}</strong><small>{suggestion.provider.name} · {suggestion.minutes} minutes clear including buffer</small></span><Icon name="chevron-right" size={16} /></button>)}</div><button type="button" className="button button-secondary button-full" onClick={onClose}>Back to appointment</button></div>;
}

function NewAppointmentForm({ activeDay, defaultProviderId, onCreate, onClose }: {
  activeDay: string;
  defaultProviderId: string;
  onCreate: (appointment: Appointment) => ScheduleCheck;
  onClose: () => void;
}) {
  const [validation, setValidation] = useState<ScheduleCheck>({ ok: true, message: `The appointment will be created for ${activeDay}.` });
  const [pending, setPending] = useState<Appointment | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const patient = String(data.get("patient") || "New patient"); const initials = patient.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); const type = String(data.get("type") || "Exam"); const duration = type === "Root canal" ? 90 : type === "Hygiene" ? 60 : 45; setPending({ id: `new-${Date.now()}`, patient, initials, type, providerId: String(data.get("provider") || defaultProviderId), day: activeDay, startMinutes: parseTime(String(data.get("time") || "14:15")), duration, bufferAfter: 15, status: "confirmed", phone: String(data.get("phone") || "Not provided"), email: String(data.get("email") || "") || undefined }); setValidation({ ok: true, message: "Details captured. Review the exact date, provider, time, and buffer before commit." }); }
  if (pending) { const provider = providers.find((item) => item.id === pending.providerId); return <div className="detail-content new-appointment-form"><section className="detail-section"><h3>Review new appointment</h3><p className="detail-copy">The schedule remains unchanged until you commit.</p></section><dl className="detail-list"><div><dt>Patient</dt><dd>{pending.patient}</dd></div><div><dt>Date</dt><dd>{pending.day}</dd></div><div><dt>Time</dt><dd>{minutesToTime(pending.startMinutes)} · {pending.duration} min</dd></div><div><dt>Provider</dt><dd>{provider?.name}</dd></div><div><dt>Buffer</dt><dd>{pending.bufferAfter} min after</dd></div><div><dt>Notification</dt><dd>{pending.email ? "Email and text" : "Text or phone"}</dd></div></dl><div className="inline-validation"><Icon name="check" size={16} /><span><strong>Ready for schedule validation</strong><small>{validation.message}</small></span></div><div className="detail-actions"><button type="button" className="button button-secondary" onClick={() => setPending(null)}>Edit details</button><button type="button" className="button button-primary" onClick={() => setValidation(onCreate(pending))}>Commit appointment</button></div></div>; }
  return <form className="detail-content new-appointment-form" onSubmit={submit}><section className="detail-section"><h3>New appointment</h3><p className="detail-copy">Creating for <strong>{activeDay}</strong>. Required schedule fields are validated before commit.</p></section><div className="form-stack"><label>Patient name<input name="patient" required autoFocus placeholder="Search or enter patient" /></label><label>Phone number<input name="phone" type="tel" required placeholder="(555) 000-0000" /></label><label>Email <span>Optional</span><input name="email" type="email" placeholder="patient@example.com" /></label><label>Appointment type<select name="type" defaultValue="Exam"><option>Exam</option><option>Hygiene</option><option>Crown fitting</option><option>Root canal</option></select></label><label>Provider<select name="provider" defaultValue={defaultProviderId}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label><label>Start time<input name="time" type="time" min="08:00" max="16:00" step="900" defaultValue="14:15" required /></label></div><div className={validation.ok ? "inline-validation" : "constraint-note"} role="status"><Icon name={validation.ok ? "check" : "warning"} size={16} /><span><strong>{validation.ok ? "Schedule validation ready" : "Schedule change blocked"}</strong><small>{validation.message}</small></span></div><div className="detail-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Review appointment</button></div></form>;
}

function CancelAppointmentPanel({ appointment, onBack, onConfirm }: { appointment: Appointment; onBack: () => void; onConfirm: (reason: string, notifyPatient: boolean) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onConfirm(String(data.get("reason")), Boolean(data.get("notifyPatient"))); }
  return <form className="detail-content cancellation-panel" onSubmit={submit}><section className="detail-section"><h3>Review cancellation</h3><p className="detail-copy">{appointment.patient} · {appointment.day} · {minutesToTime(appointment.startMinutes)} · {appointment.duration} minutes</p></section><div className="constraint-note"><Icon name="warning" size={16} /><span><strong>Staff override</strong><small>An override reason is required and will be included in the audit event.</small></span></div><div className="form-stack"><label>Override reason<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Patient contacted the practice</option><option>Provider unavailable</option><option>Clinical schedule change</option><option>Duplicate booking</option></select></label><label className="checkbox-row"><input type="checkbox" name="notifyPatient" defaultChecked />Notify the patient by their preferred channel</label></div><div className="detail-actions"><button type="button" className="button button-secondary" onClick={onBack}>Keep appointment</button><button type="submit" className="button button-danger-quiet">Confirm cancellation</button></div></form>;
}

function RequestDecisionReview({ action, request, provider, check, onCancel, onCommit }: {
  action: RequestDecision;
  request: BookingRequest;
  provider: Provider;
  check: ScheduleCheck;
  onCancel: () => void;
  onCommit: (payload: { reason?: string; notifyPatient?: boolean; channel?: string; outcome?: string }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onCommit({ reason: String(data.get("reason") || ""), notifyPatient: Boolean(data.get("notifyPatient")), channel: String(data.get("channel") || ""), outcome: String(data.get("outcome") || "") }); }
  const title = action === "approve" ? "Review approval" : action === "decline" ? "Review decline" : "Record contact";
  return <form className="request-decision-review" onSubmit={submit}><div className="request-review-heading"><div><h3>{title}</h3><p>{request.patient} · {request.requestedDay} · {minutesToTime(request.startMinutes)}</p></div><button type="button" className="icon-button" aria-label="Close decision review" onClick={onCancel}><Icon name="close" size={16} /></button></div><dl className="request-review-facts"><div><dt>Provider</dt><dd>{provider.name}</dd></div><div><dt>Duration</dt><dd>{request.duration} min + {request.bufferAfter} min buffer</dd></div><div><dt>Notification</dt><dd>{request.email ? "Email and text" : "Text or phone"}</dd></div></dl>{action === "approve" ? <><div className={check.ok ? "inline-validation" : "constraint-note"}><Icon name={check.ok ? "check" : "warning"} size={16} /><span><strong>{check.ok ? "Schedule clear" : "Approval blocked"}</strong><small>{check.message}</small></span></div><label className="decision-confirm"><input type="checkbox" required />I reviewed the patient, exact date, provider, and buffer.</label></> : null}{action === "decline" ? <div className="form-stack"><label>Decline reason<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Requested time unavailable</option><option>Provider not eligible</option><option>Unable to reach patient</option><option>Duplicate request</option></select></label><label className="checkbox-row"><input type="checkbox" name="notifyPatient" defaultChecked />Notify the patient</label></div> : null}{action === "contact" ? <div className="form-stack"><label>Channel<select name="channel" required defaultValue="phone"><option value="phone">Phone</option><option value="text">Text message</option><option value="email">Email</option></select></label><label>Outcome<select name="outcome" required defaultValue=""><option value="" disabled>Select outcome</option><option>Reached patient</option><option>Left voicemail</option><option>Sent message</option><option>No answer</option></select></label></div> : null}<div className="detail-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Back</button><button type="submit" className={action === "decline" ? "button button-danger-quiet" : "button button-primary"} disabled={action === "approve" && !check.ok}>{action === "approve" ? "Approve and notify" : action === "decline" ? "Decline request" : "Save contact outcome"}</button></div></form>;
}

function DecisionDock({ onSelect, onPropose }: { onSelect: (decision: RequestDecision) => void; onPropose: () => void }) {
  const actions: Array<{ action: RequestDecision; label: string; icon: "check" | "clock" | "phone" | "close" }> = [{ action: "approve", label: "Approve", icon: "check" }, { action: "contact", label: "Contact", icon: "phone" }, { action: "decline", label: "Decline", icon: "close" }];
  return <div className="decision-dock" aria-label="Request actions"><button type="button" className="decision-action decision-approve" data-label="Approve" aria-label="Review approval" onClick={() => onSelect("approve")}><Icon name="check" size={18} /><span>Approve</span></button><button type="button" className="decision-action" data-label="Propose time" aria-label="Propose another time" onClick={onPropose}><Icon name="clock" size={18} /><span>Propose time</span></button>{actions.slice(1).map((item) => <button type="button" key={item.action} className={`decision-action decision-${item.action}`} data-label={item.label} aria-label={item.action === "decline" ? "Review decline" : "Record contact outcome"} onClick={() => onSelect(item.action)}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}</div>;
}

function DetailRail({
  selection,
  selectedAppointment,
  selectedRequest,
  appointments,
  activeDay,
  focusedProviderId,
  mode,
  pendingDecision,
  scheduleIssue,
  hideDefaultOnMobile,
  onModeChange,
  onClose,
  onStartDecision,
  onCancelDecision,
  onCommitDecision,
  onCreate,
  onStageMove,
  onCancelAppointment,
  onChooseSlot,
  onNoteChange,
}: {
  selection: Selection;
  selectedAppointment: Appointment | null;
  selectedRequest: BookingRequest | null;
  appointments: Appointment[];
  activeDay: string;
  focusedProviderId: string;
  mode: DetailMode;
  pendingDecision: RequestDecision | null;
  scheduleIssue: string | null;
  hideDefaultOnMobile: boolean;
  onModeChange: (mode: DetailMode) => void;
  onClose: () => void;
  onStartDecision: (decision: RequestDecision) => void;
  onCancelDecision: () => void;
  onCommitDecision: (payload: { reason?: string; notifyPatient?: boolean; channel?: string; outcome?: string }) => void;
  onCreate: (appointment: Appointment) => ScheduleCheck;
  onStageMove: (providerId: string, startMinutes: number) => void;
  onCancelAppointment: (reason: string, notifyPatient: boolean) => void;
  onChooseSlot: (providerId: string, startMinutes: number) => void;
  onNoteChange: (markdown: string) => void;
}) {
  const subject = selectedRequest ?? selectedAppointment;
  const provider = providers.find((item) => item.id === subject?.providerId);
  const requestCandidate: Appointment | null = selectedRequest ? { ...selectedRequest, id: `review-${selectedRequest.id}`, day: selectedRequest.requestedDay, status: "awaiting-approval" } : null;
  const requestCheck = requestCandidate ? validateSchedule(requestCandidate, appointments) : { ok: true as const, message: "Schedule clear." };

  return <aside className="detail-rail detail-rail-v2" data-open={mode !== "selection" || Boolean(selection) ? "true" : "false"} data-mobile-default-hidden={hideDefaultOnMobile ? "true" : "false"} aria-label="Appointment details"><div className="detail-rail-header"><strong>{selectedRequest ? "Review before approval" : mode === "new" ? "New appointment" : mode === "find-slot" ? "Find a slot" : "Appointment details"}</strong><button type="button" className="icon-button" onClick={onClose} aria-label="Close details"><Icon name="close" size={18} /></button></div>{mode === "new" ? <NewAppointmentForm activeDay={activeDay} defaultProviderId={focusedProviderId} onCreate={onCreate} onClose={onClose} /> : null}{mode === "find-slot" ? <FindSlotPanel selectedRequest={selectedRequest} appointments={appointments} activeDay={selectedRequest?.requestedDay ?? activeDay} onClose={() => onModeChange("selection")} onChoose={onChooseSlot} /> : null}{mode === "cancel" && selectedAppointment ? <CancelAppointmentPanel appointment={selectedAppointment} onBack={() => onModeChange("selection")} onConfirm={onCancelAppointment} /> : null}{mode === "selection" && subject && provider ? <div className="detail-content"><div className="patient-summary"><span className="patient-avatar">{subject.initials}</span><span><h2>{subject.patient}</h2><p>{subject.type}</p></span></div><div className="contact-lines"><a href={`tel:${subject.phone}`}><Icon name="phone" size={16} />{subject.phone}</a>{subject.email ? <a href={`mailto:${subject.email}`}><Icon name="mail" size={16} />{subject.email}</a> : <span><Icon name="mail" size={16} />No email provided</span>}</div><section className="detail-section"><div className="detail-section-heading"><h3>Schedule</h3><button type="button" onClick={() => onModeChange("find-slot")}>Find another slot</button></div><dl className="detail-list"><div><dt>Date</dt><dd>{selectedRequest?.requestedDay ?? selectedAppointment?.day ?? activeDay}</dd></div><div><dt>Time</dt><dd>{minutesToTime(subject.startMinutes)} · {subject.duration} min</dd></div><div><dt>Provider</dt><dd><span className={`provider-dot tone-${provider.tone}`} />{provider.name}</dd></div><div><dt>Buffer</dt><dd>{subject.bufferAfter ?? 0} min after</dd></div><div><dt>Channel</dt><dd>{subject.email ? "Web booking · email" : "Phone"}</dd></div><div><dt>Status</dt><dd><span className="status-label" data-tone={selectedRequest ? "pending" : "confirmed"}>{selectedRequest ? "Awaiting approval" : statusCopy(selectedAppointment!.status)}</span></dd></div>{selectedRequest ? <div><dt>Conflicts</dt><dd className={requestCheck.ok ? "text-success" : "text-warning"}>{requestCheck.ok ? "No conflicts" : "Possible conflict"}</dd></div> : null}</dl></section>{!requestCheck.ok ? <div className="constraint-note"><Icon name="warning" size={16} /><span><strong>This time needs review</strong><small>{requestCheck.message}</small></span></div> : null}<section className="detail-section"><h3>Scheduling note</h3><MarkdownNoteEditor key={subject.id} initialValue={subject.note ?? "No scheduling notes for this appointment."} onChange={onNoteChange} /><p className="privacy-note"><Icon name="clipboard" size={15} />Clinical notes remain in the protected treatment workspace.</p></section>{selectedRequest ? <section className="detail-section"><h3>Request history</h3><div className="audit-row"><span className="audit-dot" /><span><strong>Requested online</strong><small>{selectedRequest.requestedAt}</small></span></div><div className="audit-row"><span className="audit-dot" /><span><strong>Slot held from public booking</strong><small>Pending staff decision</small></span></div></section> : null}{scheduleIssue ? <div className="constraint-note" role="alert"><Icon name="warning" size={16} /><span><strong>Schedule change blocked</strong><small>{scheduleIssue}</small></span></div> : null}{selectedRequest ? pendingDecision ? <RequestDecisionReview action={pendingDecision} request={selectedRequest} provider={provider} check={requestCheck} onCancel={onCancelDecision} onCommit={onCommitDecision} /> : <DecisionDock onSelect={onStartDecision} onPropose={() => onModeChange("find-slot")} /> : selectedAppointment ? <form className="reschedule-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onStageMove(String(data.get("provider")), parseTime(String(data.get("time")))); }}><h3>Reschedule</h3><div className="form-row"><label>Provider<select name="provider" defaultValue={selectedAppointment.providerId}>{providers.map((item) => <option value={item.id} key={item.id}>{item.shortName}</option>)}</select></label><label>Time<input type="time" name="time" min="08:00" max="16:30" step="900" defaultValue={formatInputTime(selectedAppointment.startMinutes)} /></label></div><button type="submit" className="button button-secondary button-full">Review change</button><button type="button" className="text-danger-button" onClick={() => onModeChange("cancel")}>Cancel appointment</button></form> : null}</div> : null}{mode === "selection" && !subject ? <div className="detail-empty"><Icon name="calendar" /><strong>Select an appointment</strong><p>Patient and schedule details will open here without moving you away from the calendar.</p></div> : null}</aside>;
}

export function CalendarWorkspace({ initialSelectedId, openNew = false }: { initialSelectedId?: string; openNew?: boolean }) {
  const initialRequest = initialRequests.find((request) => request.id === initialSelectedId) ?? initialRequests[0];
  const initialAppointment = initialAppointments.find((appointment) => appointment.id === initialSelectedId);
  const [appointments, setAppointments] = useState<Appointment[]>(createInitialCalendarAppointments);
  const [requests, setRequests] = useState(initialRequests);
  const [selection, setSelection] = useState<Selection>(initialAppointment ? { kind: "appointment", id: initialAppointment.id } : { kind: "request", id: initialRequest.id });
  const [detailMode, setDetailMode] = useState<DetailMode>(openNew ? "new" : "selection");
  const [pendingDecision, setPendingDecision] = useState<RequestDecision | null>(null);
  const [view, setView] = useState<CalendarView>("day");
  const [scope, setScope] = useState<CalendarScope>("focus");
  const [calendarMotion, setCalendarMotion] = useState<{ intent: CalendarMotionIntent; sequence: number }>({ intent: "none", sequence: 0 });
  const [focusedProviderId, setFocusedProviderId] = useState(initialRequest.providerId);
  const [visibleProviderIds, setVisibleProviderIds] = useState(() => new Set(providers.map((provider) => provider.id)));
  const [layers, setLayers] = useState<CalendarLayers>({ schedule: true, capacity: true, requests: true });
  const [requestRailOpen, setRequestRailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateOffset, setDateOffset] = useState<number>(() => offsetForDay(initialSelectedId ? initialRequest.requestedDay : undefined));
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [lastCancellation, setLastCancellation] = useState<LastCancellation | null>(null);
  const [lastRequestDecision, setLastRequestDecision] = useState<LastRequestDecision | null>(null);
  const [scheduleIssue, setScheduleIssue] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [message, setMessage] = useState("Calendar ready");

  const selectedAppointment = selection?.kind === "appointment" ? appointments.find((appointment) => appointment.id === selection.id) ?? null : null;
  const selectedRequest = selection?.kind === "request" ? requests.find((request) => request.id === selection.id) ?? null : null;
  const focusedProvider = providers.find((provider) => provider.id === focusedProviderId) ?? providers[0];
  const visibleProviders = providers.filter((provider) => visibleProviderIds.has(provider.id));
  const activeDay = dayForOffset(dateOffset);
  const agendaDays = view === "week" ? WEEK_DAYS : [activeDay];
  const detailRailOpen = detailMode !== "selection" || Boolean(selection);

  const calendarAppointments = useMemo(() => appointments.filter((appointment) => visibleProviderIds.has(appointment.providerId) || (scope === "focus" && appointment.providerId === focusedProviderId)), [appointments, visibleProviderIds, scope, focusedProviderId]);

  function beginCalendarMotion(intent: Exclude<CalendarMotionIntent, "none">) {
    setCalendarMotion((current) => ({ intent, sequence: current.sequence + 1 }));
  }

  function changeView(nextView: CalendarView) {
    if (nextView === view) return;
    beginCalendarMotion("range");
    setView(nextView);
  }

  function changeScope(nextScope: CalendarScope) {
    if (nextScope === scope) return;
    beginCalendarMotion("scope");
    setScope(nextScope);
  }

  function changeDate(nextOffset: number) {
    const clampedOffset = Math.min(Math.max(nextOffset, -3), 1);
    if (clampedOffset === dateOffset) return;
    beginCalendarMotion(clampedOffset < dateOffset ? "previous" : "next");
    setDateOffset(clampedOffset);
  }

  function selectAppointment(appointment: Appointment) { setHasInteracted(true); setSelection({ kind: "appointment", id: appointment.id }); setDetailMode("selection"); setPendingDecision(null); setScheduleIssue(null); }
  function selectRequest(request: BookingRequest) { beginCalendarMotion("context"); setHasInteracted(true); setSelection({ kind: "request", id: request.id }); setFocusedProviderId(request.providerId); setScope("focus"); setDetailMode("selection"); setPendingDecision(null); setDateOffset(offsetForDay(request.requestedDay)); setView("day"); setScheduleIssue(null); }

  function createAppointment(appointment: Appointment): ScheduleCheck { const check = validateSchedule(appointment, appointments); if (!check.ok) { setScheduleIssue(check.message); setMessage(`Appointment not created. ${check.message}`); return check; } setAppointments((current) => [...current, appointment]); setSelection({ kind: "appointment", id: appointment.id }); setDetailMode("selection"); setScheduleIssue(null); setMessage(`${appointment.patient} added to ${providers.find((provider) => provider.id === appointment.providerId)?.shortName}'s schedule on ${appointment.day}.`); return check; }

  function commitRequestDecision(payload: { reason?: string; notifyPatient?: boolean; channel?: string; outcome?: string }) {
    if (!selectedRequest || !pendingDecision) return;
    const request = selectedRequest;
    if (pendingDecision === "approve") {
      const appointment: Appointment = { ...request, id: `approved-${request.id}`, day: request.requestedDay, status: "confirmed", requestedBy: "Patient portal" };
      const check = validateSchedule(appointment, appointments);
      if (!check.ok) { setScheduleIssue(check.message); setMessage(`Approval blocked. ${check.message}`); return; }
      setAppointments((current) => [...current, appointment]); setRequests((current) => current.filter((item) => item.id !== request.id)); setSelection({ kind: "appointment", id: appointment.id }); setLastRequestDecision({ action: "approve", request, createdAppointmentId: appointment.id, summary: `${request.patient} approved for ${request.requestedDay} at ${minutesToTime(request.startMinutes)}. Notification queued.` });
    } else if (pendingDecision === "decline") {
      setRequests((current) => current.filter((item) => item.id !== request.id)); setSelection(null); setLastRequestDecision({ action: "decline", request, summary: `${request.patient}'s request declined: ${payload.reason}. ${payload.notifyPatient ? "Patient notification queued." : "No notification requested."}` });
    } else {
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "contacted" } : item)); setLastRequestDecision({ action: "contact", request, previousStatus: request.status, summary: `${payload.channel} contact recorded for ${request.patient}: ${payload.outcome}.` });
    }
    setPendingDecision(null); setScheduleIssue(null); setMessage("Request decision saved. Undo is available.");
  }

  function undoRequestDecision() {
    if (!lastRequestDecision) return;
    const { action, request, createdAppointmentId, previousStatus, previousProviderId, previousStartMinutes } = lastRequestDecision;
    if (action === "approve" && createdAppointmentId) setAppointments((current) => current.filter((appointment) => appointment.id !== createdAppointmentId));
    if (action === "approve" || action === "decline") setRequests((current) => current.some((item) => item.id === request.id) ? current : [...current, request]);
    if (action === "contact") setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: previousStatus ?? "new", providerId: previousProviderId ?? item.providerId, startMinutes: previousStartMinutes ?? item.startMinutes } : item));
    beginCalendarMotion("context"); setSelection({ kind: "request", id: request.id }); setFocusedProviderId(request.providerId); setLastRequestDecision(null); setMessage("Request decision undone. The audit trail records the reversal.");
  }

  function stageMove(appointmentId: string, providerId: string, startMinutes: number) { const appointment = appointments.find((item) => item.id === appointmentId); if (!appointment) return; const nextStart = clampStart(startMinutes, appointment.duration + (appointment.bufferAfter ?? 0)); const candidate = { ...appointment, providerId, startMinutes: nextStart }; const check = validateSchedule(candidate, appointments, appointment.id); if (!check.ok) { setPendingMove(null); setScheduleIssue(check.message); setMessage(`Change blocked. ${check.message}`); return; } setPendingMove({ appointmentId, fromProviderId: appointment.providerId, toProviderId: providerId, fromStartMinutes: appointment.startMinutes, toStartMinutes: nextStart }); setSelection({ kind: "appointment", id: appointment.id }); setScheduleIssue(null); setMessage("Change staged. Review provider, time, date, buffer, and notification before committing."); }
  function commitMove() { if (!pendingMove) return; const appointment = appointments.find((item) => item.id === pendingMove.appointmentId); if (!appointment) return; const candidate = { ...appointment, providerId: pendingMove.toProviderId, startMinutes: pendingMove.toStartMinutes }; const check = validateSchedule(candidate, appointments, appointment.id); if (!check.ok) { setPendingMove(null); setScheduleIssue(check.message); setMessage(`Commit blocked. ${check.message}`); return; } setAppointments((current) => current.map((item) => item.id === pendingMove.appointmentId ? candidate : item)); setPendingMove(null); setMessage(`${appointment.patient} rescheduled on ${appointment.day}. Notification queued and audit history updated.`); }
  function cancelAppointment(reason: string, notifyPatient: boolean) { if (!selectedAppointment) return; setLastCancellation({ appointmentId: selectedAppointment.id, previousStatus: selectedAppointment.status, reason, notifyPatient }); setAppointments((current) => current.map((appointment) => appointment.id === selectedAppointment.id ? { ...appointment, status: "cancelled" } : appointment)); setDetailMode("selection"); setMessage(`${selectedAppointment.patient}'s appointment cancelled. Undo is available.`); }
  function chooseSlot(providerId: string, startMinutes: number) { if (selectedRequest) { const candidate: Appointment = { ...selectedRequest, id: `proposal-${selectedRequest.id}`, providerId, day: selectedRequest.requestedDay, startMinutes, status: "awaiting-approval" }; const check = validateSchedule(candidate, appointments); if (!check.ok) { setScheduleIssue(check.message); setMessage(`Proposed time blocked. ${check.message}`); return; } setLastRequestDecision({ action: "contact", request: selectedRequest, previousStatus: selectedRequest.status, previousProviderId: selectedRequest.providerId, previousStartMinutes: selectedRequest.startMinutes, summary: `Alternative sent for ${selectedRequest.patient}: ${selectedRequest.requestedDay} at ${minutesToTime(startMinutes)} with ${providers.find((provider) => provider.id === providerId)?.shortName}. Notification queued.` }); setRequests((current) => current.map((request) => request.id === selectedRequest.id ? { ...request, providerId, startMinutes, status: "contacted" } : request)); beginCalendarMotion("context"); setFocusedProviderId(providerId); setDetailMode("selection"); setScheduleIssue(null); setMessage(`Alternative time sent for ${selectedRequest.patient}. Undo is available.`); return; } beginCalendarMotion("context"); setDetailMode("new"); setFocusedProviderId(providerId); setMessage(`Opening at ${minutesToTime(startMinutes)} selected. Complete appointment details for ${activeDay.short}.`); }
  function updateNote(markdown: string) { if (!selection) return; if (selection.kind === "request") setRequests((current) => current.map((request) => request.id === selection.id ? { ...request, note: markdown } : request)); else setAppointments((current) => current.map((appointment) => appointment.id === selection.id ? { ...appointment, note: markdown } : appointment)); }

  function applyPreset(preset: "my-week" | "team-capacity" | "all") {
    beginCalendarMotion("context");
    if (preset === "my-week") { setView("week"); setScope("focus"); setVisibleProviderIds(new Set([focusedProviderId])); setLayers({ schedule: true, capacity: true, requests: true }); }
    if (preset === "team-capacity") { setView("week"); setScope("team"); setVisibleProviderIds(new Set(providers.map((provider) => provider.id))); setLayers({ schedule: false, capacity: true, requests: false }); }
    if (preset === "all") { setScope("team"); setVisibleProviderIds(new Set(providers.map((provider) => provider.id))); setLayers({ schedule: true, capacity: true, requests: true }); }
    setFiltersOpen(false);
  }

  return (
    <div className="calendar-page calendar-page-v2">
      <CalendarToolbar view={view} scope={scope} dateOffset={dateOffset} motionIntent={calendarMotion.intent} filtersOpen={filtersOpen} layers={layers} visibleProviderIds={visibleProviderIds} focusedProviderId={focusedProviderId} onViewChange={changeView} onScopeChange={changeScope} onDateChange={changeDate} onToggleFilters={() => setFiltersOpen((open) => !open)} onLayerChange={(layer, checked) => setLayers((current) => ({ ...current, [layer]: checked }))} onProviderVisibilityChange={(providerId, checked) => setVisibleProviderIds((current) => { const next = new Set(current); if (checked) next.add(providerId); else if (next.size > 1) next.delete(providerId); return next; })} onApplyPreset={applyPreset} onNew={() => { setDetailMode("new"); setSelection(null); setPendingDecision(null); }} />
      <div className="calendar-context-bar"><ProviderSelector value={focusedProviderId} onChange={(providerId) => { beginCalendarMotion("context"); setFocusedProviderId(providerId); setVisibleProviderIds((current) => new Set(current).add(providerId)); setScope("focus"); }} /><p>{scope === "focus" ? "Focused schedule with team capacity beside it" : "Team schedule with provider filters applied"}</p></div>
      <div className="calendar-workbench" data-request-open={requestRailOpen ? "true" : "false"} data-requests-visible={layers.requests ? "true" : "false"} data-detail-open={detailRailOpen ? "true" : "false"}>
        {layers.requests ? <RequestRail requests={requests} appointments={appointments} selected={selection} open={requestRailOpen} onSelect={selectRequest} onToggle={() => setRequestRailOpen((open) => !open)} onOpenFilters={() => setFiltersOpen(true)} /> : null}
        <section className="calendar-canvas" aria-label="Practice calendar">
          <div className="desktop-calendar-view"><div className="calendar-motion-stage" data-motion={calendarMotion.intent} key={`desktop-calendar-${calendarMotion.sequence}`}>
            {view === "day" && scope === "focus" ? <FocusDayView focusProvider={focusedProvider} appointments={calendarAppointments} activeDay={activeDay.short} selected={selection} selectedRequest={layers.requests ? selectedRequest : null} showSchedule={layers.schedule} showCapacity={layers.capacity} visibleProviders={visibleProviders} onSelectAppointment={selectAppointment} onDropAppointment={stageMove} /> : null}
            {view === "day" && scope === "team" && layers.schedule ? <TeamDayView appointments={calendarAppointments} visibleProviders={visibleProviders} activeDay={activeDay.short} selected={selection} selectedRequest={layers.requests ? selectedRequest : null} onSelectAppointment={selectAppointment} onDropAppointment={stageMove} /> : null}
            {view === "day" && scope === "team" && !layers.schedule && layers.capacity ? <CapacityMap providersToShow={visibleProviders} appointments={calendarAppointments} activeDay={activeDay.short} /> : null}
            {view === "day" && scope === "team" && layers.schedule && layers.capacity ? <CapacityMap providersToShow={visibleProviders} appointments={calendarAppointments} activeDay={activeDay.short} /> : null}
            {view === "week" && scope === "focus" && layers.schedule ? <WeekFocusView provider={focusedProvider} appointments={calendarAppointments} selected={selection} selectedRequest={layers.requests ? selectedRequest : null} onSelectAppointment={selectAppointment} /> : null}
            {view === "week" && scope === "focus" && layers.capacity ? <TeamWeekView visibleProviders={[focusedProvider]} /> : null}
            {view === "week" && scope === "team" && layers.schedule ? <TeamWeekScheduleView visibleProviders={visibleProviders} appointments={calendarAppointments} onFocusProvider={(providerId) => { beginCalendarMotion("context"); setFocusedProviderId(providerId); setScope("focus"); }} /> : null}
            {view === "week" && scope === "team" && layers.capacity ? <TeamWeekView visibleProviders={visibleProviders} onFocusProvider={(providerId) => { beginCalendarMotion("context"); setFocusedProviderId(providerId); setScope("focus"); }} /> : null}
            {view === "week" && !layers.schedule && !layers.capacity ? <div className="calendar-layer-empty"><Icon name="filter" /><strong>Schedule and capacity hidden</strong><p>Enable a layer in Filters to restore calendar content.</p></div> : null}
          </div></div>
          <div className="mobile-calendar-motion-stage calendar-motion-stage" data-motion={calendarMotion.intent} key={`mobile-calendar-${calendarMotion.sequence}`}>
            <AgendaView days={agendaDays} appointments={layers.schedule ? calendarAppointments.filter((appointment) => scope === "team" || appointment.providerId === focusedProviderId) : []} requests={layers.requests ? requests : []} onSelectAppointment={selectAppointment} onSelectRequest={selectRequest} />
            {layers.capacity ? <MobileCapacitySummary days={agendaDays} providersToShow={scope === "focus" ? [focusedProvider] : visibleProviders} appointments={calendarAppointments} /> : null}
          </div>
        </section>
        <DetailRail selection={selection} selectedAppointment={selectedAppointment} selectedRequest={selectedRequest} appointments={appointments} activeDay={activeDay.short} focusedProviderId={focusedProviderId} mode={detailMode} pendingDecision={pendingDecision} scheduleIssue={scheduleIssue} hideDefaultOnMobile={!initialSelectedId && !openNew && !hasInteracted && detailMode === "selection"} onModeChange={setDetailMode} onClose={() => { setDetailMode("selection"); setSelection(null); setPendingDecision(null); setScheduleIssue(null); }} onStartDecision={setPendingDecision} onCancelDecision={() => setPendingDecision(null)} onCommitDecision={commitRequestDecision} onCreate={createAppointment} onStageMove={(providerId, startMinutes) => { if (selectedAppointment) stageMove(selectedAppointment.id, providerId, startMinutes); }} onCancelAppointment={cancelAppointment} onChooseSlot={chooseSlot} onNoteChange={updateNote} />
      </div>
      {pendingMove ? <div className="change-review-bar" role="region" aria-label="Review staged schedule change"><div><Icon name="clock" /><span><strong>1 change staged</strong><small>{selectedAppointment?.day} · {providers.find((provider) => provider.id === pendingMove.fromProviderId)?.shortName} at {minutesToTime(pendingMove.fromStartMinutes)} → {providers.find((provider) => provider.id === pendingMove.toProviderId)?.shortName} at {minutesToTime(pendingMove.toStartMinutes)} · Patient notification required</small></span></div><div><button type="button" className="button button-secondary button-small" onClick={() => { setPendingMove(null); setMessage("Staged change removed."); }}>Undo</button><button type="button" className="button button-primary button-small" onClick={commitMove}>Commit change</button></div></div> : lastCancellation ? <div className="change-review-bar" role="region" aria-label="Cancellation saved with undo available"><div><Icon name="warning" /><span><strong>Cancellation saved</strong><small>Override reason: {lastCancellation.reason} · {lastCancellation.notifyPatient ? "Patient notification queued" : "No notification requested"}</small></span></div><div><button type="button" className="button button-secondary button-small" onClick={() => setLastCancellation(null)}>Dismiss</button><button type="button" className="button button-primary button-small" onClick={() => { setAppointments((current) => current.map((appointment) => appointment.id === lastCancellation.appointmentId ? { ...appointment, status: lastCancellation.previousStatus } : appointment)); setLastCancellation(null); setMessage("Cancellation undone. Audit history records the reversal."); }}>Undo cancellation</button></div></div> : lastRequestDecision ? <div className="change-review-bar" role="region" aria-label="Request decision saved with undo available"><div><Icon name="check" /><span><strong>Request decision saved</strong><small>{lastRequestDecision.summary}</small></span></div><div><button type="button" className="button button-secondary button-small" onClick={() => setLastRequestDecision(null)}>Dismiss</button><button type="button" className="button button-primary button-small" onClick={undoRequestDecision}>Undo decision</button></div></div> : null}
      <p className="sr-only" aria-live="polite">{message}</p>
    </div>
  );
}
