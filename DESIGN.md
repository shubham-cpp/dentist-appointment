---
name: Dentist Management System
description: Exception-first scheduling for a live dental practice day.
colors:
  nav: "#0d2850"
  nav-deep: "#081d3c"
  primary: "#1268e8"
  primary-hover: "#0d56c5"
  canvas: "#f3f6f9"
  surface: "#ffffff"
  surface-subtle: "#f8fafc"
  text: "#152238"
  calendar-text: "#17243a"
  muted: "#5f6f82"
  muted-strong: "#53667d"
  quiet: "#617286"
  border: "#dce3ea"
  border-strong: "#c9d3de"
  teal: "#0b8f86"
  teal-soft: "#e1f5f2"
  lavender: "#715dc4"
  lavender-soft: "#eeeafd"
  blue-soft: "#e5effe"
  green: "#27856f"
  success: "#198469"
  green-soft: "#e4f3ee"
  amber: "#a76504"
  amber-soft: "#fff2d7"
  danger: "#b33838"
  danger-soft: "#fce8e8"
  focus: "#83b4fa"
typography:
  metadata:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.25
  label:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  cardTitle:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  sectionTitle:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
  pageTitle:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  metric:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  control: "0.5rem"
  md: "0.5rem"
  overlay: "0.625rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "1rem"
---

# Design System: Dentist Management System

## Overview

**Creative North Star: "Exception Radar"**

This is a compact, interruption-tolerant operations workspace for dentists and receptionists. Unresolved requests, conflicts, arrivals, and incomplete work lead; routine schedule detail stays present but visually quiet. The interface must make the next safe action obvious without hiding the live practice day.

The interaction thesis is **fast scan, deliberate commit**. Material schedule changes always follow **Select -> Preview -> Validate -> Commit -> Notify -> Undo/Audit**. Selection preserves date, provider, and scroll context; previews show consequences before mutation; undo creates a compensating audit event rather than erasing history.

**Key Characteristics:** exception-first hierarchy; dense but calm work surfaces; persistent context; explicit status language; conservative commit behavior; keyboard and Agenda parity.

## Colors

Deep navy anchors navigation, azure identifies primary action, teal confirms safe completion, and muted lavender groups provider-related information. Amber is reserved for warnings and danger red for destructive or failed states; pale neutrals carry most content.

**The Quiet Contrast Rule.** Muted and quiet text may be visually subordinate only when it retains WCAG 2.2 AA contrast on its actual surface; never lower opacity to manufacture hierarchy.

**The Meaning Beyond Color Rule.** Every status pairs color with a label and, where useful, an icon, border treatment, shape, or pattern. Color never carries eligibility, conflict, cancellation, or confirmation alone.

## Typography

Use Atkinson Hyperlegible Next throughout. It has open and distinguishable letterforms at operational sizes. Keep the root at 100% for browser text settings.

Use a role scale. Metadata is 0.75rem. Labels are 0.875rem. Body text is 1rem. Card, section, and page titles use 1.125rem, 1.25rem, and 1.5rem. Use 400, 500, 600, and 700 weights only.

Patient details, actions, inputs, and form labels must not fall below 0.875rem. Reserve 0.75rem for secondary metadata. Use tabular figures for times and aligned counts.

Keep labels direct and sentence-cased. Use tabular numerals for times and aligned counts. Avoid decorative fonts, oversized metrics, and long all-caps strings.

## Layout

Use a 0.25rem base rhythm. Dense controls use 0.5rem to 1rem internal spacing. Major regions use 1.5rem or more. Corners stay modest. Borders and tonal surfaces separate content more often than whitespace or shadow.

Desktop follows a four-zone topology: stable deep-navy navigation rail, primary workspace, calendar/request context, and persistent detail/action rail. Dashboard leads with a semantic needs-attention queue plus a compact day preview, never a generic KPI-card grid. Calendar uses provider columns, current-time context, appointment blocks, buffers, availability, and time off; 4-6 providers should scan comfortably, with saved groups, paging, or provider focus beyond that.

At narrow widths, replace spatial manipulation with a chronological **Agenda**. Preserve date/provider filters, selection, approval, reschedule, cancellation, validation, notification, undo, and audit parity. Drawers and stacked sections may replace rails, but actions and context must not disappear.

## Elevation & Depth

The system is flat by default. Canvas, white surfaces, subtle tonal fills, and thin rules create hierarchy. Reserve shadow for transient overlays or focus-adjacent elevation; never use decorative floating-card stacks.

## Shapes

Use gently curved small and medium radii consistently. Appointment blocks, inputs, buttons, and containers should feel precise rather than pill-like. Stronger borders identify selection or conflict; dashed or patterned treatments may reinforce provisional blocks and buffers.

## Components

### Navigation and shell

Keep Dashboard and Calendar adjacent and stable. Active destinations require text plus a persistent visual marker. Authored icons support labels but do not replace them.

### Exception queue and schedule

Dashboard exceptions use semantic rows with issue, patient/context, time sensitivity, and next action. Calendar cards reveal only patient name, appointment type, time, and explicit status; protected clinical notes, prescriptions, and balances stay outside event records.

### Request and detail rails

Selecting a pending request previews its proposed block and buffers inside the provider grid. The persistent rail exposes Approve, Propose time, Contact, and Decline while retaining date/provider/scroll context.

### Validation and commit

Validation is date-aware: confirm provider eligibility, practice time zone, appointment duration, buffers, existing visits, exclusive holds, and time off for the selected date. Intentional overlap is never a normal action. Show conflicts inline and move focus to a useful summary before allowing commit.

Cancellation and staff override flows require an explicit reason, affected appointment summary, notification choice/status, and final confirmation. After commit, announce the result in a live region, offer bounded undo, and preserve both the original and compensating events in the audit trail.

## Do's and Don'ts

### Do:

- **Do** optimize for dentists and receptionists scanning under interruption.
- **Do** retain provider, date, time, buffer, and time-off context through every action.
- **Do** provide visible focus, complete keyboard paths, reduced-motion behavior, semantic controls, and WCAG 2.2 AA contrast.
- **Do** reuse the shell, semantic queues, schedule blocks, rails, validation summary, action bar, status badge, live region, and Agenda row patterns.

### Don't:

- **Don't** add AI auto-booking, routine overlap, room allocation, or month-grid manipulation.
- **Don't** expose clinical note bodies, prescriptions, or balances in calendar events.
- **Don't** remove actions on mobile, use color-only statuses, silently mutate schedules, or erase audit history on undo.
- **Don't** invent decorative dashboard metrics, ornamental charts, or synthetic footer content.
