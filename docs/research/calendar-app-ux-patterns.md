# Calendar UX patterns for a multi-provider dental practice

**Prepared:** 1 August 2026  
**Products reviewed:** Google Calendar, Microsoft Outlook Calendar, Apple Calendar, Notion Calendar  
**Question:** What should a dentist dashboard and a dedicated staff calendar each do, and how should the calendar behave?

## Method and evidence labels

This review uses only first-party product help, accessibility documentation, and product pages available without an authenticated account. It does not treat a consumer calendar as a clinical system or its behavior as evidence of healthcare compliance.

- **Documented** means first-party help explicitly describes the behavior.
- **Demonstrated** means first-party imagery or a product tour visibly shows it, but the interaction was not tested here.
- **Claimed** means first-party marketing asserts a benefit.
- **Inference** is a recommendation for this dental product. It is not a claim about the source product.

Features vary by platform, account, plan, and product version. In particular, “not found in the reviewed official material” is not proof that a feature does not exist.

## Executive verdict

Yes: **Dashboard** and **Calendar** should be separate primary pages because they answer different questions.

| Surface | One job | Default time horizon | What belongs there | What does not |
|---|---|---|---|---|
| Dentist dashboard | “What needs my attention now?” | Now through end of day | arrivals, approval decisions, exceptions, incomplete care work, and a short schedule preview | a compressed copy of the full calendar, generic KPI tiles, month navigation |
| Staff calendar | “Where can care fit, and how do I safely change the schedule?” | Today by provider | full availability, appointments, buffers, time off, requests, conflict explanations, find-slot, move/reschedule | treatment documentation, long clinical text, dashboard analytics |

The proposed calendar feel is **fast scan, deliberate commit**:

1. See provider capacity and appointment state without opening records.
2. Open a side rail for operational detail without losing place.
3. Preview the consequence of a move before it changes data.
4. Commit once, then offer undo and preserve an audit event.
5. Use drag as an accelerator; every action also has a visible menu, form, and keyboard path.

The strongest transferable patterns are Google’s view/navigation/undo model, Outlook’s side-by-side calendars and Scheduling Assistant, Apple’s direct manipulation plus precise keyboard movement, and Notion Calendar’s adjustable day count, density controls, right context panel, and conflict-aware availability. None should be copied wholesale: they model meetings or personal commitments, not approval-gated care, buffers, patient privacy, treatment handoffs, or audited overrides.

## What the four products teach

### 1. Google Calendar

#### Documented behavior

