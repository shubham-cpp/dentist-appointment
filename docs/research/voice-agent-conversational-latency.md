# Why the Telnyx sandbox still does not feel like a conversation

Research checked: 20 August 2026.

Primary sources: OpenAI voice-agent and latency docs, Twilio ConversationRelay, Deepgram Flux, Telnyx Conversation Relay and AI Assistants, LiveKit speech, ITU-T G.114. Measured numbers are from this repo’s `test-telnyx-conversation` `--confirm` logs.

## Diagnosis of this project

The last successful `--confirm` run:

| Turn | gap_ms | intent_ms | tts_send_ms | What that means |
| --- | --- | --- | --- | --- |
| identity (partial) | 1926 | **3806** | 1 | After a 3-character partial, Terra still took 3.8s before we sent speech |
| reschedule (final) | 9633 | **1706** | 1 | Most of 9.6s is the agent still talking plus STT. After you stopped, Terra took 1.7s |

`tts_send_ms` is 0–1. Telnyx is not the bottleneck after we have text.

Human conversation reply time is about **200 ms**. ITU-T G.114 treats one-way delay under 150 ms as fine and above 400 ms as a quality problem. [ITU-T G.114](https://www.itu.int/rec/T-REC-G.114)

A pause of **1.7–3.8s after you stop talking** is a new turn, not a conversation. Switching Twilio to Telnyx cannot fix that while the hot path is `gpt-5.6-terra` structured output through claude-code-proxy.

OpenAI’s own latency guide: generating tokens is usually the slowest step; **do not default to an LLM**; hard-code confirmations; use a smaller model. [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)

`reasoning.effort` **none** is listed for “latency-critical tasks” including **voice and classification**. `low` already adds delay. Terra is a reasoning coding model. [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)

The 400 ms partial debounce helped identity `gap_ms` (down from ~6–9s). It did **not** help `intent_ms`. That is the remaining loop.

## Three architectures (official split)

OpenAI names two product architectures. [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)

| Architecture | How it works | Best for | Latency |
| --- | --- | --- | --- |
| **Speech-to-speech** | One realtime model takes live audio and emits live audio | Natural talk, barge-in, tools in the audio session | First audio often ~0.8s in 2026 public clusters |
| **Chained pipeline** | STT → text agent → TTS, each stage visible | Predictable workflows, transcripts, approval | Only feels live if stages **overlap** |

This demo is chained. OpenAI says chained is the right family for approval-heavy work. Our ADR 001 matches that: the model must not invent a slot or own spoken text.

Chained does **not** mean “wait for a final transcript, then a reasoning model, then speak one full sentence.” That is a turn-based IVR with an LLM in the middle.

## How production voice agents cut delay

### 1. Overlap the stages

A 2026 enterprise tutorial measured a streaming cascade (Deepgram STT → streaming LLM → ElevenLabs TTS) at **P50 time-to-first-audio ~947 ms**, best ~729 ms. Native all-in-one S2S they tested was much slower (~13s TTFA). The trick is not one magic model. It is **pipelining**. [arxiv:2603.05413](https://arxiv.org/html/2603.05413v1)

Twilio’s own CR guidance: stream LLM tokens to ConversationRelay as they arrive. Waiting for the full LLM text adds delay. [CR best practices](https://www.twilio.com/docs/voice/conversationrelay/best-practices)

We send one complete template after Terra returns. There is nothing to stream from the model because the model is not writing speech. Streaming only helps if we start **speaking a known line** before classification finishes, or we use a fast model that emits the next template id in tens of milliseconds.

### 2. Eager end of turn, not “wait for last:true”

Deepgram Flux sends:

1. `EagerEndOfTurn` — moderately sure the caller is done → **start the reply draft**
2. `TurnResumed` — they kept talking → **cancel the draft**
3. `EndOfTurn` — high confidence → **play the draft** (transcript matches the eager one)

[Deepgram eager EOT](https://developers.deepgram.com/docs/flux/voice-agent-eager-eot)

Telnyx AI Assistants with Deepgram Flux enable this by default. They start a tentative LLM call early and **do not play audio until the turn is confirmed**. Claimed median savings ~150 ms, tail ~350 ms. That is a rounding error next to our 1.7–3.8s model. [Telnyx Flux note](https://telnyx.com/release-notes/automatic-eager-end-of-turn-deepgram-flux)

Our Conversation Relay path only gets `prompt` partials and `last: true`. We debounce 400 ms. We still call Terra. Eager EOT without a fast drafter does not feel live.

### 3. A small model on the hot path

Production stacks split models:

- **Turn model:** tiny/fast, no reasoning. Classify yes/no/slot. Target tens to a few hundred ms.
- **Optional slow model:** only for messy language.

`gpt-5.6-terra` with structured output and reasoning is a coding agent. It is the wrong tool for “Yeah I’m Oliver.” The proxy also requires streaming (`Stream must be set to true`). That is another sign this stack is for agents, not phone turns.

Deepgram’s own cost note: use a **smaller/faster model for EagerEndOfTurn drafts**, full LLM only on EndOfTurn.

### 4. Pre-baked speech for closed turns

This flow has two closed questions: identity, then accept 26 August. The next sentence is known **before** the caller speaks.

A production IVR would:

1. Start TTS of the canned confirm as soon as STT looks like yes
2. Cancel if they keep talking
3. Never wait 1.7s for a model to choose a template we already know

That still keeps ADR 001. The server owns the words.

### 5. Managed assistant vs Conversation Relay

| Telnyx product | Owns turn-taking | Owns spoken text | Fit here |
| --- | --- | --- | --- |
| Conversation Relay | You | You | Current sandbox. Full control, you must do EOT + fast classify |
| AI Assistants | Telnyx (Flux EOT, barge-in) | The assistant, unless you force tools + fixed copy | Faster feel, weaker word control unless tools are strict |
| Media Streams + OpenAI Realtime | The realtime model | The model | Fastest talk; hard to keep exact server templates |

Twilio ConversationRelay publishes median **&lt;0.5s** on their own orchestration with prefetch and token batching. That assumes a fast generator, not Terra. [Twilio CR product](https://www.twilio.com/en-us/products/conversational-ai/conversationrelay)

## What cannot be fixed by more Telnyx vs Twilio work

- `intent_ms` of 1.7–3.8s
- Using a reasoning coding model for three labels
- Waiting for a complete structured object before any audio
- Measuring “conversation quality” by carrier brand

Carrier work already paid off: voice quality, simpler bill, `<Say>` on answer, confirmation playback wait. Further sandbox loops on TeXML will not cross the 300 ms bar.

## Ranked next methods (keep scheduling in the server)

1. **No LLM on closed turns.** Local matcher first. In the **product**, bind names and offered dates to the live case. Do not ship sandbox literals “Oliver” and “26th” as global answers. OpenAI: hard-code constrained outputs. ADR 001 already allows this. Target `intent_ms` near 0.

Shipped in the sandbox and gateway as of 21 August 2026. See [telnyx-sandbox-current-architecture.md](telnyx-sandbox-current-architecture.md).
2. **Leftovers only: a small classifier with reasoning off.** gpt-4o-mini or an 8B Groq model, tiny schema. Deepgram’s Flux demo uses gpt-4o-mini. [gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)
3. **Speculative canned TTS.** On a stable “yes” partial, start the known next line immediately. Abort if the transcript changes. LiveKit: preemptive generation. [LiveKit speech](https://docs.livekit.io/agents/multimodality/audio/)
4. **Stream template clauses** (`last: false` then `last: true`) so TTS can start on the first phrase.
5. **Semantic EOT** (Twilio Flux / Deepgram Flux) only after the hot-path model is fast. Telnyx Conversation Relay does not document `eotThreshold` in TeXML.
6. **Do not** move this demo to Telnyx AI Assistants or OpenAI speech-to-speech as a latency hack. That moves speech authority off the gateway.

## Stop doing

- Calling `gpt-5.6-terra` on every yes/no
- Treating Conversation Relay `last: true` as the start of work
- Expecting ngrok + Codex proxy + structured output to feel like a receptionist
- Another carrier comparison until `intent_ms` is under 300 ms on the same phone
