# Competitive workflow research: Dentally and CareStack

Research date: 2026-07-31  
Scope: multi-provider dental calendar, patient self-booking requests requiring staff approval, availability controls, appointment lifecycle, clinical handoff, prescriptions, billing, roles/security, visual interaction quality, and accessibility evidence.  
Markets considered: United Kingdom, Canada, and the United States where the products publish relevant first-party material.

## Evidence rules

- **Demonstrated UI** means the interaction or visual pattern is visible in an official product/help screenshot or is described step-by-step in official documentation.
- **Documented behavior** means an official help article describes the behavior, but the complete production UI may not be publicly inspectable.
- **Marketing claim** means a vendor feature page asserts the capability; it was not independently tested in a signed-in account.
- **Inference** is an analysis based on those public materials, explicitly labelled and not presented as product fact.

No authenticated tenant, sales demo, or private implementation documentation was used. CareStack's public feature imagery is often a marketing composite containing cropped UI fragments; Dentally's help center exposes more full workflow screenshots. Exact keyboard behavior, responsive behavior, empty/error states, and end-to-end accessibility cannot be verified from public material alone.

## Executive verdict

| Product | Best benchmark use | Fit to our staff-approval scheduling model | Quality-bar verdict |
|---|---|---:|---|
| Dentally | Calendar legibility, provider-column scanning, appointment finder, explicit availability shading, treatment-to-next-appointment handoff | Medium: strong diary mechanics, but public Portal documentation shows completed online bookings landing directly in the diary rather than an approval queue | **Use as the clarity baseline, not as the full workflow blueprint.** It is a strong reference for familiar UK/Canadian dental operations and disciplined calendar interactions. |
| CareStack | Request-versus-direct booking configuration, lifecycle visibility, integrated patient/clinical/financial journey, enterprise scheduling depth | High: it explicitly supports indirect appointment requests that staff review and finalize | **Use as the functional benchmark to beat.** Match its workflow breadth, then exceed it in cognitive simplicity, accessibility, configurable cancellation policy, and the continuity of one appointment workspace. |

CareStack is the closer competitive analogue to the proposed product because its official materials explicitly describe an appointment-request review queue and a full Requested-to-Completed lifecycle. Dentally is the stronger visual reference for a calmer, inspectable calendar and slot-finding flow. The recommended category-standard direction should combine CareStack's state model with Dentally's visual restraint, without copying either product's branding or proprietary UI.

## 1. Dentally

### 1.1 Calendar and appointment interaction patterns

**Demonstrated UI.** Dentally's diary is a time grid with one column per practitioner, a persistent icon rail, date navigation, and grey unavailable regions. Staff can create an appointment by clicking a free slot, drag an appointment from a shared clipboard, or open an appointment finder. The appointment card includes patient, unbooked treatment-plan appointment, date/time, reason, status, duration, location, practitioner, room, lab-work, and notes fields. The practitioner and date/time are derived from the calendar cell that initiated the booking, reducing re-entry ([booking documentation](https://help.dentally.com/en/articles/3551725-how-to-book-an-appointment)).

