# Four-product dental software quality bar

**Prepared:** 31 July 2026  
**Products:** Dentrix Ascend, Curve Dental, Dentally, CareStack  
**Purpose:** Establish the category-standard quality bar for a multi-provider dental calendar and its request-to-care workflow.

> This study uses current public, first-party product pages and help documentation. It did not use authenticated tenants or private sales demos. “Marketing claim” is not treated as demonstrated interaction, and absence of public evidence is not proof that a product lacks a capability.

## Source reports

- [Dentrix Ascend and Curve Dental](dentrix-ascend-curve-dental.md)
- [Dentally and CareStack](dentally-carestack.md)
- [Regulatory and patient-data research](../dental-calendar-and-patient-data.md)

## Executive verdict

No single product is the benchmark for the whole experience.

| Product | Use as the benchmark for | Do not inherit |
|---|---|---|
| Dentrix Ascend | Workflow completeness, identity reconciliation, routing states, clinical/financial posting, follow-up queues, granular permissions, and auditing | Dense cross-module navigation, overloaded color semantics, or documented dependence on 100% browser zoom |
| Curve Dental | Familiar staff-calendar interaction, persistent patient context, first-available search, safe rescheduling, staff verification, Short Notice, and staff-triggered gap filling | Drag/right-click/hover dependencies, color-only state, incomplete mobile records, or fragmented Hero/GRO/patient-link journeys |
| Dentally | Calm provider-column calendar, constraint-first appointment finder, explicit availability layers, zones, waiting lists, and treatment-to-future-appointment handoff | Direct-booking semantics, fixed cancellation policy, shared-clipboard risk, or prescriptions isolated from the visit workspace |
| CareStack | Staff-reviewed appointment requests, lifecycle breadth, kiosk/check-in, patient tasks, treatment, prescribing integration, and billing continuity | Dashboard/queue proliferation, visually noisy scheduler states, or unverified assumptions about cutoffs, buffers, and patient medication schedules |

The recommended combination is:

```text
Dentally calendar restraint
        +
Curve interaction immediacy
        +
CareStack request/lifecycle coverage
        +
Dentrix traceability and permissions
        =
Familiar category shell with one accountable patient journey
```

## Product-by-product findings

### Dentrix Ascend

