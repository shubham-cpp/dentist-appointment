# Telnyx sandbox: current architecture and performance work

Last updated: 23 August 2026.

This is the note for what we actually run now. Older files still hold vendor facts. If they disagree with this page on matcher, metrics, or greeting, this page wins.

Related:

- [ADR 001](../adr/001-voice-scheduling-authority.md)
- [Telnyx vs Twilio](telnyx-vs-twilio-voice-agents.md)
- [Conversational latency research](voice-agent-conversational-latency.md)
- [Telnyx setup runbook](../voice-telnyx-setup.md)

Primary references:

- [Telnyx ConversationRelay](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/conversationrelay)
- [Telnyx STT models](https://developers.telnyx.com/docs/voice/stt/models)
- [Telnyx native TTS models](https://developers.telnyx.com/docs/voice/tts/providers/telnyx)
- [Telnyx outbound TeXML call and AMD](https://developers.telnyx.com/api-reference/texml-rest-commands/initiate-an-outbound-call)
- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)

## Two stacks

The live dashboard demo uses Telnyx Conversation Relay in `src/voice-gateway/`. Isolated scripts in `scripts/` remain a one-line voice check and a three-turn Oliver sandbox.

Both stacks are a **chained** pipeline: STT, then text, then TTS. The model must not invent a slot or own spoken words.

## Current dashboard gateway path

1. Start or reuse `claude-code-proxy` on loopback `:18765`.
2. Start ngrok for gateway port 3001.
3. Place one outbound TeXML call.
4. Return `<ConversationRelay>` with a `welcomeGreeting`.
5. Use US English, Deepgram Flux, and `Telnyx.NaturalHD.astra`.
6. Record partial prompts as telemetry. Do not change state from them.
7. Process only a final prompt for the turn.
8. Match clear, closed answers in local code first.
9. Send an unclear final answer to `gpt-5.6-luna-fast` with no reasoning.
10. Validate the structured intent against the active phase.
11. Render all caller speech from approved server templates.
12. Wait for estimated terminal playback, then send `end`.

Premium answering-machine detection is optional. It is disabled by default because synchronous detection can delay the greeting.

## Local classifier transport contract

The local proxy implements Codex Responses Lite. It is stricter than the public GPT-5.6 API defaults.

Use `openai.responses(model)` and AI SDK `streamText`. Keep these provider options explicit.

| AI SDK option | Responses request field | Required value | Reason |
| --- | --- | --- | --- |
| `parallelToolCalls` | `parallel_tool_calls` | `false` | Codex Responses Lite rejects an omitted value. |
| `reasoningContext` | `reasoning.context` | `all_turns` | Codex Responses Lite rejects an omitted value. |
| `reasoningEffort` | `reasoning.effort` | `none` | This is the measured latency baseline. |
| `reasoningSummary` | `reasoning.summary` | omitted | The classifier does not need a summary. |
| `store` | `store` | `false` | The demo does not persist model responses. |

The AI SDK provider uses camelCase options. Its OpenAI adapter converts them to Responses API field names.

The public GPT-5.6 API defaults `reasoning.context` to `all_turns`. The local proxy still requires the explicit field.

The preflight must call `classifier.checkReady()`. A type check or mocked model test cannot validate the proxy contract.

## Observations from live `--confirm` logs

These were measured on real Telnyx calls to `CALL_TO_NUMBER`.

| Observation | Evidence | Conclusion |
| --- | --- | --- |
| Robotic voice on the old Twilio config test | Empty `<Say>` uses Basic default | Isolated Telnyx `<Say>` with NaturalHD |
| Short “yes” missed | Strict regex; rest went to Terra | Widen closed-turn matcher; bind names/dates to **call context** in the product |
| 2–6 s replies | Terra reasoning + wait for final STT | Carrier swap does not fix this |
| Telnyx TTS send is instant | `tts_send_ms` 0–1 | Not the bottleneck |
| Silence after pickup | Relay setup and TTS start need separate timings | Keep `welcomeGreeting`; record answer and setup stages |
| Confirm line cut off | `end` sent immediately after last text | Wait estimated playback |
| `gap_ms` looked huge | It included the caller talking | Use `dead_air_ms` and `eot_ms` |
| HTTP 400 from Codex | `generateText` is non-stream; proxy requires stream | Use AI SDK `streamText` |
| HTTP 400 for `reasoning.context` | Required proxy field was omitted | Set `reasoningContext: "all_turns"` |
| HTTP 400 for `parallel_tool_calls` | Required proxy field was omitted | Set `parallelToolCalls: false` |
| Hard-coded “Oliver” / “26th” | Sandbox-only phrases | Product matcher must use patient name and **offered** dates, not these strings |

Human reply time is about 200 ms. ITU-T G.114 treats delay above 400 ms as a quality problem. After local-first, fallback intent time is the remaining model cost.

## Local matcher: pattern vs demo strings

The **pattern** is product-ready: closed turns without an LLM.

The **Oliver / 26th strings** are not. They only exist because the sandbox has one fake patient and one fake date.

In the application:

- Affirmations and denials are generic (`yeah`, `sure`, `no`, `wrong person`).
- Identity uses the **current** patient first name.
- Accepting a time is local only if that date or label was **offered this turn**.
- “Can we do evening next week?” stays leftover: small classifier, no reasoning, server still owns the slot.

Do not copy sandbox literals into the gateway as forever-valid answers.

## Gateway latency metrics

The JSONL debug log records `voice.latency` events.

| Stage | Start | End | Target |
| --- | --- | --- | --- |
| `answer_to_texml` | Answer webhook received | TeXML created | Under 1,000 ms |
| `answer_to_relay_setup` | Answer webhook received | Relay setup bound | Trend only |
| `intent_classification` | Final prompt accepted | Intent ready | Local near 0 ms |
| `final_transcript_to_response_sent` | Final prompt accepted | Relay text sent | Under 1,200 ms |

Each event includes the classifier model, effort, speech model, voice, attempt, and turn where applicable.

## Work already done

1. Script 1: one NaturalHD `<Say>` call.
2. Script 2: Conversation Relay Oliver flow.
3. Self-contained proxy + ngrok.
4. AI SDK streaming classify for leftovers.
5. Relay `welcomeGreeting` for the full opener.
6. Wait before `end` so the reschedule confirm plays.
7. Honest metrics.
8. Local matcher first; Luna with no reasoning for leftovers.
9. Final-only state changes.
10. Phase-scoped model context and allowed intents.
11. Deterministic approved phrase variants.
12. First-audio and turn latency stages.
13. Optional Premium AMD, disabled by default.

## Not done

- Speculative canned TTS (start the known next line on a stable “yes”).
- Real-phone P50 and P95 measurements for Luna fallback turns.
- Provider voice comparison against the selected NaturalHD voice.
- Semantic / Flux end-of-turn knobs (Telnyx Conversation Relay does not document them).

The live gateway now uses Telnyx. The product matcher binds names and offered times to the live call context. Measure P50 and P95 latency on dashboard calls before another carrier comparison.
