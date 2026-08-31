# Telnyx voice models and platform comparison

Research date: 2026-08-30  
Source policy: Official Telnyx, OpenAI, and OpenRouter sources only.

Target comparison: Custom TeXML raw-media pipeline versus Telnyx AI Assistant.

## Executive answer

The proposed option names mix three layers.

- **Telnyx Ultra** is a text-to-speech model family.
- **OpenAI GPT-5.6 Luna** is a text LLM. It is not STT or TTS.
- **TeXML** is an XML call-control language. It is not an AI runtime.
- **Telnyx AI Assistant** is a managed voice-agent runtime.

OpenAI states that `gpt-5.6-luna` accepts text and images. It does not accept or emit audio. Telnyx exposes it to Assistants as `openai/gpt-5.6-luna`.

The correct comparison is:

```text
Custom stack
PSTN -> TeXML <Stream> -> team WebSocket -> STT -> GPT-5.6 Luna
     -> team tool loop -> Ultra TTS -> team playback buffer -> caller

Managed stack
PSTN -> TeXML/Voice API -> Telnyx AI Assistant -> configured STT
     -> managed openai/gpt-5.6-luna -> managed tools -> configured Ultra -> caller
```

Both stacks can use Luna and Ultra. The main difference is runtime ownership.

The custom stack has the lower estimated metered price. It also has much more work. The Assistant has the lower delivery and operations burden. It is the better default for a small dental team.

“Native Luna” needs careful wording. Telnyx manages Luna access. No separate OpenAI key is needed. The cited Telnyx release does not say that Telnyx hosts Luna on its own GPUs. Call it **Telnyx-managed Luna**, not a Telnyx-native speech model.

## Terms and layer boundaries

| Term | Layer | What it does | What it does not do |
|---|---|---|---|
| TeXML | Call control | Gives Telnyx XML instructions for a call | It does not transcribe, reason, or synthesize speech |
| `<Stream>` | Media transport | Sends near-real-time call audio over WebSocket | It does not supply an STT, LLM, or agent loop |
| Ultra | TTS | Converts response text to speech | It does not transcribe callers or choose actions |
| STT model | Speech recognition | Converts caller audio to text | It does not generate the answer |
| GPT-5.6 Luna | LLM | Generates text and tool calls | It does not accept or generate audio |
| Telnyx AI Assistant | Managed orchestration | Connects telephony, STT, turn-taking, LLM, tools, TTS, and logs | It does not remove the need for safe booking APIs |

TeXML can also start a managed Assistant with `<Connect><AIAssistant>`. Thus, “TeXML versus Assistant” is not a strict product boundary. This report uses “TeXML custom” to mean raw `<Stream>` media and a team-owned runtime.

## TTS catalog

### Catalog rule

Telnyx has several live documentation surfaces. They do not show the same catalog. The REST model page is the best current static list. The product page includes more legacy and partner families.

The complete voice list is account-dependent. Query this authenticated endpoint before release:

```http
GET /v2/text-to-speech/voices
```

The response supplies `provider`, `name`, `voice_id`, `language`, and `gender`. Some providers need customer credentials. A static page cannot safely list every AWS, Azure, ElevenLabs, or organization-cloned voice.

### Telnyx-branded families

