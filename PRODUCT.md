# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Dentists** manage availability and appointments, review patient information and treatment plans, write prescriptions, and prepare billing documents.
- **Patients** schedule appointments and review their prescriptions, including which medicines to take and when.
- **Receptionists** support appointment coordination and day-to-day practice administration.
- **Administrators** manage the system and its operational configuration.

## Product Purpose

Build a dental-practice management web application that connects appointment scheduling, patient care, prescriptions, treatment planning, and billing in one workflow. Success means dentists can manage their working calendar and clinical administration effectively while patients can reliably schedule care and understand what they have been prescribed.

## Positioning

The intended direction is an integrated journey spanning appointment scheduling, treatment, prescriptions, and billing for both practice staff and patients. A meaningfully distinctive position is still an open decision: it should be established by studying leading dental appointment and practice-management products in the US, UK, and Canada, identifying workflow pain points, and validating which optimizations this product can uniquely deliver.

## Operating Context

- Dentists need a well-considered calendar for viewing appointments, setting available and unavailable periods, and rescheduling patients.
- Patients need to find suitable availability, schedule appointments, and stay informed when an appointment changes.
- Dentists write and share prescriptions through the application.
- Patients review prescribed medicines, dosage timing, and related instructions in the application.
- Practice staff maintain patient records and treatment plans.
- Billing includes invoice generation using a template branded for the dental practice.

## Capabilities and Constraints

- Appointment scheduling and rescheduling for dentists, patients, and practice staff.
- Dentist availability and unavailability management.
- Patient records and treatment plans.
- Prescription authoring and secure sharing with patients.
- Patient-facing medicine schedules and instructions.
- Medicine suggestions with autocomplete during prescription authoring.
- Billing and dental-practice-branded invoice generation.
- The initial target markets are the United States, United Kingdom, and Canada.
- The medicine data source, prescribing safeguards, calendar notification behavior, and exact permissions for each role are undecided.
- Privacy, health-data, prescription, invoicing, and record-retention requirements must be resolved for each target jurisdiction before production use.

## Brand Commitments

The product name and product-level brand are undecided. The system must support dental-practice branding on generated invoices; no logo or other binding brand assets are currently available.

## Evidence on Hand

- The repository contains an early Next.js web scaffold with no implemented product workflows yet.
- No validated competitive research, customer interviews, testimonials, benchmarks, clinical datasets, medicine database, or final invoice template are currently on hand. Future work must not fabricate these.

## Product Principles

1. Treat the calendar as the operational center of the dental practice, not as a generic date picker.
2. Keep dentists, patients, receptionists, and administrators aligned around the same appointment and care journey while respecting role boundaries.
3. Make prescriptions and medicine instructions clear, timely, and difficult to misunderstand.
4. Reduce administrative friction across scheduling, clinical records, treatment planning, and billing without compromising safety or privacy.
5. Base differentiation on researched workflow pain points in the target markets rather than unverified feature claims.

## Accessibility & Inclusion

Accessibility is a product requirement. The exact conformance standard and any product-specific accommodation needs remain undecided and should be confirmed before implementation criteria are finalized.
