# Competitive workflow study: Dentrix Ascend and Curve Dental

Research date: 2026-07-31  
Scope: public, first-party product pages and first-party help documentation only  
Target product: a one-location, one-time-zone dental system for multiple providers, where patients request an available slot, staff approve it, and the visit continues through check-in, treatment, prescriptions, follow-up, invoice, and receipt.

## Evidence labels

- **Demonstrated**: first-party task documentation describes the UI or workflow, usually with screenshots.
- **Marketing claim**: the vendor describes a capability or benefit on a sales page, but the reviewed public evidence does not fully demonstrate it.
- **Inference**: an assessment derived from demonstrated behavior. It is not a vendor claim.
- **Not publicly evidenced**: the capability may exist, but it was not demonstrated in the first-party public material reviewed for this study.

This distinction matters because both vendors publish broad feature claims, while their task documentation exposes narrower operational behavior and important seams between modules.

## Executive comparison

| Product | Strongest benchmark | Booking request handling | Staff scheduling model | Visit-to-revenue continuity | Main caution | Quality-bar verdict |
|---|---|---|---|---|---|---|
| Dentrix Ascend | Operational completeness and status-driven patient routing | New online bookings occupy the calendar as **Unconfirmed**; staff may also need to match or create the patient record | Day/week calendar by provider or operatory, scheduling templates, events, opening search, Pinboard/ASAP/broken-no-show lists | Routing panel can advance statuses, post treatment, collect payment, and produce a walkout/e-statement; clinical records and ePrescribe exist | Dense, fragmented across calendar, routing, chart, ledger, forms portal, and an add-on ePrescribe surface; documented browser-zoom fragility | **Match for workflow depth, status traceability, and security granularity. Do not use as the accessibility or interaction-simplicity bar.** |
| Curve Dental | Category-standard interaction craft for a staff calendar | Self-scheduled appointments appear with a dashed border and can be verified in Scheduler or a Smart Action List | Provider/operatory grid with persistent Sidekick, click-drag creation, queue-based rescheduling, blocks, production bookings, Short Notice, and Smart Fill | Appointment tags seed procedures; visit notes stay with treatment; checkout finalizes an invoice; treatment plans/invoices can be sent to patients; ePrescribe is integrated | Heavy reliance on drag, hover, right-click, color, and multiple products/tabs (Hero, GRO, mobile, patient links); mobile scheduling is explicitly incomplete | **Best of these two as the familiar interaction benchmark, especially Sidekick + request verification + Short Notice. Modernize its accessibility and reduce cross-module seams.** |