| Family | Exact identifier | Delivery | Language and position | Voice source and controls | Public price |
|---|---|---|---|---|---:|
| Natural | `Telnyx.Natural.<voice>` | In-call, REST, WebSocket on current product/API surfaces | Product page calls it native; no current per-family language table | Prebuilt; example `abbie` | Telnyx TTS: $0.000003/character on detailed page |
| NaturalHD | `Telnyx.NaturalHD.<voice>` | In-call, REST, WebSocket | Other live docs list English, French, German, Spanish, Arabic, Hindi, Japanese, Hebrew, Portuguese | Prebuilt; examples `astra`, `andersen_johan`; Arabic `haqq`, `qadir`, `layla`, `shams`, `sakina` | $0.000048/character |
| KokoroTTS | `Telnyx.KokoroTTS.<voice>` | REST and public WebSocket | Lowest latency, good quality; `en`, `es`, `fr`, `it`, `pt` | Prebuilt; fixed settings; examples `af_heart`, `am_adam`, `bf_emma` | No family-specific row found |
| Qwen3TTS | `Telnyx.Qwen3TTS.<clone_name>` | REST and public WebSocket | Medium latency, high quality; `en`, `zh`, `fr`, `de`, `it`, `ja`, `ko`, `pt`, `ru`, `es`, `ar` | Organization clone; language boost and x-vector; examples `Delta`, `Whiskey` | $0.000032/character |
| Ultra | `Telnyx.Ultra.<voice>` | REST and in-call; no public TTS WebSocket | Lowest latency and highest quality in native table; claimed sub-100ms | Prebuilt plus clone flow; speed, volume, language hint, emotions, laughter; examples `Asher`, `Callie`, `Clara` | $0.000032/character |
| Bayan | `Telnyx.Bayan.<speaker>` | REST and public WebSocket | Low latency, good quality; MSA, 12 Arabic regional dialects, English; 113 speakers | Prebuilt; examples `Ahmed`, `Alia`, `Lana`, `Hind`; fixed 16 kHz | No public row found |
| Sukhan | `Telnyx.Sukhan.<voice_id>` | REST and public WebSocket | Low latency, good quality; Urdu; 14 voices | Prebuilt; examples `urdu-professor`, `news-reader`, `sindhi-networker`, `podcast-host`; no prosody controls | No public row found |

Ultra lists 36 `language_boost` values:

`Arabic`, `Bengali`, `Bulgarian`, `Chinese`, `Czech`, `Danish`, `Dutch`, `English`, `Finnish`, `French`, `German`, `Gujarati`, `Hebrew`, `Hindi`, `Indonesian`, `Italian`, `Japanese`, `Korean`, `Malay`, `Marathi`, `Maori`, `Norwegian`, `Polish`, `Portuguese`, `Punjabi`, `Romanian`, `Russian`, `Slovak`, `Spanish`, `Swedish`, `Tamil`, `Telugu`, `Thai`, `Turkish`, `Ukrainian`, and `Vietnamese`.

Ultra documentation conflicts with itself. The page title and native table claim 44 languages. Its body says 36 and names 36. A March 2026 release claims 42. The explicit list is the safest integration input.

### Partner and relayed TTS families

| Provider/family | Exact model or voice form | Language and position | Voice source and customization | Public Telnyx price |
|---|---|---|---|---:|
| xAI Grok TTS | `xAI.<voice_id>` | 20+ languages; auto-detect; higher latency than Ultra | `ara`, `eve`, `leo`, `rex`, `sal`; expressive tags | No public row found |
| AWS Polly | `aws.Polly.<Engine>.<VoiceId>` | AWS catalog | `standard`, `neural`, `generative`, `long-form`; SSML | Standard $0.000009/char; Neural $0.000024/char |
| Azure Speech | `azure.<VoiceId>` | Azure locale catalog | Neural voices; SSML and effects; examples `en-US-AvaMultilingualNeural`, `en-US-AndrewMultilingualNeural` | Azure Neural HD is BYO and Azure-billed |
| ElevenLabs | `elevenlabs.<Model>.<VoiceId>` | ElevenLabs account catalog | `v2`, `v3`, `MultiPL.v2`; prebuilt, cloned, or designed; BYO key | BYO; ElevenLabs bills it |
| MiniMax | `Minimax.<Model>.<VoiceId>` | Multilingual | `speech-02-turbo`, `speech-02-hd`, `speech-2.6-turbo`, `speech-2.8-turbo`; system or organization clone | `speech-2.8-turbo`: $0.000034/char |
| Resemble | `Resemble.Turbo.<VoiceId>` | Language follows customer voice | Customer Resemble voice; examples `Aaron_en-US`, `Amelia_en-US` | $0.000008/char |
| Inworld | `Inworld.<Model>.<VoiceId>` | Inworld catalog | `inworld-tts-1.5-mini` faster; `inworld-tts-1.5-max` quality; `inworld-tts-2` newest; aliases `Mini`, `Max`, `TTS2` | Mini $0.0000055/char; Max $0.000010/char |
| Fish Audio | `FishAudio.<Model>.<VoiceId>` | Cross-lingual; release claims 80+ languages | `s2.1-pro` latest/default, `s2-pro`, `s1`; ten curated voices only | No public row found |
| Rime Arcana | `Rime.ArcanaV3.<VoiceId>` | Arabic, English, French, German, Hebrew, Hindi, Japanese, Portuguese, Spanish, Tamil | Prebuilt; code switching; example `astra` | $0.000020/char |
| Rime Coda | Public request identifier not documented | Release claims eight languages | Release claims 184 Rime and 52 Telnyx-specific voices | No separate row found |
| MurfAI Falcon | Model and voice form not documented on a current provider page | Product page lists MurfAI | Pitch, rate, format, sample rate | $0.000008/char |
| HUMAIN | `Humain.<VoiceId>` in current `speak` reference | Saudi Arabic and English | `sara-en`, `abdulaziz-en`, `sara-ar`, `abdulaziz-ar`, `nourah-ar`, `abdullah-ar` | No public row found |

