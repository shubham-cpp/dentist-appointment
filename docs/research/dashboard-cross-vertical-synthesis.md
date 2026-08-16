# Cross-vertical synthesis for the Brightview dashboard

**Prepared:** 1 August 2026  
**Purpose:** Turn four independent research questions into one evidence-backed dashboard direction.

## Evidence base

This synthesis draws from four focused studies using first-party product documentation, official design systems, standards, and government or clinical guidance. The source set spans dental practice management, clinical workflow, incident response, customer support, field service, logistics, fraud and financial operations, monitoring, public services, and accessibility.

Detailed studies:

1. [Queue priority evidence](dashboard-queue-priority-evidence.md)
2. [Mobile exception context](dashboard-mobile-exception-context.md)
3. [Resolved-state evidence](dashboard-resolved-state-evidence.md)
4. [Dental character through typography and geometry](dashboard-dental-character-typography-geometry.md)

## Executive decision

Brightview should become a **verified exception-control surface**, not a generic dashboard.

The coherent model is:

1. **Safety before scoring.** Possible clinical emergencies leave the administrative queue for qualified clinical triage. NHS England distinguishes emergency, urgent, and non-urgent unscheduled dental pathways and requires appropriately trained clinical triage. ([NHS England](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))
2. **Rank by consequence and time.** Default ordering should be clinical safety gate → operational tier → deadline → disruption scope → age. PagerDuty separates impact, response priority, and notification urgency; Intercom can sort by the next SLA target rather than message type. ([PagerDuty](https://support.pagerduty.com/main/docs/incident-priority), [Intercom](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))
3. **Make every rank explain itself.** Each exception must show what changed, why it matters now, who owns it, and the next action. Opaque scores invite automation bias.
4. **Use dental work as the visual language.** Provider, operatory, procedure, appointment time, recall age, and financial due state should determine row geometry. Open Dental's configurable appointment views demonstrate that these are stable dental-operational objects, not decoration. ([Open Dental](https://www.opendental.com/manual/appointmentvieweditwindow.html))
5. **Compress semantics, not facts, on mobile.** Preserve patient + exception, time/deadline + why now, and status + owner. HL7 FHIR models task focus, period, status, priority, and owner as distinct semantics; PagerDuty retains urgency, assignment scope, and queue state on mobile. ([HL7 FHIR Task](https://hl7.org/fhir/task.html), [PagerDuty mobile](https://support.pagerduty.com/main/docs/mobile-app))
6. **Prove a healthy state.** “Practice under control” is valid only when scope, freshness, permissions, and required queue coverage are known. Google Cloud documents that missing data may be unknown or policy-dependent rather than healthy; Microsoft Sentinel makes source health attributable to named resources and timestamps. ([Google Cloud](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth), [Microsoft Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/health-table-reference))
7. **Use one recognisable clinical-humanist type system.** NHS England demonstrates how consistent typography becomes clinical identity; Carbon's productive system uses a 14px base and reserves 12px for labels/helper text rather than body copy. ([NHS fonts](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/), [Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/))

## Answers to the four questions

| Question | Evidence-backed answer | Brightview decision |
|---|---|---|
| What if queue order reflected patient harm and interruption cost? | Mature systems use safety gates, explicit tiers, deadlines, scope, ownership, and aging—not request-type grouping or an unexplained score. Strict priority needs anti-starvation controls. | Default to `clinical safety → P1–P4 tier → deadline → affected appointments/resources → ownership → age`. Allow audited promotion; only authorised clinicians may demote clinically classified work. |
| Which three facts must remain visible on a phone? | The stable unit is three semantic atoms, not three columns: focus, temporal risk, and control state. | Show `patient + exception`; `time/deadline + why now`; `status + owner`. Add one type-specific qualifier only when it changes the pre-tap decision. |
| What should appear when urgent work is resolved? | Mature systems retain recent history, future obligations, scope, and monitoring health. Zero without coverage is not proof. | Show `Practice under control` only after coverage and freshness gates pass; then show checked scope, next appointment/checkpoint, routine/deferred work, and the last three resolutions. |
| Can the product feel dental without decoration? | Yes. Mature clinical and operational products gain identity through repeated type, numerals, status grammar, and domain-native geometry. | Prototype Atkinson Hyperlegible Next versus Source Sans 3; use provider/operatory collision blocks, clinical due-age strips, booking decision tuples, and ledger-aligned finance rows. |

## Proposed desktop hierarchy

### 1. Quiet operational header

Keep clinic, date, practice time zone, notifications, and New appointment. Remove the greeting as the dominant page statement. Routine totals become compact context rather than a KPI-card strip.

### 2. Needs attention owns the first visual beat

Order exceptions by consequence and time-to-impact:

1. Possible emergency signal → separate clinical review pathway
2. **P1 · Act now** — imminent care or schedule failure
3. **P2 · Today** — care or operations materially worsen if delayed
4. **P3 · Soon** — real near-term response deadline
5. **P4 · Routine** — necessary work without near-term consequence

Each row shows:

- urgency tier and why now;
- patient and exception;
- deadline or next affected appointment;
- concrete impact/scope;
- lifecycle state and owner;
- one next-step action.

Age escalates review inside non-clinical tiers and triggers protected routine capacity; it must not manufacture clinical urgency. Revenue, insurance status, patient profitability, or predicted handling time must never outrank patient safety.

### 3. Exception geometry carries product character

Use one stable queue shell but allow four purposeful anatomies:

- **Booking request:** one schedule tuple—requested time, procedure, provider, operatory.
- **Schedule conflict:** two aligned appointment allocations with an explicit overlap bracket or collision mark.
- **Overdue clinical work:** due-age strip, task, accountable clinician, and blocked next step.
- **Invoice follow-up:** ledger-aligned amount, age, last contact, owner, and next financial action.

Exception type, urgency, lifecycle state, ownership, and deadline remain separate dimensions. Avoid rendering all five as equally rounded pills.

### 4. Routine context follows the queue

Arriving next, follow-ups within target, and provider schedule preview remain visible but quieter. They enter the exception queue only when a defined threshold is breached.

## Proposed mobile hierarchy

Replace the clipped table with ordered, variable-height list cards.

```text
[Act now]                           Today · 11:00
Noah Brown · Schedule conflict
Hygiene visit overlaps Dr Chen
Needs resolution · Dr Chen                    ›
```

Rules:

- 88–112px typical card height; grow for long names and zoom.
- 44×44px minimum product target for visible actions.
- Critical title, deadline, state, and owner wrap; they do not truncate.
- One optional qualifier; secondary history and irreversible actions move into detail.
- Back restores queue scope, sort, filters, scroll offset, and selected item.
- Clinic/date/current time/next arrival remain in a compact sticky summary; the desktop Today rail must not simply disappear.

Carbon recommends contained lists for concise multiline disclosure and data tables for genuinely comparative multicolumn work; Android's canonical list-detail pattern uses full-screen detail at compact widths and side-by-side panes when space allows. ([Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/), [Android list-detail](https://developer.android.com/develop/adaptive-apps/guides/list-detail))

## Proposed resolved state

Render the healthy state only if all gates pass:

- zero active urgent items for the selected clinic/date;
- every required queue evaluated;
- every required source within its freshness threshold;
- viewer permissions cover the stated scope;
- no deferred item is currently due;
- practice time zone known.

Example:

> **Practice under control**  
> No urgent items found across the checked Northside clinic queues as of **10:48 AM EDT**.

Proof row:

- `Urgent now: 0`
- `Coverage: 6 of 6 queues checked`
- `Scope: Northside · 4 providers · today`
- `Freshness: checked 18 seconds ago · oldest source 31 seconds`

Then show:

1. next appointment or operational checkpoint;
2. routine work within target;
3. deferred work and its next return time;
4. the last three resolved exceptions with outcome and actor;
5. actions: Open today's schedule, Review resolved activity, View monitoring details.

If any source is stale, missing, permission-limited, or not configured, use **Coverage limited** rather than healthy green. Do not use confetti, “You're done,” blank whitespace, or an unqualified “All clear.” Carbon explicitly distinguishes successful completion, no-data, and error empty states. ([Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/))

## Typography decision

Prototype two candidates with identical data and geometry:

1. **Atkinson Hyperlegible Next** — preferred human-clinical direction. Braille Institute describes the 2025 release as free to use, available in seven weights and variable formats, and designed for improved low-vision legibility. ([Braille Institute](https://www.brailleinstitute.org/about-us/news/braille-institute-launches-enhanced-atkinson-hyperlegible-font-to-make-reading-easier/))
2. **Source Sans 3** — conservative production direction. Adobe describes it as a UI family and distributes variable WOFF/WOFF2 files under OFL-1.1. ([Adobe Source Sans](https://github.com/adobe-fonts/source-sans))

IBM Plex Sans is a valid technical-precise alternative, but its industrial voice is less aligned with the recommended human-clinical tone.

Proposed floor:

| Token | Size / line height | Use |
|---|---:|---|
| Page title | 24 / 30px | Operational day/dashboard title |
| Section title | 18 / 24px | Needs attention, Arriving next |
| Patient/row primary | 15 / 20px | Patient and exception synopsis |
| Body | 14 / 20px | Issue and instructions |
| Metadata | 13 / 18px | Provider, operatory, owner, last contact |
| Label | 12 / 16px | Short headings and state labels only |
| Time/amount | 14 / 20px | Tabular times, durations, amounts, and age |

No patient, issue, provider, appointment, deadline, or ownership fact should fall below 13px. Use sentence case and tabular numerals.

## Recommended delivery order

1. **Domain model:** add safety pathway, priority tier, deadline, impact scope, ownership, explanation, freshness, and override audit fields.
2. **Typography and shell accessibility:** prototype the two fonts, adopt the operational scale, and restore accessible navigation names.
3. **Desktop queue:** replace request-type ordering, add why-now/deadline/owner, and build the four exception anatomies.
4. **Mobile queue:** replace hidden columns with semantic cards and restore list state after detail.
5. **Resolved state:** implement verified healthy, coverage-limited, recent-resolution, and deferred-work states.
6. **Validation:** test with practising dentists and receptionists using anonymised scenarios at 1280px, 390px, 200% zoom, keyboard, and screen reader.

## Measures for the prototype

- Can staff identify the most consequential item in under five seconds?
- Can staff explain why the first item is first without opening it?
- On mobile, can staff answer who/what, when/why now, and status/owner before tapping?
- Does a grayscale view preserve urgency and exception differences?
- Does resolving the last urgent item produce a trustworthy state without hiding routine or deferred work?
- Do long patient/provider names, 200–400% zoom, and missing-source fixtures preserve meaning?
- Are routine items aging indefinitely, or does protected routine capacity prevent starvation?

## Guardrails

- The queue is operational decision support, not a diagnostic system.
- Possible clinical emergencies require a qualified clinical pathway.
- No revenue- or VIP-based promotion inside clinical tiers.
- No predicted handling-time penalty for complex or accessibility-dependent care.
- No missing data treated as zero.
- No urgency conveyed by color alone.
- No operational facts hidden merely to make mobile fit.
- No routine work allowed to starve indefinitely.
- No resolved item erased; corrections create a reopen or compensating event.
