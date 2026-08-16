# Calendar UX beyond the category defaults: Gluon, BusyCal, Amie, Fantastical, and Morgen

**Prepared:** 1 August 2026  
**Primary products requested:** Gluon - Calendar & Planner, BusyCal, Amie  
**Additional peers:** Fantastical and Morgen  
**Product context:** A one-location, multi-provider dental practice calendar with patient booking requests, staff approval, configurable provider availability, treatment-linked follow-up work, and audited schedule changes.

## Method and evidence labels

This review uses first-party product documentation, first-party changelogs, and official App Store product information. It does not treat a personal calendar as a practice-management system, and none of these sources establishes healthcare, privacy, security, or accessibility compliance for our product.

- **Documented** means first-party help or release notes explicitly describe the behavior.
- **Claimed** means a first-party marketing page asserts the behavior, but it was not independently tested here.
- **Inference** means a recommendation for the dental calendar based on the documented pattern. It is not a claim about the source product.
- **Not established** means the reviewed official sources did not provide enough evidence. It does not prove that a feature is absent.

Product behavior can vary by operating system, plan, connected calendar service, and release. Gluon in particular is a new Apple-platform product whose official evidence is mainly its App Store listing and version history. Amie currently presents itself primarily as an AI meeting note taker with calendar integration, while its documentation still covers a broader calendar-and-todo product. Those sources should be read as current product documentation, not as a guarantee that every described calendar feature remains equally central to Amie's roadmap.

## Executive verdict

The earlier recommendation still holds: the staff calendar should feel **fast to scan and deliberate to commit**. This second research pass strengthens it with five more specific ideas:

1. **Save operational workspaces, not only filters.** BusyCal's saved Calendar Sets can remember visible calendars, view settings, time zone, and content filters. The dental equivalent should remember provider group, view, density, working-hours focus, and status filters together.
2. **Keep a persistent, configurable detail rail.** BusyCal's right Info Panel preserves the calendar while exposing editable detail. Our rail should keep the provider/date scroll position stable while staff inspect, approve, move, contact, or document an appointment.
3. **Treat unscheduled work as a queue that can become time.** Amie's todo inbox and Morgen's task panel let items move into calendar space. Our equivalent is not a generic personal todo list: it is a typed queue of booking requests, waitlist candidates, follow-ups, and operational blocks that can be placed into an eligible provider slot.
4. **Use manual approval as a first-class booking mode.** Fantastical Openings explicitly supports either automatic approval or manual review. The dental MVP should use manual approval: a patient submits a request, staff review constraints and context, then approve, propose another time, or decline.
5. **Make dense manipulation legible.** BusyCal combines 15-minute snapping, minute-level precision, live duration/offset feedback, working-hours collapse, and keyboard commands. Our calendar should use the same principle while validating dental constraints before commit and preserving undo/audit history.

These products do **not** justify copying a personal-calendar event model. A dental appointment is a domain record with patient identity, appointment type and duration, provider eligibility, buffers, approval state, cancellation rules, clinical handoff, billing linkage, and an audit trail.

### Executive dental decision table

| Decision area | MVP decision | Why this is the right adaptation |
|---|---|---|
| Core layout | Keep approved Option A: provider-column grid + exception/request rail + persistent detail rail | BusyCal validates an in-context detail panel; Amie validates a queue beside time; the dental workflow needs both simultaneously |
| Default view | Day by provider, with saved staff workspaces; Week capacity, Month capacity, and Agenda alternatives | Dense staff work requires attribution by provider, while planning and accessible sequence require different representations |
| Patient booking | Request only; staff Approve, Propose time, Contact, or Decline | Fantastical demonstrates manual approval as a first-class scheduling mode; automatic consumer booking does not fit the committed MVP |
| Availability setup | Paint recurring provider windows, then subtract time off, appointments, buffers, and active request holds | Morgen's canvas-defined availability is faster than configuring individual slots; dental rules must remain authoritative rather than soft templates |
| Rescheduling | Drag or keyboard move -> preview -> validate -> commit -> notify -> undo/audit | BusyCal supplies precise manipulation feedback; Morgen supplies explicit replanning choices; the dental layer adds constraints and accountability |
| Slot search | Ranked eligible openings with excluded providers/times still explainable | BusyCal's availability rows and next-available search are useful, but free/busy must be expanded to provider skills, appointment type, and buffers |
| Quick creation | Optional natural-language parser with separated parsed fields and confirmation | BusyCal/Fantastical show the speed benefit; patient/provider ambiguity and clinical sensitivity make blind creation unsafe |
| Automation | Suggest and rank only; never autonomously approve or move patient care | Amie/Morgen show useful automation for personal tasks, but patient commitments and notifications require staff control |
| Accessibility | WCAG 2.2 AA built and tested by us; Agenda has action parity with the grid | The reviewed products provide partial keyboard/settings evidence, not sufficient compliance evidence |

