# Telnyx sandbox: current architecture and performance work

Last updated: 21 August 2026.

This is the note for what we actually run now. Older files still hold vendor facts. If they disagree with this page on matcher, metrics, or greeting, this page wins.

Related:

- [ADR 001](../adr/001-voice-scheduling-authority.md)
- [Telnyx vs Twilio](telnyx-vs-twilio-voice-agents.md)
- [Conversational latency research](voice-agent-conversational-latency.md)
- [Telnyx setup runbook](../voice-telnyx-setup.md)

## Two stacks

The live dashboard demo is still Twilio (`src/voice-gateway/`). The Oliver Telnyx path is an isolated script (`scripts/test-telnyx-conversation.mjs`). It does not write the Olivia calendar.

Both stacks are a **chained** pipeline: STT, then text, then TTS. The model must not invent a slot or own spoken words.

## Current Telnyx `--confirm` path

1. Start or reuse `claude-code-proxy` on loopback `:18765`.
2. Start ngrok for port 3002 (in memory, not written to `.env.local`).
3. Place one outbound TeXML call.
4. On answer, `<Say>` plays the greeting at once. Then `<Connect><ConversationRelay>` opens.
5. Partials: if the transcript stops growing for 400 ms, treat it as a turn. Do not wait only for `last: true`.
6. **Local matcher first.** Yes / yeah / sure / go ahead / that’s me / “ok with the 26th” and similar map to `confirm` or `deny`. Log `source=local`. `intent_ms` should be ~0.
7. **Terra leftover only.** Unclear speech goes to `streamText` + structured `{intent}` with `reasoningEffort: "low"`. Log `source=model`.
8. Server templates speak. Last line waits an estimated playback time, then the script sends `end`.

Twilio gateway: same local-first rule in `classifyLocalVoiceIntent`. Leftover Terra also uses `reasoningEffort: "low"`.

## Observations from live `--confirm` logs

These were measured on real Telnyx calls to `CALL_TO_NUMBER`.

| Observation | Evidence | Conclusion |
| --- | --- | --- |
| Robotic voice on the old Twilio config test | Empty `<Say>` uses Basic default | Isolated Telnyx `<Say>` with NaturalHD |
| Short “yes” missed | Strict regex; rest went to Terra | Widen closed-turn matcher; bind names/dates to **call context** in the product |
| 2–6 s replies | Terra reasoning + wait for final STT | Carrier swap does not fix this |
| Telnyx TTS send is instant | `tts_send_ms` 0–1 | Not the bottleneck |
| Silence after pickup | Greeting was `welcomeGreeting` after WSS | Greeting is now `<Say>` before `<Connect>` |
| Confirm line cut off | `end` sent immediately after last text | Wait estimated playback |
| `gap_ms` looked huge | It included the caller talking | Use `dead_air_ms` and `eot_ms` |
| HTTP 400 from Codex | `generateText` is non-stream; proxy requires stream | Use AI SDK `streamText` |
| Hard-coded “Oliver” / “26th” | Sandbox-only phrases | Product matcher must use patient name and **offered** dates, not these strings |

Human reply time is about 200 ms. ITU-T G.114 treats delay above 400 ms as a quality problem. After local-first, leftover `intent_ms` is the remaining model cost. STT hang is `eot_ms`.

## Local matcher: pattern vs demo strings

The **pattern** is product-ready: closed turns without an LLM.

The **Oliver / 26th strings** are not. They only exist because the sandbox has one fake patient and one fake date.

In the application:

- Affirmations and denials are generic (`yeah`, `sure`, `no`, `wrong person`).
- Identity uses the **current** patient first name.
- Accepting a time is local only if that date or label was **offered this turn**.
- “Can we do evening next week?” stays leftover: small classifier, no reasoning, server still owns the slot.

Do not copy sandbox literals into the gateway as forever-valid answers.

## Metrics (console)

`--confirm` prints `t+…ms` events and a `TURN` block:

- `since_agent_ms`: previous agent text queued → this turn. Includes you talking. Not silence.
- `eot_ms`: last transcript growth → we treated the turn as done.
- `intent_ms`: classifier only. ~0 if `source=local`.
- `tts_send_ms`: WebSocket send. Not first audible audio. Telnyx does not send `tokens-played`.
- `dead_air_ms`: last transcript growth → we queued agent text. Closest measure of silence after you stop.

Call status logs only when the status changes.

## Work already done

1. Script 1: one NaturalHD `<Say>` call.
2. Script 2: Conversation Relay Oliver flow.
3. Self-contained proxy + ngrok.
4. AI SDK streaming classify for leftovers.
5. `<Say>` greeting, then relay.
6. Wait before `end` so the reschedule confirm plays.
7. Honest metrics.
8. Local matcher first; Terra `low` for leftovers.

## Not done

- Speculative canned TTS (start the known next line on a stable “yes”).
- Product matcher bound to live patient/slot context.
- Faster leftover model than Terra (gpt-4o-mini or similar).
- Semantic / Flux end-of-turn knobs (Telnyx Conversation Relay does not document them).
- Porting `src/voice-gateway/` off Twilio.

Do not start another carrier comparison until happy-path `source=local` and leftover `intent_ms` are measured with the new logs.