Fish Audio publishes these ten allowed IDs:

| Voice | Exact ID | Voice | Exact ID |
|---|---|---|---|
| Aria | `933563129e564b19a115bedd57b7406a` | Nova | `b545c585f631496c914815291da4e893` |
| Paula | `c2623f0c075b4492ac367989aee1576f` | Claire | `5567200c7d8341738f0892bbacd3be3c` |
| Yuki | `5161d41404314212af1254556477c17d` | Ethan | `536d3a5e000945adb7038665781a4aca` |
| Atlas | `c5f56a6cc2ec4fa8920cb4c5889a3fb7` | Max | `802e3bc2b27e49c2995d23ef70e6ac89` |
| Adrian | `bf322df2096a46f18c579d0baa36f41d` | Mateo | `35199d5438854f5d9157c500479ab684` |

### Voice creation

| Family | Custom source | Official input rule | Main controls |
|---|---|---|---|
| Ultra | Voice Design clone flow | Up to 10 seconds; async `202`; provider voice ID returned | Speed, volume, language boost, emotion, sample rate |
| Qwen3TTS | Organization clone | 3 to 15 seconds; trims to 10; sync `201` | Language boost, forced x-vector |
| MiniMax | Organization clone | 10 seconds to 5 minutes; sync `201` | Speed, volume, pitch, language boost |
| ElevenLabs | Customer account | Prebuilt, cloned, or designed ElevenLabs voice | Stability, similarity, style, speaker boost |
| Resemble | Customer account | Customer Resemble voice | Format, precision, sample rate |
| Kokoro, Bayan, Sukhan | No documented clone flow | Use prebuilt voices | Fixed or limited settings |

### Catalog conflicts

These conflicts were live on the research date.

1. The TTS product page says both 1,300+ and 3,900+ voices.
2. Ultra claims 36, 42, and 44 languages on different Telnyx pages.
3. One Qwen summary lists ten languages. Its provider page lists 11 and adds Arabic.
4. The current native index omits Natural and NaturalHD. Other current pages still use and price them.
5. The REST model page omits Rime and MurfAI. Product and price pages include them.
6. The Voices API provider enum omits some newer families shown by other APIs.
7. The TeXML `<Say>` reference has a narrower legacy list.
8. Product and reference pages use both `/v2/text-to-speech` and `/v2/text-to-speech/speech`.
9. The detailed page lists base TTS at $0.000003/character. A concise machine-readable table was observed at $0.000006/character.

Do not hard-code a marketing voice count. Query the Voices API with the production project. Confirm the identifier, channel, region, credentials, and price.

## STT choices

Luna is absent from both STT lists. This supports the direct OpenAI evidence that Luna is not a speech model.