### Borrow / adapt / reject

| Disposition | Pattern | Dental application |
|---|---|---|
| **Borrow** | Persistent selected-item detail rail | Keep calendar position stable while staff inspect and act |
| **Borrow** | Saved calendar workspaces | Restore provider group, view, density, filters, and working-hours focus together |
| **Borrow** | 15-minute snap plus exact-time entry and live duration feedback | Make common moves fast without sacrificing minute-precise data |
| **Borrow** | Manual approval, lead time, buffers, future window, and governed questions | Configure public request rules per appointment type |
| **Borrow** | Full-row Agenda targets, live-now marker, and type filters | Provide a strong narrow-screen and screen-reader workflow |
| **Adapt** | Todo inbox -> calendar block | Use typed booking requests, waitlist candidates, follow-ups, and internal blocks—not generic todos |
| **Adapt** | Free/busy availability viewer | Add provider eligibility, procedure duration, buffers, time off, holds, and plain-language exclusion reasons |
| **Adapt** | Paint availability on the calendar | Treat it as a recurring provider rule layer; existing appointments become exceptions rather than moving automatically |
| **Adapt** | Natural-language creation and historic templates | Show parsed structured fields; use governed appointment-type templates; never suggest prior patient/clinical text |
| **Adapt** | Undo | Preserve the original audit event and record undo as a compensating action, with notification consequences made explicit |
| **Reject** | Automatic patient booking in MVP | Every self-booking is a request requiring staff approval |
| **Reject** | AI auto-rescheduling of patient appointments | AI may rank choices; an authorized person commits the change |
| **Reject** | Intentional overlap as a normal shortcut | Override requires permission, conflict warning, reason, and audit trail |
| **Reject** | Color-only event/status encoding | Always pair color with text, shape/icon, accessible name, and non-color state cues |
| **Reject** | Generic calendar notes as clinical documentation | Treatment records, prescriptions, and private clinician notes remain separate protected modules |

## Pattern comparison

