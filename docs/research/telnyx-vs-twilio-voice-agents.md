# Telnyx vs Twilio for this voice demo

Research checked: 20 August 2026.

Sources: official Telnyx and Twilio docs, plus this repository's gateway and test scripts.

This note is for the controlled outbound rescheduling demo. It is not a general CPaaS comparison.

## Short answer

Telnyx is a reasonable next carrier for this project. Conversation Relay on Telnyx is close to Twilio ConversationRelay. Pricing is simpler. First-party voices are easier to hear than a nameless Twilio `<Say>`.

A carrier swap does not fix the live demo by itself.

As of 23 August 2026 the dashboard gateway uses a **local matcher first**, then `gpt-5.6-luna-fast` with no reasoning. The isolated Oliver sandbox keeps its own legacy model settings. Happy-path “yeah” and “that’s me” do not need a model.

The remaining delay is leftover model time and STT end-of-turn, not the carrier. Current architecture and measured logs: [telnyx-sandbox-current-architecture.md](telnyx-sandbox-current-architecture.md).

Isolated Telnyx scripts in `scripts/` are the place to prove voice quality, intent, and latency before anyone ports `src/voice-gateway/`.

## What we run today

**Isolated Twilio test.** `scripts/test-twilio-call.mjs` places one outbound call. The `<Say>` tag has no `voice`. Twilio then uses the account default, often a Basic `man` or `woman` voice. That is the documented cause of the robotic config test. See [twilio-voice-options.md](twilio-voice-options.md).

**Live demo.** `src/voice-gateway/` uses Twilio ConversationRelay, Google STT, ElevenLabs TTS, and Terra (`gpt-5.6-terra`). The gateway owns spoken text and the calendar write ([ADR 001](../adr/001-voice-scheduling-authority.md)).

## Telnyx products that look similar

| Product | Fit here |
| --- | --- |
| TeXML `<Say>` | Same job as `test-twilio-call.mjs`. Use `scripts/test-telnyx-call.mjs`. |
| Conversation Relay | Closest port of the gateway. Same WebSocket types: `setup`, `prompt`, `interrupt`, `text`, `end`. Use `scripts/test-telnyx-conversation.mjs` first. |
| AI Assistants | Telnyx hosts the agent. Do not use for the first migrate. It would move speech and policy out of the gateway. |

Conversation Relay docs: [Telnyx Conversation Relay](https://developers.telnyx.com/docs/voice/programmable-voice/conversation-relay).

TeXML outbound call docs: [Initiate an outbound TeXML call](https://developers.telnyx.com/api-reference/texml-rest-commands/initiate-an-outbound-call).

Twilio ConversationRelay price: [Conversational AI pricing](https://www.twilio.com/en-us/products/conversational-ai/pricing).

## What would change in a later gateway port

Keep the dashboard safety rules, fictional fixture, and ADR 001.

Replace Twilio HMAC signatures with Telnyx Ed25519 (`telnyx-signature-ed25519`). Replace TwiML with TeXML. Replace `CA…` CallSids with `v3:…`. Replace `/twilio/*` routes.

Do not assume every ConversationRelay attribute exists on Telnyx. Our gateway depends on `partialPrompts`, `tokens-played`, `speechTimeout`, and `interruptSensitivity`. The Telnyx example lists `url`, `voice`, `language`, `transcriptionProvider`, `welcomeGreeting`, `interruptible`, and `dtmfDetection`. Script 2 logs unknown frames so we can see the real set.

## Price for this demo

Published list prices, excluding tax.

| Meter | Twilio live demo | Telnyx Conversation Relay |
| --- | --- | --- |
| Speech bridge | $0.07/min plus Google STT and ElevenLabs | $0.05/min, hosted STT and TTS included |
| Call | US local about $0.014/min. India mobile about $0.0496/min | $0.002/min Voice API plus SIP. Confirm India on the Telnyx SIP sheet |
| Number | about $1.15/month US local | about $1.00/month US local |
| LLM | Our local proxy | Unchanged in the sandbox |

Sources: [Twilio Conversation Relay pricing](https://www.twilio.com/en-us/products/conversational-ai/pricing), [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api), [Telnyx Voice AI pricing](https://telnyx.com/pricing/voice-ai-agents), [Twilio India Voice](https://www.twilio.com/en-us/voice/pricing/in).

HIPAA and a BAA still apply before any real patient audio. These scripts stay fictional.

## Isolated scripts

1. `scripts/test-telnyx-call.mjs` speaks one NaturalHD line and hangs up.
2. `scripts/test-telnyx-conversation.mjs` runs a three-turn Oliver / Bright Dental call. Local matcher first, Terra leftover only. Console metrics: `dead_air_ms`, `eot_ms`, `intent_ms`, `source=local|model`.

Setup: [voice-telnyx-setup.md](../voice-telnyx-setup.md).