Dentrix Ascend provides the strongest public evidence of operational depth. Its calendar supports day/week views, provider or operatory columns, scheduling templates, opening search, working-provider filters, and special lists for ASAP and broken/no-show appointments. Online bookings enter the calendar as **Unconfirmed**, and staff may reconcile the submitted identity to an existing patient or create a new record. The action is audited. ([Calendar](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm), [online booking](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm), [Pinboard](https://hsps.pro/DentrixAscend/Help/Viewing_the_Pinboard_ASAP_and_Broken_No_Show_Lists.htm))

Its routing panel connects arrival and care states to treatment posting, payment, and walkout. Clinical notes lock through signing/addenda behavior, ePrescribe is available through third-party integrations, and roles/audit rights are granular. ([Routing](https://hsps.pro/DentrixAscend/Help/Changing_appointment_statuses_from_the_routing_panel.htm), [checkout](https://hsps.pro/DentrixAscend/Help/Checking_out_patients.htm), [clinical notes](https://hsps.pro/DentrixAscend/Help/Editing_clinical_notes.htm), [permissions](https://hsps.pro/DentrixAscend/Help/Security_rights_list.htm))

The main cost is fragmentation: calendar, routing, chart, ledger, forms, follow-up, and ePrescribe remain distinct surfaces. Public documentation also recommends 100% zoom and warns that lower zoom can hide columns or actions, making it a poor accessibility benchmark. ([System requirements](https://hsps.pro/DentrixAscend/Help/System_requirements.htm))

**Verdict:** Match its state traceability, permissions, audit history, and clinical-to-financial completion. Surpass its density, accessibility, and module seams.

### Curve Dental

Curve Dental is the strongest interaction reference for the chosen category-standard direction. Its persistent Sidekick keeps patient context beside the schedule. Staff can use first-available search, verify self-scheduled appointments from the grid or a work list, move appointments through a temporary Queue, maintain a Short Notice list, and deliberately trigger Smart Fill outreach for an open slot. ([Scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment), [self-scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform), [rescheduling](https://curvedental.zendesk.com/hc/en-us/articles/49259556105107-Handling-Canceled-Missed-and-Rescheduled-Appointments-from-the-Conversion-Days), [Smart Fill](https://curvedental.zendesk.com/hc/en-us/articles/50164245452307-Adding-a-Smart-Fill-Group-Message-in-the-Scheduler))

Appointment tags can seed procedures; notes remain attached to the visit after checkout; treatment plans and invoices can be shared; and prescribing exists natively or through an ePrescribe integration. ([Clinical notes](https://curvedental.zendesk.com/hc/en-us/articles/50475942204563-Adding-Clinical-Notes), [treatment plan and invoice options](https://curvedental.zendesk.com/hc/en-us/articles/51633177709331-Understanding-Treatment-Plan-and-Invoice-Display-Options), [prescription pad](https://curvedental.zendesk.com/hc/en-us/articles/47708321903379-Adding-a-Prescription-to-a-Patient))

The core scheduler relies heavily on dragging, right-clicking, hovering, border style, and color. Public mobile documentation also describes incomplete appointment construction that must be finished on desktop. No product-specific public WCAG/VPAT artifact was found in the reviewed sources. ([Curve Mobile](https://curvedental.zendesk.com/hc/en-us/articles/50184134712083-Understanding-Curve-Mobile))

**Verdict:** Use Curve as the primary familiar interaction benchmark. Keep Sidekick, first-available, request verification, safe movement, and staff-controlled gap filling; rebuild them for keyboard, touch, zoom, and screen readers.

### Dentally

Dentally provides the calmest publicly inspectable calendar. Its provider-column diary makes unavailable time prominent, while the appointment finder separates constraints from eligible results. Availability follows an understandable stack: opening hours, practitioner schedule, then one-off overrides. Zones reserve recurring time for appointment classes without pretending they are appointments. ([Booking](https://help.dentally.com/en/articles/3551725-how-to-book-an-appointment), [appointment finder](https://help.dentally.com/en/articles/9717140-how-to-use-the-new-appointment-finder-tool), [availability](https://help.dentally.com/en/articles/6702843-how-to-show-practitioner-availability-in-the-calendar), [zones](https://help.dentally.com/en/articles/3562897-how-to-use-zones-in-your-calendar))

Dentally also demonstrates a coherent appointment state sequence, waiting lists, short-notice filling, treatment plans that create explicit future scheduling requirements, locked clinical notes, prescriptions, and invoice/receipt workflows. ([Statuses](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means), [waiting lists](https://help.dentally.com/en/articles/3621351-how-to-use-waiting-lists), [future appointments](https://help.dentally.com/en/articles/12165237-how-to-add-appointments-to-a-treatment-plan), [prescriptions](https://help.dentally.com/en/articles/7549440-how-to-create-a-prescription))

Its public Portal workflow creates a direct appointment rather than a staff-reviewed request, and its documented self-cancellation cutoff is a fixed 48 hours. Cross-day movement uses a team-shared clipboard, and the prescription workflow lives under correspondence rather than the active appointment. ([Portal booking](https://help.dentally.com/en/articles/3551448-what-your-practice-sees-when-a-patient-books-online-via-portal), [Portal cancellation](https://help.dentally.com/en/articles/3668498-how-patients-can-cancel-an-appointment-online-via-portal), [moving appointments](https://help.dentally.com/en/articles/7161019-how-to-move-or-alter-an-appointment))

**Verdict:** Use Dentally as the visual-calm and appointment-finder benchmark. Do not copy its direct-booking semantics or fixed cancellation policy.

### CareStack

CareStack is the closest public analogue to the required workflow. It supports direct booking and an indirect request mode in which patients select a slot and staff review/finalize the request. Public materials describe Requested, Pending Confirmation, Booked, Confirmed, Rescheduled, Cancelled, and Completed states. ([Online scheduling](https://carestack.com/en-GB/dental-software/features/online-scheduling), [patient portal](https://carestack.com/en-GB/dental-software/features/patient-portal))

The broader system connects scheduling to kiosk check-in, treatment planning, clinical-note lifecycle, prescribing integrations, statements, payments, and patient tasks. ([Kiosk](https://carestack.com/en-GB/dental-software/features/patient-kiosk), [treatment planning](https://carestack.com/en-GB/dental-software/features/treatment-planning), [clinical notes](https://carestack.com/en-GB/dental-software/features/clinical-notes), [prescriptions](https://carestack.com/dental-software/features/prescription-management), [statements](https://carestack.com/dental-software/features/electronic-statements))

Most public evidence is feature-page marketing rather than complete task documentation. The exact request collision/expiry interaction, cancellation cutoff editor, waitlist ranking, dedicated buffers, and patient medication schedule are not publicly demonstrated. Scheduler fragments are also denser and more saturated than Dentally's calendar.

**Verdict:** Use CareStack as the functional breadth benchmark to beat. Match its request and care lifecycle, then make the interaction calmer, more explicit, and more accessible.

## Cross-product workflow comparison

| Required capability | Best public reference | Product decision |
|---|---|---|
| Multi-provider calendar | Dentally clarity; Curve interaction | Provider-column day view by default, week and agenda alternatives |
| Patient request requiring approval | CareStack semantics; Dentrix unconfirmed reconciliation | Pending request is separate from approved appointment, visible in queue and calendar context |
| Availability | Dentally precedence and zones | Opening hours -> provider schedule -> time off/override -> appointment/buffer/resource conflict |
| Appointment type and duration | Dentrix/Dentally | Duration belongs to type; authorized per-appointment override records a reason |
| Buffers | No strong public reference | First-class pre/post buffer with distinct rendering and collision logic |
| Rescheduling | Curve Queue | Recoverable move transaction with conflict preview, keyboard/menu action, undo, and audit |
| Cancellation cutoff | None fully fits | Configurable practice default plus appointment-type exception; staff override requires reason |
| Waitlist | Dentally lists; Curve Short Notice/Smart Fill | Explainable shortlist and logged outreach; staff chooses recipients; no silent auto-assignment |
| Check-in and care routing | Dentrix routing; CareStack kiosk | Role-aware arrival/ready/in-treatment/checkout sequence |
| Clinical note integrity | Dentally and Dentrix | Author/timestamp, signed lock, addendum/correction history, explicit audience |
| Prescription | Competitors focus on creation/transmission | Add patient-readable dose/timing regimen without inventing clinical instructions |
| Invoice and receipt | All four have partial evidence | Generate from completed billable work; immutable branded patient copy in portal |
| Patient experience | CareStack has broad tasks but fragmented modules | One prioritized visit page: appointment, approved summary, medicines, follow-up, invoice, receipt |
| Accessibility | No reviewed product supplied a public conformance benchmark | WCAG 2.2 AA, keyboard calendar, screen-reader status, non-color cues, 200% zoom/reflow, agenda alternative |

## Recommended category-standard experience

### 1. Calendar shell

- Default to a provider-column day view for the one-room-per-doctor launch model.
- Offer week, provider-focus, and agenda/list views; never force all 15 providers into one unreadable grid.
- Keep the grid visually quiet. Calendar cards show patient display name, appointment type, time/duration, provider when needed, and explicit status only.
- Move contact, clinical, financial, and long-form details into a persistent contextual rail.
- Make opening search constraint-first: patient type, appointment type/duration, provider preference, date range, and time-of-day.

### 2. Request approval

- Patient selection creates a **Pending approval** request and a provisional slot hold, not a confirmed appointment.
- Show the request in both a triage queue and as a striped/outlined provisional block in the proposed calendar slot.
- The opened request shows identity match, verified contact state, appointment type, rule fit, relevant operational flags, competing requests, age/SLA, and communication history.
- Staff actions are **Approve**, **Propose another time**, **Decline with reason**, and **Contact patient**.
- Preserve original request, decision, actor, timestamp, and patient notification outcome.

### 3. Availability and schedule integrity

- Explain why a time is unavailable: practice closed, provider not working, time off, existing appointment, buffer, appointment-type zone, or future room/resource conflict.
- Model before/after buffers separately from patient duration.
- Allow dentist/receptionist overrides with a recorded reason.
- Recurring care creates linked instances that can be changed individually or as a future series without rewriting completed visits.

### 4. Cancellation, rescheduling, and waitlist

- Patients may cancel or request rescheduling before the configured cutoff; requests outside it route to staff.
- Preserve the original appointment while a reschedule is reviewed according to a still-open slot-hold policy.
- Staff movement supports drag as an enhancement, plus keyboard and visible menu actions, conflict preview, confirmation, undo, and audit history.
- Waitlist results explain why each patient fits the opening. Staff select whom to contact, define offer expiry, and see prior attempts; the system never silently awards the slot.

### 5. One appointment-centered care workspace

```text
Request and approval
  -> pre-visit forms and alerts
  -> check-in and readiness
  -> treatment record and clinician note
  -> patient-shared visit summary
  -> prescription and medicine schedule
  -> follow-up or recall
  -> invoice, payment, and receipt
  -> completion and audit timeline
```

The appointment orchestrates these records without collapsing their legal boundaries. Clinical, prescription, and financial records keep separate permissions, lifecycle, and retention while the user sees one care-journey spine.

### 6. Patient experience

- The booking flow collects only identity/contact and routing information before approval; secure intake follows approval.
- The patient home prioritizes the next required action instead of presenting equal-weight module tiles.
- The durable visit page contains appointment state, approved treatment summary, general/shared notes, prescription, medicine timing/instructions, follow-up date, invoice, payment status, and receipt.
- Sensitive documents open in the authenticated portal; ordinary reminders contain only the minimum necessary information.

## Differentiation to defend

1. **One accountable journey:** competitors expose capable modules; this product makes every handoff from request to patient output visible and owned.
2. **Spatial approval:** requests are not detached inbox items—they remain visible against the capacity they may consume.
3. **Explainable availability:** every unavailable slot and every override has a reason.
4. **Patient-useful prescriptions:** issuance becomes a clear regimen and follow-up experience without automated clinical inference.
5. **Verified accessibility:** publish and test a real conformance target where public competitor evidence is absent.

## Open decisions before implementation

- Request-slot hold duration, expiry, and behavior when multiple patients request the same slot.
- Exact default cancellation cutoff and appointment-type exceptions.
- US launch states, UK private/NHS scope, and Canadian launch provinces.
- Minor, guardian, responsible-party, and substitute-decision-maker workflows.
- Medicine database/licensing, ePrescribe providers, and jurisdiction-specific prescribing rules.
- Reminder vendors, consent model, confidential communication preferences, and hosting regions.
- Whether first-release billing is invoice/payment/receipt only or includes insurance claims and remittance.
- Urgent dental request triage wording and escalation ownership.