### AI Assistant STT models

| Exact model | Provider | Official language or position |
|---|---|---|
| `deepgram/flux` | Deepgram | Turn-taking; `en`, `es`, `fr`, `de`, `hi`, `ru`, `pt`, `ja`, `it`, `nl`; `auto`, `multi` |
| `deepgram/nova-3` | Deepgram | Fast multilingual; recommended for multilingual Assistants |
| `deepgram/nova-2` | Deepgram | Previous-generation multilingual |
| `azure/fast` | Azure | Fast multilingual; locale and region settings |
| `assemblyai/universal-streaming` | AssemblyAI | 18 languages; turn detection; Universal-3.5 Pro Realtime |
| `xai/grok-stt` | xAI | Multilingual; auto mode |
| `nvidia/parakeet-v3` | NVIDIA model hosted by Telnyx | Automatic multilingual; underlying `nvidia/parakeet-tdt-0.6b-v3`; 25 European languages in release |
| `cohere/ar-stt` | Cohere model hosted by Telnyx | Arabic or English; no auto mode |
| `reson8/turns` | Reson8 | Ten European languages; turn-based; auto mode |

### Broader programmable voice STT

Voice API and TeXML also document Google, Telnyx, Speechmatics Standard, and Soniox. Exact newer IDs include:

- `xai/grok-stt`
- `assemblyai/universal-streaming`
- `speechmatics/standard`
- `soniox/stt-rt-v4`
- `nvidia/parakeet-v3`
- `cohere/ar-stt`
- `reson8/turns`

The file endpoint documents `distil-whisper/distil-large-v2`, `openai/whisper-large-v3-turbo`, and `deepgram/nova-3`. It is not the normal live-call path.

### Published direct STT prices

| Engine/model group | Price/minute |
|---|---:|
| Telnyx | $0.0150 |
| Deepgram Nova 2, Nova 3, Flux | $0.0074 |
| Google | $0.0170 |
| Azure | $0.0270 |
| AssemblyAI | $0.0070 |
| xAI Grok STT | $0.0033 |
| NVIDIA Parakeet | $0.0015 |
| Soniox | $0.0020 |
| Speechmatics | $0.0035 |
| HUMAIN | $0.0070 |
| Basira | $0.0070 |
| Cohere Arabic STT | $0.0015 |

The Assistant engine includes hosted STT. These rates apply to direct programmable voice use.

## Architecture comparison

| Layer | TeXML + raw stream + Ultra + Luna | AI Assistant + managed Luna |
|---|---|---|
| Call entry | TeXML app returns XML | Voice API start or TeXML `<AIAssistant>` |
| Call control | Team designs verbs and webhooks | Assistant owns the conversation; call commands remain around it |
| Media | `<Stream>` sends base64 RTP to team WebSocket | Telnyx keeps media in the managed path |
| Codecs | PCMU, PCMA, G722, OPUS, AMR-WB; bidirectional MP3 or RTP | Assistant abstracts codec handling |
| STT | Team selects, pays, connects, monitors | Select Assistant STT; included in engine minute |
| End of turn | Team implements VAD/EOT | Telnyx manages it; provider settings remain |
| LLM | Team calls Luna or OpenRouter | Select `openai/gpt-5.6-luna` |
| State | Team stores transcript, tool state, summaries | Assistant stores conversation state |
| Tools | Team builds schemas, loop, retries, cancellation, result injection | Webhook, built-in, MCP, sync, async tools |
| TTS | Team calls Ultra REST and injects audio | Select Ultra; included in engine minute |
| Playback | Team queues chunks and handles `clear`, `mark` | Telnyx manages playback and barge-in |
| Interruption | Team cancels Luna/TTS and clears audio | Managed interruption settings |
| Observability | Stream callbacks plus team traces | Conversation history, transcripts, logs, insights, tests, versions |
| Fallback | Team builds provider and state fallback | LLM fallback config; team still handles tool fallback |
| Portability | High | Lower due to Assistant schemas |