- Desktop offers Day, Week, Month, Year, Schedule, and 4-day views. The last selected view becomes the default until changed. Date navigation uses previous/next controls, a mini-calendar, and Today. Side-by-side calendars are limited to Day view. ([Google Calendar: views and navigation](https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DDesktop&hl=en))
- In side-by-side Day view, subscribed people, rooms, or group calendars receive dedicated columns rather than overlapping. “Find a time” compares guest calendars and can show rooms. ([Google Calendar: find times to meet](https://support.google.com/calendar/answer/6294878?hl=en))
- Keyboard shortcuts cover next/previous date range, Today, go-to-date, search, Day/Week/Month/custom/Agenda views, create, open, delete, save, and **undo**. ([Google Calendar: keyboard shortcuts](https://support.google.com/calendar/answer/37034?co=GENIE.Platform%3DDesktop&hl=en))
- A user can create by clicking an empty time, dragging to choose a longer duration, or using the Create action. ([Google Calendar: create an event](https://support.google.com/calendar/answer/72143?hl=en-uk))
- Search has a keyboard entry point and advanced filters for calendars, keywords, participant, location, exclusions, and date range; results become a schedule-style list. ([Google Calendar: screen-reader workflow and advanced search](https://support.google.com/calendar/answer/6101541?hl=en))
- Shared-calendar permissions range from free/busy visibility to event editing and share management. ([Google Calendar: sharing permissions](https://support.google.com/calendar/answer/37082?hl=en))
- Appointment schedules support recurring availability, date exceptions, scheduling windows, buffers, maximum bookings per day, and conflict checks across selected calendars. A booked time is removed from the public booking page. ([Google Calendar: create an appointment schedule](https://support.google.com/calendar/answer/10729749?hl=en-419), [availability and buffers](https://support.google.com/calendar/answer/11423292?hl=en-gb), [conflict checking](https://support.google.com/calendar/answer/16287054?hl=en))
- Google documents working hours and out-of-office blocks; an out-of-office block can automatically decline meetings. ([Google Calendar: working hours and out of office](https://support.google.com/calendar/answer/7638168?co=GENIE.Platform%3DAndroid&hl=en))
- Calendar supports primary, secondary, and event-specific time zones and displays event time for guests in their own local zone. ([Google Calendar: time zones](https://support.google.com/calendar/answer/37064?hl=en-au))
- Notifications can be configured at account, calendar, and individual-event levels and may be delivered through supported browser/desktop, email, or phone mechanisms. ([Google Calendar: notifications](https://support.google.com/calendar/answer/37242?co=GENIE.Platform%3DDesktop&hl=en))
- Desktop density can be responsive to screen size or compact. ([Google Calendar: event density](https://support.google.com/calendar/answer/15619910?hl=en))
- Google provides product-specific guidance for screen readers, keyboard operation, appearance, hearing, and alternative input. Its screen-reader guide recommends Schedule/Agenda view for the main events area. ([Google Calendar accessibility](https://support.google.com/calendar/answer/16271522?hl=EN), [screen-reader guide](https://support.google.com/calendar/answer/6101541?hl=en-GB))
- On iPhone, documented views include Schedule, Day, 3 Day, Week, and Month; calendars and search are available from the navigation drawer. ([Google Calendar with VoiceOver](https://support.google.com/calendar/answer/6101541?co=GENIE.Platform%3DiOS&hl=en))

#### What to borrow

- **Inference:** Keep Today, previous/next, mini-date navigation, search, and view selection stable in the calendar toolbar.
- **Inference:** Make Agenda a first-class operational and accessible equivalent, not a secondary report.
- **Inference:** Preserve a visible undo affordance after a successful move, cancellation, status change, or time-off edit.
- **Inference:** Use a constraint-first “Find slot” tool that checks provider, appointment duration, buffers, schedule, time off, and future resources together.

#### What not to copy

- Google’s booking page normally turns a selected appointment time into a booked calendar event; this product requires a **pending request and staff approval** before confirmation. ([Google Calendar appointment schedule flow](https://support.google.com/calendar/answer/11608416?hl=en))
- **Inference:** Do not model each provider merely as a generic toggleable personal calendar. Providers have capabilities, working patterns, overrides, audit permissions, and clinical ownership.
- **Inference:** Do not search appointment clinical notes the way a general calendar may search description-like content. Staff calendar search should be limited to operational fields and authorized patient identity data.

### 2. Microsoft Outlook Calendar

#### Documented behavior

- Outlook exposes Day, Work Week, Week, Month, and (in supported versions) Schedule view. Calendar groups can appear side by side or in horizontal Schedule view. ([Outlook: customize calendar](https://support.microsoft.com/en-gb/office/customize-your-calendar-in-outlook-for-windows-a4da6a6c-6f6f-4d4e-b117-f0ed65095009), [calendar groups](https://support.microsoft.com/en-us/outlook/create-view-or-delete-a-calendar-group))
- Multiple calendars can be shown side by side or combined as a color-coded overlay. ([Outlook: view multiple calendars](https://support.microsoft.com/en-US/Outlook/calendar/view-multiple-calendars-at-the-same-time-in-outlook))
- Scheduling Assistant shows attendee free/busy information; Outlook on the web can offer a suggested free time and rooms. ([Outlook on the web: schedule an appointment or meeting](https://support.microsoft.com/en-us/outlook/officeweb/schedule-an-appointment-or-meeting), [Scheduling Assistant](https://support.microsoft.com/en-us/outlook/training/schedule-with-outlook-on-the-web))
- Selecting an open time can begin event creation, and appointments support exact start/end times, recurrence, and availability states. ([Outlook: create an appointment](https://support.microsoft.com/en-US/Outlook/create-or-schedule-an-appointment))
- Work hours can differ by day, and a user can set recurring work location or a single-day exception. An out-of-office appointment can be created from the work-plan control. ([Outlook: work hours, location, and out of office](https://support.microsoft.com/en-us/outlook/notifications-and-settings/set-your-work-hours-and-location-in-outlook))
- Outlook stores start/end times in UTC, displays them in each attendee's local zone, and supports additional displayed zones. ([Outlook: time-zone settings](https://support.microsoft.com/en-US/Outlook/getstarted/manage-time-zone-settings-in-outlook))
- Calendar settings include default reminders and 15- or 30-minute display increments in supported web clients. ([Outlook: calendar settings](https://support.microsoft.com/en-US/Outlook/calendar-settings))
- Outlook calendar search can query the currently selected calendars and filter the date range and calendars searched. ([Outlook.com calendar search](https://support.microsoft.com/en-us/outlook/search-your-calendar-in-outlook-com))
- Outlook provides first-party keyboard and screen-reader flows for navigating the date picker, calendar list, view switcher, view options, events, and event details. On Outlook for iOS, the documented default main view is an agenda of upcoming events, with Day, 3-Day, and Month alternatives. ([Outlook Calendar screen-reader navigation](https://support.microsoft.com/en-US/accessibility/outlook/use-a-screen-reader-to-explore-and-navigate-outlook-calendar), [basic screen-reader tasks and view shortcuts](https://support.microsoft.com/en-US/accessibility/outlook/basic-tasks-using-a-screen-reader-with-the-calendar-in-outlook))
- Outlook distinguishes Free, Working elsewhere, Tentative, Busy, and Away/Out of office states. ([Outlook Web App calendar](https://support.microsoft.com/en-US/Outlook/calendar-in-outlook-web-app))
- Outlook documentation supports marking calendar items private so shared viewers see time but not subject, location, or other details. ([Outlook calendar sharing and private items](https://support.microsoft.com/en-US/Outlook/sharing-your-calendar))

#### What to borrow

- **Inference:** Provider groups should be saved views (for example Hygiene, General, or Today’s team), not a long unstructured list of up to 15 providers.
- **Inference:** Use side-by-side provider columns as the primary staff view. Use overlay only for special comparisons because color-interleaved events are harder to attribute under dense clinical schedules.
- **Inference:** Translate Scheduling Assistant into **Find slot**: a free/busy grid plus ranked eligible openings and a plain-language explanation of why rejected times do not fit.
- **Inference:** Preserve the distinction between regular availability, time off, and specific appointment states; do not encode all of them as event colors.

#### What not to copy

- The mobile Scheduling Assistant’s first-party example uses red/white/green to convey availability. That cannot be the only signal in an accessible dental scheduler. ([Outlook mobile Scheduling Assistant](https://support.microsoft.com/en-us/outlook/how-do-i-use-the-the-scheduling-assistant-to-find-meeting-times))
- **Inference:** Email-invitation semantics are not enough for appointment approval, verified patient identity, cancellation-cutoff enforcement, waitlist outreach, and audit history.
- **Inference:** A calendar overlay is unsuitable as the default for 4–15 providers because attribution and collision reasoning would depend heavily on color.
- No general calendar-action undo model or consistent desktop resize behavior was established in the reviewed current first-party documentation; neither is used as an Outlook benchmark here.

### 3. Apple Calendar

#### Documented behavior

- Apple Calendar on Mac supports Day, Week, Month, and Year navigation; Today and previous/next remain direct controls, and double-clicking a period drills from Year to Month or Week/Month to Day. ([Apple Calendar: dates and views](https://support.apple.com/en-za/guide/calendar/icl1010/mac))
- Week view can show five or seven days. Day and Week can show 6–24 hours at a time, with configurable day start and end. ([Apple Calendar: days and times displayed](https://support.apple.com/guide/calendar/change-the-days-and-times-displayed-icl1002/mac))
- Calendars can be shown or hidden from a list; keyboard modifiers can toggle all calendars. ([Apple Calendar: show or hide calendars](https://support.apple.com/en-lamr/guide/calendar/icl1006/mac))
- On Mac, staff-like direct manipulation is documented: drag a time range to create; drag event edges to change duration; drag an event to another date/time. Apple also documents keyboard movement in 15-minute increments in Day/Week view, day/week movement, keyboard view switching, Today/go-to-date, search, and opening the Availability panel. ([Apple Calendar: create and modify events](https://support.apple.com/en-ie/guide/calendar/icalwr13-events/mac), [Apple Calendar keyboard shortcuts](https://support.apple.com/guide/calendar/keyboard-shortcuts-ical002/mac))
- Search matches event title, location, attendee, or note and lists results chronologically. ([Apple Calendar search](https://support.apple.com/en-ie/guide/calendar/icl2cc2c76a7/mac))
- When the calendar service supports availability, Apple can show invitee free/busy, move the proposed block, navigate days, or jump to the next available time. ([Apple Calendar: invitees and availability](https://support.apple.com/en-md/guide/calendar/icl1016/mac))
- Time-zone support can change the zone in which all events are displayed and can set a zone per event. ([Apple Calendar advanced settings](https://support.apple.com/guide/calendar/change-advanced-settings-in-calendar-on-mac-icl26670/mac))
- One event can have multiple alerts, including screen notification, email, sound, file, and time-to-leave when location is available. ([Apple Calendar: event alerts](https://support.apple.com/en-lamr/guide/calendar/icl1012/mac))
- On iPhone, Apple provides Month variants (compact indicators, stacked indicators, or titles), Multi Day, landscape Week, and chronological List views. ([Apple Calendar: iPhone views](https://support.apple.com/guide/iphone/change-how-you-view-events-iphfd1054569/ios))
- Apple’s current iPad accessibility conformance report says there may be Calendar event displays that do not provide a non-color means of distinction. This is evidence not to assume that a platform-native calendar automatically meets this product’s non-color requirement. ([Apple iPad accessibility conformance report](https://support.apple.com/content/dam/edam/applecare/images/en_US/otherassets/accessibility/vpat_ipad_a16_2025.pdf))

#### What to borrow

- **Inference:** Pair direct manipulation with precise keyboard steps. The staff calendar should allow 5/10/15-minute movement from a menu or keyboard dialog even if drag snaps visually to 15 minutes.
- **Inference:** Use progressive drill-down: Month is a capacity overview, Week reveals provider load, Day is the manipulation surface, and appointment details open in context.
- **Inference:** Search results should be chronological and jump back into the exact date/provider position.

#### What not to copy

- **Inference:** Do not include clinical notes, prescriptions, or treatment details in broad calendar search just because Apple’s generic calendar searches notes.
- **Inference:** Do not expose a per-event time-zone control in the one-location MVP. Display the practice zone in the toolbar and store time-zone-aware timestamps; add editing only when multi-location/travel creates a real need.
- **Inference:** Do not rely on event colors for status or provider identity; use text, icon/shape, and accessible names.

### 4. Notion Calendar

#### Documented behavior

- Desktop/web lets users adjust the number of visible days, collapse the all-day section, zoom the interface, and zoom hours to alter grid density. Mobile offers 1-, 2-, or 3-day views. ([Notion Calendar settings](https://www.notion.com/help/notion-calendar-settings))
- Calendars can be hidden from the left sidebar. Selecting an event exposes editable fields in a right context panel; the same event appearing on multiple calendars with the same ID is merged. Desktop/web also supports multi-select and bulk action. ([Notion Calendar: calendars and events](https://www.notion.com/en-gb/help/manage-your-calendars-and-events?nxtPslug=manage-your-calendars-and-events))
- Events are created by selecting a time slot; mobile uses a persistent add button. Notion documents participants/rooms, warnings when rooms become unavailable, multi-day drag creation, event privacy, and event types including focus and out of office. ([Notion Calendar: calendars and events](https://www.notion.com/en-gb/help/manage-your-calendars-and-events?nxtPslug=manage-your-calendars-and-events))
- Scheduling links can be one-off or recurring, can accept typed ranges as an alternative to dragging, and can include expiry, booking windows, location, phone number, and description. “Avoid conflicts” updates offered availability when conflicts appear. Reschedule/cancel links rotate after use. ([Notion Calendar scheduling and availability](https://www.notion.com/en-gb/help/availability-blocking-and-time-zones))
- Cross-calendar blocking can show only “busy” instead of copying original event details, and the lock state indicates whether details are shared. ([Notion Calendar blocking](https://www.notion.com/help/blocking))
- Multiple labelled time zones can be displayed beside the grid and temporarily promoted while travelling. ([Notion Calendar time zones](https://www.notion.com/help/time-zones))
- Notification settings cover invite changes and configurable upcoming-meeting alerts; default event reminders remain governed by the connected Google Calendar. Notion notes that its mobile notifications cannot currently be marked time-sensitive. ([Notion Calendar settings and notifications](https://www.notion.com/help/notion-calendar-settings))
- Notion documents command search and keyboard shortcuts, including a searchable shortcut reference. ([Notion Calendar keyboard shortcuts](https://www.notion.com/help/notion-calendar-keyboard-shortcuts))
- Notion Calendar mobile cannot currently search events/contacts, has restricted event editing, cannot create scheduling snippets, and is limited to 1–3 day views rather than Week, Month, Agenda, Schedule, or List. Widgets can hide titles for privacy and exclude calendars. ([Notion Calendar apps and mobile limitations](https://www.notion.com/help/notion-calendar-apps))
- First-party marketing claims support for combining connected calendars, auto-blocking busy times, scheduling links, mobile apps/widgets, and multiple time zones. These are claims unless backed above by help documentation. ([Notion Calendar product page](https://www.notion.com/product/calendar))

#### What to borrow

- **Inference:** Make visible day count and hour density adjustable, but provide practice defaults so staff are not forced to configure the tool before working.
- **Inference:** Open appointment/request details in a right context rail while preserving date, provider, scroll position, and selected card.
- **Inference:** Treat “busy without details” as the privacy model for future external calendar blocking: a conflict may block capacity without importing a personal event title.
- **Inference:** Offer typed time input wherever the grid supports drag.

#### What not to copy

- Notion’s scheduling links automatically create a meeting on the calendar after a guest chooses a time; the dental product must create a request awaiting staff approval. ([Notion Calendar scheduling links](https://www.notion.com/en-gb/help/availability-blocking-and-time-zones))
- **Inference:** A 1–3 day mobile-only grid is not enough for reception work. The dental product needs a responsive agenda plus focused day operations, with full manipulation reserved for sufficiently wide layouts when necessary.
- **Inference:** No Notion Calendar-specific WCAG/VPAT conformance artifact was found in the reviewed first-party material. Keyboard shortcuts alone are not evidence of screen-reader or full WCAG conformance.

## Cross-product pattern comparison

| Problem | Google Calendar | Outlook Calendar | Apple Calendar | Notion Calendar | Dental decision |
|---|---|---|---|---|---|
| Primary view switching | Day, Week, Month, Year, Schedule, 4 days; choice persists ([docs](https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DDesktop&hl=en)) | Day, Work Week, Week, Month, Schedule where supported ([docs](https://support.microsoft.com/en-gb/office/customize-your-calendar-in-outlook-for-windows-a4da6a6c-6f6f-4d4e-b117-f0ed65095009)) | Day, Week, Month, Year ([docs](https://support.apple.com/en-za/guide/calendar/icl1010/mac)) | Adjustable number of days; 1–3 on mobile ([docs](https://www.notion.com/help/notion-calendar-settings)) | Day/provider default; Week, Month-capacity, Provider focus, Agenda |
| Multiple people/calendars | Toggle list; side-by-side Day columns ([docs](https://support.google.com/calendar/answer/6294878?hl=en)) | side-by-side, overlay, groups, horizontal Schedule ([docs](https://support.microsoft.com/en-us/outlook/create-view-or-delete-a-calendar-group)) | show/hide calendar list ([docs](https://support.apple.com/en-lamr/guide/calendar/icl1006/mac)) | hide/show connected calendars; merge duplicate IDs ([docs](https://www.notion.com/en-gb/help/manage-your-calendars-and-events?nxtPslug=manage-your-calendars-and-events)) | saved provider groups and side-by-side columns; no default overlay |
| Creation | click empty time, drag duration, Create action ([docs](https://support.google.com/calendar/answer/72143?hl=en-uk)) | New event or open time ([docs](https://support.microsoft.com/en-US/Outlook/create-or-schedule-an-appointment)) | drag range, double-click, quick natural-language event ([docs](https://support.apple.com/en-ie/guide/calendar/icalwr13-events/mac)) | select slot; mobile add button; drag multi-day ([docs](https://www.notion.com/en-gb/help/manage-your-calendars-and-events?nxtPslug=manage-your-calendars-and-events)) | click/drag accelerator plus explicit form and keyboard command |
| Moving and resizing | shortcuts include undo ([docs](https://support.google.com/calendar/answer/37034?co=GENIE.Platform%3DDesktop&hl=en)) | move between calendars is documented; current move/resize behavior varies by client ([docs](https://support.microsoft.com/en-us/outlook/set-default-calendar)) | drag move/resize plus 15-minute keyboard movement ([docs](https://support.apple.com/guide/calendar/keyboard-shortcuts-ical002/mac)) | bulk movement documented; multi-day drag creation ([docs](https://www.notion.com/en-gb/help/manage-your-calendars-and-events?nxtPslug=manage-your-calendars-and-events)) | preview -> validate -> commit -> undo; never drag-only |
| Finding capacity | Find a time, room visibility, appointment conflict checks ([docs](https://support.google.com/calendar/answer/6294878?hl=en)) | Scheduling Assistant, suggested time, rooms ([docs](https://support.microsoft.com/en-us/outlook/officeweb/schedule-an-appointment-or-meeting)) | Availability panel, next available ([docs](https://support.apple.com/en-md/guide/calendar/icl1016/mac)) | scheduling links and avoid-conflicts ([docs](https://www.notion.com/en-gb/help/availability-blocking-and-time-zones)) | ranked openings with rule explanations, not raw free/busy only |
| Availability layers | working hours, OOO, availability exceptions, buffers ([docs](https://support.google.com/calendar/answer/10729749?hl=en-419)) | per-day work hours/location, OOO ([docs](https://support.microsoft.com/en-us/outlook/notifications-and-settings/set-your-work-hours-and-location-in-outlook)) | working-day display and service-backed attendee availability ([docs](https://support.apple.com/guide/calendar/change-the-days-and-times-displayed-icl1002/mac)) | availability, busy blocking, focus, OOO ([docs](https://www.notion.com/help/blocking)) | practice hours -> provider hours -> one-off override/time off -> appointment/buffer/resource |
| Density control | responsive or compact ([docs](https://support.google.com/calendar/answer/15619910?hl=en)) | 15/30-minute increments documented in some clients ([docs](https://support.microsoft.com/en-US/Outlook/calendar-settings)) | 6–24 visible hours ([docs](https://support.apple.com/guide/calendar/change-the-days-and-times-displayed-icl1002/mac)) | days count, hour zoom, interface zoom, collapsible all-day ([docs](https://www.notion.com/help/notion-calendar-settings)) | 15-minute visual grid; adjustable hour density; preserve minute-precise data |
| Search | operational advanced filters and list result ([docs](https://support.google.com/calendar/answer/6101541?hl=en)) | keyword/date/calendar filters ([docs](https://support.microsoft.com/en-us/outlook/search-your-calendar-in-outlook-com)) | title/location/attendee/note ([docs](https://support.apple.com/en-ie/guide/calendar/icl2cc2c76a7/mac)) | unavailable on mobile ([docs](https://www.notion.com/help/notion-calendar-apps)) | patient/phone/request/type operational search; exclude clinical note bodies |
| Accessibility evidence | detailed keyboard/screen-reader docs; Agenda recommended ([docs](https://support.google.com/calendar/answer/16271522?hl=EN)) | detailed desktop/web/iOS/Android screen-reader docs ([docs](https://support.microsoft.com/en-US/accessibility/outlook/use-a-screen-reader-to-explore-and-navigate-outlook-calendar)) | extensive keyboard support; iPad report notes a color-only Calendar exception ([docs](https://support.apple.com/content/dam/edam/applecare/images/en_US/otherassets/accessibility/vpat_ipad_a16_2025.pdf)) | shortcuts documented; no reviewed Calendar-specific conformance artifact ([shortcut docs](https://www.notion.com/help/notion-calendar-keyboard-shortcuts)) | WCAG 2.2 AA; Agenda equivalence; non-color cues; visible focus; keyboard and screen-reader testing |

## Recommended information architecture

```text
Practice app
|
+-- Dashboard       "What needs attention now?"
|   +-- Now / next two hours
|   +-- Booking requests awaiting decision
|   +-- Schedule exceptions and gaps
|   +-- Care work to finish today
|   `-- Short day preview
|
`-- Calendar        "Where can care fit and what can I safely change?"
    +-- Provider-column Day (default)
    +-- Provider-focus / saved group
    +-- Week capacity
    +-- Month capacity overview
    +-- Agenda (responsive and accessible equivalent)
    `-- Find slot / request approval / appointment detail rail
```

## 1. Dentist dashboard: “what needs attention now?”

The dashboard should be a role-aware action queue, not an analytics landing page.

### Recommended order

1. **Now / next two hours** — patient, appointment type, appointment time, explicit status, and the next permitted action: Check in, Ready for dentist, Start treatment, Checkout, or open workspace.
2. **Booking requests awaiting decision** — oldest/most urgent first, showing requested slot, provider/type fit, age of request, and actions Approve, Propose time, Decline, Contact.
3. **Schedule exceptions** — provider late/out, same-day cancellation, gap eligible for waitlist outreach, unresolved conflict, reminder failure, or patient inside the 12-hour cutoff asking for help.
4. **Care work to finish today** — unsigned clinical note, prescription draft, missing shared visit summary, follow-up not scheduled, invoice awaiting completion. These are appointment-linked records, not calendar event fields.
5. **Short schedule preview** — the dentist’s remaining day as a compact chronological list. “Open calendar” carries the selected date/provider into the full calendar.

### Role behavior

| Role | Dashboard prioritizes |
|---|---|
| Dentist | current patient, readiness, care documentation, prescription/follow-up completion, own schedule exceptions |
| Receptionist | requests, arrivals/check-in, reminder/contact failures, gaps, waitlist outreach, payment/receipt handoff |
| Administrator | unresolved operational exceptions and configuration issues; not clinical note content by default |

### Deliberate exclusions

- No equal-weight “patients / appointments / revenue / prescriptions” KPI cards at the top.
- No month grid or mini clone of every provider’s calendar.
- No diagnosis, medication, private clinician note, or account balance in default dashboard rows unless the role and task require it.
- No red badge merely because a record exists; badges represent a concrete required action with an owner.

## 2. Dedicated staff calendar: full schedule manipulation

### Default composition

```text
+--------------------------------------------------------------------------------+
| Today  <  Fri 1 Aug  >   [Day] [Week] [Month] [Agenda]   Search   Find slot   + |
+----------------+------------------------------------------------+--------------+
| Date / filters | Dr A      Dr B      Dr C      Dr D             | Detail rail  |
| Provider group |                                                |              |
| Status filter  | 08:00                                          | Appointment  |
|                |  [appt]    available [time off]  [request]     | actions      |
|                |  [buffer]                                      | timeline     |
|                | 09:00                                          | audit/notes  |
|                |     provider-column day grid                    |              |
+----------------+------------------------------------------------+--------------+
```

- **Provider-column Day is the default.** With 4–6 visible providers, each column remains useful. At 8–15 providers, use saved groups, search, horizontal paging, and provider-focus rather than shrinking every column.
- **Week is a capacity/planning view.** It should answer which provider/day can take work; detailed manipulation opens the relevant day/provider.
- **Month is a load overview.** Show capacity, time off, closure, and exception counts—not tiny patient names.
- **Agenda is equivalent, not degraded.** It exposes every appointment action available in the grid and is the primary narrow-screen/screen-reader workflow.

### Calendar hierarchy

Appointment cards show only:

- patient display name;
- start time and duration;
- appointment type;
- explicit status text/icon;
- a narrowly scoped alert marker only when action is required.

The context rail can show operational identity/contact information, approval history, reminders, rescheduling/cancellation history, shared general notes, and links into care/billing workspaces. Private clinician notes and complete clinical records remain in their governed module.

### Visual grammar

- Availability is a background layer.
- Appointments are foreground cards.
- Pre/post buffers are attached caps, not fake appointments.
- Time off/closed periods use hatch plus label, not color alone.
- Pending approval is outlined/striped and labelled “Request”; it is not visually equivalent to Confirmed.
- Checked in, Ready, In treatment, Checkout, Completed, Cancelled, and No-show always have explicit text or an accessible abbreviated label. Color is secondary.
- The current-time line and selected card are independently distinguishable.

### Move, resize, and reschedule transaction

```text
Select appointment
      |
      +-- drag / keyboard move / Change time form
      |
      v
Preview destination + duration + buffers
      |
      v
Validate provider hours, time off, collision, cutoff, permissions
      |
      +-- invalid -> explain rule + offer eligible alternatives
      |
      v
Commit once -> update record -> queue patient notification -> audit event
      |
      `-- Undo (short recovery window; notification is cancelled if still queued)
```

- Dragging never sends a patient message mid-motion.
- Moving across the 12-hour cutoff or overriding a conflict requires permission and a reason.
- An ordinary collision is blocked. An authorized double-book, if ever introduced, is an explicit audited override, not a visual overlap accident.
- Keyboard users can select a card, invoke Move/Resize, enter date/time/duration/provider, review validation, and commit without reproducing pointer gestures.

### Navigation and search

- Today and previous/next stay fixed in the toolbar.
- Search accepts patient name, mandatory phone, optional email, request/reference number, and appointment type subject to role permissions.
- Results are chronological; choosing one restores date, provider group, scroll position, and appointment selection.
- “Find slot” takes appointment type/duration, provider or capability, date range, time of day, patient constraints, and recurring pattern. Results explain rule fit.
- Launch remains one location/one time zone. Display the practice zone beside the date; do not burden every appointment with a zone selector.

### Mobile and responsive behavior

- Mobile dashboard remains action-first.
- Mobile calendar defaults to Agenda, with a focused one-day view for a selected provider.
- Reception-grade multi-provider manipulation is not squeezed into a phone grid. Staff can approve, propose another slot, check in, change status, and use the time form; wide-screen grid drag remains an accelerator.
- Privacy-safe notifications show “Appointment update” and time/practice identity, not treatment, medicine, diagnosis, balance, or clinical note text.

## Accessibility acceptance direction

- Meet WCAG 2.2 AA and test at 200% zoom/reflow.
- Provide Agenda parity for every calendar state and action.
- Use landmarks for toolbar, filters, calendar/grid, and detail rail; selection must not reset focus or scroll unexpectedly.
- Grid keyboard: arrows move between time/provider cells, Home/End move within a row, Page Up/Down changes time range, Enter opens, and a documented shortcut opens Move/Resize.
- Announce appointment name, time/duration, provider, appointment type, status, and conflict/validation messages without relying on position or color.
- Use visible focus, non-color status cues, touch targets appropriate for coarse input, and reduced-motion behavior.
- Reminders and errors have visual and assistive-technology announcements; sound is never required.

## Healthcare/privacy adaptations

These are product recommendations, not compliance conclusions:

1. External/shared calendars may receive only a busy block unless a reviewed integration and authorization allow more. Notion’s documented “show as busy” blocking and Outlook’s private-item behavior demonstrate useful privacy patterns. ([Notion blocking](https://www.notion.com/help/blocking), [Outlook private calendar items](https://support.microsoft.com/en-US/Outlook/sharing-your-calendar))
2. Calendar cards and notifications contain the minimum operational information. Detailed treatment, prescriptions, clinician-only notes, and financial data remain behind the appointment workspace and role checks.
3. Search indexes only authorized operational fields. Clinical note bodies are excluded from global calendar search.
4. Every staff override, approval, reschedule, cancellation, no-show change, and patient-notification outcome records actor, timestamp, reason where required, and before/after values.
5. Do not send patient data to consumer calendars, conferencing metadata, widgets, lock screens, email subjects, or analytics by default.
6. Free/busy computation is separate from information disclosure: a slot can be unavailable without revealing why to a patient or unauthorized staff member.

## Concrete MVP decision

Build the two-page model.

- **Dashboard:** action queues and a short today preview.
- **Calendar:** provider-column Day by default; Provider focus, Week, Month-capacity, and Agenda alternatives; details in a persistent right rail.
- **Interaction signature:** select -> preview -> validate -> commit -> undo/audit.
- **Availability signature:** practice hours -> provider hours -> one-off time off/override -> appointment + buffer -> future resource constraint.
- **Accessibility signature:** every grid action has Agenda, keyboard, and form parity; status is never color-only.

This remains category-standard in learnability while becoming distinct through accountable approval, explainable availability, buffer-aware scheduling, reversible changes, and a visible request-to-care handoff.