| Scheduling problem | Gluon | BusyCal | Amie | Fantastical | Morgen | Dental decision |
|---|---|---|---|---|---|---|
| Switching representations | Week, month, and timeline; Bar/Dot/List modes and type filters are documented in release notes ([App Store](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759)) | Day, Week, Month, Year, List, plus saved custom ranges and layouts ([window](https://www.busymac.com/docs/busycal/70586-the-busycal-window/), [Smart Filters](https://www.busymac.com/docs/busycal/70612-smart-filters/)) | Calendar and Inbox are keyboard-addressable; agenda/list view is documented in the changelog ([quick start](https://amie.so/documentation/getting-started/quick-start), [changelog](https://amie.so/changelog/embed)) | Day, Week, Month, Year and calendar sets; broad keyboard navigation ([shortcuts](https://flexibits.com/fantastical/help/keyboard-shortcuts), [calendar sets](https://flexibits.com/fantastical/help/calendar-sets)) | Calendar canvas plus task panel and reusable Frames ([Frames](https://www.morgen.so/guides/how-to-use-frames)) | Provider-column Day default; Week capacity; Month capacity; Agenda equivalent; saved operational workspaces |
| Creating quickly | Full-cell tap/long-press and a multi-type create menu are documented in release notes ([App Store](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759)) | Click/drag, context commands, natural-language Quick Entry, and history-based suggestions ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/), [Month View](https://www.busymac.com/docs/busycal/70589-month-view/)) | Natural-language todo entry through the panel or command menu ([tasks](https://amie.so/documentation/features/tasks)) | Natural language with a visible preview, slash calendar targeting, drag range, and reusable templates ([adding events](https://flexibits.com/fantastical/help/adding-events-and-tasks)) | Command bar plus click-to-create events or Frames ([command bar](https://www.morgen.so/guides/create-events-and-tasks-with-command-bar), [Frames](https://www.morgen.so/guides/how-to-use-frames)) | Quick create can parse time/type/provider, but staff review an explicit preview before saving |
| Moving and precision | Not established in reviewed official material | 15-minute snap; Shift enables minute precision; live duration and move offset; multi-select ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/)) | Drag/resize scheduled todos; `H` reschedules ([tasks](https://amie.so/documentation/features/tasks)) | Drag snaps to 15 minutes; Shift disables snapping; modifier paths duplicate or create over an event ([shortcuts](https://flexibits.com/fantastical/help/keyboard-shortcuts)) | Reschedule, split, or continue work through explicit commands with a preview of proposed options; undo is documented for accidental unscheduling ([rescheduling](https://www.morgen.so/guides/how-to-reschedule-tasks-in-morgen), [multiple sessions](https://www.morgen.so/guides/schedule-tasks-for-multiple-sessions)) | Drag is an accelerator; keyboard/menu move is always available; preview -> validate -> commit -> undo/audit |
| Availability and requests | Not established | Free/busy timeline, work-hours focus, next-available search, attendee muting ([availability viewer](https://www.busymac.com/docs/busycal/70616-free-busy-availability-viewer/)) | Work hours, checked calendars, minimum notice, booking window, and buffers are documented; booking is automatic ([scheduling links](https://amie.so/documentation/scheduling-links)) | Availability windows, checked calendar set, lead time, break time, extra questions, and manual approval ([Openings](https://flexibits.com/fantastical/help/openings)) | Paint recurring availability directly on a calendar canvas, then cross-check real-time busy calendars ([scheduling links](https://www.morgen.so/guides/how-to-use-scheduling-links)) | Patient chooses an offered slot -> request created -> slot temporarily unavailable -> staff approves/proposes/declines |
| Details in context | Detailed cards in timeline mode ([App Store](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759)) | Right sidebar, popover, or detachable Info Panel; visible fields are configurable ([Info Panel](https://www.busymac.com/docs/busycal/70595-info-panel/)) | Hover preview and private-note entry are documented in the changelog ([changelog](https://amie.so/changelog/embed)) | Creation/editing panel plus proposal-response details ([adding events](https://flexibits.com/fantastical/help/adding-events-and-tasks), [Proposals](https://flexibits.com/fantastical/help/proposals)) | Event/task widgets and task panel ([Frames](https://www.morgen.so/guides/how-to-use-frames)) | Persistent right rail with role-aware operational detail; clinical work opens a separate protected workspace |
| Buffers and travel | Not established | Travel is a visible blocking segment before an event; fixed or map/traffic-derived ([travel time](https://www.busymac.com/docs/busycal/70603-locations-maps-travel-time/)) | AI-scheduled todos can use a configurable buffer; scheduling-link guidance recommends buffers ([AI scheduling](https://amie.so/documentation/features/ai-scheduling), [links](https://amie.so/documentation/scheduling-links)) | Break time can be enforced before and/or after an Opening ([Openings](https://flexibits.com/fantastical/help/openings)) | Buffer workflows can vary by meeting length; travel blocks update when an event is rescheduled ([buffer/travel](https://www.morgen.so/auto-schedule-buffer-travel)) | Procedure-specific cleanup/setup buffers are rule-derived calendar segments; travel is out of scope for one-location MVP |
| Accessibility evidence | App Store says the developer has not indicated supported accessibility features ([App Store](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759)) | Keyboard navigation, darker gridlines, explicit event times, and an option to disable scroll zoom are documented ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/)) | Desktop keyboard shortcuts are documented; a Calendar-specific WCAG/VPAT artifact was not found ([quick start](https://amie.so/documentation/getting-started/quick-start)) | Extensive keyboard shortcuts are documented; a Calendar-specific WCAG/VPAT artifact was not found ([shortcuts](https://flexibits.com/fantastical/help/keyboard-shortcuts)) | Keyboard commands and undo are documented in specific workflows; a Calendar-specific WCAG/VPAT artifact was not found ([rescheduling](https://www.morgen.so/guides/how-to-reschedule-tasks-in-morgen)) | WCAG 2.2 AA remains our own requirement: keyboard parity, Agenda equivalence, non-color cues, accessible names, focus management, and screen-reader tests |

## 1. Gluon - Calendar & Planner

### Evidence boundary

The reviewed product is **Gluon - Calendar & Planner** by jiung han/COTI on Apple's App Store. If the intended “Gluon” is another product, this section should be replaced. The listing currently shows very few ratings, and its calendar behaviors are described mainly through developer-authored version notes rather than a complete help center. Treat it as an early-stage interaction reference, not a category benchmark. ([official App Store listing](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))

### Documented behavior

- Gluon combines projects, tasks, events, recurring routines, reminders, metrics, and reflection in one calendar-oriented workspace. Its listing names week, month, and timeline views and Apple Calendar integration. ([App Store description](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))
- Version 2.3 added a scrollable timeline with past/future infinite scrolling, a live “now” indicator, type-filter chips for projects/events/tasks/routines, and detailed cards with status, tags, memo, and attachments. It also added a Bar/Dot/List mode switcher. ([App Store version history](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))
- Version 2.4 made an entire day cell a single tap/long-press target. Version 2.5 added free-flowing month scrolling, a month/year picker that jumps directly to a date, and a much wider navigation range. ([App Store version history](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))
- Later versions added proportional bars in place of dots, completion indicators, monthly summary cards, inline tracking summaries, consistent filtering of hidden projects, and a list-calendar treatment that hides empty days. ([App Store version history](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))
- The listing says Gluon works offline, requires no account, and syncs through iCloud. The App Store privacy section reports the developer's declaration that the app collects no data, while warning that Apple has not verified the declaration. ([App Store listing and privacy disclosure](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))

### What to borrow

- **Inference:** Use a full-row/full-card hit target in Agenda and capacity views. Tiny text should not be the only selectable area.
- **Inference:** Offer representations based on the question: detailed provider grid for manipulation, compact capacity bars for load, and Agenda/list for sequence and accessibility. Do not make dot-only Month the sole overview.
- **Inference:** Let operational entity types be toggled explicitly: appointments, pending requests, time off, buffers, and internal blocks. The filter must change both the grid and any summaries consistently.
- **Inference:** A live “now” marker and free-flowing chronological Agenda help staff preserve temporal context during a busy day.

### What not to copy

- **Inference:** Projects, mood, routines, and personal metrics do not belong in the practice schedule. Our cross-entity calendar should remain operational and appointment-linked.
- **Inference:** Proportional bars and colors can support a capacity overview, but they cannot communicate provider, approval, arrival, or clinical handoff state alone.
- **Inference:** Offline-first personal storage is not an architecture precedent for a shared practice system. Multi-role consistency, authorization, server-side auditability, reminders, and patient access require a different data model.
- The App Store states that the developer has not supplied supported accessibility-feature information, so Gluon provides no sufficient accessibility benchmark for this project. ([App Store accessibility section](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759))

## 2. BusyCal

### Documented behavior

#### Navigation, views, and density

- BusyCal's main window uses stable view buttons, previous/next and Today controls, a left calendar/mini-month sidebar, search, and a right sidebar that can show tasks, selected-item details, or both. ([BusyCal window](https://www.busymac.com/docs/busycal/70586-the-busycal-window/))
- Day view supports 4–24 visible hours, direct zoom from the time ruler, independently remembered Day/Week density, and a working-hours-only toggle that collapses time outside configured start/end. ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/))
- Month can represent a fixed month or a rolling 1–12 week range. Navigation supports month steps, week steps, pinned month context across boundaries, configurable time formats, word wrapping, and reduced-detail dense layouts. ([Month View](https://www.busymac.com/docs/busycal/70589-month-view/))
- Smart Filters can remember a calendar set, content criteria, a custom view/layout, and a time zone. Temporary changes are visibly marked and are not automatically written back to the saved set. ([Smart Filters](https://www.busymac.com/docs/busycal/70612-smart-filters/))

#### Creation and manipulation

- Day/Week dragging snaps to 15-minute intervals by default; holding Shift enables minute-by-minute movement. Resizing shows the resulting duration and moving shows the time offset. Multiple selected items can move together. ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/))
- Context actions can create an event fitted between neighboring events or align a start/end with an adjacent item. BusyCal also offers natural-language entry and calendar-history suggestions that copy relevant event properties. ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/))
- Month creation can parse a typed sentence into title, time, and location. Its natural-language mode is optional, and the parsed event remains in an editor before creation. ([Month View](https://www.busymac.com/docs/busycal/70589-month-view/))

#### Details, availability, and buffers

- The selected event/task's Info Panel can live in the right sidebar, a dismissible popover, or a detachable window. Fields are configurable, and the panel can expose created time, last edit time, privacy, free/busy, attendees, rooms, travel time, attachments, and service-dependent fields. ([Info Panel](https://www.busymac.com/docs/busycal/70595-info-panel/))
- The Availability Viewer lays organizer and attendees out as rows on a horizontal timeline, separates free, tentative, busy, outside-hours, and out-of-office states with shapes/patterns, and can move a proposed block in 15-minute steps or search for the next available time. Rows can remain visible but be temporarily excluded from the group calculation. ([Free/Busy Availability Viewer](https://www.busymac.com/docs/busycal/70616-free-busy-availability-viewer/))
- BusyCal can display availability without event titles when permissions grant only free/busy access. Support and blocking behavior vary by calendar service and, for Exchange, secondary calendars may not affect availability. ([Free/Busy Availability Viewer](https://www.busymac.com/docs/busycal/70616-free-busy-availability-viewer/))
- Travel time is a separate blocking segment before the event. It may be a fixed duration or calculated from structured locations, starting location, transport mode, and traffic; alerts can be relative to travel start. ([Locations, Maps & Travel Time](https://www.busymac.com/docs/busycal/70603-locations-maps-travel-time/))

#### Keyboard and accessibility-related controls

- BusyCal documents keyboard traversal between items and date ranges, Today, duplicate, open details, and view/sidebar controls. ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/), [keyboard shortcuts](https://www.busymac.com/docs/busycal/70620-keyboard-shortcuts/))
- BusyCal documents darker gridlines, explicit times on small event blocks, font controls, a non-color free/busy distinction (dashed versus solid), and an option to disable time-ruler scroll zoom. These are useful settings, but they are not evidence of full WCAG conformance. ([Day View](https://www.busymac.com/docs/busycal/70587-day-view/))

### What to borrow

- **Inference:** A “workspace” should save provider group + Day/Week/Agenda mode + density + status filters + working-hours focus. Suggested defaults: **Today team**, **Hygiene**, **Requests**, **Provider focus**, and **Week capacity**.
- **Inference:** Show when a user has temporarily modified a saved workspace, and make Save/Revert explicit. This avoids silently corrupting a receptionist's dependable setup.
- **Inference:** Keep a persistent right rail on desktop. It should expose only operationally relevant fields and actions for the selected item; opening treatment records or prescriptions should transition to the protected clinical workspace.
- **Inference:** Use 15-minute visual snap for speed, support exact typed time, and show live start/end/duration while moving. Before commit, validate provider hours, appointment type, buffers, time off, and status rules.
- **Inference:** Translate the Availability Viewer into **Find slot**: provider rows/columns, a proposed appointment block, eligible openings, and explanations for why a provider/time is excluded. Keep excluded providers visible but dimmed when useful.
- **Inference:** Represent setup/cleanup buffers as real blocking segments visually attached to the appointment. A move previews both the care time and its buffers.

### What not to copy

- BusyCal can create overlapping events intentionally. The dental calendar should never treat overlap as a harmless direct-manipulation shortcut; an authorized override needs a reason, warning, and audit event.
- **Inference:** Staff should not choose arbitrary density down to unreadable text. Offer a small number of tested density presets and an accessible Agenda alternative.
- **Inference:** Calendar-history suggestions may inspire appointment-type templates, but patient names, notes, or old clinical details must not be surfaced as generic event suggestions.
- **Inference:** “Free” versus “Busy” is too small a state model. The practice needs working hours, time off, hold/request, approved appointment, buffers, and operational status.

## 3. Amie

### Evidence boundary

Amie's current homepage calls the product an **AI note taker**, and a February 2026 changelog entry calls it an AI meeting note taker with full calendar integration. Its current documentation still describes calendar, todos, scheduling links, AI scheduling, desktop/menu-bar tools, and cross-platform clients. The calendar patterns below are therefore relevant, but Amie should not be treated as a pure calendar product with a stable long-term calendar-first position. ([homepage](https://amie.so/), [changelog](https://amie.so/changelog/embed), [documentation index](https://amie.so/documentation))

### Documented behavior

- Amie places unscheduled todos in an Inbox and scheduled todos as calendar blocks. A todo can be dragged from the panel to a time slot, moved, resized, or rescheduled with `H`; `I` and `C` switch between Inbox and Calendar. ([Tasks & Todos](https://amie.so/documentation/features/tasks))
- Todo Quick Entry and the command menu accept natural-language dates, times, durations, deadlines, and recurrence. Properties include priority, deadline, duration, recurrence, labels, and list. ([Tasks & Todos](https://amie.so/documentation/features/tasks))
- AI scheduling considers existing events, already scheduled todos, blocked/busy time, work-hour windows, list-specific preferred times, priority, deadlines, default durations, and configurable buffers. Manual dragging remains available after automatic placement. ([AI Scheduling](https://amie.so/documentation/features/ai-scheduling))
- Scheduling links can be one-off or recurring. Recurring links respect work hours, selected calendars, blocked time, minimum notice, and a future booking window. A selected time is booked automatically and confirmations are sent. ([Scheduling Links](https://amie.so/documentation/scheduling-links))
- Amie's changelog documents agenda/list view, hover-to-preview with quick private-note entry, a 15-minute default break for AI-scheduled todos, clearer overlaps, month drag/drop for todos, and options for whether scheduled todos are private and free/busy. ([Amie changelog](https://amie.so/changelog/embed))
- The macOS menu-bar view deliberately reduces scope to upcoming confirmed timed events and can hide declined, completed, or all-day items. ([Menu Bar Calendar](https://amie.so/documentation/desktop/menubar))

### What to borrow

- **Inference:** Put unscheduled operational work beside time, but keep it typed. The queue can contain **booking request**, **waitlist candidate**, **follow-up to place**, **provider time-off request**, or **internal block**—not an unstructured todo.
- **Inference:** Dragging a queue item to a provider slot should create a preview with derived duration/buffers and an explicit action: Approve & schedule, Propose time, or Create block.
- **Inference:** Use preferred windows as one input to slot ranking: appointment type, provider eligibility, patient preference, follow-up target, and practice availability. Do not auto-schedule patients merely because an algorithm found whitespace.
- **Inference:** A compact “up next” view should filter completed/cancelled noise, but never hide an exception that requires action.
- **Inference:** Natural language can speed internal quick create—“exam, Jane Doe, Dr Lee, Tue 2:30”—if parsed fields are shown separately for confirmation and patient ambiguity blocks save.

### What not to copy

- Amie's scheduling links automatically book meetings; our patient flow requires staff approval before confirmation.
- **Inference:** AI auto-rescheduling is inappropriate for patient appointments. It may rank candidate openings, but staff must choose and the patient must be notified/confirm where policy requires.
- **Inference:** Calendar colors must not stand in for provider, appointment state, or privacy. Text and shape cues remain necessary.
- **Inference:** Meeting private notes are not a model for clinical notes. Clinical notes require separate authorization, lifecycle, retention, and audit behavior.
- No Amie Calendar-specific accessibility conformance artifact was found in the reviewed official material. Keyboard shortcuts are useful evidence of efficiency, not proof of screen-reader or WCAG support.

## 4. Fantastical: the most relevant booking-request peer

Fantastical was added because its Openings model directly supports the MVP's most important distinction: a booker may request a time without automatically receiving a confirmed appointment.

### Documented behavior

- Natural-language creation produces a preview that can be dragged to another time before saving. It can parse recurrence, time ranges, location, invitees, alerts, and slash-prefixed calendar selection; templates can be created from prior events and reviewed before adding. ([Adding Events and Tasks](https://flexibits.com/fantastical/help/adding-events-and-tasks))
- Keyboard and modifier actions cover create, search, Today, view navigation, duplication, 15-minute drag snapping, and unsnapped precision. ([Keyboard Shortcuts](https://flexibits.com/fantastical/help/keyboard-shortcuts))
- Calendar Sets group visible calendars and can change the default destination calendar/task list. They can also switch by keyboard, time of day, or location. ([Calendar Sets](https://flexibits.com/fantastical/help/calendar-sets))
- Openings templates specify title/description, one or more durations, start interval, availability blocks per day, checked calendar set, destination calendar, break time before/after, lead time, future request window, and optional required questions. ([Openings](https://flexibits.com/fantastical/help/openings))
- An Openings template can automatically approve a fitting meeting or notify the owner to manually accept/decline it. The recipient selects a date/time, supplies information and required answers, verifies the choice, and requests the meeting. ([Openings](https://flexibits.com/fantastical/help/openings))
- Openings uploads unavailable time slots but not event name, location, or invitees; it also uploads selected account/calendar names and colors. This is a useful privacy-minimization example, not evidence for our compliance. ([Openings](https://flexibits.com/fantastical/help/openings))
- Proposals allow an organizer to send multiple candidate times, gather responses/comments, inspect a response matrix, and either automatically or manually create the final event. ([Proposals](https://flexibits.com/fantastical/help/proposals))

### What to borrow

- **Inference:** Keep **manual approval** as an explicit appointment-type/practice policy. For MVP, default every patient self-booking flow to manual approval.
- **Inference:** Appointment-type configuration should contain duration, slot-start interval, provider eligibility, availability windows, pre/post buffer, minimum notice, maximum future booking window, and patient intake questions.
- **Inference:** The approval rail should provide four outcomes: **Approve**, **Propose another time**, **Decline**, and **Contact**. The slot and derived buffers remain unavailable to other public requests while the request awaits a decision.
- **Inference:** “Propose another time” should offer 2–3 valid choices generated from Find slot, with staff able to edit them before sending. Patient response returns to the same request record rather than creating disconnected tentative appointments.
- **Inference:** Public availability should expose eligible openings only. It should never disclose provider event titles, other patient identity, internal notes, or the reason a slot is unavailable.

### What not to copy

- **Inference:** A generic required-question builder is too permissive for healthcare. Patient-facing questions must come from governed appointment-type templates with purpose, visibility, retention, and sensitivity reviewed.
- **Inference:** Do not let bookers add arbitrary guests. A guardian/dependent relationship is a structured patient-access workflow, not a meeting guest list.
- **Inference:** Do not represent every request as an ordinary calendar feed. Requests need an owned queue, age, conflict state, communications, and decision history; a lightweight ghost/hold can appear in the grid.

## 5. Morgen: availability painted on the calendar and explainable replanning

Morgen was added because it provides two distinct patterns: defining availability directly on a calendar canvas and presenting explicit replanning choices rather than silently moving scheduled work.

### Documented behavior

- A Scheduling Link is configured by highlighting recurring available regions on a calendar canvas, adding event type/duration, and optionally adding co-hosts. Offered slots are cross-checked in real time against selected Busy Calendars. ([Scheduling Links](https://www.morgen.so/guides/how-to-use-scheduling-links))
- A long highlighted availability region is divided into bookable slots based on the configured duration; it does not require manually painting every slot. All-day out-of-office items need to be busy to block public availability. ([Scheduling Links](https://www.morgen.so/guides/how-to-use-scheduling-links))
- Frames are recurring template regions for types of work. They can be free or busy, repeat on a custom pattern, filter eligible tasks, and accept tasks through drag/drop or AI planning. Moving a Frame does not automatically move tasks overlaid on it unless the items are selected together. ([Frames](https://www.morgen.so/guides/how-to-use-frames))
- Replanning offers explicit choices such as next available, AI reprioritization, or unschedule; hovering can preview the proposed result. Separate commands can reschedule the whole session, complete and schedule another session, or split remaining time. ([Rescheduling tasks](https://www.morgen.so/guides/how-to-reschedule-tasks-in-morgen))
- Morgen documents undo after accidental unscheduling. ([Multiple task sessions](https://www.morgen.so/guides/schedule-tasks-for-multiple-sessions))
- Morgen Assist claims configurable before/after buffers, buffer duration based on meeting length, privacy-safe busy propagation across calendars, and travel blocks that update after rescheduling. ([Buffer & travel](https://www.morgen.so/auto-schedule-buffer-travel))

### What to borrow

- **Inference:** Configure provider availability by painting a broad recurring working region and attaching rules, rather than entering dozens of individual slots. Appointment-type duration/start interval then derives public slot choices from the region.
- **Inference:** Show availability as a separate layer beneath appointments. Editing the layer changes future openings; it must not silently move existing approved appointments.
- **Inference:** Replanning should describe the outcome before commit: “Move 60-minute crown prep to Dr Lee at 14:00; include 10-minute cleanup; patient notification required; no conflicts.”
- **Inference:** When an availability template changes, show which existing appointments become exceptions and require human resolution.
- **Inference:** Preserve undo for reversible calendar actions while still writing an audit event. Undo is a new compensating action, not deletion of history.

### What not to copy

- Frames are intentionally soft templates. Provider working hours and time off are operational rules and cannot be treated as loose visual suggestions.
- **Inference:** AI priority scoring should not decide which patient receives scarce capacity without transparent practice policy and staff control.
- **Inference:** Travel-time automation is unnecessary in the one-location MVP. The reusable concept is rule-derived adjacent blocking time, which maps to clinical setup/cleanup buffers.

## Recommended calendar workflow after this research

```text
Public booking
    |
    v
Choose appointment type -> answer governed intake questions
    |
    v
Eligible providers + derived slots
  (working template - time off - approved care - buffers - active request hold)
    |
    v
Select slot -> short exclusive form-completion hold -> submit request
    |
    v
Request becomes unavailable to public booking and enters staff queue
    |
    +----------------------+----------------------+------------------+
    |                      |                      |                  |
    v                      v                      v                  v
 Approve             Propose 2-3 times        Contact            Decline
    |                      |                      |                  |
    v                      v                      `------> queue <----'
Confirmed care       Patient selects one
appointment                 |
    |                        v
    |                 staff confirmation
    +------------------------+
    |
    v
Reminder -> arrival/check-in -> treatment -> completion
    |
    v
Follow-up request + prescription + invoice/payment/receipt linkage
```

### Staff calendar interaction contract

1. **Select** a request, appointment, availability region, or empty slot.
2. **Preview** in the right rail without losing provider/date/scroll position.
3. **Validate** appointment type, provider eligibility, duration, buffers, hours, time off, cancellation cutoff, and existing bookings.
4. **Explain** conflicts and show ranked alternatives; never fail with “slot unavailable” alone.
5. **Commit** through an explicit action. Drag/drop opens the same validation/commit step.
6. **Notify** the patient/staff according to the action and expose delivery state.
7. **Undo** when safe and always preserve the audit sequence.

## Composition implications for approved Option A: Exception Radar

The selected composition should remain exception-first, with the research shaping its interaction details:

| Region | Recommended behavior | Source pattern |
|---|---|---|
| Left navigation/filter zone | Named workspaces that restore provider set, view, density, and filters; temporary changes visibly differ from saved state | BusyCal Smart Filters/Calendar Sets |
| Calendar grid | Provider columns; 15-minute visual snap; exact typed time; working-hours focus; attached buffer segments; non-color status cues | BusyCal Day View |
| Request/exception rail | Queue items can be previewed, dragged to test a slot, or opened for Approve / Propose / Contact / Decline | Amie inbox-to-calendar + Fantastical manual Openings |
| Appointment detail rail | Persistent, role-aware operational fields; selected item remains visible in context; treatment opens separately | BusyCal Info Panel |
| Find slot | Proposed block plus visible eligible/excluded providers and plain-language reasons; ranked openings | BusyCal Availability Viewer |
| Availability editor | Paint broad recurring provider windows; appointment duration/interval derives slots; warn rather than move existing care | Morgen Scheduling Links/Frames |
| Agenda | Infinite/continuous chronology, live now marker, full-row targets, type filters, complete action parity with grid | Gluon timeline/list pattern |
| Quick create | Natural-language accelerator whose parsed fields are exposed before save; provider/patient ambiguity blocks commit | BusyCal/Fantastical creation |

## MVP decisions reinforced by the research

| Decision | Recommendation |
|---|---|
| Default calendar view | Provider-column Day, restoring the user's last saved operational workspace |
| Provider scale | Show 4–6 columns comfortably; use saved groups/horizontal paging/provider focus for 8–15 rather than shrinking columns indefinitely |
| Grid interval | 15-minute visual grid; minute-precise stored start/end; typed exact time supported |
| Density | Comfortable, Compact, and High-density presets; never remove Agenda equivalence or critical text |
| New appointment | Click/drag/quick create all lead to one structured preview-and-validation flow |
| Patient self-booking | Always creates a staff-approved request in MVP |
| Request actions | Approve, Propose time, Contact, Decline |
| Move/reschedule | Preview appointment + buffers + conflicts + notifications before commit; receptionist/dentist override requires a reason |
| Saved setup | Provider group + view + density + filters + working-hours focus stored as one workspace |
| Details | Persistent right rail on desktop; contextual sheet/drawer at narrower widths; no clinical-note body in default calendar |
| Availability | Recurring provider template + one-off time off/override; existing approved appointments become exceptions, not silent moves |
| Buffers | Appointment-type defaults, rendered as attached non-bookable segments and moved/validated with the appointment |
| Accessibility | WCAG 2.2 AA; keyboard parity; screen-reader Agenda; non-color status; visible focus; live-region confirmation; reduced-motion support |
| AI/NLP | Optional accelerator for parsing and ranking only; never autonomous patient rescheduling or approval |

## Open questions for later product validation

1. Should a pending request reserve its slot until staff decide, or expire after a configurable review SLA? The current product decision is to remove it from public availability; operations testing should establish escalation/expiry behavior.
2. Which appointment types need different public slot-start intervals from their duration (for example, a 60-minute procedure beginning every 15 or 30 minutes)?
3. Which workspaces should ship by role, and which may users customize? A receptionist likely needs different defaults from a dentist.
4. Should proposing a time require the patient to accept before staff confirmation, or may staff confirm after phone contact and record consent?
5. Which actions can be undone after a notification has already been sent, and how should a compensating notification be presented?
6. What is the safe maximum information density at the tested 4, 8, and 15 appointments per provider per day while preserving zoom, keyboard, and screen-reader access?

## Primary sources reviewed

### Gluon

- [Gluon - Calendar & Planner, official App Store listing and version history](https://apps.apple.com/us/app/gluon-calendar-planner/id6758938759)

### BusyCal

- [The BusyCal Window](https://www.busymac.com/docs/busycal/70586-the-busycal-window/)
- [Day View](https://www.busymac.com/docs/busycal/70587-day-view/)
- [Month View](https://www.busymac.com/docs/busycal/70589-month-view/)
- [Info Panel](https://www.busymac.com/docs/busycal/70595-info-panel/)
- [Smart Filters / Calendar Sets](https://www.busymac.com/docs/busycal/70612-smart-filters/)
- [Free/Busy Availability Viewer](https://www.busymac.com/docs/busycal/70616-free-busy-availability-viewer/)
- [Locations, Maps & Travel Time](https://www.busymac.com/docs/busycal/70603-locations-maps-travel-time/)
- [Keyboard Shortcuts](https://www.busymac.com/docs/busycal/70620-keyboard-shortcuts/)

### Amie

- [Amie homepage](https://amie.so/)
- [Amie documentation](https://amie.so/documentation)
- [Quick Start](https://amie.so/documentation/getting-started/quick-start)
- [Tasks & Todos](https://amie.so/documentation/features/tasks)
- [AI Scheduling](https://amie.so/documentation/features/ai-scheduling)
- [Scheduling Links](https://amie.so/documentation/scheduling-links)
- [Menu Bar Calendar](https://amie.so/documentation/desktop/menubar)
- [Amie changelog](https://amie.so/changelog/embed)

### Fantastical

- [Adding Events and Tasks](https://flexibits.com/fantastical/help/adding-events-and-tasks)
- [Keyboard Shortcuts](https://flexibits.com/fantastical/help/keyboard-shortcuts)
- [Calendar Sets](https://flexibits.com/fantastical/help/calendar-sets)
- [Openings](https://flexibits.com/fantastical/help/openings)
- [Proposals](https://flexibits.com/fantastical/help/proposals)

### Morgen

- [Scheduling Links](https://www.morgen.so/guides/how-to-use-scheduling-links)
- [Frames](https://www.morgen.so/guides/how-to-use-frames)
- [Rescheduling tasks](https://www.morgen.so/guides/how-to-reschedule-tasks-in-morgen)
- [Scheduling tasks for multiple sessions](https://www.morgen.so/guides/schedule-tasks-for-multiple-sessions)
- [Buffer and travel automation](https://www.morgen.so/auto-schedule-buffer-travel)