The `<Stream>` verb supports inbound, outbound, or both tracks. Bidirectional streams can send MP3 or RTP back. The media protocol also has `clear`, `mark`, and DTMF. These are runtime primitives. They are not a complete agent.

## Luna facts

| Item | Direct/custom | Assistant |
|---|---|---|
| Model ID | `gpt-5.6-luna` | `openai/gpt-5.6-luna` |
| Modality | Text in/out; image in; no audio | Same LLM inside a speech pipeline |
| Tool support | Function calling | Assistant maps tools into the loop |
| Context | 1,050,000 tokens | Same model, subject to runtime limits |
| Maximum output | 128,000 tokens | Same model; voice turns should be short |
| Input price | $0.20/M tokens | $0.0002/1K tokens |
| Cached input | $0.02/M tokens | $0.00002/1K tokens |
| Output price | $1.20/M tokens | $0.0012/1K tokens |
| Credentials | Team supplies OpenAI/OpenRouter | No separate model key or contract |
| Hosting claim | Provider path | Telnyx manages access; Telnyx GPU hosting is not stated |

## Price comparison

Public units:

- Voice API or TeXML platform: $0.0020/minute.
- US inbound SIP: from $0.0032/minute.
- Media WebSocket: $0.0035/minute.
- Deepgram Nova/Flux STT: $0.0074/minute.
- Ultra: $0.000032/character.
- AI Assistant engine: $0.0500/minute.
- Luna: $0.20/M input and $1.20/M output tokens.

The Assistant engine includes orchestration, turns, interruption, tools, knowledge retrieval, hosted STT, and hosted TTS. Telephony and LLM tokens are extra.

Use 6,000 uncached input tokens, 500 output tokens, and 450 TTS characters per call-minute.

```text
Luna direct
  input + output                                  $0.001800/min

Custom TeXML
  $0.0020 + $0.0032 + $0.0035 + $0.0074
  + (450 * $0.000032) + $0.0018                 $0.032300/min

Custom through OpenRouter
  Add its 5.5% credit fee to Luna inference       $0.032399/min

AI Assistant
  $0.0500 + $0.0032 + $0.0018                   $0.055000/min
```

OpenRouter says it adds no inference markup. It charges 5.5% when credits are bought, with an $0.80 minimum. BYOK has separate rules. Routing can prefer price, latency, or throughput. A failed first provider and fallback can add delay.

Custom TeXML saves about $0.0226 per call-minute before runtime costs. At 4,992 minutes per month, the difference is about $112.85. That amount alone does not fund a robust custom media runtime.

Confirm the exact Luna invoice rate with Telnyx. Public Telnyx and OpenAI token rows match on the research date.

## Latency

Use one test boundary:

```text
caller stops -> EOT -> final transcript -> Luna first token
             -> enough text -> Ultra first audio -> caller hears audio
```

Ultra's sub-100ms claim is a model claim. It is not phone-to-phone latency.

Telnyx publishes a vendor benchmark of about 450ms for a co-located pipeline and 1,210ms for a stitched pipeline. It does not test these exact Luna stacks. Treat it as guidance, not a forecast.

Telnyx says external LLMs can add latency. Its co-location advantage applies when the full pipeline stays on Telnyx. The Luna release does not state Luna's inference location. No official source proves an exact managed-Luna latency advantage over OpenRouter Luna.

Potential Assistant gains come from fewer hops, managed EOT, and integrated playback. Potential custom gains come from exact EOT, regional placement, speculative TTS, and provider pinning. Measure p50 and p95 on phone calls.

## Observability and failure modes

