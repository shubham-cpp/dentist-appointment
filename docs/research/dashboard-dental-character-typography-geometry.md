# Dental character without decoration: typography and exception geometry for Brightview

**Prepared:** 1 August 2026  
**Research question:** Can Brightview feel unmistakably dental through typography and exception geometry without adding decoration?  
**Scope:** Clinical identity, dental scheduling, public-service and transport typography, incident response, logistics and commerce operations, financial operations, and industrial product UI

## Method and limits

This review uses current primary sources: official brand and design systems, first-party product manuals, standards, and font projects. It deliberately looks beyond dental competitors to operational products where people must scan, prioritise, assign, and act under time pressure.

- **Documented** means a source explicitly describes the behaviour or design rule.
- **Brightview inference** means a design recommendation derived from several documented patterns.
- Public product documentation shows that a mature system implements a pattern; it does not prove that the pattern improves clinical outcomes.
- Font legibility depends on rendering, language, size, display, and users. A typeface described as accessible still requires testing in Brightview's actual rows, devices, and zoom settings.

## Executive conclusion

Yes. Brightview can feel specifically dental without tooth illustrations, gradients, or ornamental clinic imagery. The strongest visual identity is a repeated operational grammar:

1. **A recognisable, open sans-serif used consistently.** NHS England says Frutiger was chosen for clarity at distance and small sizes and became recognisable through consistent use; it also notes that widely available Arial is workable but has less character and fewer NHS associations. This is direct evidence that type can become clinical identity through disciplined repetition rather than decoration. ([NHS font guidance](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/))
2. **Dental objects determine the geometry.** Open Dental structures scheduling around operatories, providers, appointment time, procedure information, confirmation state, overdue recall and insurance-verification signals. Its configurable appointment views let practices decide which facts occupy the main body and corners of an appointment block. ([Open Dental appointment-view configuration](https://www.opendental.com/manual/appointmentvieweditwindow.html))
3. **Urgency, state, and type stay separate.** PagerDuty separates incident priority, notification urgency, and alert severity, and asks teams to define objective meaning and expected response for a small number of priority levels. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority), [PagerDuty incident concepts](https://support.pagerduty.com/main/docs/incidents))
4. **Different workflows expose different decision facts.** Shopify uses separate order, payment, fulfilment, delivery, return, and fraud-risk filters rather than collapsing the entire order into one status. ([Shopify order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders)) Stripe puts a dispute's reason, response deadline, consequence, evidence workflow, and final state around the decision. ([Stripe dispute response](https://docs.stripe.com/disputes/responding))
5. **Density comes from a controlled type and row system, not tiny text.** Carbon's productive system uses a 14px base for task-focused products and defines 12px as label/helper text rather than body copy; its table supports explicit row sizes, sorting, expansion, visible row actions, search, filters, and batch actions. ([Carbon productive type set](https://carbondesignsystem.com/elements/typography/type-sets/), [Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))

The proposed visual world is therefore **human-clinical, operational, and schedule-native**: a high-legibility sans, tabular time and amounts, restrained rectangular status shapes, and exception rows whose anatomy depicts the work itself.

## What mature systems teach us

| Vertical and source | Documented product behaviour | Transfer to Brightview |
|---|---|---|
| **Clinical identity — NHS England** | Frutiger is used as a clear, readable, recognisable clinical typeface; bold, roman, and light create hierarchy with a modest number of weights. The guidance explicitly says Arial is practical but lacks the same character and association. ([font guidance](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/)) | Character can come from one disciplined family, a small number of weights, and repeated hierarchy. Do not add a novelty display face to compensate for weak information design. |
| **Dental scheduling — Open Dental** | Appointment views select operatories, providers, patient/appointment fields, time range, row height, and which facts occupy the main list or corners. Available signals include procedures, provider, time asked to arrive, overdue recall, overdue prophy/perio, and unverified insurance. ([appointment-view configuration](https://www.opendental.com/manual/appointmentvieweditwindow.html)) | Use provider, operatory, procedure, time, recall and verification as the visual vocabulary. A conflict should look like two allocations colliding; a recall should expose a due interval; finance should align amounts like a ledger. |
| **Dental workflow — Open Dental** | The appointment module shows open/closed schedule areas, provider time bars, a moving current-time line, appointment completion changes, crossed-out broken appointments, waiting-room state, confirmation state, and provider/operatory context. ([appointments module](https://www.opendental.com/manual/appointments.html)) | Borrow schedule grammar—lanes, time anchors, current-time position, completion state—not dental clip art. Preserve text alongside any line, color, or crossing treatment. |
| **Dental work queues — Open Dental** | Recall, confirmation, planned-appointment, unscheduled, ASAP, and radiology-approval work are separate lists with distinct purposes. The unscheduled list is intentionally short; the planned tracker is long and regularly reviewed. ([appointment lists](https://www.opendental.com/manual/appointmentlists.html)) | One universal row should not erase workflow differences. Keep a common queue shell but give each exception type a purpose-specific decision block. |
| **Incident response — PagerDuty** | Priority determines order of response, urgency determines notification behaviour, and severity describes impact. PagerDuty recommends objective definitions, expected response, and no more levels than teams can use reliably; incidents can be upgraded or downgraded. ([incident priority](https://support.pagerduty.com/main/docs/incident-priority), [incident concepts](https://support.pagerduty.com/main/docs/incidents)) | Show `urgency`, `state`, and `exception type` as separate fields. A red “schedule conflict” type label confuses category with consequence; instead classify its current operational urgency. |
| **Logistics and commerce — Shopify** | Orders carry several orthogonal statuses and can be filtered using combinations such as risk plus payment state. Saved views and bulk actions support repeated operational work. ([order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders)) | Let staff view “Today + unowned,” “Clinical + overdue,” or “Finance + due” without inventing a single ambiguous super-status. Keep type and state tokens composable. |
| **Financial operations — Stripe** | Disputes surface a deadline, reason category, consequence of no response, relevant evidence, and a guided accept-or-challenge action. Stripe also makes submission finality explicit. ([dispute response](https://docs.stripe.com/disputes/responding)) | Financial follow-up should show amount, age, last contact, next due action, and consequence. It should not borrow the same geometry or alarm color as a care-delivery conflict. |
| **Industrial product UI — IBM Carbon** | Carbon separates productive from expressive type, using fixed, denser product styles to preserve task hierarchy. Its table pattern supports expansion for supplementary detail, row hover for cross-column scanning, sortable columns, persistent touch actions, and batch actions. ([type sets](https://carbondesignsystem.com/elements/typography/type-sets/), [data-table usage](https://carbondesignsystem.com/components/data-table/usage/)) | Use a fixed operational scale, one coherent queue surface, and progressive disclosure. On touch, persist the action; do not hide it behind hover. |
| **Public service / transport — GOV.UK** | GDS Transport descends from road-sign lettering designed for clarity at speed; GOV.UK says consistent use improves recognition and readability. Its current scale uses 16px as the small body point and supports tabular numbers for comparison and stable counters. ([GOV.UK typography](https://brand.design-system.service.gov.uk/typography/), [type scale](https://design-system.service.gov.uk/styles/type-scale/), [tabular-number guidance](https://design-system.service.gov.uk/styles/font-override-classes/)) | Treat reception scanning like wayfinding: stable alignments, few size steps, clear words, and tabular times. Distinctiveness should survive monochrome and peripheral vision. |
| **Public-service status — GOV.UK** | Tags indicate status only, use adjectives rather than actions, and are deliberately styled so users do not mistake them for buttons. GOV.UK removed uppercase tag text after research found it harder to read for longer labels. ([GOV.UK tag](https://design-system.service.gov.uk/components/tag/)) | Keep state lozenges short, sentence case, and non-interactive. Put the real action in a clearly separate button or link. |
| **Accessibility standard — W3C** | WCAG 2.2 requires meaning conveyed by color to have another cue such as text or shape, and its AA target-size criterion requires a 24×24 CSS-pixel target or sufficient spacing; W3C's enhanced guidance recommends 44×44 for easier operation. ([use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color), [minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)) | Every severity treatment needs a word and structural cue, not color alone. Make primary row actions 44px high on touch layouts and at least 24px with safe spacing on desktop. |

## Typeface decision

### Humanist versus grotesk/system sans

This is a design assessment informed by the sources, not a universal legibility ranking:

- A **neutral grotesk or system stack** is efficient and familiar, but at Brightview's current tiny sizes and uniform weights it produces the interchangeable admin texture the critique identified. Replacing Inter with another neutral sans while retaining 8–11px operational text will not solve the hierarchy.
- A **humanist-leaning or deliberately differentiated sans** better supports Brightview's desired clinical warmth because variation in letter shapes and rhythm can remain recognisable without visual ornament. The NHS's long-running Frutiger system demonstrates this identity mechanism in healthcare. ([NHS font guidance](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/))
- The family matters less than the system: larger operational text, a disciplined scale, restrained weights, tabular numerals, and semantic row structure do most of the work. Carbon and GOV.UK both codify typography as a limited system rather than ad hoc component values. ([Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/), [GOV.UK type scale](https://design-system.service.gov.uk/styles/type-scale/))

### Recommended candidates

| Candidate | Licensing and first-party evidence | Character and trade-off | Recommendation |
|---|---|---|---|
| **Atkinson Hyperlegible Next** | Braille Institute says the 2025 release is free to download and use, includes seven weights plus variable and monospace versions, supports more than 150 languages, and was designed to improve legibility for readers with low vision. ([Braille Institute announcement](https://www.brailleinstitute.org/about-us/news/braille-institute-launches-enhanced-atkinson-hyperlegible-font-to-make-reading-easier/)) | The differentiated glyphs give Brightview a more ownable, humane texture than Inter. Its accessibility origin is congruent with healthcare, but it must be tested for width and density in the existing table. | **Preferred prototype.** Use the variable roman, weights 400/500/600/700. Do not use the mono companion as a decorative accent. |
| **Source Sans 3** | Adobe's official repository says it was designed for UI environments and ships WOFF/WOFF2 and variable files under the OFL-1.1 license. ([Adobe source repository](https://github.com/adobe-fonts/source-sans)) | Calm, open, and less conspicuously stylised. It is the safest clinical-operational choice, though it will need stronger geometry to feel unmistakably Brightview. | **Conservative production choice** if Atkinson is too wide or characterful in testing. Use 400/600/700. |
| **IBM Plex Sans** | IBM describes Plex as a distinctive corporate family designed to work in UI environments, with Sans, Serif, Mono, and Condensed variants, broad script support, and an Open Font License. ([IBM Plex repository](https://github.com/IBM/plex)) | Excellent numerals and a precise technical voice. Its industrial character may make the product feel more like infrastructure software than patient care. | **Alternative direction** for a more technical-precise Brightview, not the default human-clinical direction. |

Recommended CSS fallback after the chosen webfont:

```css
font-family: "Atkinson Hyperlegible Next", ui-sans-serif, system-ui,
  -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
```

Self-host WOFF2 files and retain the font's license text in the repository. This is an implementation recommendation, not legal advice.

## Brightview typography specification

The following is a Brightview proposal. It uses Carbon's 14px productive base as the density reference while keeping 12px strictly for labels/helper text; GOV.UK's use of stable scale steps and tabular numerals informs the rhythm. ([Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/), [GOV.UK tabular-number guidance](https://design-system.service.gov.uk/styles/font-override-classes/))

| Token | Size / line height | Weight | Use |
|---|---:|---:|---|
| `display-day` | 28 / 32px | 600 | Date or operational day title; one per page |
| `title-page` | 24 / 30px | 650 | Dashboard title if the date is not the title |
| `title-section` | 18 / 24px | 650 | Needs attention, Arriving next, Follow-ups |
| `metric` | 22 / 28px | 650 | Daily counts; use tabular numerals |
| `row-primary` | 15 / 20px | 600 | Patient name or exception synopsis |
| `body` | 14 / 20px | 400 | Issue statement and short instructions |
| `metadata` | 13 / 18px | 500 | Provider, operatory, procedure, ownership, last contact |
| `label` | 12 / 16px | 650 | Column labels and short state tags only; sentence case |
| `time-amount` | 14 / 20px | 600 | Time, duration, amount, age; `font-variant-numeric: tabular-nums` |

Implementation rules:

- Remove 8–11px operational text. No patient, issue, provider, appointment, or due-date fact should be set below 13px; reserve 12px for short labels.
- Use no more than four visible weights and do not rely on `font-weight: 700` everywhere. GOV.UK specifically warns that excessive bold makes it difficult to know what needs attention. ([GOV.UK font overrides](https://design-system.service.gov.uk/styles/font-override-classes/))
- Keep state labels sentence case. GOV.UK moved away from uppercase tags because longer uppercase text was harder to read in its research. ([GOV.UK tag](https://design-system.service.gov.uk/components/tag/))
- Apply tabular numerals to times, durations, queue counts, money, and due age so values align and updating counters do not visually shift. ([GOV.UK font overrides](https://design-system.service.gov.uk/styles/font-override-classes/))
- Use a maximum of roughly 60–70 characters for issue summaries before moving supporting detail to expansion; Carbon recommends expandable rows for supplementary information rather than cramming complex content into the base table. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))

## Exception geometry: one queue, four meaningful anatomies

### Shared shell

Every exception uses the same outer grid so scanning stays predictable:

```text
4px urgency rail | type + state | patient and decision facts | due/owner | action
```

- **Desktop:** 64px default row; 80–96px only when the decision genuinely needs two lines or a comparison. A full-row hover treatment helps users track fields across the row, as Carbon recommends. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))
- **Mobile:** convert the row to a card-like list item, not a clipped table. Order facts as `urgency/type → patient/issue → decision tuple → due/owner → action`; keep the primary action at least 44px high, following W3C's enhanced target-size guidance. ([W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced))
- **Urgency rail:** `Act now` uses a solid 4px rail, `Today` a 2px rail, `Routine` a 1px neutral rule. The words remain present, so color and thickness reinforce rather than carry meaning alone. ([W3C use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color))
- **State:** a compact, pale, sentence-case label such as `Unassigned`, `Waiting on patient`, or `Blocked`. It is not clickable; GOV.UK advises keeping status tags distinct from actions. ([GOV.UK tag](https://design-system.service.gov.uk/components/tag/))
- **Action:** one visible verb tied to the row's next step; secondary actions move into expansion or an overflow. Carbon recommends keeping fewer than three row actions inline and preserving actions on touch devices. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))

### 1. Booking request — decision row

```text
Routine | Booking request · Awaiting decision
Priya Shah — Hygiene visit
Requested Tue 2:30 PM · Dana Lee, RDH · Op 3
Received 22 min ago · Unassigned                         [Review request]
```

**Geometry:** a single schedule tuple (`requested time → provider → operatory`) sits on one line. The row remains 72px and has a neutral rail because it represents one proposed allocation, not a collision. The row action is a verb, while `Awaiting decision` is a non-interactive state.

**Why this is dental:** appointment views in Open Dental are explicitly organised by provider, operatory, time, and appointment fields. ([Open Dental appointment views](https://www.opendental.com/manual/appointmentvieweditwindow.html))

### 2. Schedule conflict — collision block

```text
Act now | Schedule conflict · Unassigned
10:30–11:15  Priya Shah · Crown seat · Dr Patel · Op 2
10:45–11:30  Omar Reed · Exam       · Dr Patel · Op 2
Same provider and operatory overlap by 30 min              [Resolve clash]
```

**Geometry:** the exception expands to two aligned schedule lines connected by one conflict bracket or overlap mark. Time, provider, and operatory occupy fixed columns so the collision is visible before reading the prose. This is functional diagramming: the shape represents two allocations competing for the same clinical resource.

**Why this is dental:** Open Dental uses operatories, provider schedules, appointment boxes, and time bars as the schedule's core visual grammar. ([Open Dental appointments module](https://www.opendental.com/manual/appointments.html)) PagerDuty's separation of impact and priority supports labelling the collision type independently from its current `Act now` urgency. ([PagerDuty incident concepts](https://support.pagerduty.com/main/docs/incidents))

### 3. Overdue clinical work — due strip

```text
Today | Clinical follow-up · 3 days overdue
Leila Morgan — Review radiograph report
Due 29 Jul · Dr Chen · Clinical owner
Patient contact waiting                                      [Open task]
```

**Geometry:** a right-aligned due-age block anchors the row; the clinical task and accountable clinician remain more prominent than the generic state. A filled past-due segment may grow from `due` toward `today`, but the explicit due date and words `3 days overdue` remain present.

**Why this is dental:** Open Dental exposes overdue prophy/perio and recall indicators in appointment views and maintains purpose-specific recall and radiology-approval lists. ([appointment-view fields](https://www.opendental.com/manual/appointmentvieweditwindow.html), [appointment lists](https://www.opendental.com/manual/appointmentlists.html))

### 4. Invoice follow-up — ledger row

```text
Routine | Invoice follow-up · Contact due
Marco Diaz                                              $286.00
Invoice INV-1048 · 18 days open · Last contact 25 Jul
Owner Maya                                                [Log outcome]
```

**Geometry:** amount and age align on a numeric edge using tabular numerals. Last contact and next action replace schedule-lane geometry. The row does not use clinical-warning red merely because money is overdue.

**Why this works:** Stripe's dispute workflow places amount-related consequence, deadline, reason, evidence and next action around the financial decision; Shopify similarly keeps payment state separate from fulfilment and risk. ([Stripe dispute response](https://docs.stripe.com/disputes/responding), [Shopify order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders))

## Status, type, and urgency model

Do not let one pill answer three different questions.

| Dimension | Question | Brightview examples | Visual treatment |
|---|---|---|---|
| **Exception type** | What kind of work is this? | Booking request, schedule conflict, clinical follow-up, invoice follow-up | Plain text plus one restrained 16px icon; no filled pill |
| **Urgency** | When must we respond? | Act now, Today, Routine | Rail thickness + short text + restrained semantic color |
| **Lifecycle state** | Where is it in the workflow? | Unassigned, In progress, Waiting on patient, Blocked | Pale rectangular tag, sentence case, non-interactive |
| **Ownership** | Who is accountable? | Maya, Dr Chen, Unassigned | Avatar/initial optional; always show the name or word |
| **Deadline / age** | Why now? | Starts in 42 min, Due 4 PM, 3 days overdue, 18 days open | Tabular numeral block aligned to a stable edge |

PagerDuty's documented distinction between severity, priority, and notification urgency is the direct analogue for separating these dimensions. ([PagerDuty incident concepts](https://support.pagerduty.com/main/docs/incidents)) Shopify's independent order-state dimensions show how filtering remains useful when lifecycle fields stay orthogonal. ([Shopify order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders))

## Iconography and surface rules

- Use icons as **redundant recognition**, never as the only label. W3C requires another cue when color carries meaning; the same resilience principle should apply to compact iconography. ([W3C use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color))
- Reserve a tooth diagram or tooth-number glyph for genuinely tooth-specific clinical information. Do not use a tooth icon as the generic symbol for every patient, appointment, or clinical task.
- Prefer domain objects: calendar/clock for time, two-lane clash for collision, clipboard/check for clinical work, ledger/receipt for finance, person/provider, and room/operatory.
- Use one 16px outline family at a consistent stroke weight. Do not mix filled emoji-like icons with thin outline controls.
- Keep the dashboard as one continuous operational surface with rule-separated items. Excessive floating cards and pills fragment scanning and make every fact look equally important; Carbon's table model instead uses consistent rows, headers, hover, expansion, and a toolbar. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))

## Transferable patterns

1. **Turn domain nouns into layout.** Provider, operatory, procedure, time, due interval and balance are not labels to sprinkle into a generic card; they determine columns, alignment, and row height. Open Dental's configurable views are the clearest dental precedent. ([appointment-view configuration](https://www.opendental.com/manual/appointmentvieweditwindow.html))
2. **Make the exception explain itself.** PagerDuty attaches objective meaning and expected response to priority; Stripe attaches deadline, consequence and evidence to a dispute. Brightview should answer `what changed`, `why now`, `who owns it`, and `what happens next` in the collapsed row. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority), [Stripe dispute response](https://docs.stripe.com/disputes/responding))
3. **Use density variants intentionally.** A routine single-decision row can be short; a collision that compares two allocations must be tall enough to show both. Carbon provides multiple row sizes and expansion rather than compressing every case into one height. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/))
4. **Make filters composable.** Shopify's separate payment, fulfilment, delivery, return and risk statuses support useful compound views. Brightview should likewise combine urgency, type, owner, provider, clinic and due state. ([Shopify order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders))
5. **Let typography become memory.** NHS and GOV.UK both use consistent type as identity and wayfinding. Brightview needs one repeated typographic rhythm across dashboard, calendar, patient and clinical surfaces—not a special dashboard font treatment. ([NHS font guidance](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/), [GOV.UK typography](https://brand.design-system.service.gov.uk/typography/))

## Anti-patterns

- **Pill soup:** type, urgency, state, owner and due age all rendered as equally rounded badges. It destroys hierarchy and makes statuses resemble actions; GOV.UK explicitly separates status tags from interactive controls. ([GOV.UK tag](https://design-system.service.gov.uk/components/tag/))
- **Color as taxonomy:** red for all conflicts, amber for all clinical tasks, blue for all requests, regardless of consequence. This conflates type with urgency and fails when color is unavailable. ([W3C use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color))
- **Dental decoration as identity:** tooth silhouettes, smile photography, enamel gradients, or mint-blue waves applied to operational rows. These do not communicate provider, operatory, procedure, deadline, or ownership.
- **A second “personality” font:** pairing a display serif or rounded novelty sans with microscopic body text. NHS demonstrates that a modest set of weights within one recognisable family can carry hierarchy. ([NHS font guidance](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/))
- **One generic row for every exception:** forcing a resource collision, clinical task, approval decision, and financial follow-up into identical columns. Open Dental and Shopify both retain purpose-specific dimensions and views. ([Open Dental appointment lists](https://www.opendental.com/manual/appointmentlists.html), [Shopify order filters](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders))
- **Hidden mobile facts and hover-only actions:** Carbon says touch layouts should persist row actions even when hover-dependent overflow is enabled elsewhere; W3C requires usable target size or spacing. ([Carbon data-table usage](https://carbondesignsystem.com/components/data-table/usage/), [W3C minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum))
- **Urgency without criteria:** a loud `Urgent` label that does not state the approaching appointment, overdue duration, patient impact, or response deadline. PagerDuty recommends objective definitions and expected response for every priority level. ([PagerDuty incident priority](https://support.pagerduty.com/main/docs/incident-priority))

## Recommended design decision

Prototype the dashboard with **Atkinson Hyperlegible Next** and the scale above, then compare it against **Source Sans 3** using the exact same geometry and data. Test at 1280px desktop, 390px mobile, 200% zoom, and with long patient/provider names. The visual direction should be accepted only if:

1. patient, issue, time/due, owner, and action remain visible at every target width;
2. users can identify the schedule conflict before reading its type label;
3. a grayscale screenshot still preserves urgency order and exception type;
4. booking, clinical, and finance rows feel related but not interchangeable;
5. no operational content falls below the proposed 13px floor; and
6. every touch action is at least 44px high.

The typeface change will remove the generic Inter texture. The exception geometry is what will make the result unmistakably Brightview: provider lanes, operatory conflicts, procedure and recall context, due-age structure, and ledger-aligned finance facts—expressed as information, not decoration.

## Primary-source index

1. [NHS England — Fonts](https://www.england.nhs.uk/nhsidentity/identity-guidelines/fonts/)
2. [Open Dental — Appointment View Edit](https://www.opendental.com/manual/appointmentvieweditwindow.html)
3. [Open Dental — Appointments Module](https://www.opendental.com/manual/appointments.html)
4. [Open Dental — Appointment Lists](https://www.opendental.com/manual/appointmentlists.html)
5. [PagerDuty — Incident Priority](https://support.pagerduty.com/main/docs/incident-priority)
6. [PagerDuty — Incidents](https://support.pagerduty.com/main/docs/incidents)
7. [Shopify — Filtering Orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders)
8. [Stripe — Respond to Disputes](https://docs.stripe.com/disputes/responding)
9. [IBM Carbon — Type Sets](https://carbondesignsystem.com/elements/typography/type-sets/)
10. [IBM Carbon — Data Table Usage](https://carbondesignsystem.com/components/data-table/usage/)
11. [GOV.UK — Typography, Type Scale, Font Overrides, and Tag](https://brand.design-system.service.gov.uk/typography/)
12. [W3C — WCAG 2.2 Understanding Documents](https://www.w3.org/WAI/WCAG22/Understanding/)

Font candidates are additionally sourced from [Braille Institute](https://www.brailleinstitute.org/about-us/news/braille-institute-launches-enhanced-atkinson-hyperlegible-font-to-make-reading-easier/), [Adobe's Source Sans repository](https://github.com/adobe-fonts/source-sans), and [IBM's Plex repository](https://github.com/IBM/plex).
