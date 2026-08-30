# Phase 4 controlled AI call

## Purpose

Build one fictional outbound appointment scheduling call.

The system calls only `CALL_TO_NUMBER`. It can change only Olivia Garcia's fictional appointment.

## Safety rules

- `VOICE_DEMO_MODE` and `VOICE_CALLS_ENABLED` must both be true.
- Use fictional fixture data only.
- Do not store recordings or raw transcripts.
- Do not expose phone numbers, secrets, tokens, prompts, or model output.
- Recheck a slot before the final write.
- Apply a confirmed reschedule or cancellation once.
- Keep a cancellation audit record and free the old slot.
- Do not retry uncertain Telnyx call creation.
- Limit one active call and one call every four minutes.

## Runtime boundary

Next.js remains on port 3000. A Fastify gateway runs on port 3001.

The dashboard calls the gateway through loopback. Telnyx reaches the gateway through one public ngrok URL. The local Codex proxy stays on loopback.

## Required public routes

- `POST /voice/answer`
- `POST /voice/status`
- `POST /voice/relay-complete`
- `WSS /voice/relay`

Validate every Telnyx HTTP webhook with Ed25519. Bind one CallSid and one Relay session to each attempt. Accept the WebSocket, then bind it on a matching `setup` frame.

## Conversation policy

Luna returns only a validated intent, slot ID, date, or time preference. It never writes caller-facing speech.

The server renders all speech. It owns the 21-day fictional schedule and the final write.

The main outcomes are `rescheduled`, `canceled`, `staff_follow_up`, and `identity_failed`.

Use `gpt-5.6-luna-fast` through the local Responses proxy. Set reasoning effort to `none`. Stop one model request after five seconds.

Handle clear yes, no, provider, and numbered choices in the gateway. Bind names and offered times to the live call context. Send other final speech to Luna once. Use only final Telnyx transcripts to change state.

Use the Conversation Relay `welcomeGreeting`. Use Deepgram Flux and `Telnyx.NaturalHD.astra`. Wait an estimated playback time before `end`.

Verify identity first. Then ask for permission. Explain the change only after permission. Do not reveal appointment details before identity verification.

## Slice acceptance

1. A deterministic Conversation Relay canary completes one controlled call.
2. Natural caller language selects only eligible fictional slots.
3. Interruptions, timeouts, bad callbacks, and restarts fail safely.
4. The dashboard shows redacted progress, the result, and a manual stop action.

## Review rule

Every code task stays in review until focused tests, Matt's code review, and simplify checks pass. Every slice ends with an end-to-end verification.