| Area | Custom TeXML | Assistant |
|---|---|---|
| Media disconnect | Reconnect can repeat or stale audio; team reconciles state | Managed media removes the app socket; Telnyx runtime is central |
| Barge-in | Cancel Luna, call `clear`, discard audio, ignore late chunks | Managed interruption can still fail on noise or EOT errors |
| Tools | Team owns timeout, retry, auth, idempotency | Sync blocks; async needs later message delivery; writes still need idempotency |
| Dynamic data | Team owns lookup timeout and fallback | Default webhook timeout is 1,500ms; Assistant proceeds with defaults |
| Model outage | Team builds fallback and preserves state | Assistant supports fallback config |
| Catalog drift | Team pins and tests IDs | Assistant voice settings can also drift |
| Tracing | Stream callbacks, marks, DTMF, and webhooks need a trace ID | Conversation ID, transcript, logs, timing, errors, insights |
| Sensitive data | Team controls storage and redaction | Dynamic-variable data can appear in logs; review PHI policy |
| Testing | Team builds replay, load, and call tests | Versions, traffic distribution, built-in tests, review |

Tool safety stays with the application in both designs. Validate appointment inputs. Use idempotency keys. Do not let retries create duplicate appointments.

## Migration

### Custom TeXML to Assistant

1. Keep the number and entry TeXML if desired.
2. Replace raw `<Stream>` with `<AIAssistant>` or `ai_assistant_start`.
3. Map the prompt and greeting.
4. Select `openai/gpt-5.6-luna`.
5. Select the same STT and Ultra voice.
6. Convert tools to webhook, built-in, or MCP tools.
7. Map clinic context to dynamic variables.
8. Remove custom VAD, STT, TTS, buffers, cancellation, and media recovery.
9. Keep booking auth, validation, and idempotency.
10. Rebuild dashboards with conversations, logs, and insights.
11. Test versions and traffic distribution before cutover.

The reverse move adds runtime work. Export prompts and tool contracts. Rebuild state, interruption, audio queues, fallbacks, and tracing. Do not assume managed runtime state exports.

Keep Luna, Ultra, and STT constant during a bake-off. This isolates orchestration from model quality.

## Recommendation

Use Telnyx AI Assistant with Telnyx-managed Luna for the first clinic pilot. Select Ultra after a phone test confirms quality and pronunciation.

Choose custom TeXML when raw audio control is required, Assistant tools cannot express the flow, measured latency favors custom, scale savings exceed ownership costs, or portability is mandatory.

Rename the option to **Telnyx Assistant + managed GPT-5.6 Luna**. Show its STT choice. Do not call Luna a voice or STT model.

## Claim-to-source map

All links were accessed on 2026-08-30.

