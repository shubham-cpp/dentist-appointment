import Link from "next/link";
import { attentionRows, minutesToTime, type AttentionRow } from "@/lib/demo-data";
import { PRACTICE_DAY, PRACTICE_TIME_MINUTES } from "@/lib/calendar-workspace-model";
import { dashboardAttentionHref } from "@/lib/dashboard-navigation";
import type { DemoReschedulingCase } from "@/lib/demo-rescheduling-types";
import { DemoReschedulingPanel } from "./demo-rescheduling-panel";
import { Icon, type IconName } from "./icon";

const arrivingNext = [
  { time: "10:55 AM", patient: "Noah Brown", type: "Hygiene visit", provider: "Dr Chen", state: "Arriving" },
  { time: "11:25 AM", patient: "Michael Thompson", type: "Consultation", provider: "Dr Chen", state: "Expected" },
  { time: "11:35 AM", patient: "Ava Chen", type: "Exam", provider: "Dr Patel", state: "Checked in" },
];

const recentlyResolved = [
  { time: "10:46 AM", item: "Noah Brown schedule conflict", outcome: "Time updated; patient notified", actor: "Maya Patel" },
  { time: "10:39 AM", item: "Emma Johnson clinical record", outcome: "Signed", actor: "Dr Chen" },
  { time: "10:31 AM", item: "Sofia Martinez booking request", outcome: "Approved for Thu 2:15 PM", actor: "Maya Patel" },
];

const priorityOrder = {
  "act-now": 0,
  today: 1,
  soon: 2,
  routine: 3,
} as const;

export type DashboardAttentionState =
  | "active"
  | "resolved"
  | "coverage-limited"
  | "loading"
  | "error";

type DashboardWorkspaceProps = {
  attentionState?: DashboardAttentionState;
  initialDemoReschedulingCase: DemoReschedulingCase;
};

function queueIcon(row: AttentionRow): IconName {
  if (row.geometry === "collision") return "warning";
  if (row.geometry === "finance") return "card";
  if (row.geometry === "booking") return "calendar";
  return "clipboard";
}

function PriorityLabel({ row }: { row: AttentionRow }) {
  return <span className="queue-priority" data-priority={row.priority}>{row.priorityLabel}</span>;
}

