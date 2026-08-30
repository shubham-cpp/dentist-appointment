# Voice platform comparison research

Research date: 2026-08-30  
Scope: US inbound dental reception and appointment scheduling  
Options: Twilio ConversationRelay, Telnyx TeXML with a custom voice pipeline, and Telnyx AI Assistant  
Custom model path: AI SDK and OpenRouter to OpenAI GPT-5.6 Luna

## How to read this file

This file separates four evidence types:

- **Official price:** A vendor public price checked on the research date.
- **Official capability:** A feature in current vendor documentation.
- **Vendor benchmark:** A vendor test or marketing claim. It is not an independent result.
- **Derived estimate:** A calculation from stated assumptions. It is not a quote or invoice.

No public source gives a neutral latency test for all three exact stacks. Do not compare unlike benchmark boundaries.

## Executive finding

Telnyx AI Assistant is the best first pilot for this use case. It has the smallest delivery burden. It includes turn-taking, interruption, speech, tools, and hosted observability. Its public unit price is lower than Twilio ConversationRelay.

Twilio ConversationRelay is the best middle path when the team already uses Twilio. The application owns the LLM and business logic. Twilio owns speech and voice session handling. It is the most expensive option in this model.

Telnyx TeXML with raw media has the lowest expected usage cost. It also has the largest engineering and operational burden. Use it when audio control, provider choice, or scale savings justify a custom voice runtime.

The final choice needs a phone-call bake-off. Test the same prompts, tools, voices, phone numbers, and regions. Measure phone-to-first-audio at p50 and p95. Also measure false interruptions, booking completion, and recovery from tool errors.

## Option boundaries

The three options have different ownership boundaries.

| Layer | Twilio ConversationRelay | Telnyx TeXML, custom | Telnyx AI Assistant |
|---|---|---|---|
| US phone number and PSTN | Twilio | Telnyx | Telnyx |
| Call control | Twilio Voice and TwiML | TeXML | Telnyx managed runtime |
| Media transport | Managed by ConversationRelay | Team-owned bidirectional WebSocket | Managed by Assistant |
| STT and endpointing | Twilio | Team selects and operates | Telnyx managed configuration |
| LLM | Team endpoint through AI SDK and OpenRouter | Team endpoint through AI SDK and OpenRouter | Native managed Luna, another Telnyx model, or an external compatible endpoint |
| TTS and playback | Twilio | Team selects and operates | Telnyx managed configuration |
| Turn-taking and barge-in | Twilio | Team builds it | Telnyx managed runtime |
| Scheduling and EHR tools | Team builds webhooks | Team builds webhooks | Team builds webhooks or MCP tools |

For this report, **Telnyx plus TeXML means raw bidirectional media and a custom voice runtime**. TeXML also has managed AI verbs. Those verbs would make the second option overlap with Telnyx AI Assistant.

## One-screen comparison

| Criterion | Twilio ConversationRelay | Telnyx TeXML, custom | Telnyx AI Assistant |
|---|---|---|---|
| Best fit | Existing Twilio team that wants custom agent logic | Team that needs full audio control and low variable cost | Fast pilot and small voice-infrastructure team |
| Expected recurring cost | Highest | Lowest, voice-dependent | Middle |
| First response | Static `welcomeGreeting` | Team must send or play it | Static greeting field |
| Published latency evidence | Twilio internal p50 and p95 | No numeric end-to-end claim found | Telnyx sub-second marketing claim; no neutral distribution |
| Barge-in | Managed and configurable | Team builds state and buffer clearing | Managed and configurable |
| DTMF | Managed events | Gather and media events | Built-in send DTMF tool and telephony handling |
| Voice choice | Google, Amazon, ElevenLabs | Broadest; any compatible speech or audio service | Broad catalog, Voice Design, and voice cloning |
| Custom LLM | Native application WebSocket | Complete application ownership | Native Luna for model choice; external endpoint for custom agent logic |
| Tool model | Application-owned | Application-owned | Managed tools, webhooks, async tools, MCP |
| WebSocket failure burden | Shared; application socket still matters | Highest | Lowest in application code |
| Portability | Medium to high | Highest | Lowest |
| Delivery speed | Medium | Slowest | Fastest |

## Public pricing

Prices below are public pay-as-you-go prices. They exclude taxes, carrier surcharges, committed discounts, recording, infrastructure, and paid third-party tools.

### Twilio

Twilio lists the following US prices:

- ConversationRelay: **$0.07 per minute**.
- US local inbound voice: **$0.0085 per minute**.
- US local phone number: **$1.15 per month**.
- US toll-free inbound voice: **$0.0220 per minute**.
- US toll-free phone number: **$2.15 per month**.
- Media Streams: **$0.0044 per minute**. This is not added to ConversationRelay in this model.
- SIP interface: **$0.004 per minute**.
- SIP REFER: **$0.10 per invocation**.

Source: [Twilio US Voice pricing](https://www.twilio.com/en-us/voice/pricing/us).

Twilio lists SMS from **$0.0083 per segment**. Carrier fees can apply. Source: [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us).

ConversationRelay includes managed STT, TTS, and voice orchestration. Voice channel charges remain separate. Source: [Twilio Conversational AI pricing](https://www.twilio.com/en-us/products/conversational-ai/pricing).

### Telnyx

Telnyx lists these component prices:

- Voice API or TeXML platform: **$0.002 per minute**.
- US local inbound SIP: **from $0.0032 per minute**.
- WebSocket media streaming: **$0.0035 per minute**.
- Deepgram Nova 2, Nova 3, or Flux STT: **$0.0074 per minute**.
- Telnyx base TTS: **$0.000003 per character**.
- Telnyx Ultra TTS: **$0.000032 per character**.
- HD voices: **$0.000048 per character**.
- Noise suppression: **$0.002 per leg-minute**.
- Krisp noise suppression: **$0.005 per leg-minute**.
- Transfer: **$0.10 per invocation**.

Sources: [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api) and [Telnyx Elastic SIP pricing](https://telnyx.com/pricing/elastic-sip).

Telnyx AI Assistant lists:

- Voice AI engine: **$0.05 per minute**.
- US inbound telephony: **from $0.0032 per minute**.
- US local phone number: **$1 per month**.
- Managed Kimi model: about **$0.004 per call-minute** for planning.
- Pay-as-you-go capacity: **500 concurrent calls** and **100 API requests per second**.

The $0.05 engine includes orchestration, turn-taking, interruptions, tools, knowledge retrieval, STT, and TTS. Telephony and LLM usage remain separate. Source: [Telnyx Voice AI Agent pricing](https://telnyx.com/pricing/voice-ai-agents).

Telnyx lists outbound SMS from **$0.004 per message part**, plus carrier fees. Source: [Telnyx messaging pricing](https://telnyx.com/pricing/messaging).

### OpenAI GPT-5.6 Luna and OpenRouter

OpenAI lists GPT-5.6 Luna at:

- Input: **$0.20 per 1 million tokens**.
- Cached input: **$0.02 per 1 million tokens**.
- Output: **$1.20 per 1 million tokens**.

Prompts above 272,000 tokens use higher rates. This dental agent should stay far below that threshold. GPT-5.6 Luna is a text model. It does not replace STT or TTS. Source: [OpenAI GPT-5.6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

OpenRouter says it passes through provider inference prices without an inference markup. It charges a **5.5% fee, with an $0.80 minimum, when a customer buys credits**. Source: [OpenRouter FAQ](https://openrouter.ai/docs/faq).

OpenRouter can route by price, throughput, or latency. It can also use provider fallbacks. This can improve resilience. It can also change the selected provider unless the team pins routing rules. Source: [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

## Cost model

### Token assumption

Telnyx uses about **6,000 prompt tokens and 500 output tokens per call-minute** in its Voice AI calculator example. Source: [Telnyx Voice AI Agent pricing](https://telnyx.com/pricing/voice-ai-agents).

The uncached Luna cost is:

```text
input  = 6,000 / 1,000,000 * $0.20 = $0.00120
output =   500 / 1,000,000 * $1.20 = $0.00060
Luna inference                           $0.00180/min
with 5.5% OpenRouter credit fee          $0.001899/min
```

This estimate treats all input as uncached. It is conservative when prompt caching applies. It does not include AI SDK hosting.

### TeXML speech assumption

The TeXML custom stack needs a TTS character estimate. Use these planning assumptions:

- Human speech rate: 150 words per minute.
- Average word plus spacing: six characters.
- The assistant speaks for half of each call-minute.
- Synthesized text: **450 characters per call-minute**.

This is a derived estimate. Real costs depend on caller behavior and voice design.

### Per-minute planning cost

| Stack | Formula | Derived cost/min |
|---|---|---:|
| Twilio ConversationRelay + Luna | $0.0700 + $0.0085 + $0.001899 | **$0.080399** |
| Telnyx TeXML + base TTS + Luna | $0.0020 + $0.0032 + $0.0035 + $0.0074 + 450 x $0.000003 + $0.001899 | **$0.019349** |
| Telnyx TeXML + Ultra TTS + Luna | Same fixed items + 450 x $0.000032 | **$0.032399** |
| Telnyx TeXML + HD TTS + Luna | Same fixed items + 450 x $0.000048 | **$0.039599** |
| Telnyx AI Assistant + native Luna | $0.0500 + $0.0032 + $0.0018 | **$0.0550** |
| Telnyx AI Assistant + custom Luna endpoint | $0.0500 + $0.0032 + $0.001899 | **$0.055099** |
| Telnyx AI Assistant + managed Kimi | $0.0500 + $0.0032 + about $0.0040 | **about $0.0572** |

The TeXML rows include full-call STT billing. They do not include custom runtime engineering. The Assistant rows assume hosted STT and TTS stay inside the $0.05 engine rate.

### Dental call-volume planning model

No ADA source gives a national average for calls per dental office. Do not present these bands as market facts.

Useful context:

- The ADA says dentists averaged 36.1 office hours and 30.5 patient-treatment hours each week in 2024. Source: [ADA US Dentist Workforce 2025](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/us_dentist_workforce_2025.pdf).
- An ADA HPI survey figure reports about 79.7 patient visits per dentist each week in 2022. The accessible source is a third-party presentation that cites the ADA survey. Source: [Connex Brothers presentation, page with ADA HPI source](https://connexbrothers.com/wp-content/uploads/2024/04/AADD-Workshop-CBCG-Keynote_John-1.pdf).
- A vendor compilation claims 40 to 80 inbound calls each business day for a one-to-three-provider general practice. It also claims three-to-five-minute calls. This is not an audited national study. Source: [Ainora dental phone statistics](https://ainora.lt/blog/dental-practice-phone-call-statistics-2026).
- A 2025 medical dataset covers 4,687,808 inbound calls across 297 practices. It is not dental-specific. It uses three minutes as a receptionist handle-time assumption. Source: [CallMyDoc patient phone benchmark](https://blog.callmydoc.com/new-blog-1/patient-phone-communication-2026).
- CallRail reports that 48% of dental practices say new patients contact them by phone first. Source: [CallRail dental patient inquiry research](https://www.callrail.com/blog/dental-practices-website-traffic-patient-inquiries).
- The ADA advises each practice to track its own new-patient calls. This is stronger than using a national vendor range for capacity planning. Source: [ADA marketing inquiry guidance](https://www.ada.org/resources/practice/practice-management/marketing_inquiriesprospectivepatients).

Use 20.8 business days per month and four minutes per call. These bands place a normal small-to-medium clinic around the cited 40-to-80-call range. High bands model group, DSO, overflow, or extended-hours traffic.

| Band | Calls/business day | Calls/month | Minutes/month | Interpretation |
|---|---:|---:|---:|---|
| Less | 20 | 416 | 1,664 | Small office, partial automation, or after-hours only |
| Medium | 60 | 1,248 | 4,992 | Typical planning case for one-to-three providers |
| High | 120 | 2,496 | 9,984 | Busy multi-provider clinic or broad overflow |
| Extra high | 240 | 4,992 | Large group, multi-site routing, or 24/7 service |

### Monthly usage estimate

Each estimate includes one local phone number. It excludes taxes, surcharges, SMS, transfer fees, recordings, infrastructure, and premium support.

| Band | Minutes | Twilio Relay + Luna | TeXML + Ultra + Luna | Telnyx Assistant + Kimi | Telnyx Assistant + native Luna |
|---|---:|---:|---:|---:|---:|
| Less | 1,664 | **$134.93** | **$54.91** | **$96.18** | **$92.52** |
| Medium | 4,992 | **$402.50** | **$162.74** | **$286.54** | **$275.56** |
| High | 9,984 | **$803.85** | **$324.47** | **$572.08** | **$550.12** |
| Extra high | 19,968 | **$1,606.56** | **$647.94** | **$1,143.17** | **$1,099.24** |

The TeXML result changes with the voice. At medium usage, base TTS is about $97.59 per month. HD TTS is about $198.67 per month. Both include one $1 phone number.

## Latency

### What affects perceived response time

Use the same latency boundary for every test:

```text
caller stops -> end-of-turn decision -> final STT -> LLM first token
             -> enough text for TTS -> TTS first audio -> caller hears audio
```

The main contributors are:

1. PSTN and media network delay.
2. Voice activity detection and end-of-turn delay.
3. STT finalization.
4. WebSocket or API network time.
5. LLM time to first token.
6. Tool calls for patient lookup or scheduling.
7. TTS time to first audio.
8. Playback buffering.

A fast static greeting helps only the first turn. It does not prove low latency for later scheduling turns.

### Twilio ConversationRelay

Twilio advertises **less than 0.5 seconds median** and **less than 0.725 seconds at p95** for ConversationRelay. Twilio also published internal figures of 491 ms at p50 and 713 ms at p95 across different models. These are vendor benchmarks. The public method does not define a complete PSTN-to-custom-Luna boundary. Sources: [ConversationRelay product page](https://www.twilio.com/en-us/products/conversational-ai/conversationrelay) and [Twilio core-latency guide](https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents).

ConversationRelay Insights divides response time into network round trip, STT, application, and TTS. The application measure includes the customer WebSocket. Twilio says these measurements are not guarantees. Source: [ConversationRelay Insights](https://www.twilio.com/docs/voice/voice-insights/conversation-relay-summary).

Twilio recommends streaming LLM tokens as soon as they are ready. This reduces the wait before TTS starts. Source: [ConversationRelay best practices](https://www.twilio.com/docs/voice/conversationrelay/best-practices).

Twilio says Deepgram Flux can reduce response latency by 200 to 600 ms and reduce false interruptions by about 30%. This is a vendor claim, not an independent benchmark. Source: [Twilio Deepgram Flux release note](https://www.twilio.com/en-us/changelog/conversation-relay-now-supports-deepgram-flux---new-features).

### Telnyx TeXML custom pipeline

Telnyx describes media streaming as near-real-time. Its docs do not publish an end-to-end p50 or p95 result for a raw TeXML, external STT, Luna, and TTS stack. Sources: [TeXML Stream](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/stream) and [Telnyx media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming).

The custom path can use RTP or linear PCM to reduce transcoding. It can send small audio chunks. It can also clear queued playback during an interruption. These controls can help latency. The team must tune them. A poor endpointing or buffer design can make this option the slowest.

### Telnyx AI Assistant

Telnyx markets sub-second voice-to-voice response for its integrated stack. A Telnyx comparison article presents a 450 ms co-located architecture budget. This is a vendor-authored model. It is not a neutral SLA or a p50/p95 test for GPT-5.6 Luna. Source: [Telnyx voice AI latency comparison](https://telnyx.com/resources/voice-ai-agents-compared-latency).

Deepgram Flux eager end-of-turn can start the LLM before a final transcript. Telnyx says this saves about 150 ms at the median when triggered, and about 350 ms in its top five percent of improvements. It can create speculative LLM requests. Source: [Telnyx eager end-of-turn release note](https://telnyx.com/release-notes/automatic-eager-end-of-turn-deepgram-flux).

An external Luna endpoint sends requests outside the managed Telnyx inference path. OpenRouter routing and the selected OpenAI provider add variable network and queue time. No public source gives the exact increment. Measure it.

## Voice handling and customization

### Twilio ConversationRelay

ConversationRelay opens a secure WebSocket to the application. It sends transcribed caller prompts. The application streams text tokens back for TTS. It supports a fixed `welcomeGreeting`, US English, DTMF detection, speech interruption, input during agent speech, and backchannel filtering. Source: [ConversationRelay TwiML reference](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay).

The greeting can be non-interruptible or interruptible by speech, DTMF, or either. This directly supports a fast opening such as:

> Hello, I am Ava from Brightview Dental. Am I speaking with Jordan?

Twilio exposes high, medium, and low interruption sensitivity. It also exposes speech timeout and dental vocabulary hints. These controls help with names, treatment terms, and noisy calls.

Twilio supports Deepgram and Google STT. It supports ElevenLabs, Google, and Amazon TTS. ElevenLabs Flash 2.5 is the default model. A team can select a voice ID and tune speed, stability, and similarity. Source: [ConversationRelay voice configuration](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration).

Google and Amazon support broad SSML. ElevenLabs supports the `phoneme` tag for US English in this interface. Source: [ConversationRelay WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages).

Current general documentation does not promise arbitrary custom voice cloning. Twilio has discussed bring-your-own TTS pilots. Do not make it a production requirement without written confirmation.

### Telnyx TeXML custom pipeline

TeXML `<Stream>` sends base64 RTP data over WebSocket. It supports inbound, outbound, or both tracks. Codecs include PCMU, PCMA, G722, OPUS, and AMR-WB. Bidirectional modes support MP3 and RTP. Source: [TeXML Stream reference](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/stream).

The lower-level media API supports bidirectional RTP and L16 audio. A `clear` command stops playback and clears queued audio. Mark events track playback position. DTMF events arrive over the WebSocket. Error frames expose media problems. Source: [Telnyx media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming).

This gives the team full control of endpointing, echo behavior, chunk size, speech provider, voice model, pronunciation, and barge-in. It also makes the team responsible for every failure state.

TeXML `<Gather>` can collect speech, DTMF, or both. It supports partial callbacks and speech hints. Source: [TeXML Gather reference](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/gather).

### Telnyx AI Assistant

The managed assistant supports a fixed greeting or model-generated greeting. It supports speech plans, background audio, noise suppression, and several STT and TTS providers. Source: [Telnyx no-code Voice Assistant guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant).

Deepgram Flux is the documented English turn-taking choice. Keyterm boosts can improve dental words and patient names. Start-speaking and eager end-of-turn settings change the speed-versus-false-start tradeoff. Source: [Telnyx transcription settings](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings).

Telnyx Voice Design can create a voice from a text description. Voice Clone accepts reference audio. Saved custom voices work with AI Assistants and other Telnyx voice products. Sources: [Telnyx Voice Design Lab](https://telnyx.com/products/voice-design-lab) and [custom voice usage](https://developers.telnyx.com/docs/voice/voice-design-lab/using-custom-voices).

## Custom LLM and agent logic

### Twilio ConversationRelay

The application owns the LLM loop. Twilio sends prompts through WebSocket. The application can use AI SDK, OpenRouter, Luna, its own memory, and any tool router. It streams text tokens back. Source: [ConversationRelay WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages).

This design has high model portability. It also makes the application responsible for conversation state, tool retries, safety rules, and partial-output handling.

### Telnyx TeXML custom pipeline

The application owns the full agent and audio loop. It can use any model or provider. This is the least locked-in model layer. It creates the most code and the broadest test surface.

### Telnyx AI Assistant

Telnyx accepts an external OpenAI-compatible LLM endpoint. Its docs name Azure, Bedrock, Baseten, and any compatible public endpoint. This makes OpenRouter plausible. Confirm streaming and metadata behavior in a prototype. Source: [Telnyx custom LLM guide](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm).

The `forward_metadata` setting is false by default. Enable it when the external agent needs patient or call variables. Source: [Telnyx custom LLM guide](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm).

The Assistant API supports external LLM configuration, fallback configuration, tools, MCP servers, greetings, speech settings, and telephony settings. Source: [Telnyx Create Assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant).

Telnyx added GPT-5.6 Luna as a native managed Assistant model on 6 August 2026. It needs no separate OpenAI key. Use an external endpoint only when Brightview must keep exact AI SDK logic. Telnyx still owns turn-taking, speech, tool invocation flow, and session orchestration. Sources: [Telnyx managed Luna release note](https://telnyx.com/release-notes/glm-5-2-gpt-5-6-luna-sol-voice-ai-assistants) and [Telnyx custom LLM guide](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm).

## Scheduling, CRM, EHR, and calendar integration

All three options can call the same scheduling service. The key difference is who manages tool execution.

| Need | Twilio ConversationRelay | TeXML custom | Telnyx AI Assistant |
|---|---|---|---|
| Patient lookup | Application tool | Application tool | Webhook or MCP tool |
| Find appointment slots | Application tool | Application tool | Webhook tool |
| Hold and book slot | Application transaction | Application transaction | Webhook tool with explicit result |
| Send confirmation | Twilio SMS or another provider | Telnyx SMS or another provider | Telnyx messaging tool or webhook |
| Human transfer | Twilio Voice | PSTN, SIP, or REFER | PSTN transfer, handoff, or SIP REFER tool |
| Slow backend | Application must fill time | Application must fill time | Async tools can let speech continue |

Telnyx managed tools include webhook, hang up, AI handoff, transfer, SIP REFER, and Send DTMF. Source: [Telnyx Assistant workflows](https://developers.telnyx.com/docs/inference/ai-assistants/workflows).

Async webhooks let the assistant continue while a backend runs. The Add Messages API can inject the result later. This can help slow EHR and scheduling systems. Source: [Telnyx async tools](https://developers.telnyx.com/docs/inference/ai-assistants/async-tools).

Telnyx lists native integrations such as Salesforce, ServiceNow, Jira, HubSpot, Zendesk, and Intercom. Its public catalog does not list a dental EHR or practice-management connector. Use vendor APIs, webhooks, or MCP. Source: [Telnyx Assistant integrations](https://developers.telnyx.com/docs/inference/ai-assistants/integrations).

Do not let any voice platform directly write an appointment without application checks. The scheduling service should enforce slot holds, idempotency, office hours, provider rules, patient identity rules, and audit logs.

## SIP, transfer, and DTMF

| Capability | Twilio ConversationRelay | TeXML custom | Telnyx AI Assistant |
|---|---|---|---|
| SIP connection | Twilio SIP Interface | TeXML `<Dial>` to SIP | Managed SIP telephony |
| SIP REFER | Twilio Voice supports it | TeXML `<Refer>` | Built-in SIP REFER tool |
| PSTN transfer | Twilio Voice call control | TeXML `<Dial>` | Built-in transfer tool |
| DTMF from caller | ConversationRelay DTMF message | `<Gather>` or media event | Managed runtime |
| Send DTMF to downstream IVR | Application call control | Media or call control | Built-in Send DTMF tool |

Sources: [Twilio SIP Interface](https://www.twilio.com/docs/voice/api/sip-interface), [TeXML Dial](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/dial), [TeXML Refer](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/refer), and [Telnyx Assistant workflows](https://developers.telnyx.com/docs/inference/ai-assistants/workflows).

## Developer experience

### Twilio ConversationRelay

ConversationRelay has a small and clear application contract. The application receives prompts and sends text tokens. The team does not manage raw audio. It still owns the full agent loop.

Strengths:

- Direct WebSocket contract.
- Static greeting and managed barge-in.
- Token streaming.
- Useful latency breakdown in Voice Insights.
- Mature Twilio call control and ecosystem.

Costs:

- More application logic than Telnyx Assistant.
- WebSocket lifecycle is a production dependency.
- Voice and STT choices stay inside the supported list.
- Highest public variable cost in this model.

### Telnyx TeXML custom pipeline

TeXML is familiar to teams that know TwiML. Telnyx documents a compatibility path. The compatibility table still lists unsupported differences. Source: [Telnyx TwiML compatibility](https://developers.telnyx.com/docs/voice/programmable-voice/twiml-compatibility).

Strengths:

- Full media, provider, model, and buffering control.
- Low public component prices.
- WebSocket reconnection defaults to enabled.
- Strong portability at the agent layer.

Costs:

- Team must build endpointing, interruption state, audio queues, token buffering, retries, and observability.
- More race conditions during barge-in and transfer.
- More vendors and credentials in the hot path.
- Harder load tests and incident diagnosis.

### Telnyx AI Assistant

Telnyx says a portal assistant can be created in under five minutes. This is a setup claim, not a production-readiness claim. Source: [Telnyx no-code Voice Assistant guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant).

Strengths:

- Smallest voice-runtime code surface.
- Managed speaking plans, interruption, tools, and speech.
- Visual workflows and reusable tools.
- Assistant version testing and traffic distribution.
- Langfuse traces can show LLM, tool, token, latency, and cost events.

Sources: [Telnyx version testing](https://developers.telnyx.com/docs/inference/ai-assistants/version-testing-traffic-distribution) and [Telnyx agent observability](https://developers.telnyx.com/docs/inference/ai-assistants/agent-observability).

Costs:

- Most control stays in Telnyx-specific configuration.
- Debugging can cross a managed boundary.
- External LLM behavior must match Telnyx's compatibility contract.
- Migration needs a rewrite of workflows and speaking settings.

## Reliability, support, limits, and failure handling

### Twilio

Twilio supports a Voice Fallback URL when the primary voice handler fails. Its guidance recommends another region, another provider, a fixed message, or a human route. Sources: [Twilio availability and reliability](https://www.twilio.com/docs/usage/security/availability-reliability) and [Twilio Voice failover practices](https://www.twilio.com/docs/voice/twilio-voice-failover-best-practices).

ConversationRelay emits errors for STT, TTS, malformed messages, maximum duration, RTP timeout, and WebSocket termination. Ten malformed WebSocket messages can close a session. Source: [ConversationRelay WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages).

An unexpected application WebSocket failure can end the AI session. The fallback call path should offer a human queue, voicemail, callback, or fixed office-hours message.

Twilio's API SLA uses a 99.95% threshold. Enterprise Edition uses 99.99%. Exclusions apply. This does not prove that every speech provider has the same coverage. Source: [Twilio API SLA](https://www.twilio.com/en-us/legal/service-level-agreement/twilio-apis).

Twilio support plans list:

- Developer: free, with no guaranteed response time.
- Production: $250 minimum or 4% of monthly spend.
- Business: $1,500 minimum or 6% of monthly spend.
- Personalized: $5,000 minimum or 8% of monthly spend.

Source: [Twilio support plans](https://www.twilio.com/en-us/support-plans).

Twilio documents a four-hour maximum call duration. This is not material for dental reception. Account concurrency limits can still matter during outages or campaigns. Source: [Twilio Voice limits](https://www.twilio.com/docs/voice/limitations-and-edge-cases).

### Telnyx TeXML

TeXML applications support a primary webhook URL and a fallback URL. The media stream supports status callbacks and automatic WebSocket reconnect by default. Sources: [TeXML fundamentals](https://developers.telnyx.com/docs/voice/programmable-voice/texml-fundamentals) and [TeXML Stream](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/stream).

Automatic reconnect is useful. It does not restore application conversation state by itself. The team must define replay, duplicated audio, stale tool result, and transfer behavior.

### Telnyx AI Assistant

The Assistant API exposes fallback configuration. Managed tools and traces reduce custom failure code. The team still needs safe behavior for failed EHR tools, OpenRouter outages, patient mismatch, and no available slots. Source: [Telnyx Create Assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant).

The pay-as-you-go page lists 500 concurrent calls and community support. Telnyx's general pricing page advertises in-house 24/7 chat and call support. Public wording is not enough to define incident entitlement. Confirm the contract before launch. Sources: [Telnyx Voice AI pricing](https://telnyx.com/pricing/voice-ai-agents) and [Telnyx general pricing](https://telnyx.com/pricing).

Telnyx marketing pages claim 99.999% availability for parts of its voice network. Do not apply this figure to the complete AI Assistant, model, or tool chain without a contract. Source: [Telnyx inbound SIP overview](https://telnyx.com/resources/inbound-sip-trunks).

### Required dental failure paths

Each option needs these deterministic paths:

1. Send the fixed greeting without waiting for the LLM.
2. If the patient lookup fails, ask for a callback number.
3. If scheduling times out, offer a human transfer or callback.
4. If booking status is uncertain, never claim success.
5. If the LLM or speech path fails, play a fixed apology.
6. If transfer fails, return to the assistant or voicemail.
7. If the call drops, preserve a resumable task with minimal PHI.

## Lock-in and change cost

| Area | Twilio ConversationRelay | TeXML custom | Telnyx AI Assistant |
|---|---|---|---|
| LLM prompt and tools | Portable application code | Portable application code | Partly portable; workflow bindings are Telnyx-specific |
| Audio runtime | Twilio-specific | Team-owned | Telnyx-specific |
| Voice configuration | Provider list inside Twilio | Team-owned | Telnyx voice objects and settings |
| Telephony markup | TwiML | TeXML, similar to TwiML | Assistant and telephony configuration |
| Observability | Twilio Insights plus app traces | Team-owned | Telnyx and Langfuse integrations |
| Migration effort | Medium | Lowest platform lock-in, highest maintenance | Highest managed-platform lock-in |

TeXML has the least vendor lock-in in code. It can still create operational lock-in through custom complexity. Managed Assistant has the most feature lock-in. It can reduce near-term delivery risk.

## Decision matrix

The weights below are an opinion for a US dental receptionist. They favor completed and correct bookings over the lowest unit cost.

| Criterion | Weight | Twilio Relay | TeXML custom | Telnyx Assistant |
|---|---:|---:|---:|---:|
| Conversation quality and latency | 25% | 8 | 6 | 9 |
| Scheduling and integration control | 20% | 8 | 9 | 8 |
| Delivery speed and developer burden | 20% | 7 | 3 | 10 |
| Reliability and failure recovery | 15% | 8 | 5 | 8 |
| Recurring cost | 10% | 5 | 10 | 8 |
| Voice control | 5% | 7 | 10 | 10 |
| Portability | 5% | 8 | 9 | 5 |
| **Weighted score** | **100%** | **7.45** | **6.60** | **8.60** |

The scores are not measured facts. Change the weights and scores after the pilot. Close results need more evidence.

## Scenario recommendations

### Default pilot

Choose **Telnyx AI Assistant with a Telnyx-managed model**. Use a static greeting. Connect scheduling with a webhook. This path gives the fastest route to real call data.

### Standardize on GPT-5.6 Luna

Choose **Telnyx AI Assistant with native managed GPT-5.6 Luna**. It has the smallest delivery burden and avoids an OpenRouter hop.

Use an external endpoint only when the exact AI SDK tool loop is mandatory. Confirm metadata, streaming, and fallback behavior in that case.

### Existing Twilio estate

Choose **Twilio ConversationRelay with Luna** when the team already uses Twilio numbers, call flows, support, and observability. It gives direct agent control without raw audio work.

### Maximum control or high scale

Choose **Telnyx TeXML custom media** only when the team accepts voice-infrastructure ownership. It has the lowest estimated variable cost. It also has the highest chance of hidden engineering cost.

### Strong voice-brand requirement

Test **Telnyx AI Assistant or TeXML** first. Telnyx documents Voice Design and voice cloning. Confirm consent, rights, safety, and pronunciation before using a cloned voice.

## Proof-of-concept test plan

Use at least 200 comparable calls per option. Include live staff test calls and consented production shadow traffic where lawful.

Measure:

- Phone-to-first-audio p50, p95, and p99.
- Turn-response p50 and p95 after the caller stops.
- False interruption rate.
- Missed interruption rate.
- Name, phone, date, and dental-term transcription errors.
- Appointment completion rate.
- Double-booking and uncertain-booking rate.
- Tool p50, p95, timeout, and retry rates.
- Human transfer completion rate.
- Call abandonment rate.
- Total vendor cost per completed booking.

Test these conditions:

- Quiet office and noisy car.
- Mobile and landline.
- Slow speech, fast speech, accent variation, and backchannels.
- Caller changes a date after the assistant starts speaking.
- No available appointment.
- Duplicate patient names.
- EHR timeout after a slot hold.
- OpenRouter or model failure.
- WebSocket interruption.
- Human transfer failure.

Use the same script and tools for all options. Keep static greeting audio equivalent. Record benchmark boundaries and confidence labels.

## How to present the final comparison

The final HTML should use progressive disclosure:

1. Show a 30-second verdict and scenario recommendations.
2. Show one consistent comparison table.
3. Show the four usage bands and cost calculator.
4. Explain latency and ownership boundaries.
5. Add voice, integration, reliability, and lock-in detail.
6. Put formulas, assumptions, and sources in expandable sections.

Nielsen Norman Group recommends showing important options first and advanced detail later. Source: [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

NN/g also recommends stating meaningful differences directly. Put decision-critical differences first. Source: [NN/g explicit differences between options](https://www.nngroup.com/articles/explicit-differences/).

Comparison tables work best when they use consistent rows, short cells, and common attributes. Source: [NN/g compensatory and noncompensatory decisions](https://www.nngroup.com/articles/compensatory-noncompensatory-decisions/).

AWS Decision Guides compare services by criteria and use case. Source: [AWS Decision Guides](https://docs.aws.amazon.com/decision-guides/latest/decision-guides).

GOV.UK recommends evaluating total ownership cost, ability to change, integration constraints, user needs, and lock-in. It also recommends prototypes when uncertainty is high. Sources: [GOV.UK choose the right tools and technology](https://www.gov.uk/service-manual/service-standard/point-11-choose-the-right-tools-and-technology) and [GOV.UK choosing technology](https://www.gov.uk/service-manual/technology/choosing-technology-an-introduction).

ASQ describes a weighted decision matrix as criteria, weights, and option scores. Always show raw evidence before the score. Source: [ASQ decision matrix](https://asq.org/quality-resources/decision-matrix).

An architecture decision record should state context, alternatives, pros, cons, rationale, and consequences. Source: [Martin Fowler on Architecture Decision Records](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html).

NASA trade-study guidance adds constraints, measures, source data, uncertainty, sensitivity, and selection rules. Source: [NASA Systems Engineering Handbook appendix](https://www.nasa.gov/reference/system-engineering-handbook-appendix/).

### Recommended UI confidence labels

Use visible badges or text labels:

- Official price.
- Official capability.
- Vendor benchmark.
- Derived estimate.
- Planning assumption.
- Unknown; test required.

Do not hide uncertainty in a footnote. Put it next to the number or claim.

## Final source list

The main sources appear next to each claim. The most important sources are:

- [Twilio ConversationRelay reference](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
- [Twilio ConversationRelay WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages)
- [Twilio US Voice pricing](https://www.twilio.com/en-us/voice/pricing/us)
- [Twilio ConversationRelay latency insights](https://www.twilio.com/docs/voice/voice-insights/conversation-relay-summary)
- [Telnyx Voice API pricing](https://telnyx.com/pricing/voice-api)
- [Telnyx Voice AI Agent pricing](https://telnyx.com/pricing/voice-ai-agents)
- [Telnyx TeXML Stream](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/stream)
- [Telnyx media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming)
- [Telnyx Voice Assistant quickstart](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)
- [Telnyx custom LLM guide](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm)
- [OpenAI GPT-5.6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenRouter FAQ](https://openrouter.ai/docs/faq)