| Claim | Official source |
|---|---|
| Luna provider, Assistant ID, managed access | [Telnyx Luna release](https://telnyx.com/release-notes/glm-5-2-gpt-5-6-luna-sol-voice-ai-assistants) |
| Luna modalities, context, tools, prices | [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| Static TTS families and identifier forms | [REST TTS models](https://developers.telnyx.com/docs/voice/tts/rest-api/parameters/models) |
| Native latency, quality, language, channels | [Native TTS provider](https://developers.telnyx.com/docs/voice/tts/providers/telnyx) |
| Account voice discovery | [Voices API](https://developers.telnyx.com/api-reference/text-to-speech-commands/list-available-voices) |
| Natural, NaturalHD, partner list, counts | [TTS product](https://telnyx.com/products/text-to-speech-api) |
| Natural and NaturalHD identifier examples and language scope | [Programmable Voice TTS](https://developers.telnyx.com/docs/voice/programmable-voice/tts) |
| Per-character prices | [TTS pricing](https://telnyx.com/pricing/text-to-speech) |
| Ultra IDs, controls, languages, latency | [Ultra](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/ultra) |
| Ultra 42-language release claim | [Ultra release](https://telnyx.com/release-notes/telnyx-ultra-text-to-speech-api) |
| Kokoro facts | [Kokoro](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/kokoro) |
| Qwen facts | [Qwen3TTS](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/qwen3) |
| Bayan facts | [Bayan](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/bayan) |
| Sukhan facts | [Sukhan](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/sukhan) |
| xAI TTS | [xAI provider](https://developers.telnyx.com/docs/voice/tts/providers/xai) |
| AWS | [AWS provider](https://developers.telnyx.com/docs/voice/tts/providers/aws) |
| Azure | [Azure provider](https://developers.telnyx.com/docs/voice/tts/providers/azure) |
| ElevenLabs | [ElevenLabs provider](https://developers.telnyx.com/docs/voice/tts/providers/elevenlabs) |
| MiniMax | [MiniMax provider](https://developers.telnyx.com/docs/voice/tts/providers/minimax) |
| Resemble | [Resemble provider](https://developers.telnyx.com/docs/voice/tts/providers/resemble) |
| Inworld | [Inworld provider](https://developers.telnyx.com/docs/voice/tts/providers/inworld) |
| Fish models and voice IDs | [Fish Audio provider](https://developers.telnyx.com/docs/voice/tts/providers/fishaudio) |
| Fish 80+ language claim | [Fish release](https://telnyx.com/release-notes/fish-audio-tts-voice-ai/) |
| Rime Coda counts and languages | [Rime Coda release](https://telnyx.com/release-notes/rime-coda-tts) |
| Clone rules and response | [Clone parameters](https://developers.telnyx.com/docs/voice/voice-design-lab/clone-voice/parameters), [clone responses](https://developers.telnyx.com/docs/voice/voice-design-lab/clone-voice/responses) |
| In-call IDs, including HUMAIN | [Speak command](https://developers.telnyx.com/api-reference/call-commands/speak-text) |
| TeXML role | [TeXML fundamentals](https://developers.telnyx.com/docs/voice/programmable-voice/texml-fundamentals) |
| Stream tracks, codecs, callbacks | [TeXML Stream](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/stream) |
| Media messages, clear, mark, DTMF | [Media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming) |
| TeXML starts an Assistant | [AI Assistant verb](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/aiassistant) |
| Managed Assistant voice flow | [Start Assistant](https://developers.telnyx.com/docs/voice/programmable-voice/ai-assistant-start) |
| Assistant config, fallback, observability | [Create Assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant) |
| Tools, transfer, DTMF, MCP, KB | [No-code Assistant](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant) |
| Sync and async tools | [Async tools](https://developers.telnyx.com/docs/inference/ai-assistants/async-tools) |
| Dynamic timeout, logs, PHI warning | [Dynamic variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables) |
| Versions and traffic tests | [Testing and versions](https://developers.telnyx.com/docs/inference/ai-assistants/version-testing-traffic-distribution) |
| Assistant STT models and languages | [Transcription settings](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings) |
| Programmable voice STT | [Voice and TeXML STT](https://developers.telnyx.com/docs/voice/programmable-voice/speech-to-text) |
| File STT models | [Transcribe audio API](https://developers.telnyx.com/api-reference/audio/transcribe-speech-to-text) |
| Parakeet model and hosting | [Parakeet release](https://telnyx.com/release-notes/nvidia-parakeet-stt-voice-ai) |
| Speechmatics ID and hosting | [Speechmatics release](https://telnyx.com/release-notes/speechmatics-stt-voice-api) |
| Voice, media, STT, TTS prices | [Voice API pricing](https://telnyx.com/pricing/voice-api) |
| Assistant scope, limits, prices | [Voice AI pricing](https://telnyx.com/pricing/voice-ai-agents) |
| OpenRouter fees | [OpenRouter FAQ](https://openrouter.ai/docs/faq) |
| OpenRouter routing | [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) |
| OpenRouter latency factors | [Latency guide](https://openrouter.ai/docs/features/latency-and-performance) |
| Vendor latency comparison | [Telnyx latency comparison](https://telnyx.com/resources/voice-ai-agents-compared-latency) |
| Co-location scope | [Low-latency voice AI](https://telnyx.com/resources/low-latency-voice-ai) |

## Evidence limits

No neutral public benchmark compares these two exact Luna stacks. No public source gives Assistant Luna's inference location. No static public page gives every account-eligible voice. Vendor latency numbers use vendor-selected conditions.

Run an account-level proof before release. Record the resolved voice ID, invoice unit, model route, region, p50, p95, transcription error rate, false interruption rate, and tool success rate.