function CriticalQueueItem({ row }: { row: AttentionRow }) {
  return (
    <li className="queue-critical" data-priority={row.priority}>
      <div className="queue-critical-topline">
        <PriorityLabel row={row} />
        <time>{row.time}</time>
      </div>

      <div className="queue-critical-heading">
        <div>
          <span className="queue-kind"><Icon name={queueIcon(row)} size={16} />{row.kind}</span>
          <h3>{row.patient}</h3>
          <p>{row.issue}</p>
        </div>
        <span className="queue-deadline"><strong>{row.metric}</strong>{row.metricLabel}</span>
      </div>

      {row.comparison ? (
        <ul className="queue-conflict-list" aria-label="Conflicting appointments">
          {row.comparison.map((item) => (
            <li key={`${item.time}-${item.patient}`}>
              <time>{item.time}</time>
              <strong>{item.patient}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="queue-critical-footer">
        <p><strong>{row.owner}</strong> owns this decision. {row.whyNow}</p>
        <Link href={dashboardAttentionHref(row)} className="button button-primary" aria-label={`${row.action} for ${row.patient}`}>
          {row.action}<Icon name="chevron-right" size={16} />
        </Link>
      </div>
    </li>
  );
}

function CompactQueueItem({ row }: { row: AttentionRow }) {
  return (
    <li className="queue-compact" data-priority={row.priority}>
      <div className="queue-compact-meta">
        <PriorityLabel row={row} />
        <time>{row.time}</time>
      </div>
      <div className="queue-compact-main">
        <span className="queue-compact-icon"><Icon name={queueIcon(row)} size={16} /></span>
        <div>
          <span className="queue-kind">{row.kind}</span>
          <h3>{row.patient}</h3>
          <p>{row.issue}</p>
          <small>{row.owner} · {row.detail}</small>
        </div>
      </div>
      <Link href={dashboardAttentionHref(row)} className="queue-compact-action" aria-label={`${row.action} for ${row.patient}`}>
        {row.action}<Icon name="chevron-right" size={16} />
      </Link>
    </li>
  );
}

function AttentionStatePanel({ state }: { state: Exclude<DashboardAttentionState, "active"> }) {
  if (state === "loading") {
    return (
      <div className="queue-state queue-state-loading" aria-live="polite" aria-busy="true">
        <span className="state-spinner" />
        <div><h3>Checking the practice queue</h3><p>Booking, schedule, clinical, and billing sources are being evaluated.</p></div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="queue-state queue-state-error" role="alert">
        <Icon name="warning" size={22} />
        <div><h3>Unable to check today’s priorities</h3><p>The previous queue is unavailable. The page cannot confirm that all work is clear.</p></div>
        <Link href="/dashboard" className="button button-secondary">Try again</Link>
      </div>
    );
  }

  if (state === "coverage-limited") {
    return (
      <div className="queue-state queue-state-limited">
        <div className="queue-state-heading"><Icon name="warning" size={22} /><div><h3>No urgent items found in the checked queues</h3><p>Online-booking updates are 12 minutes late. Other Northside sources were checked at 10:48 AM.</p></div></div>
        <dl className="queue-state-details">
          <div><dt>Coverage</dt><dd>5 of 6 queues</dd></div>
          <div><dt>Scope</dt><dd>Northside · 4 providers</dd></div>
          <div><dt>Oldest source</dt><dd>12 min delayed</dd></div>
        </dl>
        <Link href="/settings" className="button button-secondary">Review monitoring</Link>
      </div>
    );
  }

  return (
    <div className="queue-state queue-state-resolved">
      <div className="queue-state-heading"><span className="resolved-mark"><Icon name="check" size={20} /></span><div><h3>Practice under control</h3><p>No urgent items were found across the checked Northside clinic queues at 10:48 AM.</p></div></div>
      <dl className="queue-state-details">
        <div><dt>Urgent now</dt><dd>0</dd></div>
        <div><dt>Coverage</dt><dd>6 of 6 queues</dd></div>
        <div><dt>Freshness</dt><dd>18 sec ago</dd></div>
      </dl>
      <div className="queue-state-resolved-grid">
        <div><h4>Next checkpoint</h4><strong>11:00 AM · Noah Brown arrival</strong><p>Dr Patel · in 12 minutes</p></div>
        <div><h4>Recently resolved</h4><ul>{recentlyResolved.map((item) => <li key={`${item.time}-${item.item}`}><time>{item.time}</time><span><strong>{item.item}</strong><small>{item.outcome} · {item.actor}</small></span></li>)}</ul></div>
      </div>
      <div className="queue-state-actions"><Link href="/calendar" className="button button-primary">Open today’s schedule</Link><Link href="/calendar?queue=resolved" className="button button-secondary">Review resolved work</Link></div>
    </div>
  );
}

function AttentionQueue({ state }: { state: DashboardAttentionState }) {
  const prioritizedRows = attentionRows
    .filter((row) => row.priority !== "routine")
    .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);
  const [criticalRow, ...compactRows] = prioritizedRows;
  const routineCount = attentionRows.length - prioritizedRows.length;

  return (
    <section className="surface dashboard-queue" aria-labelledby="attention-heading">
      <header className="dashboard-queue-heading">
        <div>
          <div className="dashboard-queue-title"><h2 id="attention-heading">Now</h2><span className="count-badge">{state === "active" ? attentionRows.length : 0}</span></div>
          <p>One shared order for safety, patient flow, and due work.</p>
        </div>
        <Link href="/calendar?queue=open" className="button button-secondary dashboard-queue-link">View full queue</Link>
      </header>

      {state === "active" && criticalRow ? (
        <ol className="dashboard-queue-list">
          <CriticalQueueItem row={criticalRow} />
          {compactRows.map((row) => <CompactQueueItem key={row.id} row={row} />)}
          {routineCount > 0 ? <li className="queue-routine-summary">{routineCount} routine items are hidden until urgent work clears.</li> : null}
        </ol>
      ) : <AttentionStatePanel state={state as Exclude<DashboardAttentionState, "active">} />}
    </section>
  );
}

function PatientFlow() {
  return (
    <aside className="surface patient-flow" aria-labelledby="patient-flow-heading">
      <header className="patient-flow-heading">
        <div><h2 id="patient-flow-heading">Patient flow</h2><p>Next changes to watch</p></div>
        <Link href="/calendar">Calendar</Link>
      </header>
      <ol>
        {arrivingNext.map((item) => (
          <li key={`${item.time}-${item.patient}`}>
            <time>{item.time}</time>
            <div><strong>{item.patient}</strong><span>{item.type} · {item.provider}</span></div>
            <span className="patient-flow-state">{item.state}</span>
          </li>
        ))}
      </ol>
      <Link href="/calendar" className="patient-flow-footer">Open the full schedule<Icon name="chevron-right" size={16} /></Link>
    </aside>
  );
}

export function DashboardWorkspace({
  attentionState = "active",
  initialDemoReschedulingCase,
}: DashboardWorkspaceProps) {
  const queueSummary = {
    active: "1 act-now item",
    resolved: "0 urgent items",
    "coverage-limited": "Coverage limited",
    loading: "Checking priorities",
    error: "Priority data unavailable",
  }[attentionState];

  return (
    <div className="dashboard-page">
      <header className="page-header dashboard-header">
        <div><h1>{PRACTICE_DAY.long.replace(", 2023", "")}</h1><p>Northside clinic · Practice time {minutesToTime(PRACTICE_TIME_MINUTES)}</p></div>
        <div className="header-actions">
          <button type="button" className="icon-button" aria-label="Open notifications, 5 unread"><Icon name="bell" /><span className="notification-dot" aria-hidden="true">5</span></button>
          <Link href="/calendar?new=1" className="button button-primary"><Icon name="plus" size={16} />New appointment</Link>
        </div>
      </header>

      <DemoReschedulingPanel initialReschedulingCase={initialDemoReschedulingCase} />

      <section className="dashboard-context" aria-label="Practice context">
        <div className="dashboard-context-item"><Icon name="patients" size={17} /><span><strong>Northside clinic</strong><small>4 providers in clinic</small></span></div>
        <div className="dashboard-context-item"><Icon name="clock" size={17} /><span><strong>Checked 10:48 AM</strong><small>All connected queues</small></span></div>
        <div className="dashboard-context-item dashboard-context-status"><Icon name={attentionState === "resolved" ? "check" : "warning"} size={17} /><span><strong>{queueSummary}</strong><small>Shared practice queue</small></span></div>
        <Link href="/calendar" className="dashboard-context-calendar">Open calendar<Icon name="chevron-right" size={16} /></Link>
      </section>

      <div className="dashboard-workspace-grid"><AttentionQueue state={attentionState} /><PatientFlow /></div>
    </div>
  );
}
