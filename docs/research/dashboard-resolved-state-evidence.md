# Dashboard resolved-state evidence: when the practice is genuinely under control

**Prepared:** 1 August 2026  
**Question:** What should the dashboard show when every urgent item has been resolved and the practice is genuinely under control?  
**Product context:** Brightview is an exception-first operational dashboard for dentists and receptionists working through a live practice day under interruption.

## Executive answer

Brightview should not replace its exception queue with a decorative empty state or an unsupported “All clear.” It should show a **verified operational state**:

> **Practice under control**  
> No urgent items were found across the checked Northside clinic queues as of 10:48 AM. Monitoring is active.

That statement must be immediately supported by:

1. **Proof of scope:** location, practice date/time zone, providers, and exception categories checked.
2. **Proof of freshness and coverage:** last evaluation time, next refresh, data age, and source/connector health.
3. **A quiet preview of what is next:** the next appointment, scheduled checkpoint, and routine work that is waiting but not urgent.
4. **A retained resolution trail:** the last few resolved items with time, outcome, actor or automation, and a path to the audit history.
5. **Honest degradation:** stale, missing, permission-limited, or partially covered data must replace “under control” with a neutral limited-confidence state.

This is the consistent pattern across mature operational products. PagerDuty separates open incidents from resolved history and retains a timestamped incident timeline; Google Cloud warns that missing data can leave health unknown or even close incidents depending on policy; Microsoft Sentinel exposes health-event timestamps and affected resources; QuickBooks treats zero difference as proof only within a named account and statement period; and Samsara retains status-change audit records with event time, logged time, initiator, and status. ([PagerDuty incident lifecycle](https://support.pagerduty.com/main/docs/incidents), [Google Cloud missing-data behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth), [Microsoft Sentinel health table](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference), [QuickBooks reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/reconcile-account-quickbooks-desktop/L2U5ZKM1J_US_en_US), [Samsara route audit log](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes))

## Method and evidence labels

This review uses 12 first-party sources from official product documentation, vendor help centers, and an official design system. It covers three dental products and five adjacent operational verticals: incident management, security operations, customer-support inboxes, finance reconciliation, and logistics/dispatch.

- **Documented** means the source explicitly describes the behavior.
- **Inference** means a Brightview recommendation derived from the documented pattern, not a claim that the source product implements Brightview's proposed UI.
- **Not established** means the public source does not establish the behavior; it does not prove absence.

Public dental documentation provides credible evidence for queue scope, follow-up completion, and recent-completion history, but does not publish a complete “practice under control” dashboard state. The Brightview specification therefore combines dental workflow evidence with mature adjacent operational patterns.

## Evidence matrix

| Vertical and product | Documented resolved/healthy-state evidence | Proof, recency, scope, and next work | Stale or partial-coverage handling | Brightview implication |
|---|---|---|---|---|
| **Dental — Dentally Tasks** | Tasks are separated into **All, Today, Upcoming, and Completed**; due-within-24-hours work creates a red counter. ([Dentally task list](https://help.dentally.com/en/articles/4066063-how-to-access-and-manage-your-practice-personal-task-list)) | The state is scoped by time and completion, while upcoming work remains visible rather than becoming an undifferentiated empty list. | Connector freshness is not established in this source. | When urgent work reaches zero, keep **routine/upcoming** work visible and explicitly separate it from resolved work. |
| **Dental — Dentally Dashboard** | A selected time filter updates appointments, accounts, invoicing, and statistics; for multi-site customers, the dashboard is an overview of the full group. ([Dentally dashboard](https://help.dentally.com/en/articles/6817566-how-to-use-the-dentally-dashboard/)) | The meaning of every number depends on the selected timeframe and organization scope. | Data-age or partial-source behavior is not established in this source. | “No urgent items” must state clinic and timeframe; a location-filtered zero must never read like a whole-group zero. |
| **Dental — Dentrix Ascend** | Completing a patient follow-up moves it from **Needs Follow-up** to **Complete (Last 7 Days)**; date-range filters are retained on the same device. ([Dentrix Ascend follow-up release notes](https://learn.dentrixascend.com/release-notes-february-14-2022-prod-387/)) | Recent completion is retained for seven days, preserving evidence after the active queue clears. | The source does not establish source-health behavior. | Replace the cleared queue with a small **Recently resolved** trail, not blank space or vanished work. |
| **Dental — Open Dental** | The Unscheduled List supports provider, clinic, site, status, procedure, and date filters; users manually refresh it; once an appointment is rescheduled it no longer appears, and communication notes can be recorded. ([Open Dental Unscheduled List](https://www.opendental.com/manual/unscheduled.html)) | A zero is meaningful only for the visible filter scope and after refresh; removed work still has a documented follow-up path. | The explicit Refresh control means the displayed list can be older than the underlying state. | Show active filters and last refresh beside the zero state; retain the resolution/contact record outside the active queue. |
| **Incident management — PagerDuty** | Incidents move through Triggered, Acknowledged, and Resolved. A resolved incident can be reopened, and the incident Timeline records status timestamps, actions, and notifications. ([PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents)) | Resolution is a state transition with a durable history, not deletion. | A resolved incident can return if further work is required. | Every resolved Brightview exception needs a durable outcome and a permitted reopen/compensating path; “resolved” must not erase evidence. |
| **Incident management — PagerDuty dashboard** | Open incidents remain ordered by urgency; the dashboard separately shows activity over the last seven days and current/upcoming on-call assignments. ([PagerDuty incidents page](https://support.pagerduty.com/main/lang-do/docs/navigate-the-incidents-page)) | The healthy view answers both “what just happened?” and “who/what is next?” | Coverage depends on configured services and escalation policies; the page does not make an unscoped universal safety claim. | Use the cleared space for **recently resolved** plus **next scheduled operational checkpoint**, while keeping scope explicit. |
| **Security operations — Google Cloud Monitoring** | Monitoring can automatically close an incident when a condition stops being met, but missing or delayed measurements can leave a condition unknown, keep an incident open, create an incident, or close one depending on configuration. Third-party delays can commonly be 5–15 minutes and reach 30 minutes. ([Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth)) | A lack of open incidents is not sufficient proof; the monitoring policy and incoming-data state determine confidence. | Missing data is a first-class state, not equivalent to good data. | If any Brightview feed is stale or missing, downgrade to **Coverage limited** and say which queue cannot be verified. Never convert “no data” into zero urgent. |
| **Security operations — Microsoft Sentinel** | `SentinelHealth` records UTC event time, resource ID/name, operation, status, and description for connectors, automation, playbooks, and analytics rules. ([Microsoft Sentinel health table](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference)) | Health is attributable to a named monitored resource and timestamped event. | Health drift can be inspected per resource, making partial failure visible. | Show “6 of 6 operational sources checked,” oldest source age, and named degraded sources rather than one undifferentiated green dot. |
| **Customer support — Intercom Snooze** | Snoozed conversations leave the open queue and automatically reopen when their time expires or relevant activity occurs; Intercom says work should be closed only when fully resolved. ([Intercom snooze](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation)) | Future obligations remain scheduled even while no longer urgent; reopen events are timestamped in the conversation. | A zero open count may coexist with snoozed work due to return. | Surface “2 deferred, next returns at 1:30 PM” below the verified zero; do not treat deferral as completion. |
| **Finance — QuickBooks** | A reconciliation is complete when the statement and QuickBooks transactions match and the Difference is **$0.00**; the workflow names the account, statement date, beginning/ending balances, and provides a reconciliation report and undo/discrepancy paths. ([QuickBooks reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/reconcile-account-quickbooks-desktop/L2U5ZKM1J_US_en_US)) | Zero is credible because the operands, period, and account are visible and the result is recorded. | A later change can create a discrepancy, and users can inspect or undo the reconciliation. | Pair “0 urgent” with the checked categories and period, then retain a report-like audit trail that can reveal later changes. |
| **Logistics/dispatch — Samsara** | Routes expose Scheduled, Arrived, Skipped, EnRoute, and Completed states. Stop audit logs retain Event, Event Time, Logged At, Comment, Initiated By, and Status; results can be narrowed by date and tags. ([Samsara route management](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes)) | Completion is verified against planned/actual events and remains traceable to person or automated tracking. | Manual and automated events are distinguishable; a skipped stop is not represented as completed. | Distinguish **resolved**, **deferred**, **cancelled**, and **not observed**. Record actor, event time, recorded time, and reason where relevant. |
| **Design system — IBM Carbon** | Carbon treats completion as a user-action empty state: the message should explain why the space is empty and any useful follow-up, remain concise, and replace the data region. It explicitly notes that configured alerts with nothing triggered means nothing currently requires attention, not that alerts are absent. ([Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)) | The message stays contextual to the region and keeps one clear next action rather than presenting a dead end. | Carbon separates successful completion, no-data, and error-management empty states. | Use a calm, contextual proof panel inside Needs Attention. Do not reuse the same visual for “resolved,” “never configured,” “failed to load,” and “permission denied.” |

## What the mature patterns agree on

### 1. A trustworthy zero is a scoped result, not a mood

Dentally's dashboard numbers change with timeframe and can represent one group across multiple sites; Open Dental's queue can be filtered by provider, clinic, site, status, procedure, and dates; and QuickBooks proves zero against a named account and statement period. ([Dentally dashboard](https://help.dentally.com/en/articles/6817566-how-to-use-the-dentally-dashboard/), [Open Dental Unscheduled List](https://www.opendental.com/manual/unscheduled.html), [QuickBooks reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/reconcile-account-quickbooks-desktop/L2U5ZKM1J_US_en_US))

**Inference:** Brightview's healthy-state headline is valid only when its scope is visible in the same region: clinic, practice date/time zone, included providers, and checked exception categories.

### 2. “No open work” and “no monitored problem” are different claims

Google Cloud documents multiple behaviors for missing data, including unknown states and policy-driven closure; Microsoft Sentinel exposes resource-specific health events so operators can inspect whether monitoring itself is functioning. ([Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth), [Microsoft Sentinel health table](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference))

**Inference:** Brightview needs two independent assertions:

- **Queue state:** no urgent exception currently satisfies the practice's urgency rules.
- **Observation state:** every expected source was checked recently enough to support that conclusion.

If observation is incomplete, the interface must not show “Practice under control.”

### 3. Resolution should move work, not erase it

Dentrix Ascend moves completed follow-ups into a seven-day completed view; PagerDuty retains resolved incidents and full timelines; Samsara retains an audit log with event and recording timestamps plus the initiating actor. ([Dentrix Ascend follow-up release notes](https://learn.dentrixascend.com/release-notes-february-14-2022-prod-387/), [PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents), [Samsara route management](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes))

**Inference:** The end state should preserve the last three to five resolutions and link to the full audit history. Resolution is a transition from active to recent history, never disappearance.

### 4. Healthy operations still have a future

Dentally separates Today, Upcoming, and Completed work; PagerDuty combines recent activity with current/upcoming on-call responsibility; Intercom's snoozed work can return at a specified time or on new activity. ([Dentally task list](https://help.dentally.com/en/articles/4066063-how-to-access-and-manage-your-practice-personal-task-list), [PagerDuty incidents page](https://support.pagerduty.com/main/lang-do/docs/navigate-the-incidents-page), [Intercom snooze](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation))

**Inference:** “Under control” should smoothly hand the receptionist to the next appointment or checkpoint and disclose deferred items due to return. It must not imply that the practice day is finished.

## Peak-end and reassurance pattern

The emotional peak should be the **last urgent item becoming resolved**, but the lasting impression should be quiet control, not celebration.

1. **Confirm the specific action:** “Schedule conflict resolved for Noah Brown.”
2. **Re-evaluate the full scoped queue:** do not switch to a healthy state based only on the last visible row disappearing.
3. **Show proof before praise:** checked queues, scope, timestamp, and monitoring health precede the reassuring headline.
4. **Retain recent evidence:** show the latest resolutions and who or what completed them.
5. **Hand off to what is next:** next patient, next routine deadline, and next automatic check.

PagerDuty's resolved state plus timeline, QuickBooks' zero-difference proof plus report, and Dentrix Ascend's recent-completion tab all support this close-the-loop pattern. ([PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents), [QuickBooks reconciliation](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/reconcile-account-quickbooks-desktop/L2U5ZKM1J_US_en_US), [Dentrix Ascend follow-up release notes](https://learn.dentrixascend.com/release-notes-february-14-2022-prod-387/))

## Brightview end-state specification

### State eligibility

Brightview may render **Practice under control** only when every condition below is true:

| Gate | Required condition | If the gate fails |
|---|---|---|
| Urgent queue | Zero active items meet the configured urgent rules for the selected clinic and practice day | Render **Needs attention** |
| Queue coverage | Booking approvals, conflicts, overdue arrivals, incomplete care handoffs, urgent communications, and configured billing exceptions were all evaluated | Render **Coverage limited** and name omitted/failed queues |
| Data freshness | Every required source is within its source-specific freshness threshold | Render **Coverage limited**; show source, last received time, and retry/status action |
| Permissions | The viewer has coverage visibility for the clinic/providers included in the claim | Narrow the claim to visible scope; never imply hidden providers are checked |
| Deferred work | No deferred item is currently due; future deferred items have a known return time | Show the next return time; if overdue, promote to Needs attention |
| Time zone | Practice date and time zone are known and displayed | Suppress the healthy claim until resolved |

The data-freshness gate is essential: Google Cloud shows that missing data can produce unknown or policy-dependent incident behavior, while Sentinel makes health attributable to named resources and UTC timestamps. ([Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth), [Microsoft Sentinel health table](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference))

### 1. Headline and supporting copy

**Verified healthy state**

> **Practice under control**  
> No urgent items found across the checked Northside clinic queues as of **10:48 AM EDT**.

Supporting status line:

> Monitoring active · next automatic check in 42 seconds

**Limited-confidence state**

> **No urgent items detected in the queues we could check**  
> Online-booking updates have not arrived for 12 minutes. Other Northside clinic queues were checked at 10:48 AM EDT.

Action: **Review monitoring**

The limited-confidence state must use neutral/warning styling, not healthy green. This follows the documented distinction between no triggered alerts and missing monitoring data. ([Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth), [Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/))

### 2. Proof indicators

Show four compact, text-labelled indicators directly below the headline:

| Indicator | Example | Interaction |
|---|---|---|
| **Urgent now** | `0` | Opens the evaluated rule summary, not an empty generic list |
| **Coverage** | `6 of 6 queues checked` | Opens queue/source health and permissions scope |
| **Practice scope** | `Northside · 4 providers · today` | Opens location/provider/date scope control |
| **Freshness** | `Checked 18 sec ago · oldest source 31 sec` | Opens source-by-source data age; manual refresh is secondary |

Do not use a single green shield as the only evidence. The proof should remain understandable in text, and the top-level state should be recomputed when scope changes.

### 3. Next-event preview

Use the space immediately after proof for a compact chronological handoff:

> **Next scheduled checkpoint**  
> 11:00 AM · Noah Brown arrival · Dr Aisha Patel · in 12 min  
> Then: 11:25 AM Michael Thompson · Dr Brian Chen

Below it, disclose nonurgent work without turning it into an alarm:

> **Routine queue:** 3 booking requests within target · next decision due 1:30 PM  
> **Deferred:** 2 follow-ups · next returns 2:00 PM

This adapts Dentally's Today/Upcoming separation, PagerDuty's upcoming responsibility, and Intercom's timed reopening of deferred work. ([Dentally task list](https://help.dentally.com/en/articles/4066063-how-to-access-and-manage-your-practice-personal-task-list), [PagerDuty incidents page](https://support.pagerduty.com/main/lang-do/docs/navigate-the-incidents-page), [Intercom snooze](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation))

### 4. Recently resolved activity

Show the last three resolutions, expandable to the full audit trail:

| Resolved | Item | Outcome | Actor |
|---|---|---|---|
| 10:46 AM | Noah Brown schedule conflict | Moved to 11:00 AM; patient notified | Maya Patel |
| 10:39 AM | Emma Johnson unsigned note | Signed | Dr Brian Chen |
| 10:31 AM | Sofia Martinez booking request | Approved for Thu 2:15 PM | Maya Patel |

Each row should expose **View details**. Where policy permits correction, use **Reopen** or a compensating action; do not silently delete or rewrite history. PagerDuty retains status/action timelines and allows reopening, while Samsara distinguishes event time, logged time, status, and initiator. ([PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents), [Samsara route management](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes))

### 5. Monitoring and refresh metadata

The compact default line should read:

> **Monitoring active** · 6/6 sources healthy · evaluated 10:48:12 AM EDT · next refresh 10:49:00 AM

The disclosure view should show:

- source/queue name;
- covered clinic/providers;
- last event received;
- last successful evaluation;
- freshness threshold;
- current status: Healthy, Delayed, Failed, Permission limited, or Not configured;
- action: Retry, View status, Fix connection, or Request access.

Use the **oldest required source age**, not merely the most recent refresh time, in the compact summary. Sentinel's health schema associates health with a resource name, event time, status, and description; Google Cloud demonstrates why delayed data must be modeled separately from a healthy value. ([Microsoft Sentinel health table](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference), [Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth))

### 6. Actions

Use one operational primary action and a small number of secondary paths:

- **Primary:** `Open today's schedule`
- **Secondary:** `Review resolved activity`
- **Secondary:** `View monitoring details`
- **Utility:** `Refresh now`

Keep `New appointment` in the normal page header rather than making it the empty state's purpose. Carbon recommends a concise contextual empty state with one most important action and warns against turning it into a dead end or a menu of unrelated options. ([Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/))

## Visual and interaction direction

- Keep the normal **Needs attention** container and replace only its table body with the verified end-state content; this preserves spatial memory.
- Use a restrained teal check icon plus text, not a green page wash. Proof indicators should use neutral surfaces and ordinary operational typography.
- Do not animate confetti, bounce the layout, or auto-dismiss the state. The user may still be responsible for the next patient and routine work.
- When the last urgent item resolves, announce the specific resolution first, then announce the recomputed scoped state through the existing live region.
- On narrow screens, order the content as headline → coverage/freshness → next event → routine/deferred → recently resolved → actions.

## Anti-patterns to reject

| Anti-pattern | Why it is unsafe or misleading | Required alternative |
|---|---|---|
| **Confetti or congratulatory “You're done!”** | The practice day is continuing; the emotional cue implies work is over and is disproportionate to a safety-sensitive operational state. | Calm confirmation plus next scheduled checkpoint. |
| **“All clear” without scope** | A filtered location, provider set, or date can produce zero while other work remains. | Name clinic, date/time zone, providers, and checked categories. |
| **Green equals proof** | Color cannot establish whether data is fresh, complete, or permission-limited. | Text-labelled counts, coverage, and freshness; green/teal only supports meaning. |
| **Blank whitespace after clearing the queue** | It erases proof of recent work and leaves no useful next step. | Recently resolved activity plus next event. |
| **Treating missing data as zero** | Monitoring systems document missing/unknown states and policy-dependent closure behavior. ([Google Cloud alert behavior](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth)) | Coverage-limited state with source and last-received time. |
| **Hiding snoozed/deferred work** | Deferred items can return automatically; zero open does not mean zero future obligation. ([Intercom snooze](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation)) | Show deferred count and next return time. |
| **Deleting resolved items from view** | Mature incident, dental follow-up, and dispatch systems retain history for review. ([PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents), [Dentrix Ascend follow-up release notes](https://learn.dentrixascend.com/release-notes-february-14-2022-prod-387/), [Samsara route management](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes)) | Keep a short recent trail and full audit link. |
| **One global refresh timestamp** | A recent UI refresh can conceal one stale source. | Show oldest required source age and source-level details. |
| **Counting all routine work as urgent** | The dashboard never reaches a credible resolved state and trains staff to ignore warning emphasis. | Separate urgent now, routine within target, upcoming, deferred, and resolved. |

## Acceptance criteria for the resolved state

1. The healthy headline cannot render when any required source is stale, failed, not configured, or outside the viewer's permission scope.
2. The headline names the clinic and includes an absolute evaluation time plus practice time zone.
3. A details disclosure lists every checked exception category and source-level health.
4. Changing clinic, date, provider scope, or urgency policy immediately invalidates and recomputes the state.
5. Routine and deferred work remain visible with next-due/return time without being styled as urgent.
6. The next scheduled patient/checkpoint remains visible on desktop and narrow layouts.
7. At least the three most recent resolutions remain visible with event time, outcome, and actor/automation.
8. Resolutions link to an immutable audit trail; corrections create a reopen or compensating event.
9. The state uses text and structure as evidence; color and icons are supplemental.
10. The transition after resolving the last item announces both the specific result and the recomputed queue status without moving keyboard focus unexpectedly.
11. The resolved panel has one primary action and no celebratory animation.
12. Test fixtures cover true zero, routine-only work, deferred work due later, stale source, failed source, partial permission coverage, and a new urgent item arriving while the resolved state is visible.

## Source inventory

1. [Dentally — How to access and manage your practice/personal task list](https://help.dentally.com/en/articles/4066063-how-to-access-and-manage-your-practice-personal-task-list)
2. [Dentally — How to use the Dentally dashboard](https://help.dentally.com/en/articles/6817566-how-to-use-the-dentally-dashboard/)
3. [Dentrix Ascend — Patient Follow-Up redesign and Complete (Last 7 Days)](https://learn.dentrixascend.com/release-notes-february-14-2022-prod-387/)
4. [Open Dental — Unscheduled List](https://www.opendental.com/manual/unscheduled.html)
5. [PagerDuty — Incidents](https://support.pagerduty.com/main/docs/incidents)
6. [PagerDuty — Navigate the Incidents Page](https://support.pagerduty.com/main/lang-do/docs/navigate-the-incidents-page)
7. [Google Cloud Monitoring — Behavior of metric-based alerting policies](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth)
8. [Microsoft Sentinel — Health tables reference](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference)
9. [Intercom — Snooze a conversation](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation)
10. [QuickBooks — Reconcile an account](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/reconcile-account-quickbooks-desktop/L2U5ZKM1J_US_en_US)
11. [Samsara — Manage Routes and Stop Audit Log](https://kb.samsara.com/hc/en-us/articles/4409668581261-Manage-Routes)
12. [IBM Carbon Design System — Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)

The 12 first-party sources span nine mature products or standards and eight domain groupings.
