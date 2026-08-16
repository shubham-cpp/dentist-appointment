# ADR 001: Keep scheduling authority in the gateway

## Status

Accepted for the fictional phone demo.

## Decision

Terra interprets patient speech. It returns structured intent only.

The gateway owns these facts and actions:

- The patient and current appointment.
- The rolling 21-day clinic schedule.
- Eligible free times and provider rules.
- All caller-facing speech.
- The final slot recheck.
- The confirmed reschedule or cancellation.

The gateway handles clear yes, no, provider, and numbered choices without a model call. It sends other complete answers to Terra once.

## Reason

The model must not invent a free time or decide a calendar write. This split also gives short answers a fast path.

## Result

A model failure cannot create an appointment change. The gateway sends a generic staff follow-up instead.

A confirmed cancellation is a soft delete. The active appointment disappears, its time becomes free, and the audit record remains.
