# Evidence for prioritising the Brightview “Needs attention” queue

**Prepared:** 1 August 2026  
**Research question:** What if queue order reflected patient harm and interruption cost rather than request type?  
**Scope:** Dental/clinical triage, dental practice management, incident response/SRE, contact-centre routing, customer support, and fraud operations

## Method and limits

This review uses 12 primary sources: current government or standards guidance and first-party product documentation. It examines implemented priority models, not marketing roundups or third-party “best practice” articles.

- **Documented** means the source explicitly describes the behaviour.
- **Inference** means a proposed Brightview design decision derived from more than one source.
- Product documentation proves that a mature system implements a pattern; it does **not** prove that the pattern improves clinical outcomes.
- Emergency-department and fraud models are useful analogies, not dental decision rules. Brightview must not present an operational rank as a diagnosis or substitute it for trained clinical triage.

## Executive conclusion

Yes—Brightview should replace request-type ordering with a **clinically gated, deadline-aware operational order**.

The strongest pattern across mature systems is not an opaque all-purpose score. It is a small number of explicit layers:

1. **Safety gate:** recognise a possible emergency and route it to a clinical/emergency pathway rather than leaving it in an administrative queue. NHS England divides unscheduled dental need into emergency (triage potentially within 60 minutes), urgent (care usually within 24 hours), and non-urgent (care within 7 days); it also says appropriately trained staff must perform clinical triage. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))
2. **Impact:** show what care, patient, provider, operatory, or downstream work is at risk. Atlassian explicitly separates severity—the impact—from priority—the urgency and order of response. ([Atlassian severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels))
3. **Time to consequence:** order within impact by breached or nearest meaningful deadline. Intercom exposes live SLA deadlines and can sort by the next target rather than merely by message type or creation date. ([Intercom inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))
4. **Aging:** use oldest-first only as a tie-breaker, or to trigger a reviewed escalation. Twilio assigns higher-priority tasks first and the oldest task only within the same priority; its workflows can escalate priority over time. ([Twilio task queues](https://www.twilio.com/docs/taskrouter/api/task-queue), [Twilio workflows](https://www.twilio.com/docs/taskrouter/api/workflow))
5. **Ownership and explanation:** show who is handling the item and why it is ranked here. Stripe exposes risk factors and assignments while retaining human judgement in a prioritised review queue. ([Stripe transaction reviews](https://docs.stripe.com/radar/transaction-reviews), [Stripe risk insights](https://docs.stripe.com/radar/reviews/risk-insights))

For Brightview, the default should therefore be a lexicographic order—**clinical safety → response deadline → operational disruption → age**—with visible explanation and audited overrides. Do not let revenue, insurance status, patient profitability, or estimated handling time outrank clinical need.

## Evidence matrix

| Product or standard | Documented priority model | Tie-breaking, aging, and escalation | What is visually or contextually encoded | What operators can control | Brightview learning |
|---|---|---|---|---|---|
| **NHS England unscheduled dental care** (clinical/dental standard) | Three care classes: emergency, urgent, and non-urgent. Emergency conditions may need clinical triage within 60 minutes; urgent care is usually within 24 hours; non-urgent care within 7 days. Determining urgency can include pain, swelling, loss of function, symptom duration, and response to medication. ([guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/)) | The care window is set by clinical need, and worsening condition can change the category. Case-by-case clinical judgement remains explicit. ([guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/)) | Category, symptom/risk evidence, pathway, and clinically appropriate timescale—not merely a generic red flag. | Trained clinical staff determine the pathway; the guidance says teams need the appropriate training, experience, and skill mix. ([guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/)) | Make clinical safety a hard gate. A receptionist-facing rank can surface risk evidence and request clinical review, but must not silently diagnose or demote it. |
| **AHRQ Emergency Severity Index v4** (emergency triage standard) | The one-page algorithm first asks whether the patient needs an immediate life-saving intervention, then checks high-risk/confusion/distress or severe pain, and only after those gates estimates expected resources; vital-sign danger zones can cause reconsideration of acuity. ([AHRQ ESI algorithm PDF](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_2.pdf)) | It is a decision tree, not a sum where several low-level signals can outweigh a life-threatening one. Resource expectation distinguishes lower-acuity levels only after safety gates. ([AHRQ ESI algorithm PDF](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_2.pdf)) | Acuity level and the clinical branch that produced it. | The algorithm explicitly says to consider reassignment when vital signs enter a danger zone rather than treating the first lower-acuity branch as immutable. ([AHRQ ESI algorithm PDF](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_2.pdf)) | Use hard safety rules before operational scoring. Never allow “quick to solve,” “high revenue,” or “old request” to cancel a possible harm signal. |
| **Open Dental** (dental practice management) | Task priority determines both task colour and list sort order. Treatment procedures can use configurable priorities such as Urgent, High, Wait Insurance, or Next; setting a priority immediately changes sort order. ([task priorities](https://www.opendental.com/manual/definitionstaskpriorities.html), [treatment plan](https://www.opendental.com/manual/treatmentplan.html)) | The planned-appointment tracker can group by status and then date, or sort by creation date. Recall lists can sort by due date, and patients return to the reminder list after a configured interval if they remain unscheduled. ([planned tracker](https://www.opendental.com/manual/appttracker.html), [recall list](https://www.opendental.com/manual/recalllist.html)) | Priority can control colour; lists expose status, planned date, due date, reminder history, provider, clinic, and procedure filters. ([task priorities](https://www.opendental.com/manual/definitionstaskpriorities.html), [recall list](https://www.opendental.com/manual/recalllist.html)) | Practices configure priority labels, order, colours, date windows, list sort, and provider/clinic filters. | Dental systems already support priority and due-date views, but they keep treatment, recall, and appointment work in separate lists. Brightview can unify exceptions only if every row keeps its original deadline and clinical context. |
| **PagerDuty** (incident response/SRE) | Incident priority is distinct from alert severity and notification urgency. PagerDuty recommends a limited classification scheme with objective impact characteristics and an expected response for each level. ([incident priority](https://support.pagerduty.com/main/docs/incident-priority), [incidents](https://support.pagerduty.com/main/docs/incidents)) | Incidents may be upgraded or downgraded as circumstances evolve; response expectations or SLAs can be attached to each level. ([incident priority](https://support.pagerduty.com/main/docs/incident-priority)) | Priority label, impact definition, and separate notification urgency. | Accounts customise labels and definitions; responders can change the incident priority. | Keep **impact**, **work order**, and **notification behaviour** as separate fields. A P1 item need not make every user-facing surface alarm continuously. |
| **Atlassian incident response / Opsgenie** (incident response/SRE) | Atlassian’s incident record captures the emergency summary, customer impact, severity, faulty service, affected products, and assignee. SEV 1–2 page responders immediately; SEV 3 is handled in business hours. ([incident response handbook](https://www.atlassian.com/incident-management/handbook/incident-response)) | The team assesses extent, number affected, start time, support-case volume, security, and data loss; severity is then confirmed or adjusted. Opsgenie can automatically raise incident priority if a newly associated alert has higher priority. ([incident response handbook](https://www.atlassian.com/incident-management/handbook/incident-response), [Opsgenie incident priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/)) | Opsgenie pairs a P1–P5 label with colour; Atlassian includes severity and summary in the page and maintains an explicit incident owner. ([Opsgenie incident priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/), [incident response handbook](https://www.atlassian.com/incident-management/handbook/incident-response)) | Responders can edit priority, assign ownership, and update severity as evidence changes. | Show “why now,” affected scope, start/deadline time, and owner together. Recalculate when an appointment, symptom, or dependency changes. Do not make colour the only signal. |
| **Twilio TaskRouter** (contact-centre routing) | Higher numeric priority is assigned before lower priority, regardless of age; among equal priorities, the oldest task is assigned first. Workflows choose queues, prioritise tasks, and can escalate them or move them over time. ([task queues](https://www.twilio.com/docs/taskrouter/api/task-queue), [workflows](https://www.twilio.com/docs/taskrouter/api/workflow)) | FIFO is a tie-breaker. Aging does not beat a higher priority automatically, but a workflow can deliberately raise a task over time. | Task priority, age, queue, eligible worker skills/capability, and assignment state are separate data. ([TaskRouter overview](https://www.twilio.com/docs/taskrouter/how-taskrouter-works)) | Teams configure workflows, escalation/fallback rules, task attributes, queues, and eligible workers. | Use age within a tier and explicit aging thresholds across tiers. A pure “oldest first” queue hides harm; a strict priority queue without escalation starves routine work. |
| **Amazon Connect** (contact-centre routing) | Routing profiles use queue priority and delay. When priority and delay are equal, the oldest contact is routed first; the longest-idle eligible agent receives it. ([priority and delay examples](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html)) | Delay controls when a queue becomes eligible to a routing profile, but lower-priority queues still wait while higher-priority queues contain work. ([priority and delay examples](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html)) | Priority, configured delay, contact wait time, queue, and agent availability. | Administrators configure different priorities and delays by routing profile. | Separate **deadline/eligibility** from priority. The documented starvation behaviour is a warning: reserve capacity or create aging escalation for routine booking and finance work. |
| **Intercom Inbox** (customer support) | Conversations have None/Low/Medium/High/Urgent priority. The inbox can instead sort by next SLA target, waiting since, priority, snooze return, or custom fields. ([priority levels](https://www.intercom.com/help/en/articles/15517604-conversation-priority-levels), [inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting)) | Within priority, Intercom sorts by last activity. SLA targets can be first response, next response, close, or resolution; timers respect office hours, can pause for “waiting on customer,” and reopen a snoozed item when a target is missed. ([SLA configuration](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets), [inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting)) | The row/card can show a live, colour-coded SLA pill; per-target sorting changes the shown timer to the relevant breach deadline. ([inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting)) | Staff can set priority manually, in bulk, by keyboard, or through workflows/rules/macros; they can choose alternative sort orders. ([priority levels](https://www.intercom.com/help/en/articles/15517604-conversation-priority-levels)) | Keep a stable safety-first default but allow role-appropriate sort and filters. “Waiting on patient” should pause the active work timer only when it has a next-review date; it must not erase the item. |
| **Stripe Radar** (fraud/financial operations) | Radar places unusual or elevated-risk payments into a prioritised review queue and presents risk level, customer/payment context, amount, and time. Rules can add business-specific cases to review. ([transaction reviews](https://docs.stripe.com/radar/transaction-reviews), [transaction risk prevention](https://docs.stripe.com/radar/transaction-risk-prevention)) | Reviewers can claim work, filter owned or unassigned reviews, and see assignment history. Human judgement is explicitly combined with the reasons behind the score and business context. ([transaction reviews](https://docs.stripe.com/radar/transaction-reviews)) | Risk insights surface factors behind the score; related items and business metadata can be shown at decision time. ([risk insights](https://docs.stripe.com/radar/reviews/risk-insights), [transaction reviews](https://docs.stripe.com/radar/transaction-reviews)) | Businesses configure review rules; reviewers assign themselves and make the final decision. Stripe warns that manual review can slow good customers and create a bottleneck. ([transaction reviews](https://docs.stripe.com/radar/transaction-reviews)) | Show evidence, not a mysterious score. Claiming and audit history prevent duplicate work. Automated ranking should help staff focus—not impose an irreversible clinical or financial decision. |

## Cross-product findings

### 1. Priority is not the same thing as severity

Atlassian defines severity as impact and priority as how soon and in what order to act; PagerDuty separately models alert severity, incident priority, and notification urgency. ([Atlassian severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels), [PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents))

**Brightview inference:** Keep these as separate concepts:

- **Clinical/operational impact:** What harm or disruption could occur?
- **Response deadline:** By when must somebody assess or act?
- **Queue priority:** What should appear first right now?
- **Notification urgency:** Who should be interrupted, and how?
- **Status:** New, claimed, waiting, resolved, or dismissed with reason.

This prevents a routine invoice that is overdue from acquiring the same visual semantics as an emergency symptom, while still letting it move above a fresh, non-urgent booking request when its filing deadline is imminent.

### 2. Hard safety gates should precede arithmetic

The NHS dental model and AHRQ ESI both put possible harm gates ahead of routine operational distinctions. NHS England also says pain may be secondary to swelling, trauma, systemic involvement, or loss of function when those pose greater immediate or longer-term risk. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/), [AHRQ ESI algorithm](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_2.pdf))

**Brightview inference:** Do not calculate a single score such as `age + revenue + inconvenience`. First test whether a symptom or event requires an emergency/clinical pathway. Only then rank the remaining administrative work.

### 3. A deadline is more useful than “high” by itself

Intercom can sort by the next SLA target and display a live deadline on the row; Twilio and Amazon distinguish base priority from age/delay. ([Intercom inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting), [Twilio task queues](https://www.twilio.com/docs/taskrouter/api/task-queue), [Amazon Connect priority and delay](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html))

**Brightview inference:** Every non-routine row needs either `respond_by` or an explicit statement that it has no time-critical deadline. “High” without “why now” forces staff to trust an unexplained judgement.

### 4. Strict priority needs an anti-starvation mechanism

Twilio documents that a lower-priority task never beats a higher-priority one merely by waiting; Amazon documents that lower-priority queues remain ineligible while higher-priority work remains. ([Twilio task queues](https://www.twilio.com/docs/taskrouter/api/task-queue), [Amazon Connect priority and delay](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html))

**Brightview inference:** Aging may not override clinical safety, but it should trigger:

- an escalation inside the same non-clinical class;
- a visible overdue state;
- a manager review after a configurable threshold; and
- protected daily capacity for routine booking and finance work.

Otherwise, a busy practice can make routine patients permanently invisible.

### 5. Ownership and evidence reduce duplicate work and blind trust

Atlassian treats a current incident owner as critical; Stripe lets reviewers claim items, filter unassigned work, and see assignment history while exposing factors behind the system’s risk judgement. ([Atlassian incident response](https://www.atlassian.com/incident-management/handbook/incident-response), [Stripe transaction reviews](https://docs.stripe.com/radar/transaction-reviews), [Stripe risk insights](https://docs.stripe.com/radar/reviews/risk-insights))

**Brightview inference:** Every row should answer: “Who owns this?”, “What changed?”, “Why is it here?”, and “What happens if we wait?”

## Proposed Brightview ordering model

### A. Use a pathway plus four work tiers

| Path or tier | Meaning | Response expectation | Examples |
|---|---|---|---|
| **Emergency pathway — not a queue rank** | Possible immediate threat or condition needing emergency triage | Trigger the practice’s emergency protocol and qualified clinical assessment; do not leave it waiting in “Needs attention” | spreading swelling with airway concern, uncontrolled bleeding, avulsed permanent tooth |
| **P1 · Act now** | Same-day care is unsafe, blocked, or about to fail; or a qualified clinician marked the item urgent | Claim immediately; show an interruptive alert only to the responsible role | unresolved same-day provider/operatory conflict, urgent clinical callback, medication/medical-history conflict affecting imminent care |
| **P2 · Resolve today** | Patient outcome or today’s operation materially worsens if delayed, but it is not an emergency | Resolve before the displayed deadline today | overdue time-sensitive clinical follow-up, failed reminder for an imminent appointment, tomorrow-morning schedule risk |
| **P3 · Respond soon** | A real response deadline exists but consequence is not immediate | Work in deadline order; typically within 1–2 business days | booking request for a near-term slot, pre-authorisation or document deadline, non-urgent recall exception |
| **P4 · Routine** | Necessary work with no near-term care or operational consequence | Work oldest-first within protected routine capacity | general booking request, routine invoice follow-up, housekeeping |

The emergency/urgent/non-urgent dental timescales above come from NHS England; Brightview’s P1–P4 labels are product-level operational tiers and must not be presented as clinical categories. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))

### B. Default sort is lexicographic, not a hidden weighted score

For every active item, sort by this tuple:

```text
1. emergency_pathway_flag                    true first; remove to clinical pathway
2. work_tier                                 P1, P2, P3, P4
3. deadline_state                            breached, <1h, <4h, today, later, none
4. patient_or_operational_impact             care blocked, multi-patient cascade, single patient, admin only
5. next_affected_appointment_at              earliest first
6. ownership_state                           unassigned before assigned-stale before actively-owned
7. entered_current_tier_at                    oldest first
8. stable_item_id                            deterministic final tie-break
```

Important constraints:

- **Clinical evidence sets the safety class.** Operational inconvenience may order two items in the same class; it must not demote a clinical risk.
- **Age is a tie-breaker and review trigger.** It must not manufacture clinical urgency.
- **Dependency scope is concrete.** “Affects two patients and one provider in the next hour” is valid; a vague “business impact score 83” is not.
- **Handling time is not a negative factor.** A complex patient must not be pushed down because helping them is predicted to take longer.
- **Financial value does not enter the clinical tier.** Amount due may help order P4 finance work, but it must never outrank patient safety.

### C. Required data fields

| Field | Purpose |
|---|---|
| `item_id`, `item_type`, `source_record_id` | Stable identity, deduplication, and auditability |
| `patient_id` and role-safe display identity | Connect the task to the patient without putting unnecessary clinical detail in the queue |
| `created_at`, `last_changed_at`, `entered_current_tier_at` | Distinguish total age from age at the current urgency |
| `clinical_pathway` | `unassessed`, `emergency_review`, `urgent`, `non_urgent`, `not_clinical` |
| `clinical_reason_codes` | Structured evidence such as swelling, uncontrolled bleeding, trauma, pain/function, clinician-marked time sensitivity; visible only to authorised roles |
| `clinical_assessed_by`, `clinical_assessed_at` | Provenance; avoid presenting unassessed intake as a diagnosis |
| `respond_by`, `deadline_source`, `deadline_state` | Explain the time consequence and calculate breach state |
| `appointment_at`, `provider_id`, `operatory_id` | Connect urgency to real schedule context |
| `affected_patient_count`, `affected_appointment_count`, `blocked_resource_count` | Explain operational cascade without an opaque score |
| `status`, `owner_id`, `claimed_at`, `waiting_reason`, `review_at` | Prevent duplicate work and make waiting states safe |
| `contact_attempt_count`, `last_contact_at`, `last_outcome` | Preserve work history and avoid repeated blind outreach |
| `priority_tier`, `priority_rule_id`, `priority_explanation`, `evaluated_at` | Make the computed order inspectable and refreshable |
| `override_tier`, `override_reason`, `override_by`, `override_expires_at` | Permit accountable human correction without permanent rank drift |

### D. Re-evaluation events

Recompute priority when any of these changes:

- symptoms, clinical assessment, or medical-history conflict;
- appointment time, provider, operatory, or duration;
- a response deadline becomes near or breached;
- the item is claimed, released, snoozed, or becomes stale in progress;
- a patient responds, a contact attempt fails, or a dependency resolves; or
- an authorised person applies or expires an override.

This mirrors the mature-system practice of updating incident priority when evidence changes rather than freezing the initial classification. PagerDuty permits upgrade/downgrade as a situation evolves, and Opsgenie can raise an incident when a higher-priority alert becomes associated. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority), [Opsgenie incident priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/))

## Override and user-sort rules

### Default view

- Keep the safety-first order above.
- Pin any emergency-pathway item in a separate clinical alert region until it is transferred or acknowledged by an authorised role.
- Keep P1 items above P2–P4 in the default view.
- Within each tier, show deadline and “why now” before type.

### Human override

- Any staff member may **promote** an item or request clinical review.
- Only an appropriately authorised clinician may **demote** a clinically classified item.
- Moving an item across tiers requires a reason, actor, timestamp, and expiry/review time.
- Overrides must not rewrite the underlying evidence; the row should show both computed and overridden state.
- An override expires when its reason is no longer true or at the explicit review time.

### Sort and filter controls

Offer:

- **Priority (recommended)**
- Soonest deadline
- Oldest waiting
- Appointment time
- Owner / unassigned
- Type

Offer filters for My items, Unassigned, P1/P2, Clinical, Schedule, Booking, and Finance. If the user selects a non-priority sort, keep a compact persistent banner such as “2 act-now items” so critical work cannot disappear. Intercom’s ability to switch between SLA, wait time, priority, and custom-field sorts is the useful analogue; the clinical safety banner is a Brightview safeguard. ([Intercom inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))

## Visual encoding and explainability copy

Each row or mobile card should retain:

1. **Text priority badge:** `P1 · Act now`, `P2 · Today`, `P3 · Soon`, or `P4 · Routine`.
2. **Why now:** one sentence generated from evidence, not from item type.
3. **Time:** live response deadline or next affected appointment.
4. **Scope:** patient/provider/operatory or affected-count summary.
5. **Owner and status:** `Unassigned`, `Maya · working`, or `Waiting for patient · review 14:00`.
6. **Next action:** one role-appropriate verb.

Use colour as reinforcement only. Opsgenie and Open Dental use priority colour, while Intercom uses a colour-coded deadline pill; Brightview should pair every colour with a visible text label and deadline. ([Opsgenie priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/), [Open Dental task priorities](https://www.opendental.com/manual/definitionstaskpriorities.html), [Intercom inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))

Suggested copy:

- **P1 · Act now** — “Same-day conflict affects 2 patients and Dr Patel; first appointment starts in 42 min.”
- **P2 · Today** — “Clinical follow-up is 1 day overdue; clinician marked it time-sensitive.”
- **P3 · Soon** — “Requested appointment starts tomorrow; waiting 19 hr for a response.”
- **P4 · Routine** — “Invoice reminder; no care or filing deadline.”
- **Override** — “Moved to P2 by Maya until 16:00 — patient travelling tomorrow.”
- **Unassessed clinical signal** — “Symptoms need clinical review; priority is provisional.”

Do not show an unexplained number such as `Risk 87`. Stripe’s more transferable pattern is to expose the contributing signals and let human judgement use business context. ([Stripe risk insights](https://docs.stripe.com/radar/reviews/risk-insights), [Stripe transaction reviews](https://docs.stripe.com/radar/transaction-reviews))

## Illustrative reordering of the known dashboard row types

The current critique identified routine booking requests above a same-day conflict, with overdue clinical and financial work flattened into the same queue. Because the actual rows do not yet expose structured clinical evidence and deadlines, this is an **illustrative** order, not a diagnosis of individual patients.

| Proposed order | Row type | Assumed evidence | Tier and explanation |
|---:|---|---|---|
| 1 | **Schedule conflict** | Same-day; first affected appointment in 42 minutes; two patients and one provider affected; unassigned | **P1 · Act now** — imminent care disruption with a concrete multi-patient cascade |
| 2 | **Overdue clinical work** | Clinician-marked follow-up; deadline breached yesterday; patient outcome may worsen with further delay | **P2 · Today** — breached clinical deadline, but no emergency signal documented |
| 3 | **Booking request A** | Requested slot is tomorrow; waiting 19 hours | **P3 · Soon** — nearest real booking deadline, then oldest within tier |
| 4 | **Booking request B** | Requested slot later this week; waiting 11 hours | **P3 · Soon** — same type, but later consequence than request A |
| 5 | **Booking request C** | Flexible dates; waiting 4 hours | **P4 · Routine** — no near-term care or slot-loss consequence |
| 6 | **Invoice / financial follow-up** | Three days old; no filing, coverage, prescription, or same-day checkout deadline | **P4 · Routine** — oldest routine finance work, but no patient-safety consequence |

Exceptions matter more than the row type:

- A booking request that reports spreading swelling or uncontrolled bleeding exits the administrative queue for emergency clinical review. NHS England lists those as emergency examples. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))
- An invoice tied to a same-day checkout, benefits expiry, or treatment-blocking policy can move to P2 or P3, but the explanation must name that deadline.
- “Overdue clinical work” that is merely an unsigned internal note, with no impact on current care, should be P3/P4; the word *clinical* alone does not establish harm.
- A schedule conflict discovered days ahead may be P2/P3 rather than P1; interruption cost depends on the next affected time and available workaround.

## Failure modes and ethical limits

### 1. Under-triage disguised as automation

An intake form can miss context, and a receptionist cannot be made responsible for silently determining clinical urgency. NHS England requires appropriate clinical-triage training and case-appropriate judgement. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))

**Guardrail:** show provisional evidence, an emergency script, and a one-step “request clinical review.” Never label the algorithm “diagnosis.”

### 2. Starvation of routine or socially vulnerable patients

Strict high-priority-first systems can indefinitely defer lower tiers; Twilio and Amazon document precisely that behaviour. ([Twilio task queues](https://www.twilio.com/docs/taskrouter/api/task-queue), [Amazon Connect priority and delay](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html))

**Guardrail:** age-based review thresholds, protected routine capacity, and a manager-visible oldest-item metric. NHS England also says access must remain available regardless of NHS number, GP registration, permanent address, or whether the patient is already known to the practice. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))

### 3. Revenue or “VIP” status contaminating clinical priority

Intercom supports faster SLAs for important customers, which is rational for commercial support but unsafe as a clinical ordering rule. ([Intercom SLA configuration](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets))

**Guardrail:** insurance, balance, lifetime value, and patient profitability may never set or break ties in a clinical tier. Financial deadlines belong in a separate evidence field.

### 4. Penalising complex care

Optimising for “interruption cost” can become “serve the quickest patient first” or suppress people requiring interpreters, accessibility support, or longer appointments. NHS England calls for accessible care and personalised support for complex needs. ([NHS England clinical guidance](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/))

**Guardrail:** predicted handling time must not lower priority. Complexity informs resource matching and appointment length, not worthiness.

### 5. Opaque scores and automation bias

Stripe’s review guidance explicitly combines model reasons, business context, and human judgement, and warns that reviews can create bottlenecks for legitimate customers. ([Stripe transaction reviews](https://docs.stripe.com/radar/transaction-reviews))

**Guardrail:** expose rule and evidence, allow correction, retain assignment/override history, and monitor false promotions and demotions by source and user role.

### 6. Priority inflation

If any user can mark every item urgent without definition or expiry, the queue becomes red noise. PagerDuty recommends objective, shared criteria and a defined expected response for every level. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority))

**Guardrail:** limited tiers, reason-required override, expiry, audit, and periodic calibration using real examples.

### 7. Stale rank after conditions change

A booked time moves, a patient replies, symptoms worsen, or a conflict gains a workaround. PagerDuty and Opsgenie both support priority changes as evidence evolves. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority), [Opsgenie incident priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/))

**Guardrail:** event-driven re-evaluation, `evaluated_at`, visible stale-owner state, and automatic expiry of temporary overrides.

### 8. Colour-only urgency and alert fatigue

Open Dental, Opsgenie, and Intercom all use colour as a rapid cue. Their model should be adapted, not copied as colour-only semantics. ([Open Dental task priorities](https://www.opendental.com/manual/definitionstaskpriorities.html), [Opsgenie priorities](https://support.atlassian.com/opsgenie/docs/what-are-incident-priority-levels/), [Intercom inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))

**Guardrail:** text tier, icon/shape, “why now,” and deadline in every row; interrupt only the accountable role for P1/emergency items.

## Recommended first implementation slice

1. Add the required deadline, impact, ownership, and explanation fields to the four known row types.
2. Implement P1–P4 using explicit rules; route possible emergency symptoms to a separate clinical-review state.
3. Make `Priority (recommended)` the default, with `Soonest deadline` and `Oldest waiting` as alternatives.
4. Add `Why now`, `respond_by`, owner, and next action to every desktop row and mobile card.
5. Add promote/request-review for all staff; require authorised clinical role, reason, and audit to demote a clinical item.
6. Instrument queue age by tier, deadline breaches, override frequency, reclassifications, unassigned time, and oldest P4 age.
7. Review the rules with a practising dentist and receptionist using real anonymised scenarios before enabling automatic notifications.

## Primary sources reviewed

1. [NHS England — Clinical guidance: unscheduled urgent and non-urgent dental care](https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/)
2. [AHRQ — Emergency Severity Index v4 triage algorithm](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_2.pdf)
3. [Open Dental — Task priorities](https://www.opendental.com/manual/definitionstaskpriorities.html)
4. [Open Dental — Treatment Plan Module](https://www.opendental.com/manual/treatmentplan.html)
5. [Open Dental — Planned Appointment Tracker](https://www.opendental.com/manual/appttracker.html)
6. [Open Dental — Recall List](https://www.opendental.com/manual/recalllist.html)
7. [PagerDuty — Incident Priority](https://support.pagerduty.com/main/docs/incident-priority)
8. [Atlassian — How we respond to an incident](https://www.atlassian.com/incident-management/handbook/incident-response)
9. [Twilio TaskRouter — Task Queue and Workflow resources](https://www.twilio.com/docs/taskrouter/api/task-queue)
10. [Amazon Connect — Queue priority and delay examples](https://docs.aws.amazon.com/connect/latest/adminguide/concepts-routing-profiles-priority.html)
11. [Intercom — Inbox sorting and SLA behaviour](https://www.intercom.com/help/en/articles/6989006-inbox-sorting)
12. [Stripe Radar — Transaction reviews and risk insights](https://docs.stripe.com/radar/transaction-reviews)
