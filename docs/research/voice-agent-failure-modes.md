# Voice-agent appointment rescheduling: failure modes and controls

**Research checked:** 9 August 2026  
**Scope:** An outbound agent moves appointments after a clinician becomes unavailable.

## Bottom line

The agent must not own the calendar state. It may request actions from a constrained scheduling service.

Treat telephony and model events as delayed, duplicated, and sometimes incorrect. A spoken agreement is not a booking.

Only an atomic server-side booking transaction can change an appointment. The transaction must check every resource again.

## Non-negotiable rules

1. Give the agent a case token, not database credentials or a general calendar API.
2. Return only current slots from the scheduling service.
3. Create a short, one-use hold after the patient selects a slot.
4. Commit with the case, hold, appointment, and campaign versions locked.
5. Make every write idempotent with a client command ID.
6. Stop all automation when staff, the patient, or the clinician changes the case.
7. Do not reveal appointment details before the contact passes the practice verification policy.
8. Send uncertain, sensitive, or failed conversations to staff.

PostgreSQL exclusion constraints can prevent time-range overlap. Serializable work can fail, so the application must retry the whole transaction. [PostgreSQL range constraints](https://www.postgresql.org/docs/current/rangetypes.html) and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

## Failure modes

| Failure | Required control | Detection and recovery |
|---|---|---|
| Two people select one slot. | Search returns a `quoteVersion`. `hold_slot` creates one short hold. `commit` rechecks all resources in one transaction. | Return a neutral failure. Offer fresh slots or staff help. Never claim success before the commit. |
| A slot becomes stale during speech. | Give each quote a short expiry. Check the hold, appointment version, campaign status, and constraints at commit. | Expire holds automatically. Count expired holds and failed commits. |
| A retry creates two bookings. | Store one immutable command record per case, tool, and idempotency key. Return the prior result on a repeat. | Reconcile every duplicate key. Alert on more than one active allocation. |
| Staff cancels the campaign while a call waits or speaks. | Check an active campaign version before dialing, tool calls, transfer, and commit. Revoke case-tool access immediately. | Suppress queued work. End or redirect an active call to a neutral closing message. Twilio can cancel a ringing call and end an active call. [Call resource](https://www.twilio.com/docs/voice/api/call-resource) |
| The clinician becomes available again. | Treat it as a versioned calendar change. Stop affected cases and release unconsumed holds. | Reconcile all active cases. Staff reviews any booking committed after the change began. |
| The patient books online or staff moves the appointment. | Both paths must update the same case and appointment version. | The next agent action sees a stale version and stops. Do not dial again. |
| The carrier queues a call after a plan change. | Create the call attempt before the provider request. Check case validity again just before the provider request. | Do not create availability quotes before connection. Twilio queues calls above the account calls-per-second limit. [Call resource](https://www.twilio.com/docs/voice/api/call-resource) |
| The call-create request times out. | Mark the result `send_unknown`. Do not automatically create another call. | Reconcile the provider call ID and callbacks first. Retry only under the attempt policy. |
| A voicemail, IVR, fax, or wrong person answers. | Start with a generic practice identity and reason. Verify the allowed contact before dates, provider, treatment, or absence details. | A completed call only proves audio connection. It can be a person, IVR, or voicemail. [Call resource](https://www.twilio.com/docs/voice/api/call-resource) |
| Machine detection is wrong or slow. | Treat `human`, `machine`, and `unknown` as routing hints. Use a generic voicemail script or no message. | Tune only with reviewed recordings or labelled samples. AMD has speed, accuracy, international-route, and media-stream-limit trade-offs. Async AMD uses one shared audio fork. [AMD guide](https://www.twilio.com/docs/voice/answering-machine-detection) |
| A webhook is late, duplicated, spoofed, or out of order. | Verify the signature before parsing. Store the raw event under `(CallSid, SequenceNumber)`. Use monotonic state transitions. | Return `2xx` only after durable storage. Process booking work outside the retryable callback. Twilio callbacks can arrive out of order and retries carry an idempotency token. [Call callbacks](https://www.twilio.com/docs/voice/api/call-resource), [retry controls](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides), and [webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) |
| The patient interrupts while the agent reads a date. | On speech start, cancel model output, truncate the model item to heard audio, and clear unsent carrier audio. Mark which audio the caller actually heard. | Ask again from the last confirmed point. Twilio supports `clear` and `mark` for buffered media. OpenAI Realtime supports VAD response interruption. [Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages) and [Realtime API](https://developers.openai.com/api/reference/resources/realtime) |
| Noise, weak mobile coverage, accent, or language causes a wrong date. | Offer an explicit supported-language choice. Use short date phrases. Repeat the complete local date and time for confirmation. | On low confidence, repeated repair, or conflicting replies, transfer to staff. Track failures by language and route. |
| A proxy, guardian, parent, caregiver, or minor answers. | Model this as a policy state. Use an approved-contact record and a staff path. Do not ask the agent to decide authority. | Give no appointment details when authority is unknown. In the US, verify an unknown personal representative's identity and authority under the provider policy. [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/faq/551/how-would-a-covered-entity-know-if-someone-were-a-personal-representative/index.html) |
| The model invents a slot, policy, or explanation. | Require tools for every fact and calendar action. Give no clinical notes or absence reason. Use a state machine outside the prompt. | Tool-schema errors, unsupported requests, complaints, distress, and medical questions become staff handoffs. |
| A transfer fails or leaves the caller silent. | Create a handoff record before transfer. Keep the original case locked and pass minimal context, parent call ID, and child call ID. | Confirm staff answer and bridge completion. If either fails, return to a safe callback or end politely. [Twilio `<Dial>`](https://www.twilio.com/docs/voice/twiml/dial) |
| Recording or transcript data leaks. | Default to no recording. Keep only necessary scheduling data in the agent context and logs. Separate operational logs from clinical records. | Apply a reviewed retention, access, deletion, and breach process. In the US, voicemail content should be limited to the needed information. [HHS voicemail guidance](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html) |
| The caller opts out, complains, or reports urgent symptoms. | Make opt-out immediate and global. Do not provide clinical advice. Use an approved urgent-care script and staff or emergency path. | End automated rescheduling. Create a high-priority staff item. |
| Carrier, AI, database, or staff queue fails. | Give each dependency a timeout and circuit breaker. Preserve the case. Make a manual call list available. | Pause the campaign when error limits exceed policy. Recover from the database and event log, not model memory. |
| The route breaks local calling rules. | Check consent, calling window, caller ID, recording, language, and opt-out rules before activation. | For India, classify the call with carrier and counsel. Do not assume “transactional.” DoT allocated `1601` for non-BFSI, non-government service and transactional calls. The TSP must verify the sender and obtain an undertaking. Pre-declare automated calling use and purpose to the originating provider. [DoT 1601 direction](https://www.dot.gov.in/static/uploads/2026/06/8ff32b52c48ddcf909ac8c18f02abb22.pdf), [TRAI regulations](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf), and [TRAI UCC guidance](https://www.trai.gov.in/what-spam-or-ucc) |

## Scheduling design that resists races

Use one authoritative calendar database. Apply non-overlap constraints to each provider, room, chair, assistant, and equipment resource.

Use these server actions only:

1. `search_slots(caseToken, preference, quoteVersion)` returns two or three valid choices.
2. `hold_slot(caseToken, slotId, quoteVersion)` creates an expiring, one-use hold.
3. `commit_reschedule(caseToken, holdId, confirmation, commandId)` locks the case, appointment, and hold.
4. `commit_reschedule` verifies the absence, campaign, appointment, resources, hold expiry, and versions.
5. The same transaction creates allocations, updates the appointment, consumes the hold, and writes audit and outbox events.

Use `SELECT ... FOR UPDATE` only inside a short transaction. PostgreSQL documents that this blocks conflicting writers and lockers. [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

Never reserve every option the agent says. Hold only the selected option. Do not let a model choose an unavailable slot.

## Call-state and event design

Keep a durable case state separate from a provider call state.

```text
case: queued → dialing → connected → negotiating → held → booked
                                  └────────────→ needs_staff
queued/dialing/connected/negotiating/held ────→ stopped
```

`booked`, `needs_staff`, and `stopped` are terminal for automation. A staff override creates a new audited transition.

Store the following IDs on every record: campaign, case, appointment version, call attempt, provider call, media stream, AI session, event, command, and handoff.

Keep these timestamps: provider event time, receipt time, processing time, slot quote time, hold expiry, and final transaction time. Order events by allowed state transition, not arrival time.

Keep an outbox table for call attempts, confirmations, and staff work. A worker claims one due job with a lease.

Return quickly from the carrier callback after event storage. Do not run a slot hold or booking transaction in that callback.

Do not assume a call record read is current. Twilio marks its call-resource reads as eventually consistent. [Call resource](https://www.twilio.com/docs/voice/api/call-resource)

## Conversation safety controls

The first message should identify the practice, say that an automated assistant is calling, and offer staff help. It should not name a procedure.

Before any booking, the agent must read back the date, time zone, provider or substitute, location, and replacement effect. It must receive clear confirmation.

Treat silence, an acknowledgement such as “yes” after a long prompt, a bad transcript, and interruption as no confirmation. Ask one short clarification.

Treat a transcription as a hint, not proof of patient intent. Confirm the complete local date, time, clinic, and provider before commit.

Use a fixed handoff for these events:

- identity or authority uncertainty;
- a minor, guardian, caregiver, interpreter, or third party;
- medical, billing, complaint, threat, distress, or emergency content;
- a difficult treatment, substitution, accessibility need, or language failure;
- no valid slot, expired hold, tool failure, or two failed repair attempts.

Keep live staff in the loop until the transfer has actually connected. Do not mark the case resolved when the transfer begins.

## Required operating metrics

Measure each metric by practice, campaign, language, carrier route, appointment type, and agent version.

- affected, booked, staff-resolved, no-contact, stopped, and overdue case counts;
- attempts, answer rate, human verification rate, voicemail and `unknown` classifier rates;
- slot quote, hold, expiry, constraint-rejection, stale-version, and duplicate-command rates;
- active call, transfer-success, staff-queue wait, and unresolved-before-deadline counts;
- call setup delay, speech-to-first-response, tool latency, dropped calls, and silence events;
- opt-outs, wrong-contact reports, privacy incidents, and complaint rate;
- provider webhook retry, duplicate, signature-failure, and event-lag rates;
- cost per attempt and cost per resolved case.

Review audio-quality metrics with each incident. Twilio Voice Insights exposes connection, delay, jitter, packet-loss, and call-event data. [Voice Insights](https://www.twilio.com/docs/voice/voice-insights)

## Incident actions

| Trigger | Immediate action | Follow-up |
|---|---|---|
| Booking constraint fails. | Do not retry the commit blindly. Put the case in `needs_staff`. | Investigate hold and calendar versioning. |
| Wrong-person disclosure. | Stop the call path and preserve the audit record. | Follow the privacy incident plan. Review the contact and prompt. |
| Campaign cancellation. | Stop workers, revoke tools, and cancel active calls where safe. | Reconcile every case and hold. |
| Webhook outage or event lag. | Store no new irreversible results from assumed call state. | Replay the event inbox and reconcile provider records. |
| AI or media outage. | Transfer to staff or end with a generic callback route. | Keep schedule changes manual until the health check is stable. |
| Carrier degradation. | Reduce concurrency or pause the affected route. | Check connection, delay, jitter, and packet loss. |
| Staff queue overload. | Pause automated calls before creating more handoffs. | Rebalance staff or use an approved alternate channel. |
| Main call-flow URL fails. | Route to a separate safe fallback endpoint. | Play a generic callback message or offer staffed transfer. [Twilio Voice failover](https://www.twilio.com/docs/voice/twilio-voice-failover-best-practices) |

## Staged rollout checklist

### Before any patient call

- [ ] Approve the legal, consent, caller-ID, recording, language, and opt-out policy for each launch region.
- [ ] Test the real carrier number on target mobile, landline, voicemail, IVR, busy, and no-answer routes.
- [ ] Implement signed webhook validation, immutable audit events, secret storage, and least-privilege accounts.
- [ ] Test two simultaneous bookings, staff booking, online booking, cancellation, clinician return, and hold expiry.
- [ ] Test duplicate, delayed, missing, and forged webhooks.
- [ ] Test barge-in while dates play. Confirm that unheard audio never becomes assumed confirmation.
- [ ] Define the staff queue owner, transfer hours, overflow path, and unresolved-case deadline.
- [ ] Create a one-click campaign pause and a manual rescheduling list.

### Rollout order

1. Run scheduler tests without telephony.
2. Run staff-monitored calls that only collect preferences and create handoffs.
3. Pilot simple appointment types with low concurrency and full call review.
4. Enable holds and automated booking for that narrow group.
5. Expand only after the safety, accuracy, resolution, and staff-load gates hold.

Do not use a low booking rate alone as the release measure. It can hide wrong-contact, opt-out, audio, and staff-handoff failures.

## Source notes

This note uses official vendor, database, regulator, and government sources. It is engineering guidance, not legal advice.

- [Twilio Programmable Voice Call resource](https://www.twilio.com/docs/voice/api/call-resource)
- [Twilio Answering Machine Detection guide](https://www.twilio.com/docs/voice/answering-machine-detection-faq-best-practices)
- [Twilio Media Streams WebSocket messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
- [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Twilio webhook retry controls](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides)
- [Twilio Voice failover](https://www.twilio.com/docs/voice/twilio-voice-failover-best-practices)
- [Twilio Voice Insights](https://www.twilio.com/docs/voice/voice-insights)
- [OpenAI Realtime API reference](https://developers.openai.com/api/reference/resources/realtime)
- [PostgreSQL range types and exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [HHS guidance on messages and appointment reminders](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html)
- [DoT direction on the India 1601 service and transactional calling series](https://www.dot.gov.in/static/uploads/2026/06/8ff32b52c48ddcf909ac8c18f02abb22.pdf)
- [TRAI TCCCPR Second Amendment, 2025](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf)
- [TRAI guidance on spam and commercial communication](https://www.trai.gov.in/what-spam-or-ucc)
