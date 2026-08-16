# Mobile exception context for the Brightview dashboard

**Prepared:** 1 August 2026  
**Question:** Which facts must remain visible before staff tap an exception on a phone?  
**Products and standards reviewed:** HL7 FHIR Task, PagerDuty, Stripe Radar, Zendesk Support, Salesforce Field Service, Open Dental, CareStack, IBM Carbon, VA.gov Design System, Android Adaptive Apps, Apple Human Interface Guidelines, WCAG 2.2

## Method and evidence labels

This review uses only primary sources: official product documentation, official help centres, standards, and first-party design-system guidance. It covers dental operations and adjacent operational queues in clinical workflow, incident response, customer support, field service, and fraud review.

- **Documented** means a first-party source explicitly describes the product or standard.
- **Observed structure** means the source enumerates fields or a component anatomy; it does not prove how every account is configured.
- **Inference** means a recommendation for Brightview derived from the cross-product evidence. It is not a claim that another product behaves identically.

Public documentation is evidence of a mature product's model, not evidence of usability, clinical safety, regulatory compliance, or every current in-product variation. Screens behind authentication were not tested.

## Executive answer

Do not preserve three arbitrary table columns. Preserve **three stable information atoms** that together answer the receptionist's pre-tap questions:

1. **Focus — who and what:** patient name plus exception type, expressed as one meaningful title, for example **“Noah Brown · Schedule conflict.”** HL7 FHIR separates a task's subject/focus from its workflow state; PagerDuty notifications expose incident description and impacted service; Stripe's list view exposes customer and risk context. ([HL7 FHIR Task](https://hl7.org/fhir/task.html), [PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB))
2. **Temporal risk — when and why now:** appointment time, due date, or age, paired with an explicit urgency cue when consequence is not self-evident, for example **“Today · 11:00 AM · overlaps Dr Chen.”** PagerDuty can sort by urgency, recency, or priority; Salesforce supports dynamic priority as due dates approach; Stripe keeps amount/date/time visible in its review list. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Salesforce Field Service appointment priority](https://help.salesforce.com/s/articleView?id=service.pfs_scheduling_priority_optimization.htm&language=en_US&type=5), [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB))
3. **Control state — where the work stands and who owns the next move:** status plus owner in one accountability line, for example **“Needs resolution · Dr Chen.”** HL7 models status and owner independently; Zendesk makes status and assignee first-class queue fields; PagerDuty exposes triggered/acknowledged state and assignment; Salesforce work orders separate status and priority. ([HL7 FHIR Task](https://hl7.org/fhir/task.html), [Zendesk mobile views](https://support.zendesk.com/hc/en-us/articles/4408833959706-Working-with-views-in-the-Support-mobile-app), [PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Salesforce work-order fields](https://help.salesforce.com/s/articleView?id=service.fs_work_order_fields.htm&language=en_US))

These are semantic atoms, not single database fields. Combining patient and exception into the title, and status and owner into one accountability line, preserves the facts needed to decide **whether this is mine, whether it is urgent, and whether I can act** without recreating a seven-column table.

### Optional fourth metadata slot

Show one **decision-changing qualifier** only when it changes triage before opening:

- schedule conflict: conflicting provider/operatory or overlap duration;
- booking request: requested procedure or provider constraint;
- unsigned note: procedure/visit reference and elapsed time;
- overdue invoice: amount or days overdue, subject to role permissions;
- follow-up: clinical reason and due age;
- arrival: appointment type/provider and arrival state.

This slot is intentionally conditional. Stripe's queue highlights risk, customer, payment method, customer information, amount, date, and time, but moves richer risk reasoning to a detailed view; Zendesk splits conversations from a Details tab containing tags, assignee, requester, and custom fields. Mature products keep enough context to triage, then disclose the long tail. ([Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB), [Zendesk mobile tickets](https://support.zendesk.com/hc/en-us/articles/4408825697434-Working-with-tickets-in-the-Support-mobile-app))

## Evidence matrix

| Product or standard | Vertical | What remains prominent in the queue/list model | Urgency, status, ownership treatment | What is disclosed later | Brightview learning |
|---|---|---|---|---|---|
| [HL7 FHIR Task](https://hl7.org/fhir/task.html) | Clinical workflow standard | `focus`/subject, status, priority, requested/execution period, owner | Status is required; priority supports routine/urgent/asap/stat; owner is independently searchable | Inputs, outputs, notes, history, workflow definition and referenced operational detail | Treat patient-linked exception, time risk, state, and owner as separate semantics even when visually compressed. Do not use a single colour badge as the whole task model. |
| [PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app) | Incident response | Open incident description, service, number, assignment scope; notifications include incident number, service, and description | Queue can sort by urgency, priority, or recent; triggered and acknowledged remain explicit; Mine/My Teams/All scopes assignment | Responders, impacted service detail, notes, status updates, escalation and reassignment actions | Put consequence/time-sensitive items first; expose status and ownership before entry; retain the user's queue scope. |
| [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB) | Fraud/financial review | Risk level, customer, payment method/customer information, amount, date and time | Review queue is prioritised; risk is explicit and list view is deliberately scan-oriented | Customisable payment context, risk insights, order/shipping metadata, approve/refund/fraud decisions | A list should answer “who/what, how risky, how much/when”; reasoning and irreversible actions belong in detail. |
| [Zendesk mobile views](https://support.zendesk.com/hc/en-us/articles/4408833959706-Working-with-views-in-the-Support-mobile-app) and [mobile tickets](https://support.zendesk.com/hc/en-us/articles/4408825697434-Working-with-tickets-in-the-Support-mobile-app) | Customer support | Ticket views, sortable queue, subject-led ticket entry | Status and assignee are first-class bulk-edit fields; the most recent view is restored | Conversations have their own tab; Details holds tags, assignee, requester and custom fields; metadata is separately disclosed | Preserve queue/filter/sort on return. Keep a readable subject and accountability state in the list; move conversation/history and secondary properties behind detail. |
| [Salesforce Field Service priority](https://help.salesforce.com/s/articleView?id=service.pfs_scheduling_priority_optimization.htm&language=en_US&type=5) and [work-order fields](https://help.salesforce.com/s/articleView?id=service.fs_work_order_fields.htm&language=en_US) | Logistics/field service | Work order/service appointment, due-date-sensitive priority, status | Priority can be fixed or dynamic as due dates approach and may incorporate asset health, customer value, revenue, or SLA; work orders retain separate priority and status | Products, skills, milestones, reports, time sheets and record hierarchy | “Why now” should be computed from consequences and time, not copied from request type. Do not equate status with priority. |
| [Open Dental ODMobile appointments](https://www.opendental.com/manual/opendentalmobileappts.html) | Dental operations | Daily schedule, date, selected operatory and appointment blocks | Phone shows one operatory at a time; appointment is selected to view/edit; date and appointment view remain direct navigation context | Full appointment editing, procedures and rescheduling actions occur after selecting the appointment | Keep date/provider-operatory context around mobile navigation. The phone surface should specialize instead of squeezing a multi-column desktop schedule. |
| [CareStack online appointments](https://carestack.zendesk.com/hc/en-us/articles/25837834831892-Manage-Online-Appointments-and-Track-Potential-Patients) | Dental operations | Appointment created date/time, patient, provider, location, operatory, production type, category and appointment mode are available for request handling | Request vs direct-scheduled state is explicit; patient contact is an action from the request flow | The full request/appointment record contains the broader field set | Procedure/provider/location are legitimate conditional qualifiers, but showing all of them on every phone card would recreate the desktop table. |
| [IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/) | Enterprise design system | Similar content structure per row; concise multi-line content; optional status icon and inline action | Status icons may differ in colour but remain attached to text; rows may be clickable | Complex multi-column content belongs in a data table or disclosed view | Replace the narrow table with a contained list/card whose row height expands for content; keep row structure consistent and avoid hidden columns. |
| [VA.gov Card Status](https://design.va.gov/components/card/card-status/) | Government/health service design system | Heading, body, one action link and optional status | Status is programmatically associated with the card heading and announced; error state uses icon and text, not colour alone | Supporting detail is body content or the linked destination | One clear action and an announced status are safer than tiny repeated “Review” links with ambiguous accessible names. |
| [Android list-detail guidance](https://developer.android.com/develop/adaptive-apps/guides/list-detail) and [list state management](https://developer.android.com/develop/adaptive-apps/cookbook/recyclerview-state) | Adaptive product UI | List on compact screens, list and detail together when space allows | Selected item is explicit scaffold state | Detail takes over the phone screen, but Back returns to the list; scroll/item state should be restored | Use phone cards feeding a full-screen detail and restore queue, filters, scroll and selection; use side-by-side list/detail at wider breakpoints. |
| [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Platform design system | Comfortable, legible controls with alternatives to gestures | Status cannot depend on gesture or tiny controls | Secondary interactions may use gestures only when an onscreen alternative exists | Aim for a 44×44 pt-equivalent interactive target and preserve a visible action path even if swipe shortcuts are added. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Web accessibility standard | Programmatic names and meaningful link purpose in context | Non-text controls require names; target-size and focus requirements remain applicable | Not applicable | Meet 24×24 CSS px minimum targets with spacing, but use the stronger 44px product target for interruption-heavy clinical operations. |

## What mature products preserve across verticals

### 1. The object of work is never status alone

PagerDuty couples incident description with service; Stripe couples risk with customer/payment; Zendesk couples ticket subject with requester context; HL7 defines the task separately from its focus. A red “Needs resolution” pill without the patient and exception forces recall and is not enough to triage. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB), [Zendesk ticket profile fields](https://support.zendesk.com/hc/en-us/articles/4408829574810-Viewing-tickets-in-a-Support-profile), [HL7 FHIR Task](https://hl7.org/fhir/task.html))

**Inference for Brightview:** make the first spoken and visual string `Patient — exception`, not a generic action label. For example, the accessible link name should be “Resolve schedule conflict for Noah Brown, today at 11 AM,” not “Resolve.”

### 2. Urgency is a separate dimension from workflow status

PagerDuty can order by urgency even when incidents have different triggered/acknowledged states. Salesforce explicitly separates appointment priority from status and permits priority to rise as due dates approach. HL7 separately models `priority`, `status`, and `requestedPeriod`. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Salesforce Field Service appointment priority](https://help.salesforce.com/s/articleView?id=service.pfs_scheduling_priority_optimization.htm&language=en_US&type=5), [HL7 FHIR Task](https://hl7.org/fhir/task.html))

**Inference for Brightview:** “Awaiting approval” is state; “requested slot begins in 3 hours” is urgency. A routine-looking status must not suppress a same-day consequence. Queue order should use consequence plus time, while the card continues to display the actual workflow state.

### 3. Ownership is part of triage, not administrative residue

PagerDuty's Mine/My Teams/All scopes, Zendesk's assignee controls, and HL7's owner field all treat accountability as operational. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app), [Zendesk mobile views](https://support.zendesk.com/hc/en-us/articles/4408833959706-Working-with-views-in-the-Support-mobile-app), [HL7 FHIR Task](https://hl7.org/fhir/task.html))

**Inference for Brightview:** show the owner even when it is “Unassigned.” Hide an owner only when the current queue definition guarantees ownership and the guarantee is visible in the queue title, such as “My exceptions.”

### 4. Deep evidence moves behind disclosure, but list state does not disappear

Stripe distinguishes scan-oriented list view from customisable detailed context. Zendesk puts conversation and ticket properties into separate tabs. Open Dental selects an appointment before exposing full edits. Android's list-detail guidance shows detail taking over compact screens and returning to the list, while its state guidance explicitly preserves scroll position and individual list-element state. ([Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB), [Zendesk mobile tickets](https://support.zendesk.com/hc/en-us/articles/4408825697434-Working-with-tickets-in-the-Support-mobile-app), [Open Dental ODMobile appointments](https://www.opendental.com/manual/opendentalmobileappts.html), [Android list-detail](https://developer.android.com/develop/adaptive-apps/guides/list-detail), [Android list state](https://developer.android.com/develop/adaptive-apps/cookbook/recyclerview-state))

**Inference for Brightview:** details can replace the list on a phone, but Back must restore the exact queue, sort, filter chips, scroll offset, and selected/highlighted card. PagerDuty also documents remembering Mine/My Teams/All selection, providing a real product precedent for restoring scope. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app))

## Recommended mobile card anatomy

```text
┌──────────────────────────────────────────────┐
│ [Urgent]                         Today 11:00 │  ← temporal risk
│ Noah Brown · Schedule conflict              │  ← focus; wraps to 2 lines
│ Hygiene visit overlaps Dr Chen              │  ← optional qualifier
│ Needs resolution · Dr Chen             ›    │  ← state + owner
└──────────────────────────────────────────────┘
```

### Structural specification

| Zone | Required content | Behaviour |
|---|---|---|
| Temporal-risk row | urgency word or icon+word, and absolute/relative time | Place earliest/highest consequence first. Never encode urgency by colour alone. Use “Today · 11:00 AM,” “3 days overdue,” or “Requested Thu · 2:15 PM,” not a bare timestamp. |
| Focus title | patient name + exception type | Two-line wrap with no ellipsis at default text size. This is the card heading and link-name anchor. If an exceptionally long name still overflows at zoom, let the row grow. |
| Qualifier | one decision-changing fact | Optional and type-specific. Omit rather than filling the line with generic metadata. |
| Control-state line | status + owner | Always text. Use “Unassigned” explicitly. Programmatically associate status with the focus title, following the VA.gov Card Status pattern. ([VA.gov Card Status](https://design.va.gov/components/card/card-status/)) |
| Interaction | whole-card details link plus at most one direct safe action | Prefer one clear action. Inline actions are permitted in Carbon contained lists, but a dense cluster of icon buttons is not required. ([IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/)) |

### Sizing and density

- Use a **minimum 44×44 CSS-pixel target** for the card link and every visible action. Apple's current guidance recommends 44×44 pt on iOS; WCAG 2.2 AA sets a lower 24×24 CSS-pixel minimum with spacing exceptions. In this interruption-heavy workflow, the stronger platform target is the appropriate product floor. ([Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG 2.2 target size](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/))
- Let rows grow. Carbon's contained-list guidance uses a 48px default row for one line, supports 64px and variable heights, and explicitly allows concise multi-line content. Brightview cards will usually need roughly 88–112px to carry the three semantic atoms without micro-type. ([IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/))
- Keep operational body text at a readable product size; do not compress critical metadata into the current 8–11px range. Apple's platform guidance emphasizes sufficiently sized controls and legibility; the exact CSS type scale should be validated in the browser at 200% and 400% zoom. ([Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow))

### Truncation policy

Critical exception labels, status, time, and error text should not truncate. Carbon says truncation should not be used for titles, labels, errors, validation messages, or notifications, and recommends disclosing full content when truncation is unavoidable. Its contained-list rows can grow with content. ([Carbon overflow content](https://carbondesignsystem.com/patterns/overflow-content/), [IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/))

**Inference for Brightview:**

- wrap the focus title to two lines, then grow the card for larger text;
- keep the status and time intact;
- allow truncation only for optional user-generated qualifiers after the differentiating words;
- do not rely on hover-only tooltips on a phone; the full value must also be available on focus and in the detail heading;
- never truncate several fields in the same card, because cards would stop being distinguishable.

## What moves behind disclosure

The detail view should contain information that supports diagnosis, validation, communication, or commit—not the initial decision to inspect.

| Keep on card | Move to detail |
|---|---|
| patient + exception | patient demographics, contact details, allergies/medications, treatment history, full account context |
| appointment/deadline/age + urgency | full day schedule, alternative slots, operatory/provider constraints, conflict graph |
| status + owner | complete status history, assignment history, notes, audit events |
| one type-specific qualifier | full note text, procedure codes, invoice line items, payment method, correspondence, attachments |
| at most one safe direct action | destructive/irreversible actions, multi-step approval, refund/write-off, reassignment, override reasoning |

CareStack documents broad patient details—medical alerts, medications, treatment history and last/next appointment—on the Patient Details page rather than implying every item belongs in a mobile schedule row. Zendesk similarly moves tags, requester and custom fields into Details; Stripe moves risk reasoning and custom order metadata into review detail. ([CareStack mobile app](https://carestack.com/dental-software/cs-mobile-app), [Zendesk mobile tickets](https://support.zendesk.com/hc/en-us/articles/4408825697434-Working-with-tickets-in-the-Support-mobile-app), [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB))

## Sample cards for Brightview's known item types

The first four are distinct exception kinds in the current `attentionRows` data. Arrivals and follow-ups are current dashboard watch lists; they should enter the exception queue only when a threshold is breached.

### Booking request

```text
[Routine]                         Thu · 2:15 PM
Sofia Martinez · Booking request
Crown fitting
Awaiting approval · Maya Patel                 ›
```

- **Focus:** patient + request type.
- **Temporal risk:** requested slot, upgraded to “Soon” if the decision deadline approaches.
- **Control state:** awaiting approval + owner.
- **Qualifier:** procedure because it affects duration/provider fit.
- **Detail:** alternative times, provider/operatory eligibility, contact history, approve/propose/decline flow.

### Schedule conflict

```text
[Urgent]                         Today · 11:00 AM
Noah Brown · Schedule conflict
Hygiene visit overlaps Dr Chen
Needs resolution · Dr Chen                    ›
```

- **Focus:** patient + conflict.
- **Temporal risk:** today and exact time; “in 12 min” may supplement but not replace absolute time.
- **Control state:** needs resolution + accountable owner.
- **Qualifier:** conflicting resource/consequence.
- **Detail:** conflicting appointments, duration, valid moves, patient contact and audited resolution.

### Unsigned note

```text
[Due now]                     Visit · Today 9:30 AM
Emma Johnson · Unsigned note
Root canal #19 · 1h 18m elapsed
Unsigned · Dr Chen                            ›
```

- **Focus:** patient + unfinished clinical record.
- **Temporal risk:** encounter time and age.
- **Control state:** unsigned + signing clinician.
- **Qualifier:** procedure/visit reference.
- **Detail:** clinical note body and sign/return workflow; role-gated to avoid exposing note content in the general queue.

### Overdue invoice

```text
[Overdue]                           Due 21 Jul
Michael Thompson · Overdue invoice
Invoice #10482 · 18 days overdue
Follow-up needed · Billing                    ›
```

- **Focus:** patient + financial exception.
- **Temporal risk:** due date and age; amount may replace invoice number for billing-authorised roles.
- **Control state:** follow-up state + team owner.
- **Qualifier:** invoice reference or permitted balance.
- **Detail:** line items, payment/contact history and audited financial actions.

### Arrival/check-in watch item

```text
[Next]                         10:55 AM · in 7 min
Noah Brown · Arrival
Hygiene visit · Dr Patel
Arriving · Front desk                         ›
```

This remains in “Arriving next” while normal. It becomes an exception only when state violates a threshold, for example “Not arrived · 8 min late” or “Checked in · provider unavailable.” The same card grammar permits escalation without moving fields.

### Clinical follow-up watch item

```text
[Overdue]                              1 day late
Sarah Williams · Clinical follow-up
Extraction site call
Not started · Unassigned                       ›
```

The current dashboard says only “Follow-up overdue.” The operational card must add an accountable owner or explicitly say “Unassigned,” because clinical task models and adjacent operational queues treat ownership as part of execution state. ([HL7 FHIR Task](https://hl7.org/fhir/task.html), [Zendesk mobile views](https://support.zendesk.com/hc/en-us/articles/4408833959706-Working-with-views-in-the-Support-mobile-app))

## Responsive behaviour replacing the hidden table columns

### Compact phone: below 600px

Replace the `<table>` presentation with an ordered contained list of exception cards. Do not render desktop columns and hide cells with `display: none`.

1. Show the three semantic atoms on every card.
2. Sort by computed consequence/time risk, not request type. Within equal urgency, use deadline then oldest-created.
3. Use a visible queue scope such as **Urgent**, **Mine**, **Unassigned**, and **All**, but default to the practice role's most actionable scope. PagerDuty's mobile app uses Mine/My Teams/All and remembers the selection. ([PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app))
4. Tap the card to open a full-screen detail. Back returns to the same queue, filter, sort, scroll offset, and selected card. Android explicitly recommends preserving list scroll and item state; its list-detail pattern uses full-screen detail on compact widths. ([Android list state](https://developer.android.com/develop/adaptive-apps/cookbook/recyclerview-state), [Android list-detail](https://developer.android.com/develop/adaptive-apps/guides/list-detail))
5. Keep one direct action only when it is safe without more context, such as **Assign to me**. Booking approval, conflict resolution, clinical signing and financial actions should open detail first.
6. Keep arrival/day context as a compact sticky summary above the queue: clinic, date, current time, next arrival, and provider issue count. The current Today rail must not simply disappear.

### Medium: 600–1023px

- Use the same card list in a 40–48% list pane with selected-item detail beside it when space permits.
- Keep the selected card visually and programmatically identified.
- Allow optional qualifier and one compact action, but do not reintroduce seven columns.
- Android's adaptive list-detail model explicitly supports list and detail side by side on larger windows and list/detail replacement on compact windows. ([Android canonical list-detail](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts))

### Wide: 1024px and above

- A real data table is appropriate when all columns fit and users benefit from comparison, sorting and bulk operations.
- Preserve the same semantic order: focus first, temporal risk second, state/owner third. Desktop column order should not contradict phone priority.
- Prefer an in-context detail rail over navigation away for routine review, while keeping the queue visible.
- Carbon distinguishes contained lists for smaller/disclosure contexts from data tables for complex, multi-column content. ([IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/))

### Field mapping from the current table

| Current desktop column | Compact phone treatment | Rationale |
|---|---|---|
| Type | Merge into focus title after patient | Patient-first phrasing makes repeated card actions distinguishable. |
| Patient | First words of focus title | Stable recognition anchor. |
| Appointment or issue | Use as optional qualifier, or merge into exception title when it is the exception | Preserve only when it changes the choice to inspect. |
| Time | Temporal-risk row; add relative age/urgency when relevant | Time is not decorative metadata in a live practice. |
| Status | Control-state line; never colour-only | Workflow state and priority remain separate. |
| Owner | Same control-state line; show “Unassigned” | Eliminates “who has this?” recall. |
| Review/Resolve/Follow up | Whole card receives a descriptive accessible name; at most one explicit safe action | Removes tiny ambiguous repeated links. |

## Accessibility requirements

1. **Programmatic card name:** include patient, exception, time risk and action purpose. WCAG requires controls to expose a name and link purpose must be understandable in context. ([WCAG 2.2](https://www.w3.org/TR/WCAG22/))
2. **Status association:** connect the status text to the card heading with `aria-describedby`, or use an equivalent semantic pattern. VA.gov's Card Status associates status with the heading and announces status text; its error treatment combines icon and text rather than colour alone. ([VA.gov Card Status](https://design.va.gov/components/card/card-status/))
3. **Target size:** meet WCAG's 24×24 CSS px minimum and use 44×44 CSS px as Brightview's product floor for card actions. ([WCAG 2.2 target size](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility))
4. **Keyboard and switch access:** a card and its one optional inline action need a logical focus order and visible focus. Do not make a swipe the only way to acknowledge, assign or dismiss; Apple explicitly advises alternatives to gestures. ([Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility))
5. **No colour-only meaning:** urgency, status, arrival state and selection need text plus icon/shape where useful. VA.gov's status card uses text and icon in error states, and WCAG requires non-text content and contrast to be perceivable. ([VA.gov Card Status](https://design.va.gov/components/card/card-status/), [WCAG 2.2](https://www.w3.org/TR/WCAG22/))
6. **Reflow:** at narrow widths and 400% zoom, cards grow vertically; no horizontal scroll and no removed facts. ([WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow))
7. **Live updates:** if ownership or status changes while the queue is visible, announce the change without moving focus. Preserve the card's position until the user completes or dismisses it to avoid disorientation. The exact live-region strategy should be tested with screen readers rather than inferred from colour or animation.
8. **Privacy:** default cards should avoid diagnosis, medications, detailed note content and unrestricted balances. Use the least clinical/financial detail needed for the current role to triage; deeper data remains role-gated in detail.

## Information-priority rationale

| Question under interruption | Required atom | Failure if hidden |
|---|---|---|
| “Which patient and problem is this?” | Focus | Repeated “Review” actions become indistinguishable; staff open unnecessary records. |
| “Does this threaten care or the schedule now?” | Temporal risk | Routine requests can visually outrank same-day conflicts and overdue clinical work. |
| “Is someone already handling it?” | Control state | Duplicate work, dropped handoffs, and unowned exceptions become likely. |
| “What single fact changes my choice?” | Conditional qualifier | Useful context is either lost or drowned in a recreated desktop table. |

The recommendation is therefore **three stable atoms plus one optional qualifier**, not “patient, issue, time” as three naked columns. Patient/issue without status and owner cannot show whether the work is already acknowledged. Status/owner without time cannot show interruption cost. Time/status without the patient and exception cannot support recognition.

## Implementation acceptance criteria

- At 390px, every active exception exposes focus, temporal risk, status and owner without opening Calendar.
- Cards are ordered by consequence plus time-to-impact; request type is not the primary sort.
- No focus title, status, deadline or owner is hidden with `display: none`.
- The whole card has a descriptive accessible name; no six identical “Review” links remain.
- All visible actions have at least a 44×44 CSS-pixel hit area and visible focus.
- Back from detail restores queue scope, sort, filters, scroll offset and selection.
- A detail view contains the full clinical/financial/operational context and the irreversible action; the card does not.
- Arrival and follow-up watch items use the same grammar and enter the exception queue only when a defined threshold is breached.
- At 200% and 400% zoom, cards reflow vertically without horizontal scrolling or loss of the three atoms.
- Status, urgency and ownership remain understandable in monochrome and to a screen reader.

## Recommended first prototype

Prototype the four true exception kinds—booking request, schedule conflict, unsigned note and overdue invoice—as the card set above at 390px. Test two ordered variants with reception staff:

1. **Risk-first default:** schedule conflict, overdue unsigned note, overdue invoice, then booking requests by decision deadline.
2. **My work default:** urgent items across the practice first, then items owned by the signed-in staff member, then unassigned work.

Measure whether staff can answer, without opening a card: **who/what, when/why now, and status/owner**. If they repeatedly require the optional qualifier, promote that qualifier only for that exception type rather than adding a universal fourth row.

## Sources

1. [HL7 FHIR Task](https://hl7.org/fhir/task.html)
2. [PagerDuty mobile app](https://support.pagerduty.com/main/docs/mobile-app)
3. [Stripe Radar reviews](https://docs.stripe.com/radar/reviews?locale=en-GB)
4. [Zendesk mobile views](https://support.zendesk.com/hc/en-us/articles/4408833959706-Working-with-views-in-the-Support-mobile-app)
5. [Zendesk mobile ticket details](https://support.zendesk.com/hc/en-us/articles/4408825697434-Working-with-tickets-in-the-Support-mobile-app)
6. [Salesforce Field Service appointment priority](https://help.salesforce.com/s/articleView?id=service.pfs_scheduling_priority_optimization.htm&language=en_US&type=5)
7. [Open Dental ODMobile appointments](https://www.opendental.com/manual/opendentalmobileappts.html)
8. [CareStack online appointments](https://carestack.zendesk.com/hc/en-us/articles/25837834831892-Manage-Online-Appointments-and-Track-Potential-Patients)
9. [IBM Carbon contained list](https://carbondesignsystem.com/components/contained-list/usage/)
10. [VA.gov Card Status](https://design.va.gov/components/card/card-status/)
11. [Android adaptive list-detail](https://developer.android.com/develop/adaptive-apps/guides/list-detail) and [list state management](https://developer.android.com/develop/adaptive-apps/cookbook/recyclerview-state)
12. [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