Sources for the summary: Dentrix Ascend's [calendar view documentation](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm), [online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm), [routing-panel patient information](https://hsps.pro/DentrixAscend/Help/Viewing_or_editing_patient_information_from_the_routing_panel.htm), and [patient checkout workflow](https://hsps.pro/DentrixAscend/Help/Checking_out_patients.htm); Curve Dental's [scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment), [self-scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform), [rescheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/49259556105107-Handling-Canceled-Missed-and-Rescheduled-Appointments-from-the-Conversion-Days), and [permissions guide](https://curvedental.zendesk.com/hc/en-us/articles/50251888058131-Understanding-Curve-Hero-and-Curve-GRO-Access-Permissions).

## 1. Dentrix Ascend

### Public scheduling and calendar interaction

**Demonstrated.** Dentrix Ascend's Calendar can switch between day and week, organize columns by provider, operatory, provider group, or operatory group, change time-block size, show or hide scheduling-template blocks, hide patient names or ages, filter to working providers, and show missed appointments as narrower translucent tiles. The documentation says a 1920x1080 monitor usually shows up to seven columns and that view settings are saved per computer. ([Calendar view documentation](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm))

**Demonstrated.** Appointment tiles can be colored by provider and/or procedure; procedure types can have their own colors, and a multi-code appointment uses a procedure color according to the vendor's priority rules. ([Appointment color and layout documentation](https://hsps.pro/DentrixAscend/Help/Customizing_appointment_colors_and_layout.htm))

**Demonstrated.** Staff can search openings manually or from a scheduling template using provider or operatory availability, with patient context carried into the resulting appointment. ([Opening-search documentation](https://hsps.pro/DentrixAscend/Help/Searching_for_available_appointment_times.htm)) Provider availability can be restricted for a date by creating an event directly on an open calendar slot; the vendor explicitly gives vacation as an example. ([Blocking online availability](https://hsps.pro/DentrixAscend/Help/Blocking_time_slots_from_online_booking_availability.htm))

**Demonstrated.** The right-side Pinboard contains separate Pinboard, ASAP, and Broken/No Show tabs, searchable by patient, procedure, provider, or date. ([Pinboard/ASAP/broken-no-show documentation](https://hsps.pro/DentrixAscend/Help/Viewing_the_Pinboard_ASAP_and_Broken_No_Show_Lists.htm)) A missed appointment remains on the calendar but becomes transparent; staff record whether it was Broken, No Show, or Cancelled by Office, can record the reason and cancellation time, and can reschedule immediately or later. ([Missed-appointment workflow](https://hsps.pro/DentrixAscend/Help/Marking_appointments_as_missed.htm))

**Visual hierarchy and density assessment — inference.** The public task documentation shows a classic high-density practice-management structure: temporal grid as the primary plane, compact appointment tiles, multiple color semantics, toolbar/view controls, and task panels/lists beside the calendar. It is optimized for experienced staff scanning many appointments rather than first-time comprehension. The distinction between provider color, procedure color, status/translucency, template blocks, and special tile symbols creates useful information bandwidth, but it also creates a learning burden and makes a strong non-color status language essential in a modern implementation. This assessment is grounded in the documented controls and tile behaviors above; exact current production pixels were not independently inspected behind a logged-in account.

### Availability, duration, buffers, time off, recurring care

**Demonstrated.** Online-bookable availability is configured as schedule-template time blocks. Each block identifies when it is available, which providers may be booked, whether recare/new/existing patients may use it, and which appointment reasons are permitted. ([Available-hours setup](https://hsps.pro/DentrixAscend/Help/Setting_up_available_hours_for_online_booking.htm), [time-block editing](https://hsps.pro/DentrixAscend/Help/Editing_the_time_blocks_of_a_scheduling_template.htm))

**Demonstrated.** Appointment reasons carry a fixed default duration; patients see only openings long enough for the reason and cannot change the duration. ([Appointment-reason setup](https://hsps.pro/DentrixAscend/Help/Customizing_appointment_reasons_for_online_booking.htm)) The practice can choose to expose only the first opening within a larger available span to reduce schedule fragmentation. ([Online slot-display setting](https://hsps.pro/DentrixAscend/Help/Setting_the_number_of_time_slots_to_display_for_online_booking.htm))

**Demonstrated.** Provider-specific calendar events act as date exceptions to online availability, and schedule-template blocks provide recurring weekly availability. ([Availability exception workflow](https://hsps.pro/DentrixAscend/Help/Blocking_time_slots_from_online_booking_availability.htm), [time-block editing](https://hsps.pro/DentrixAscend/Help/Editing_the_time_blocks_of_a_scheduling_template.htm)) Recare is a first-class scheduling and communication workflow in online booking. ([Online booking overview](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm))

**Not publicly evidenced.** The reviewed first-party material did not demonstrate an explicit before/after **buffer** field attached to an appointment type, nor generic recurring-series creation with “this visit / this and future / all visits” editing. A product should not assume that fixed duration plus template blocks fully solves cleanup, sterilization, or provider transition time.

### Patient self-booking and staff approval

**Demonstrated.** The current online scheduler supports new and existing patients and representatives booking for an adult or child. Patients select an appointment reason, see only non-conflicting slots long enough for that reason, select a time, provide demographics and optional comments, consent to texts, and optionally enter primary and secondary insurance. The vendor says calendar changes publish to online booking within 30 seconds, while changes to booking hours publish nightly. ([Online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm))

**Demonstrated.** The submission creates an appointment tile marked as booked online with an **Unconfirmed** status. If the submitted identity is not a perfect match, staff must assign it to one of up to two suggested records, search for a different patient, or create a new patient; the differences are highlighted and booking creates an audit-log entry. ([Office handling in the online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm)) This is close to the target product's approval model, but the vendor's documented action is “confirm/verify and reconcile,” not a clean request queue that leaves the slot uncommitted.

**Demonstrated.** Staff have a separate Unconfirmed Appointments list grouped by Unconfirmed and Confirmed, with primary-contact phone/email, last automated contact, form status, and bulk confirmation actions. ([Confirmation workflow](https://hsps.pro/DentrixAscend/Help/Confirming_appointments.htm))

**Inference.** Occupying the calendar immediately prevents double booking, while an unconfirmed status preserves staff review. The important UX lesson is to model **slot hold** separately from **clinical/identity approval**. A pending request should reserve capacity, expose a visible expiry or service-level target, and give staff one place to approve, decline, correct patient matching, or propose a different time.

**Not publicly evidenced.** The reviewed official material did not demonstrate patient self-cancellation or self-rescheduling governed by a configurable cutoff, or a patient-visible request status before staff action. The booking flow includes a 24-hour notice acknowledgment, but the documentation does not show it as a configurable cancellation engine. ([Online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm))

### Reminders, no-show recovery, waitlist, and follow-up

**Demonstrated.** Automated reminders can carry booking or forms links, and the Unconfirmed list shows when an automated email or text last went out. ([Confirmation workflow](https://hsps.pro/DentrixAscend/Help/Confirming_appointments.htm), [forms overview](https://hsps.pro/DentrixAscend/Help/Dentrix_Ascend_Forms_overview.htm))

**Demonstrated.** ASAP and Broken/No Show are staff-operated lists available inside the calendar's Pinboard. ([Pinboard/ASAP/broken-no-show documentation](https://hsps.pro/DentrixAscend/Help/Viewing_the_Pinboard_ASAP_and_Broken_No_Show_Lists.htm)) After treatment, an appointment marked “Needs Follow-up” enters a provider-filterable list; staff see the phone number, contact the patient, and mark the follow-up complete. ([Post-visit follow-up workflow](https://hsps.pro/DentrixAscend/Help/Following_up_with_patients_after_visits.htm))

**Inference.** This respects the user's stated preference that staff choose whom to contact, but the work is distributed across Pinboard, Unconfirmed Appointments, and Patient Follow-up. A stronger product should present these as related work queues with consistent ownership, due dates, reason, last contact, and suggested next action, while never auto-contacting a waitlisted patient without staff intent.

### Check-in, treatment, notes, prescriptions, invoice, and receipt

**Demonstrated.** The routing panel groups appointments by status, updates automatically as statuses change, and supports pop-up status notifications by provider or operatory. Staff can move appointments through status actions without opening the calendar appointment. ([Routing status workflow](https://hsps.pro/DentrixAscend/Help/Changing_appointment_statuses_from_the_routing_panel.htm), [notification subscriptions](https://hsps.pro/DentrixAscend/Help/Subscribing_to_notifications.htm))

**Demonstrated.** Within the routing panel, staff can see patient photo, name, birth date/age, medical alerts, status-dependent phone/address/email, premedication state, forms, related-patient context, attached procedures, and payment action. Chair/Checkout/Complete cards can post or complete planned procedures; Checkout can open Patient Walkout. ([Routing-panel patient information](https://hsps.pro/DentrixAscend/Help/Viewing_or_editing_patient_information_from_the_routing_panel.htm)) Completed procedures appear in both clinical and financial records, and completing the appointment is a typical way to post scheduled work. ([Completing treatment](https://hsps.pro/DentrixAscend/Help/Completing_treatment.htm))

**Demonstrated.** Clinical notes can be edited until signed or attached to a submitted claim; signed notes accept an addendum, and the system attempts to recover unsaved note content after automatic logout. ([Clinical-note editing](https://hsps.pro/DentrixAscend/Help/Editing_clinical_notes.htm)) Treatment plans can be presented as an online or printed consent form and can record provider, witness, and patient signatures. ([Treatment consent workflow](https://hsps.pro/DentrixAscend/Help/Providing_treatment_consent_forms.htm))

**Demonstrated.** Dentrix Ascend ePrescribe is a paid add-on provided through DoseSpot or Veradigm. The DoseSpot workflow lets an enabled prescriber search medication names, select strength, enter patient directions, dispense amount/unit, refills and days' supply, save favorites, choose a preferred pharmacy, and approve/send or print. Proxy users can prepare a prescription for a provider to approve; controlled substances require PIN plus two-factor authentication. Prescriptions also appear in clinical Progress Notes. The documentation warns that users cannot navigate elsewhere in Ascend while inside the embedded ePrescribe record. ([ePrescribe guide](https://hsps.pro/DentrixAscend/Help/dentrix_ascend_eprescribe.htm))

**Demonstrated.** Patient Walkout combines claim work, payment, and a walkout statement. The statement may be patient- or guarantor-based, carry patient-specific and default messages, show card-payment options, and be printed, mailed, or sent as an e-statement; a PDF copy can be saved to the patient's Document Manager and the communication history. ([Patient checkout workflow](https://hsps.pro/DentrixAscend/Help/Checking_out_patients.htm))

**Not publicly evidenced.** The reviewed official documentation did not demonstrate a single longitudinal patient portal where patients can see approved prescriptions as a dose-by-time schedule alongside follow-up date, treatment summary, invoice, and receipt. Ascend does document link-based forms, online treatment consent, e-statements, and e-prescribing, but these are separate surfaces. ([Forms workflow](https://hsps.pro/DentrixAscend/Help/Completing_patient_forms.htm), [treatment consent workflow](https://hsps.pro/DentrixAscend/Help/Providing_treatment_consent_forms.htm), [billing statement workflow](https://hsps.pro/DentrixAscend/Help/Generating_a_patient_s_billing_statement.htm), [ePrescribe guide](https://hsps.pro/DentrixAscend/Help/dentrix_ascend_eprescribe.htm))

### Roles, permissions, security, and compliance claims

**Demonstrated.** Default roles include Administrator, Billing Coordinator, Provider, and Receptionist; roles can be renamed/customized, and rights can be restricted by feature and location. ([Role documentation](https://hsps.pro/DentrixAscend/Help/Adding_user_roles.htm)) The public rights matrix separates prescription review/printing/voiding, ledger review, payment creation, statement generation, user management, working hours, reports, and other operations. ([Security-rights matrix](https://hsps.pro/DentrixAscend/Help/Security_rights_list.htm))

**Demonstrated.** The audit log records user activities with date, user, location, and details; online booking and form write-back are among the documented audited actions. ([Audit-log documentation](https://hsps.pro/DentrixAscend/Help/Audit_log.htm), [online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm), [forms workflow](https://hsps.pro/DentrixAscend/Help/Completing_patient_forms.htm)) MFA may be required for unusual login circumstances, repeated login failures lead to locking/blocking, and those events enter the audit log. ([Login documentation](https://hsps.pro/DentrixAscend/Help/Logging_in.htm))

**Marketing/compliance claim.** Dentrix Ascend's official security white paper says it uses TLS for data in motion and describes physically secure data storage; its privacy policy says data can be processed under HIPAA Business Associate Agreements. These are vendor claims, not an independent certification assessment in this study. ([Security white paper](https://www.dentrixascend.com/assets/pdf/Ascend%20Advantages%20White%20Paper-PRESS.pdf), [privacy policy](https://www.dentrixascend.com/documents/Dentrix-Ascend-Privacy-Policy.pdf))

**Not publicly evidenced.** No product-specific WCAG conformance statement or Accessibility Conformance Report/VPAT was found in the reviewed official public material. This is absence of evidence, not evidence that the product is inaccessible.

**Accessibility concern — demonstrated plus inference.** The vendor says browser zoom should remain at 100%, that lowering it can hide the final calendar column or buttons, and recommends 1920x1080 at 100% zoom. ([Calendar view documentation](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm), [system requirements](https://hsps.pro/DentrixAscend/Help/System_requirements.htm)) That is a poor benchmark for low-vision and reflow support. Our product should support at least 200% zoom, keyboard operation, non-color status cues, and a usable reduced-density/mobile alternative without losing actions.

### Dentrix Ascend: what to match, avoid, and surpass

**Match**

- Separate provider/operatory views, compact day/week switching, visible working-hours exceptions, and opening search. ([Calendar view](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm), [opening search](https://hsps.pro/DentrixAscend/Help/Searching_for_available_appointment_times.htm))
- Use fixed appointment-type duration to generate valid slots, and offer a first-available-only option to protect schedule shape. ([Appointment reasons](https://hsps.pro/DentrixAscend/Help/Customizing_appointment_reasons_for_online_booking.htm), [slot-display setting](https://hsps.pro/DentrixAscend/Help/Setting_the_number_of_time_slots_to_display_for_online_booking.htm))
- Reserve a requested slot immediately but make its unconfirmed/needs-match state unmistakable. ([Online booking workflow](https://hsps.pro/DentrixAscend/Help/Online_booking_overview_and_workflow.htm))
- Preserve a traceable status path from arrival through chair, checkout, and completion, with clinical and financial posting linked. ([Routing status workflow](https://hsps.pro/DentrixAscend/Help/Changing_appointment_statuses_from_the_routing_panel.htm), [completing treatment](https://hsps.pro/DentrixAscend/Help/Completing_treatment.htm))
- Keep staff permissions granular and audit sensitive changes. ([Security-rights matrix](https://hsps.pro/DentrixAscend/Help/Security_rights_list.htm), [audit log](https://hsps.pro/DentrixAscend/Help/Audit_log.htm))

**Avoid**

- Depending on many overlapping color systems and translucent tiles without redundant text/icon/status treatment.
- Treating browser zoom as fixed or allowing calendar columns/actions to disappear outside a preferred desktop configuration. ([Calendar view documentation](https://hsps.pro/DentrixAscend/Help/Customizing_the_schedule_view.htm))
- Fragmenting one patient's journey across unrelated queues and modal/embedded surfaces.
- Making prescription entry a navigational dead end. ([ePrescribe guide](https://hsps.pro/DentrixAscend/Help/dentrix_ascend_eprescribe.htm))

**Differentiation opportunities**

1. One approval inbox that reconciles the patient, reviews intake risk, approves/declines/proposes a time, and communicates the outcome.
2. A visit workspace with shared handoff state: check-in -> clinical work -> patient-facing summary -> prescription -> follow-up -> invoice/receipt.
3. Explicit visibility classes for every note/output: `clinical private`, `staff operational`, or `patient shared`, with a preview of exactly what the patient receives.
4. A patient timeline that combines approved prescription directions and times, general notes, follow-up date, invoice, receipt, and pending actions.
5. First-class cancellation cutoff, override reason, audit history, and staff-selected waitlist outreach.

## 2. Curve Dental

### Public scheduling and calendar interaction

**Demonstrated.** Curve Hero uses a time-grid Scheduler plus a persistent Sidekick. Staff select a patient in Sidekick, choose a date from its mini-calendar, click-drag over a time span in the applicable operatory, verify patient/provider in a New Appointment dialog, then add description, tags, procedures, and notes before creating the appointment. Tags can automatically attach procedures, and an asterisk on the appointment header indicates a note. ([Appointment scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment))

**Demonstrated.** The Sidekick's opening search filters by provider, weekdays, date range, time range, clinic, operatories, and number of time units. Results navigate the Scheduler, and an appointment bubble can be dragged from results into the grid. ([Available-time search](https://curvedental.zendesk.com/hc/en-us/articles/47871405725971-Finding-an-Available-Appointment-Time))

**Demonstrated.** Rescheduling uses a spatial “parking” model: drag the appointment to Sidekick, which becomes the Queue; navigate to the new date; drag the appointment from Queue into its new operatory/time. Procedures, providers, and appointment notes are retained. Canceled and missed appointments can be filtered in Sidekick and dragged back onto the schedule. ([Canceled/missed/rescheduled workflow](https://curvedental.zendesk.com/hc/en-us/articles/49259556105107-Handling-Canceled-Missed-and-Rescheduled-Appointments-from-the-Conversion-Days))

**Demonstrated.** Appointments can use provider or appointment-type color. Tags update existing and future appointment colors, confirmation/status is also represented by a configurable colored bar, missed appointments change color, and online bookings use a dashed border. ([Appointment color settings](https://curvedental.zendesk.com/hc/en-us/articles/50984215211667-Editing-Appointment-Color-Settings-and-Appointment-Printout-Settings), [tag colors](https://curvedental.zendesk.com/hc/en-us/articles/51116505355923-Changing-the-Default-Color-for-Appointments-Scheduled-with-Tags), [check-in status](https://curvedental.zendesk.com/hc/en-us/articles/50403864709523-Checking-In-an-Appointment-and-Undoing-a-Check-In), [self-scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform))

**Visual hierarchy and density assessment — inference.** Curve is the stronger “category standard” reference of these two. The Scheduler remains dominant, Sidekick supplies persistent patient context/search/queue, and appointment details are progressively disclosed through hover summaries, right-click menus, dialogs, and expandable Sidekick modules. The model supports fast expert manipulation, but the same task may rely on position, color, border style, hover, right-click, and drag. It should be treated as a workflow benchmark, not copied interaction-for-interaction.

### Availability, duration, buffers, time off, recurring care

**Demonstrated.** Curve's public permission documentation exposes configuration for clinic hours, appointment hours, clinic closures, staff working hours/time off, appointment unit length, default Scheduler layouts, appointment confirmations/statuses/tags, and provider or appointment-type color. ([Permissions guide](https://curvedental.zendesk.com/hc/en-us/articles/50251888058131-Understanding-Curve-Hero-and-Curve-GRO-Access-Permissions)) A Block Booking prevents appointments in a selected time span. ([Block-booking workflow](https://curvedental.zendesk.com/hc/en-us/articles/50047683265427-How-Do-I-Schedule-Blocks-in-Scheduler))

**Demonstrated.** Production Bookings reserve capacity for desired appointment categories. Tags on the production booking must correspond with tags on the self-scheduling appointment type; the booking can disallow online scheduling or allow patient requests, and offered times also depend on provider, operatory, and duration. ([Production bookings and self-scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50462178699923-Understanding-How-Production-Bookings-Affect-Self-Scheduling))

**Marketing claim.** Curve's scheduling page says practices can set appointment time increments, block unavailable periods, customize provider/operatory views, and configure recurring appointments at regular intervals. The reviewed public task docs substantiate the first three more clearly than generic recurring-series behavior. ([Scheduling product page](https://www.curvedental.com/dental-scheduling-software))

**Not publicly evidenced.** No explicit before/after buffer setting or recurring-series edit semantics were demonstrated in the reviewed first-party task documentation.

### Patient self-booking and staff approval

**Demonstrated.** Curve's patient self-scheduler is a clinic-specific `dental4.me` link. The patient selects clinic, new/returning status, appointment type, and provider. The UI proposes the provider's first available appointment first; “Show Me Other Options” then asks for morning/afternoon/evening preference and displays other slots. The patient enters name, email, date of birth, mobile, gender, and optional insurance information, then verifies with a six-digit SMS code. ([Patient self-scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform))

**Demonstrated.** The appointment is booked into the Scheduler with a dashed border. Staff right-click it and select **Verify Online Booking**, or verify it from an Online Booking task in Curve GRO's Smart Action List. ([Patient self-scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform), [Smart Action List filters](https://curvedental.zendesk.com/hc/en-us/articles/50240210530963-Filtering-the-Smart-Action-List-Tasks-in-Curve-GRO)) This is the closest public comparator to the target product's “request reserves a slot, staff must approve” rule.

**Inference.** “First available” as a strong default, followed by time-of-day preferences rather than a full calendar dump, reduces choice and can protect productive schedule shape. Staff verification appears in both the grid and work queue, which supports opportunistic and dedicated review. Our product should preserve those two entry points but call the state **Pending approval** rather than relying on a dashed border and “verify” terminology.

**Not publicly evidenced.** The reviewed official material did not show patients directly canceling/rescheduling with a configurable cutoff or seeing an approval-pending state. It did show patients confirming future appointments by replying to reminder texts. ([LiveText confirmation behavior](https://curvedental.zendesk.com/hc/en-us/articles/50077509600659-Reviewing-the-Text-Message-Conversation-Pane-in-the-LiveText-Section))

### Reminders, no-show recovery, waitlist, and follow-up

**Demonstrated.** Curve GRO sends configurable email/text appointment reminders, and patients can see family appointments in the patient portal; the vendor also describes online statements/payment there. ([Patient communication product page](https://www.curvedental.com/dental-patient-communication-software)) Patient reminder messages run through campaigns, can be disabled globally or per patient, and appointment confirmation replies are applied to a recent eligible reminder. ([Reminder opt-out configuration](https://curvedental.zendesk.com/hc/en-us/articles/50524185289875-How-Do-I-Inactivate-the-Text-and-Email-Reminder-for-Patients-for-Upcoming-Appointments), [LiveText confirmation behavior](https://curvedental.zendesk.com/hc/en-us/articles/50077509600659-Reviewing-the-Text-Message-Conversation-Pane-in-the-LiveText-Section))

**Demonstrated.** A Short Notice list records patients who want an earlier/different time; staff can add either an existing appointment or a patient without an appointment, including provider, clinic, operatory, units, description, and note. ([Appointment Short Notice](https://curvedental.zendesk.com/hc/en-us/articles/47873814307091-Placing-a-Patient-Appointment-on-Short-Notice), [non-appointment Short Notice](https://curvedental.zendesk.com/hc/en-us/articles/47828061819795-Placing-a-Patient-without-an-Appointment-on-Short-Notice))

**Demonstrated.** Smart Fill lets staff initiate a group message for an open slot from the Scheduler; the marketing page says candidate filters can include unscheduled recare, Short Notice, CDT codes, treatment type, and status. Staff still choose and send the outreach rather than the system automatically awarding the slot. ([Smart Fill workflow](https://curvedental.zendesk.com/hc/en-us/articles/50164245452307-Adding-a-Smart-Fill-Group-Message-in-the-Scheduler), [scheduling product page](https://www.curvedental.com/dental-scheduling-software))

**Inference.** This is a strong match for the user's preference to let staff choose whom to contact. The opportunity is to make selection accountable: show “why this patient,” relevant appointment need, last outreach, consent channel, preferred times, and an explicit staff-selected recipient list before sending.

### Check-in, treatment, notes, prescriptions, invoice, and receipt

**Demonstrated.** Staff check in from an appointment's right-click menu; a colored status bar updates, and hovering shows an Appointment Summary with current status. Undo Check In returns the appointment to No Confirmation/default. ([Check-in workflow](https://curvedental.zendesk.com/hc/en-us/articles/50403864709523-Checking-In-an-Appointment-and-Undoing-a-Check-In))

**Demonstrated.** Appointment tags can attach procedure line items during scheduling. A clinical note added before checkout is attached to the scheduled visit on the Treatment Plan Card; after checkout the visit moves to History as “Invoiced,” and the note remains accessible for that date of service. ([Appointment scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment), [clinical-note workflow](https://curvedental.zendesk.com/hc/en-us/articles/50475942204563-Adding-Clinical-Notes)) Treatment plans can be accepted/rejected and accepted visits become schedulable from Sidekick. ([Treatment-plan status workflow](https://curvedental.zendesk.com/hc/en-us/articles/50475537731219-Accepting-or-Rejecting-Treatment-Plans))

**Demonstrated.** Treatment plans can be printed, emailed, or presented electronically, with procedure/visit totals and patient/insurance estimates. Invoices can be printed or emailed to the responsible party as receipts and can distinguish charges, credits, insurance estimate, write-off estimate, and patient portion. ([Treatment-plan and invoice display options](https://curvedental.zendesk.com/hc/en-us/articles/51633177709331-Understanding-Treatment-Plan-and-Invoice-Display-Options)) An unsigned treatment plan sent by text/email is protected by birth-date verification and downloads to the patient's device; correspondence records the send event and user. ([Patient treatment-plan download](https://curvedental.zendesk.com/hc/en-us/articles/50476123034003-Understanding-How-a-Patient-Downloads-an-Unsigned-Treatment-Plan))

**Demonstrated.** Curve Hero's built-in prescription pad lets staff select or add medication, dose, dispense amount/unit, instructions (SIG), substitution settings, and an electronic signature, then save or print. The documentation warns that if it is not printed during creation, it cannot be printed later. ([Prescription-pad workflow](https://curvedental.zendesk.com/hc/en-us/articles/47708321903379-Adding-a-Prescription-to-a-Patient))

**Marketing claim.** Curve's DrFirst-based ePrescribe page claims electronic delivery to pharmacies, medication history and PDMP access, drug/allergy/dose/formulary alerts, cost visibility, prior authorization, controlled-substance support, and two-factor authentication. ([ePrescribe product page](https://www.curvedental.com/eprescribe)) The public marketing page establishes intended capability, but the reviewed public task documentation does not expose the complete live DrFirst interaction.

**Not publicly evidenced.** The reviewed material did not demonstrate prescriptions appearing in the patient portal as a medication timetable, or a unified patient visit summary containing general notes, follow-up date, prescription, invoice, and receipt. The official patient communication page demonstrates upcoming appointments, statements, online payment, education, and secure communication; forms and treatment plans arrive through time-limited links. ([Patient communication product page](https://www.curvedental.com/dental-patient-communication-software), [form-sharing workflow](https://curvedental.zendesk.com/hc/en-us/articles/50304033795347-Emailing-or-Texting-a-Form-to-a-Patient), [treatment-plan download](https://curvedental.zendesk.com/hc/en-us/articles/50476123034003-Understanding-How-a-Patient-Downloads-an-Unsigned-Treatment-Plan))

### Roles, permissions, security, and compliance claims

**Demonstrated.** Curve Hero includes immutable default roles and editable custom roles. Roles define access across Hero and GRO; users may receive multiple roles, and permission changes take effect after next login. ([Custom/default role documentation](https://curvedental.zendesk.com/hc/en-us/articles/50257400596755-Understanding-Custom-and-Default-Roles), [assigning roles](https://curvedental.zendesk.com/hc/en-us/articles/47401748340883-How-do-I-Add-Permissions-to-an-Account))

**Demonstrated.** The public permission catalog separates scheduler creation/rescheduling, deletion, checkout, editing checkout line items, production visibility, blocks, treatment-plan management, billing outputs, notes by tag, prescriptions, forms, online-booking configuration, communications, and mobile access. It also documents that mobile access remains constrained by a user's other roles and working hours. ([Permissions guide](https://curvedental.zendesk.com/hc/en-us/articles/50251888058131-Understanding-Curve-Hero-and-Curve-GRO-Access-Permissions))

**Demonstrated.** Administrators can export an Audit Trail CSV for selected dates, users, and modules; processing may take a day and the export remains available for seven days. ([Audit Trail workflow](https://curvedental.zendesk.com/hc/en-us/articles/51168443760659-Generating-a-Self-Service-Audit-Using-Audit-Trail)) Curve also documents optional/suspicious-activity MFA using an emailed code that expires after ten minutes. ([MFA workflow](https://curvedental.zendesk.com/hc/en-us/articles/50458311957779-Understanding-the-Multi-Factor-Authentication-for-Added-Database-Security))

**Marketing/compliance claim.** Curve's data policy says it follows HIPAA privacy requirements, encrypts practice traffic with 256-bit SSL, isolates practice databases, replicates/backups data across availability zones, and uses data-center controls/certifications including SOC 2 and ISO 27001. This language describes Curve and its infrastructure but should not be rewritten as “Curve itself is SOC 2 and ISO 27001 certified” without current audit documents. ([Curve data policy](https://www.curvedental.com/data-policy)) Curve also publishes a Canadian privacy addendum addressing applicable Canadian privacy law and personal health information. ([Canadian privacy addendum](https://www.curvedental.com/canadian-privacy-addendum)) No equivalent UK-specific first-party product compliance evidence surfaced in this review.

**Not publicly evidenced.** No Curve Hero/GRO product-specific WCAG conformance statement or Accessibility Conformance Report/VPAT was found in the reviewed first-party public material. Curve does document keyboard shortcuts for periodontal charting, but that is not evidence of complete keyboard or screen-reader support. ([Perio keyboard shortcuts](https://curvedental.zendesk.com/hc/en-us/articles/48238557304339-Perio-Charting-Keyboard-Shortcuts))

**Accessibility concern — demonstrated plus inference.** Core desktop scheduling instructions repeatedly require click-drag, drag-to-queue, right-click, and hover, while status is encoded with appointment color, status-bar color, and dashed borders. ([Appointment scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment), [rescheduling](https://curvedental.zendesk.com/hc/en-us/articles/49259556105107-Handling-Canceled-Missed-and-Rescheduled-Appointments-from-the-Conversion-Days), [check-in](https://curvedental.zendesk.com/hc/en-us/articles/50403864709523-Checking-In-an-Appointment-and-Undoing-a-Check-In), [online booking](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform)) Those interactions need equivalent keyboard-accessible commands, visible action menus, text labels, focus states, and announcements in our product.

**Responsive limitation — demonstrated.** Curve Mobile provides provider columns, date/filter navigation, appointment summaries, status changes, texting, and appointment-block creation, but it cannot attach tags or procedure codes; users must finish the appointment in desktop Hero. The documentation also says choosing Complete as a mobile confirmation does not complete procedures or checkout. ([Curve Mobile overview](https://curvedental.zendesk.com/hc/en-us/articles/50184134712083-Understanding-Curve-Mobile))

### Curve Dental: what to match, avoid, and surpass

**Match**

- Persistent Sidekick patient context beside the calendar, including a temporary Queue for safe rescheduling. ([Scheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/50404036221203-Scheduling-an-Appointment), [rescheduling workflow](https://curvedental.zendesk.com/hc/en-us/articles/49259556105107-Handling-Canceled-Missed-and-Rescheduled-Appointments-from-the-Conversion-Days))
- First-available recommendation before exposing more options, plus explicit patient type, appointment type, and provider selection. ([Patient self-scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform))
- Staff verification from both the appointment itself and a dedicated work queue. ([Patient self-scheduling](https://curvedental.zendesk.com/hc/en-us/articles/50239233556115-Understanding-the-Patient-Self-Scheduling-Platform))
- Short Notice plus staff-initiated Smart Fill, because it preserves staff control over whom to contact. ([Short Notice](https://curvedental.zendesk.com/hc/en-us/articles/47873814307091-Placing-a-Patient-Appointment-on-Short-Notice), [Smart Fill](https://curvedental.zendesk.com/hc/en-us/articles/50164245452307-Adding-a-Smart-Fill-Group-Message-in-the-Scheduler))
- Carry appointment procedures and notes into the visit, then preserve them as dated history after checkout. ([Clinical-note workflow](https://curvedental.zendesk.com/hc/en-us/articles/50475942204563-Adding-Clinical-Notes))

**Avoid**

- Making right-click, hover, or drag the only discoverable path to essential actions.
- Using border style or color as the only indication that staff action is required.
- Splitting approval and communication work across Hero Scheduler and a separately opened GRO tab without a shared navigation/state model. ([Smart Action List](https://curvedental.zendesk.com/hc/en-us/articles/50240210530963-Filtering-the-Smart-Action-List-Tasks-in-Curve-GRO))
- Shipping a mobile scheduler that creates incomplete appointment records requiring desktop cleanup. ([Curve Mobile overview](https://curvedental.zendesk.com/hc/en-us/articles/50184134712083-Understanding-Curve-Mobile))
- A print-once prescription path with no later reprint in the native pad. ([Prescription-pad workflow](https://curvedental.zendesk.com/hc/en-us/articles/47708321903379-Adding-a-Prescription-to-a-Patient))

**Differentiation opportunities**

1. Preserve Curve's fast Sidekick concept but turn it into a visit-aware contextual rail: request -> patient -> alerts -> treatment -> prescription -> patient outputs -> payment.
2. Make every drag action reversible and pair it with keyboard/menu alternatives; show conflict and policy consequences before commit.
3. Keep the first-available patient flow, but explicitly state “This reserves the time while the practice reviews your request,” show response expectations, and notify on approval/decline/counterproposal.
4. Combine Short Notice eligibility, consent, contact history, and slot fit into one explainable shortlist; staff select recipients.
5. Give patients one durable visit page for shared notes, approved treatment, medication instructions/times, follow-up, invoice, receipt, and secure questions.

## 3. Cross-product design recommendation for the category-standard direction

The proposed product should look familiar to experienced dental teams without inheriting the category's accumulated seams.

### Recommended staff surface

1. **Calendar remains the home surface.** Use a provider-column day view as the default for the one-room-per-doctor launch assumption, with week and agenda alternatives. Appointment cards show only patient name, appointment type, and approval/status by default, as specified by the product owner.
2. **Use a persistent contextual rail.** Borrow Curve's Sidekick persistence and Dentrix Ascend's routing depth. Opening a card reveals mandatory phone, optional email, patient/guardian identity, alerts, request history, notes with visibility labels, procedures/treatment, balance, and next actions.
3. **Separate state dimensions.** Avoid one overloaded “status.” Display:
   - booking: requested / approved / declined / reschedule proposed;
   - attendance: unconfirmed / confirmed / arrived / late / no-show / canceled;
   - care: ready / in treatment / checkout / completed;
   - financial: estimate / invoiced / partially paid / paid.
4. **Use an approval inbox.** Copy Curve's dual entry points: visible pending card plus filterable queue. Add identity-match, clinical-intake flags, slot-policy checks, responsible staff member, age of request, and approve/decline/propose-time actions.
5. **Use a recoverable reschedule tray.** Curve's Queue is spatially intuitive, but it must also expose buttons and keyboard actions, preserve the original slot until commit when appropriate, and show an undo toast/audit event.
6. **Protect schedule shape.** Copy first-available recommendations, appointment-type duration, working hours/time off, production/category blocks, and staff-selected Short Notice outreach. Add explicit buffers and sterilization/transition semantics rather than hiding them inside duration.

### Recommended visit and patient surface

Create one linked visit record rather than a set of loosely connected modules:

```text
Booking request
    -> staff approval
    -> confirmed appointment
    -> check-in / forms / alerts
    -> treatment record + private clinical notes
    -> approved prescription + patient directions
    -> shared visit summary + follow-up date
    -> invoice / payment / receipt
    -> patient follow-up task
```

Every output should have a clear author, signed/approved state, audience, timestamp, revision history, and patient-delivery status. “Doctor private,” “staff only,” and “shared with patient” should be explicit fields, not conventions inferred from where a note was typed.

### Accessibility bar to exceed both products

- Full calendar operation with keyboard, visible action menus, and screen-reader names/status announcements; drag remains an enhancement.
- Status text and iconography in addition to color, opacity, or border style.
- Reflow and action availability at 200% zoom; no disappearing columns or controls.
- A compact agenda/list alternative to the visual grid for mobile, zoomed layouts, and assistive technology.
- Patient booking with progressive disclosure, clear errors, back-navigation without data loss, readable consent, and no unnecessary demographic fields before staff approval.
- Touch targets and focus order that remain usable in dense 4-, 8-, and 15-provider scenarios, while filtering and provider groups prevent all columns from being shown at once.

## 4. Final quality-bar verdicts

### Dentrix Ascend

Use Dentrix Ascend as the **workflow-completeness and traceability benchmark**. Its strongest evidence is the connection between online-booked/unconfirmed appointments, identity reconciliation, routing statuses, clinical/financial posting, patient follow-up, granular roles, and audit history. It is not the right interaction or accessibility benchmark because the documented surface is dense, color-heavy, fragmented, and explicitly fragile outside 100% browser zoom.

### Curve Dental

Use Curve Dental as the **primary category-standard interaction benchmark**. Its best patterns are the persistent Sidekick, opening search, first-available patient flow, dashed pending booking plus staff verification, rescheduling Queue, Short Notice, and staff-triggered Smart Fill. Exceed it by eliminating right-click/drag/color dependencies, unifying Hero/GRO/patient-link work, making mobile appointments complete, and giving patients a coherent prescription/visit/billing timeline.

### Combined recommendation

The target should feel immediately legible to a Curve or Dentrix user, but its differentiator should be **one accountable patient journey**: a request reserves capacity; staff approval is explicit; each operational/clinical/financial state is separate and traceable; staff decide waitlist outreach; clinicians control private versus shared notes; and the patient receives a single durable view of approved treatment, medication instructions, follow-up, invoice, and receipt.