**Demonstrated UI.** The public appointment-finder screenshot uses a two-pane layout: constraints on the left and chronological slot results on the right. Filters include start date, practitioner, duration, and zone groups; every result offers one action to navigate to that day in the diary and another to book from the result. Quick jumps such as Today, +1 week, +3 months, and +6 months make distant follow-up search efficient ([appointment finder](https://help.dentally.com/en/articles/9717140-how-to-use-the-new-appointment-finder-tool)).

**Documented behavior.** Availability has an explicit precedence model. Practice opening hours define the default; practitioner schedules express regular work, breaks, and extended leave; one-off overrides handle ad hoc changes. Unavailable time appears dark grey and is excluded from online booking and the appointment finder, although staff can manually override it by booking into the grey region ([availability overview](https://help.dentally.com/en/articles/6702843-how-to-show-practitioner-availability-in-the-calendar), [practitioner schedules](https://help.dentally.com/en/articles/4679311-how-to-use-schedules-to-show-practitioner-availability), [practice opening hours](https://help.dentally.com/en/articles/3568938-how-to-change-the-practice-opening-hours)).

**Documented behavior.** "Zones" reserve or highlight recurring periods for appointment classes such as emergency, hygiene, NHS/private, or a particular room. Zones can have a title, colour, recurrence, date range, practitioners/rooms, and background/border presentation, and the appointment finder can include or exclude zone groups ([calendar zones](https://help.dentally.com/en/articles/3562897-how-to-use-zones-in-your-calendar)). This is production-oriented scheduling rather than a bare availability calendar.

**Documented behavior.** Same-day movement and duration changes are direct manipulation: drag the appointment or resize its bottom edge. Cross-day movement uses the clipboard, requiring a right-click, move-to-clipboard action, date navigation, and a second drag into the destination ([move or alter an appointment](https://help.dentally.com/en/articles/7161019-how-to-move-or-alter-an-appointment)). Recurring calendar appointments exist but require administrator permission; Dentally warns practices not to misuse them to model provider unavailability because this corrupts utilization reporting ([recurring appointments](https://help.dentally.com/en/articles/3551520-how-to-add-recurring-appointments-to-the-practice-calendar)).

**Gap in public evidence.** Appointment-type duration is documented, and breaks can be represented by schedules, but a dedicated configurable pre/post appointment buffer rule is not visible in the reviewed official material. It should not be assumed absent; it is simply not established by the public sources reviewed.

### 1.2 Appointment lifecycle, reminders, cancellation, no-show, and waitlist

**Documented behavior.** Calendar cards surface compact status symbols for Pending, Confirmed, Arrived, In Surgery/Seated, and Completed. Arrived moves the patient into a virtual waiting room and notifies the practitioner. Dentally defines Completed as treatment finished, fees charged, estimate/consent created, and any continuing appointment created ([appointment statuses](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means)).

**Documented behavior.** If an appointment never reaches Arrived, Dentally automatically marks it Did Not Attend at the end of the day; staff can also mark it manually and append notes ([DNA/FTA handling](https://help.dentally.com/en/articles/9718000-how-to-mark-that-a-patient-did-not-attend-dna-fta)). Cancellation records a reason, removes the slot from the live calendar, retains the cancelled record in the patient history/audit, and can place it on the shared clipboard for rebooking ([staff cancellation and rebooking](https://help.dentally.com/en/articles/7156777-how-to-cancel-and-rebook-an-appointment)).

**Documented behavior.** Automated SMS/email reminders and two-way confirmations can update appointment state: YES confirms and NO cancels. Timing and templates are configurable, but Dentally warns that configuring both its automation and legacy patient-communications paths can cause duplicate reminders ([automated reminders and confirmations](https://help.dentally.com/en/articles/3566498-how-to-set-up-automated-reminders-and-confirmations-in-patient-communications)). A newer booking-confirmation flow sends or queues revised details after a booking/move with a 10-minute delay, but the official article marks it beta and not widely available ([booking confirmations beta](https://help.dentally.com/en/articles/15969539-how-to-set-up-booking-confirmations)).

**Documented behavior.** Waiting lists are admin-configured, can carry default reason/duration/notes/location/status, track elapsed and paused waiting time, and expose a report for overdue/waiting/booked/rejected entries. Dentally separately recommends its short-notice filler when a patient already has an appointment, because a successful fill can automatically move the appointment into the gap ([waiting lists](https://help.dentally.com/en/articles/3621351-how-to-use-waiting-lists)). This supports the user's preference that staff choose whom to contact rather than automatically assigning the slot.

### 1.3 Patient Portal and online booking

**Documented behavior.** A patient-selected slot is temporarily represented by a grey hold while the booking is in progress. When the patient completes booking, the appointment appears automatically in the diary, patient record, and day list; deposits/payments appear in the account. Public documentation describes a completed direct booking, not a staff approval queue ([practice view of Portal booking](https://help.dentally.com/en/articles/3551448-what-your-practice-sees-when-a-patient-books-online-via-portal)).

**Documented behavior.** Portal can restrict existing patients to their assigned dentist through practitioner locking and can expose only configured practitioners, appointment categories, durations, and fees ([practitioner locking](https://help.dentally.com/en/articles/9230862-how-to-use-practitioner-locking-with-online-booking), [online-booking collection](https://help.dentally.com/en/collections/2414893-online-booking)). Patients can cancel through Portal when enabled and are prompted to rebook, but the documented cutoff is a fixed 48 hours rather than a practice-configurable duration ([Portal cancellation](https://help.dentally.com/en/articles/3668498-how-patients-can-cancel-an-appointment-online-via-portal)).

**Documented behavior.** Existing patients access treatment estimates through a task-oriented Portal home, review appointment-level price breakdowns and separate terms/payment-terms sections, then type or draw a signature. Portal login includes a one-time mobile code, and signed estimates are preserved in correspondence ([digital estimate signing](https://help.dentally.com/en/articles/4153793-how-patients-can-sign-treatment-estimates-digitally-via-dentally-portal)). Portal also supports medical-history forms, online payments, and check-in devices in the vendor's official feature collection ([Dentally Portal collection](https://help.dentally.com/en/collections/2055711-dentally-portal)).

**Inference.** Dentally's direct-booking model is simpler for patients but does not publicly evidence the requested "patient proposes, staff approves" model. For this product, copying Dentally's booking semantics would violate a core requirement. Its temporary slot-hold behavior remains worth matching to prevent two patients from requesting the same live slot during checkout.

### 1.4 Clinical records, treatment planning, prescriptions, and billing

**Documented behavior.** A treatment plan orders work by appointment and can span multiple practitioners and fee schedules. Clinicians add future "unbooked appointments" with duration, booking interval, booking notes, and clinical notes; reception later finds those requirements in the patient's Appointments tab and books them. Incomplete items can be reordered between appointments by drag-and-drop ([UK/ROI treatment plan](https://help.dentally.com/en/articles/3565923-how-to-create-a-treatment-plan-in-the-uk-and-roi), [future treatment appointments](https://help.dentally.com/en/articles/12165237-how-to-add-appointments-to-a-treatment-plan)).

**Documented behavior.** The chart is the clinical center for existing conditions and proposed treatment. The default patient-record tab is role-sensitive: practitioners open to Chart, non-practitioners to Details ([chart overview](https://help.dentally.com/en/articles/3565932-how-to-chart-in-dentally)). Clinical notes lock after 24 hours; later correction uses an additional general note or controlled reopening when allowed, providing a stronger integrity model than silently editing history ([clinical-note editing](https://help.dentally.com/en/articles/4575643-how-to-edit-clinical-notes)).

**Documented behavior.** In UK/ROI/Canada, administrators create reusable prescription templates, while only clinicians see the New Prescription action. Generation happens from Patient Record > Correspondence rather than from the appointment itself; the result is timestamped, remains editable until printed, and is then locked ([prescription creation](https://help.dentally.com/en/articles/7549440-how-to-create-a-prescription)). The public workflow is document/template oriented; medicine search, drug-interaction checking, electronic transmission, patient dosage schedules, and patient acknowledgement are not demonstrated in this article.

**Documented behavior.** Dentally supports invoice creation from completed treatment, itemized receipts, emailing invoice/estimate attachments, invoice adjustment, and account-level creation/editing ([invoice documentation collection](https://help.dentally.com/en/collections/2955231-invoices)). Reception-level permissions include taking payments and printing/emailing invoices, estimates, and receipts, while practitioners can create/charge/complete treatment items and estimates ([UK default permissions](https://help.dentally.com/en/articles/3567068-understanding-the-default-permission-levels-in-dentally-uk-only)).

**Inference.** The data is connected, but the public flow crosses Calendar, Patient Appointments, Chart, Correspondence, and Account tabs. That is a defensible deep-domain information architecture, yet it creates an opportunity for our product to offer a single appointment workspace that orchestrates treatment notes, prescription, follow-up, invoice, and patient-visible outputs without flattening the underlying records.

### 1.5 Roles, permissions, security, and compliance claims

**Documented behavior.** Dentally uses five numbered default access levels in the UK: no access, reception, standard practitioner, practice manager, and administrator, with Level 4 able to customize additional permissions. Reception can manage the full appointment book and patient details; practitioners add clinical capabilities; administrators control schedules, deletion, settings, and audit. Country-specific permission definitions differ ([UK permission levels](https://help.dentally.com/en/articles/3567068-understanding-the-default-permission-levels-in-dentally-uk-only), [user setup](https://help.dentally.com/en/articles/3568910-how-to-add-a-new-user-to-dentally)). Site visibility can also be restricted, including denying access to another site's diary and appointment details ([multi-site permissions](https://help.dentally.com/en/articles/4775477-an-overview-of-multi-site-features)).

**Marketing/compliance claims.** Dentally states that data is encrypted in transit and at rest, supports dual-layer authentication, tailored permissions, IP/location and login-window restrictions, activity monitoring, and automatic backups ([security page](https://www.dentally.com/en-gb/security)). Its company page claims Cyber Essentials certification, UK GDPR compliance, NHS DSPT certification, and DCB0129 clinical-risk-management adherence ([Dentally credentials](https://www.dentally.com/en-gb/resources/our-story)). These are vendor claims, not an independent certification audit performed for this research.

### 1.6 Visual hierarchy and information density

**Demonstrated UI.** The calendar screenshots show a restrained grayscale canvas: the appointment grid dominates, practitioner names are column headers, time labels stay on the left, and unavailable periods are broad grey blocks. Navigation is concentrated in a narrow icon rail and a strong date toolbar. The appointment finder reduces the high-dimensional diary to a constraint panel and a scannable list of eligible slots ([appointment finder with screenshots](https://help.dentally.com/en/articles/9717140-how-to-use-the-new-appointment-finder-tool), [availability screenshots and semantics](https://help.dentally.com/en/articles/6702843-how-to-show-practitioner-availability-in-the-calendar)).

**Inference.** This is the stronger of the two products for visual calm. It favors the operational artifact over dashboards and decoration. However, several actions rely on unlabeled icons, status relies on small initials/icons in a card corner, and grey alone carries availability meaning in the grid. Those patterns save space for expert users but increase learning and accessibility risk.

### 1.7 Accessibility evidence

No public Dentally accessibility statement, WCAG/EN 301 549 conformance report, VPAT, or documented screen-reader/keyboard workflow was located in the official sources reviewed. This is an **absence of public evidence**, not proof of non-conformance.

**Inference from demonstrated UI.** Grey/white availability and compact P/C/clock/S/check status markings should never be our only state cues. Our version should pair color with text or accessible names, keep every slot/action keyboard reachable, expose grid relationships to assistive technology, provide a list alternative to the time grid, and avoid icon-only high-frequency controls without persistent labels/tooltips.

### 1.8 Strengths, friction, and design takeaways

**Strengths worth matching**

- Provider-column day view with unmistakable unavailable-time shading.
- Fast three-path booking: click a slot, drag a known appointment, or search eligible slots.
- Constraint-first appointment finder with duration/provider/appointment-class filtering.
- Clear distinction between provider availability, appointment zones, and real appointments, preserving utilization-report integrity.
- Staff-controlled waiting lists and short-notice filling.
- Treatment plan creates an explicit future scheduling requirement instead of relying on free-text memory.
- Role-sensitive patient-record entry and strong record locking/audit concepts.

**Friction or gaps**

- **Inference:** cross-day rescheduling through a global clipboard introduces an extra holding state and a risk of appointments being stranded or moved by another staff member; the documentation notes the clipboard is shared by the whole team ([cancellation/rebooking](https://help.dentally.com/en/articles/7156777-how-to-cancel-and-rebook-an-appointment)).
- **Inference:** the fixed 48-hour Portal cancellation cutoff is less suitable than a policy per practice or appointment type ([Portal cancellation](https://help.dentally.com/en/articles/3668498-how-patients-can-cancel-an-appointment-online-via-portal)).
- **Inference:** separate reminder configuration paths create operational complexity and a duplicate-message failure mode explicitly acknowledged by Dentally ([reminder configuration](https://help.dentally.com/en/articles/3566498-how-to-set-up-automated-reminders-and-confirmations-in-patient-communications)).
- **Evidence gap:** no staff-approval queue for patient booking requests is demonstrated publicly.
- **Evidence gap:** the prescription article demonstrates a print/template workflow, not medicine autocomplete or a patient-facing dose-time regimen.

**Patterns to avoid**

- Do not make a request look like a confirmed appointment.
- Do not encode status or availability only through color, a single letter, or an unlabeled glyph.
- Do not require a shared clipboard to reschedule across dates; preserve the convenience while giving the appointment an explicit "being moved" transaction with collision checks and undo.
- Do not expose administrators to two competing reminder engines.

## 2. CareStack

### 2.1 Calendar and scheduling interaction patterns

**Marketing claim with cropped UI.** CareStack presents a unified scheduler across locations, providers, and operatories. It says staff can customize icons, color layouts, and status flags; search/filter openings; and inspect treatment, insurance, and payment information without leaving the scheduler. Its daily list also surfaces pending eligibility/forms, while a monthly planner combines appointments, production goals, and empty-chair hours ([multi-location scheduling](https://carestack.com/dental-software/features/scheduling)).

**Demonstrated fragment.** The official scheduler crop shows time on the vertical axis, operatory columns, tinted appointment cards, patient names, compact categorical tags, and different card borders. This is a dense, production-oriented grid rather than a consumer calendar. The public images do not expose a complete signed-in scheduler, so exact popovers, drag behavior, keyboard mechanics, and collision handling remain unverified ([scheduling feature page](https://carestack.com/dental-software/features/scheduling)).

**Marketing/documented behavior.** CareStack supports patient- and production-type rules, custom appointment types, provider selection, and multiple filtered schedule views. The official pricing matrix names Appointment Finder, Custom Schedule Views with Clipboard, Short Call List, Production Calendar Setup, and multi-specialty scheduling ([CareStack pricing/feature matrix](https://carestack.com/pricing)). The public reviewed pages do not document a dedicated pre/post buffer editor or provider time-off interaction in enough detail to benchmark it.

### 2.2 Request approval, lifecycle, reminders, no-shows, and waitlist

**Marketing claim directly aligned to our requirement.** CareStack supports both direct booking and indirect appointment requests. In request mode, a patient selects a slot, the request appears in a left-navigation notification/review queue, and staff review and finalize it. Direct bookings can instead enter the diary without staff confirmation. Configuration can differ by new/existing patient and by production/treatment type ([online scheduling](https://carestack.com/en-GB/dental-software/features/online-scheduling), [patient portal](https://carestack.com/en-GB/dental-software/features/patient-portal)).

**Marketing claim.** The UK page describes a lifecycle spanning Requested, Pending Confirmation, Booked, Confirmed, Rescheduled, Cancelled, and Completed, with a common real-time view for reception, clinical, and management teams and visible source (direct booking versus request). It also claims lifecycle-event messaging for booking, confirmation, reschedule, and cancellation ([UK online scheduling](https://carestack.com/en-GB/dental-software/features/online-scheduling)).

**Marketing claim.** Reminders can use SMS, email, and voice; cadence, templates, patient communication preferences, and delivery hours are configurable. Patient responses update the appointment in CareStack, and a dashboard reports sent/confirmed reminders and associated production value ([appointment reminders](https://carestack.com/dental-software/features/appointment-reminders), [appointment confirmations](https://carestack.com/en-GB/dental-software/features/appointment-confirmations)).

**Evidence gap.** The feature matrix names a Short Call List, but the reviewed official public pages do not document its ranking, eligibility, contact logging, or conversion workflow in enough detail to establish whether it behaves as a full waitlist ([pricing matrix](https://carestack.com/pricing)). The user's requirement that staff choose whom to contact therefore remains a design requirement, not a CareStack behavior we can safely assume.

**Evidence gap.** CareStack publicly describes lifecycle states and no-show reduction through reminders, but an exact automatic no-show transition rule and a patient self-cancellation cutoff editor were not demonstrated in the reviewed official material. Likewise, request-slot hold/expiry and what happens when two patients request the same slot are not publicly clear.

### 2.3 Patient portal, booking, and check-in

**Marketing claim with visible dashboard fragments.** The Portal home is task-oriented around payments, upcoming appointments, pending forms, and pending treatment. Patients can confirm appointments, complete medical-history/consent forms, upload documents, update details/family members, view/sign treatment plans, see upcoming and completed treatment, review balances/statements, and make payments. Access uses two-factor authentication ([patient portal](https://carestack.com/en-GB/dental-software/features/patient-portal)).

**Marketing claim.** Online-scheduling form configuration can choose requested fields such as phone, address, referral source, and insurance carrier. Booking can be linked from a practice website or Portal and can be limited by appointment/production type and provider availability ([online scheduling](https://carestack.com/dental-software/features/online-scheduling)).

**Marketing/documented behavior.** Kiosk Mode lets patients register, check in, update details, and complete forms; a successful check-in updates CareStack and alerts the clinical team. Office Mode supports chairside treatment-plan/consent presentation; Provider Mode limits the view to the provider's own schedule and relevant patient information. The UK page states that kiosk sessions log out ten seconds after check-in and patients see only their own same-day data ([patient kiosk](https://carestack.com/en-GB/dental-software/features/patient-kiosk)).

**Inference.** CareStack's strongest idea is not any single page; it is the explicit separation of request, booking, confirmation, and completion while keeping patient actions connected to the same record. Our design should match that state clarity but avoid turning the patient Portal into a module directory. A ranked "what needs attention next" home should dominate over equal-weight navigation tiles.

### 2.4 Clinical records, treatment planning, prescriptions, and billing

**Marketing claim.** Treatment planning supports plans/phases, alternatives, drag-and-drop organization, appointment-linked progress, patient Portal review/signing, and financial estimates that recalculate with the treatment structure. It claims accepted/pending/declined status, version history, and an audit trail for digital acceptance ([treatment planning](https://carestack.com/en-GB/dental-software/features/treatment-planning)).

**Marketing claim.** Clinical notes can auto-launch from procedures, use provider/procedure templates and conditional logic, remain draft/in-progress/completed, and be finalized only by authorized clinicians. Addenda and all changes remain in record history ([clinical notes](https://carestack.com/en-GB/dental-software/features/clinical-notes)). This is a good reference for the user's need to separate restricted clinician notes from general patient-facing follow-up information, although the exact private/shared-note UI is not publicly demonstrated.

**Marketing claim with important dependency.** CareStack integrates with DoseSpot and similar third-party electronic prescribing services, supports controlled and non-controlled electronic prescriptions, and lets authorized dentists prescribe from the patient record. The vendor states that the third-party e-prescription service requires separate signup and cost ([prescription management](https://carestack.com/dental-software/features/prescription-management), [DoseSpot integration](https://carestack.com/dental-software/integrations)). The public feature page does not show the patient's own dose-time schedule or confirm that prescriptions are visible as a structured regimen in the Portal.

**Marketing claim.** Electronic statements can be generated individually or in filtered batches. Patients receive an email notification and authenticate to view balances/details and pay, keeping PHI out of ordinary email content. Portal payments, text-to-pay, patient/insurance receivables, and ledger reconciliation are integrated into CareStack's revenue-cycle model ([electronic statements](https://carestack.com/dental-software/features/electronic-statements), [revenue-cycle management](https://carestack.com/dental-software/features/revenue-cycle-management), [online payments](https://carestack.com/dental-software/features/online-payments)).

**Inference.** CareStack is the better breadth benchmark for appointment-to-treatment-to-finance, but its public materials imply several dashboards, planners, queues, and modules. Our opportunity is a role-aware appointment workspace that launches the correct specialized record while preserving one visible care-journey spine and a single completion checklist.

### 2.5 Roles, permissions, security, and compliance claims

**Marketing claim.** CareStack states that administrators can control permissions and remote access and use an audit trail to inspect access. Its HIPAA page describes job-function-based permissions, audit trails, secure patient messaging, backups/recovery, and encrypted online payments ([remote access](https://carestack.com/dental-software/features/remote-access), [HIPAA feature page](https://carestack.com/dental-software/features/hipaa-compliant)). The Portal uses two-factor authentication and separates a responsible party's full account access from another family member's individual account access ([patient portal FAQ](https://carestack.com/en-GB/dental-software/features/patient-portal)).

**Marketing/compliance claims.** CareStack presents itself as HIPAA-compliant in the US and describes GDPR-aligned Portal/kiosk data handling in its UK materials ([HIPAA feature page](https://carestack.com/dental-software/features/hipaa-compliant), [UK patient kiosk](https://carestack.com/en-GB/dental-software/features/patient-kiosk)). These are vendor claims and do not substitute for our own jurisdiction-specific legal analysis, data-processing agreements, security assessment, or clinical-safety work.

### 2.6 Visual hierarchy and information density

**Demonstrated fragment.** CareStack's public scheduler fragment is denser than Dentally's: hour/operatory grid, saturated tinted cards, patient names, short labels, dashed/solid borders, and a location selector coexist in a compact space. Online-created appointments are described as having a dotted outline, while request counts appear in a navigation notification. Dashboard concepts add production, utilization, confirmation, and pending-item counts around scheduling ([scheduler](https://carestack.com/dental-software/features/scheduling), [online-scheduling notifications](https://carestack.com/en-GB/dental-software/features/online-scheduling)).

**Important limitation.** Most official feature-page images are promotional composites rather than uncropped product screens. They are evidence of a few card/tag/list conventions, not proof of complete information architecture or interaction quality. Exact typography scale, panel behavior, responsiveness, and error handling are not publicly visible enough to score confidently.

**Inference.** CareStack's density is appropriate for experienced front-office users, but its mix of colors, badges, borders, small tags, and production metrics could compete with the core question: "who is where, what state are they in, and what needs action?" Our category-standard design should reserve saturated color for exceptions and action states, keep appointment type/status as text, and move revenue/insurance detail into the opened appointment unless a role explicitly needs it in the grid.

### 2.7 Accessibility evidence

No public CareStack accessibility statement, WCAG conformance claim, VPAT, or documented screen-reader/keyboard scheduling workflow was located in the official sources reviewed. The word "accessible" on feature pages is used in the general sense of availability from a website/device, not demonstrated standards conformance. This is an **absence of public evidence**, not proof of non-conformance.

**Inference from demonstrated fragments.** Dotted borders, color-coded cards, tiny categorical tags, icon-only controls, and dense grid content should not be copied without redundant labels, sufficient contrast, focus states, keyboard equivalents, and a list view. Portal 2FA must also have accessible recovery and alternatives; no such workflow is publicly shown.

### 2.8 Strengths, friction, and design takeaways

**Strengths worth matching**

- Configurable direct booking versus staff-reviewed appointment requests.
- Explicit request-to-completion lifecycle and booking-source visibility.
- Unified operational data across scheduling, forms, treatment, prescriptions, and financials.
- Kiosk check-in that updates appointment state and alerts clinicians.
- Structured clinical-note lifecycle with authorized finalization and addenda.
- Patient Portal that combines outstanding tasks, accepted/upcoming treatment, statements, and payments.
- Enterprise depth for provider, operatory, location, appointment type, and production constraints.

**Friction or gaps**

- **Inference:** the breadth creates a risk of dashboard and queue proliferation; public materials name daily lists, monthly planners, opportunity mining, confirmation dashboards, Portal task dashboards, and revenue dashboards ([scheduling](https://carestack.com/dental-software/features/scheduling), [revenue cycle](https://carestack.com/dental-software/features/revenue-cycle-management)).
- **Evidence gap:** exact request review actions, conflict resolution, request-slot expiry, patient communication on rejection/alternative-time proposal, and audit display are not publicly demonstrated.
- **Evidence gap:** configurable cancellation cutoff and detailed waitlist/short-call interaction are not established by public documentation.
- **Dependency:** electronic prescribing depends on a separately contracted third-party service ([prescription management FAQ](https://carestack.com/dental-software/features/prescription-management)).
- **Accessibility gap:** no public conformance artifact was located.

**Patterns to avoid**

- Do not put every operational KPI into the core appointment grid.
- Do not make dashed borders or color the only distinction between online, request, confirmed, or exception states.
- Do not let appointment requests become a disconnected inbox; show their proposed slot/provider and downstream collision risk in context.
- Do not present a third-party prescription integration as a seamless patient medication schedule unless the product actually models dose timing, instructions, changes, and acknowledgement.

## 3. Direct comparison against our required workflow

| Required capability | Dentally public evidence | CareStack public evidence | Recommended product response |
|---|---|---|---|
| Multi-provider staff calendar | Strong provider-column diary and finder | Strong provider/operatory/location scheduler | Start with provider columns for one location; preserve a resource model so rooms can be added later. |
| Patient sees availability and submits request | Availability and direct booking documented; approval queue not shown | Indirect request and staff finalization explicitly claimed | Make request the only launch mode, with a visibly provisional slot and staff SLA. |
| Appointment types/durations | Documented appointment reason and duration | Rules by appointment/production type claimed | Duration belongs to type, with an authorized per-appointment override and reason. |
| Working hours/time off | Explicit opening-hours > schedule > override model | Capability implied, detailed UI not public | Adopt an explainable precedence stack and show why any slot is unavailable. |
| Buffers | Dedicated rule not found publicly | Dedicated rule not found publicly | Make pre/post buffers first-class, visible but not mistaken for patient time. |
| Recurring visits | Admin recurring calendar events plus treatment booking intervals | Treatment timeframes and scheduling depth claimed | Generate a series/request plan with per-instance exceptions, not opaque duplication. |
| Approval | Not publicly evidenced for Portal booking | Request review/finalize is directly aligned | Use a work queue plus calendar overlay; approve, decline-with-reason, or propose alternatives. |
| Waitlist | Detailed waiting list and short-notice filler | Short Call List named; detailed workflow not public | Staff-ranked list with eligibility filters, contact attempts, temporary offer hold, and no auto-assignment. |
| Reminders | Configurable SMS/email and state-changing replies | Multichannel, lifecycle-driven reminders claimed | One rules engine, consent-aware channels, preview/test, and duplicate-rule detection. |
| Cancellation/reschedule cutoff | Portal cancellation on/off with fixed 48-hour cutoff | Exact cutoff editor not public | Configurable global default plus type/provider exceptions; dentist/reception override with reason/audit. |
| No-show | Automatic end-of-day DNA plus manual status | Lifecycle/reminders described; exact automatic rule not public | Explicit no-show action with configurable delayed suggestion, not silent irreversible automation. |
| Check-in | Arrived status/virtual waiting room; Portal Kiosk introduced | Kiosk check-in updates PMS and notifies team | Patient check-in should surface missing forms/alerts without exposing private clinical data. |
| Treatment and follow-up | Appointment-linked treatment plan and unbooked future appointment | Appointment-linked treatment lifecycle and estimates | Appointment workspace should end with treatment status, shareable summary, and follow-up request/date. |
| Private vs general notes | Clinical notes, personal templates, general/additional notes documented | Authorized clinical-note lifecycle claimed | Separate clinical/private notes from patient-visible visit summary with explicit visibility labels. |
| Prescription | Clinician-only templated/printed record | Integrated eRx through a separate service | Structured medication order plus patient regimen; jurisdiction adapters for print/eRx. |
| Invoice/receipt | Completed-treatment invoice, receipt, email/print | Integrated statements, ledger, Portal payment | Generate branded invoice/receipt from completed billable items; patient receives immutable copy in Portal. |
| Accessibility | No public conformance artifact found | No public conformance artifact found | Treat WCAG 2.2 AA as a build requirement and test calendar/Portal with keyboard and screen readers. |

## 4. Differentiation opportunities

### 4.1 Make the request queue spatial, not detached

Display pending requests both in a triage queue and as striped provisional overlays on the proposed provider/slot. Opening one should show patient, appointment type, proposed time, rule fit, relevant alerts, and competing requests. Actions should be Approve, Propose alternatives, Decline with reason, or Contact patient. This combines CareStack's request semantics with Dentally's strong diary context.

### 4.2 Explain availability instead of merely shading it

Every unavailable or partially constrained slot should answer "why?": practice closed, provider not working, time off, existing appointment, buffer, appointment-type zone, or future room conflict. Staff overrides should require an optional/required reason based on policy and remain in the audit trail. Dentally provides the right conceptual layers; our product can make their precedence visible.

### 4.3 One appointment workspace, multiple governed records

Use the appointment as an orchestration surface:

1. request/approval and communication,
2. pre-visit forms and alerts,
3. check-in and seating,
4. treatment record and private clinical note,
5. patient-visible visit summary/general note,
6. prescription and medicine schedule,
7. follow-up request/date,
8. billable items, invoice, payment, and receipt,
9. completion checklist and audit timeline.

The underlying patient, treatment, prescription, and financial records remain separate for integrity and permissions; the workspace removes navigation fragmentation.

### 4.4 Make prescriptions useful after issuance

Both competitors focus publicly on creating/transmitting a prescription document/order. Differentiate by deriving a patient-readable regimen: medicine, strength, dose, route, frequency, start/end, as-needed reason, special instructions, warnings supplied by the authorized data source, and scheduled times. Keep clinician-authored instructions distinct from system reminders, track revisions, and never infer clinical dosing.

### 4.5 Accessibility as a visible product advantage

Ship a calendar grid and equivalent agenda/list view, full keyboard scheduling, persistent text status, non-color redundancy, screen-reader announcements for drag/move transactions, accessible conflict dialogs, high-contrast themes, zoom/reflow support, and reduced-motion handling. Publish a conformance statement and known limitations. Neither competitor supplied public accessibility evidence located in this review, making verifiable accessibility a credible differentiator.

### 4.6 Policy clarity across US/UK/Canada

Keep scheduling policy configurable per practice while isolating jurisdiction-specific clinical, prescription, privacy, tax, and invoice behavior behind validated configuration. Do not imply that HIPAA, UK GDPR/NHS, or Canadian privacy/health-record requirements are interchangeable. The UI should show the policy source/version behind required fields, retention, consent, prescription delivery, and financial documents.

## 5. Recommended benchmark decision

Use **CareStack as the workflow coverage benchmark** and **Dentally as the calendar clarity benchmark**.

The bar to ship should be:

- no less lifecycle coverage than CareStack for Request > Approve > Confirm > Check in > Treat > Prescribe > Follow up > Invoice/receipt > Complete;
- no more visual noise than Dentally in the default staff calendar;
- better request conflict handling, configurable cutoffs/buffers, and staff-selected waitlist outreach than either product publicly demonstrates;
- a clearly superior patient medication experience;
- documented, tested accessibility rather than an unverified claim.

For the selected **Category standard** direction, the familiar elements should be the provider-column time grid, top date controls, appointment cards, list-based slot finder, detail drawer/workspace, and patient task home. The distinctive layer should be traceable request approval and a care-journey spine connecting every downstream outcome.

## Primary-source inventory

### Dentally

- [Appointment calendar documentation](https://help.dentally.com/en/collections/2055727-appointment-calendar)
- [How to book an appointment](https://help.dentally.com/en/articles/3551725-how-to-book-an-appointment)
- [Appointment finder](https://help.dentally.com/en/articles/9717140-how-to-use-the-new-appointment-finder-tool)
- [Practitioner availability](https://help.dentally.com/en/articles/6702843-how-to-show-practitioner-availability-in-the-calendar)
- [Patient appointment statuses](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means)
- [Waiting lists](https://help.dentally.com/en/articles/3621351-how-to-use-waiting-lists)
- [Portal online booking behavior](https://help.dentally.com/en/articles/3551448-what-your-practice-sees-when-a-patient-books-online-via-portal)
- [Portal cancellation](https://help.dentally.com/en/articles/3668498-how-patients-can-cancel-an-appointment-online-via-portal)
- [Treatment-plan appointments](https://help.dentally.com/en/articles/12165237-how-to-add-appointments-to-a-treatment-plan)
- [Prescription creation](https://help.dentally.com/en/articles/7549440-how-to-create-a-prescription)
- [Default permissions](https://help.dentally.com/en/articles/3567068-understanding-the-default-permission-levels-in-dentally-uk-only)
- [Security](https://www.dentally.com/en-gb/security)

### CareStack

- [Multi-location scheduling](https://carestack.com/dental-software/features/scheduling)
- [UK online scheduling and lifecycle](https://carestack.com/en-GB/dental-software/features/online-scheduling)
- [Patient Portal](https://carestack.com/en-GB/dental-software/features/patient-portal)
- [Patient kiosk](https://carestack.com/en-GB/dental-software/features/patient-kiosk)
- [Appointment reminders](https://carestack.com/dental-software/features/appointment-reminders)
- [Treatment planning](https://carestack.com/en-GB/dental-software/features/treatment-planning)
- [Clinical notes](https://carestack.com/en-GB/dental-software/features/clinical-notes)
- [Prescription management](https://carestack.com/dental-software/features/prescription-management)
- [Electronic statements](https://carestack.com/dental-software/features/electronic-statements)
- [Revenue-cycle management](https://carestack.com/dental-software/features/revenue-cycle-management)
- [Remote access and audit](https://carestack.com/dental-software/features/remote-access)
- [HIPAA feature page](https://carestack.com/dental-software/features/hipaa-compliant)
- [Feature/pricing matrix](https://carestack.com/pricing)
