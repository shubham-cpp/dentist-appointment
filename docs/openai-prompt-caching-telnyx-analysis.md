# OpenAI Prompt Caching Through Telnyx AI Assistants

Date: 2026-08-26

## Executive conclusion

The 93% cache-hit value is probably already a good result. It likely means that
93% of selected input tokens came from prompt-cache reads. It does not mean that
93% of requests hit a cache. It also does not mean that OpenAI removed 93% of
the call latency.

The current managed Telnyx integration does not expose OpenAI prompt-cache
controls. The documented Telnyx Assistant API exposes the model, instructions,
tools, and OpenAI key reference. It does not expose `prompt_cache_key`,
`prompt_cache_options`, or `prompt_cache_breakpoint`. Telnyx therefore owns the
OpenAI request shape for this integration.

Raising the ratio from 93% to 98% is not a useful voice-latency goal by itself.
The missing five percentage points are input tokens, not end-to-end time. A
voice turn also includes end-of-turn detection, transcription, Telnyx
orchestration, model generation, text-to-speech, and carrier delivery.

Do not add a custom LLM proxy only to chase 98%. It adds a network hop and more
failure modes. First measure OpenAI time-to-first-token and the other voice
stages. Keep the current per-call tool token and privacy controls.

## What OpenAI caches

OpenAI caches the model's rendered prefix. This can include hidden OpenAI
instructions, developer messages, tool definitions, and conversation history.
Cache reuse requires an exact rendered prefix match through an eligible cache
breakpoint. A changed model, tool schema, tool order, reasoning effort, response
format, or earlier prompt content can stop reuse after the changed token.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

GPT-5.6 has these cache properties:

| Property | GPT-5.6 behavior |
| --- | --- |
| Minimum visible cacheable prefix | 1,024 input tokens |
| Implicit caching | Enabled by default |
| Explicit caching | Supported |
| Cache-read price | 0.1 times the uncached input rate |
| Cache-write price | 1.25 times the uncached input rate |
| Minimum lifetime | 30 minutes after the latest write or reuse |
| Supported `ttl` value | `30m` |
| Maximum writes per request | Four |

OpenAI can keep an entry longer than 30 minutes. It does not guarantee this.
Cache entries live on individual machines. Load-based routing can cause a miss.
A cache key improves routing but does not pin a request or guarantee a hit.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

The GPT-5.6 Luna model page confirms its cached-input rate and cache-write
charge. It also confirms support for both Responses and Chat Completions.
[OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

### Implicit mode

In implicit mode, OpenAI places a cache breakpoint after the latest eligible
message. This works well for an append-only conversation. Each turn can reuse
the earlier conversation and write the newly extended prefix.

Implicit mode can miss a useful shorter boundary. For example, one request can
write through a dynamic patient message. A later request with different patient
content cannot reuse that longer prefix. An explicit boundary after the stable
instructions would solve that case.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

### Explicit mode

For GPT-5.6, an application can set `prompt_cache_options.mode` to `explicit`.
It can then add `prompt_cache_breakpoint: { "mode": "explicit" }` to supported
content blocks. Content after the last selected breakpoint is normal uncached
input. It does not incur a cache-write charge.

Explicit mode helps when a request has a long stable prefix and a changing
suffix. It gives cost and prefix control. It does not make output generation
faster after input processing completes.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

One current documentation detail is inconsistent. The prompt-caching guide says
cache reads consider the latest 50 breakpoints. The Responses API reference says
80. This limit does not affect the present recommendation. OpenAI should clarify
the effective limit before an implementation depends on it.
[Prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching),
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

## OpenAI Responses API controls

An application that directly calls the Responses API can use these controls:

| Control or metric | Purpose |
| --- | --- |
| `prompt_cache_key` | Groups related traffic to improve cache routing |
| `prompt_cache_options.mode` | Selects implicit or explicit-only caching |
| `prompt_cache_options.ttl` | Sets the minimum cache lifetime; only `30m` is supported |
| `prompt_cache_breakpoint` | Marks a reusable boundary in a supported content block |
| `previous_response_id` | Continues a stored conversation without rebuilding state manually |
| `usage.input_tokens_details.cached_tokens` | Reports cache-read input tokens |
| `usage.input_tokens_details.cache_write_tokens` | Reports cache-write input tokens |

Applications should also keep tools, their order, prior messages, and request
settings stable. They should append turns instead of rewriting history. OpenAI
recommends comparing cached tokens, cache-write tokens, latency, and total cost.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching),
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

GPT-5.6 can preserve reasoning across turns. That can improve multi-turn quality
and cache efficiency. This is separate from setting a cache breakpoint.
[OpenAI GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)

## What the 93% value probably means

OpenAI defines token cache-hit rate as:

```text
token cache-hit rate = total cached input tokens / total input tokens
```

The prompt-caching guide tells developers to aggregate this ratio by a useful
scope. It also links the OpenAI Prompt Caching Dashboard for the same monitoring
task. Therefore, 93% probably means 93% of input tokens in the dashboard's
selected time and filters were cache reads.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

This interpretation is probable, not fully confirmed. The public dashboard page
does not publish its aggregation contract. Check its selected project, API key,
model, and date filters. Other OpenAI traffic can affect the ratio.

The metric does not show these items:

| It does not show | Reason |
| --- | --- |
| Percentage of requests with a hit | It is a token ratio |
| Percentage of latency removed | Cache tokens cover input processing only |
| Time-to-first-token | The dashboard ratio has no duration unit |
| Voice end-to-end latency | STT, turn detection, TTS, and telephony remain |
| Output-token generation speed | OpenAI still generates a new response |

## Is 98% meaningful or attainable?

It is mathematically attainable for some traffic. The aggregate uncached and
newly written input must stay at or below 2%. Long conversations with large,
stable histories can approach this ratio.

It is not a sound universal target for this application:

1. The first request for a new cache entry must write the prefix.
2. Every turn adds new speech, model output, tool calls, and tool results.
3. A short call gives new tokens a larger share of total input.
4. Cache entries can expire or miss because of routing.
5. Each call has dynamic patient and security values.

Adding useless stable text can raise the ratio while increasing total tokens,
latency, and cache-write cost. OpenAI explicitly recommends measuring absolute
token counts, latency, and cost. It also documents the minimum-length cost trap.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

A better acceptance set is:

| Metric | Use |
| --- | --- |
| Cached input tokens | Find reusable context |
| Cache-write tokens | Find unnecessary writes |
| Uncached input tokens | Find changing prefixes |
| OpenAI first-token latency | Measure model input and queue delay |
| Full voice time-to-first-audio | Measure what the caller experiences |
| Input cost per completed call | Measure financial value |

## What Telnyx exposes

The documented managed Assistant API lets the application set `model`,
`instructions`, `tool_ids` or tools, `greeting`, `llm_api_key_ref`, dynamic
variables, voice settings, transcription settings, and telephony settings. It
does not document OpenAI cache keys, cache options, explicit breakpoints,
Responses conversation IDs, reasoning context, or service tier.
[Telnyx Create Assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant)

Telnyx documents that its OpenAI integration needs an OpenAI key and an OpenAI
model selection. Its public Assistant documentation does not state whether it
uses OpenAI Responses or Chat Completions for the managed integration. It does
not describe its cache-key or breakpoint behavior.
[Telnyx voice-assistant guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)

Telnyx observability can show the full message array, model output, and some
token data. It does not document OpenAI `cached_tokens` or `cache_write_tokens`
as Telnyx trace fields. The OpenAI dashboard is currently the stronger source
for cache usage.
[Telnyx assistant observability](https://developers.telnyx.com/docs/inference/ai-assistants/agent-observability)

### Current application boundary

The application selects `openai/gpt-5.6-luna`, a fixed greeting, stable
instructions, and nine tool IDs. It starts each call with dynamic clinic,
patient, date, time-zone, and tool-token values.
[Assistant definition](../src/voice-gateway/telnyx-assistant-definition.ts),
[assistant start request](../src/voice-gateway/telnyx-assistant-client.ts)

The application never sends an OpenAI prompt-cache field. It sends the assistant
ID and dynamic variables to Telnyx. Telnyx then makes the model request. No
change in this repository can set a managed OpenAI cache breakpoint unless
Telnyx adds a documented field.

The unique `tool_token` probably changes a rendered tool URL or header for each
call. OpenAI includes tool definitions in the cached prefix. This can reduce
cross-call reuse after the changed tool content. This is an inference because
Telnyx does not publish its final OpenAI request or cache boundary.

Do not reuse a security token across calls to improve caching. Within one call,
the token stays stable. The observed 93% ratio is consistent with strong reuse
of the growing conversation history.

## Could a custom LLM endpoint add controls?

Telnyx supports a public OpenAI-compatible Chat Completions endpoint through
`external_llm`. Telnyx can also forward dynamic variables as `extra_metadata`.
A gateway that the application owns could inspect Telnyx requests and inject a
stable `prompt_cache_key`. It could also transform message content to add
supported GPT-5.6 cache breakpoints.
[Telnyx custom LLM guide](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm),
[OpenAI Chat Completions reference](https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions)

This option is technically possible, but not justified by the current data. It
adds another public service, network round trip, streaming implementation,
authentication boundary, and failure path. It can make the voice latency worse.

Use a custom gateway only when all these conditions are true:

1. Telnyx confirms that the managed integration cannot expose the required fields.
2. OpenAI request logs show costly or slow uncached stable prefixes.
3. A production-like benchmark shows a material latency or cost gain.
4. The gateway preserves streaming, tools, cancellation, and per-call security.

## Prompt caching and the reported latency

OpenAI confirms that a cache hit reduces input processing before the response
starts. It does not change output generation. It cannot remove Telnyx turn
detection, transcription, tool execution, TTS, or carrier delay.
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

The fixed Telnyx greeting is stored on the assistant. Telnyx supports fixed text,
an empty greeting, or a model-generated greeting. This application uses fixed
text. Prompt caching should not be the main cause of the 1.5-to-2-second greeting
delay because that greeting should not require model generation.
[Telnyx Create Assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant)

For later turns, moving from 93% to 98% only changes how OpenAI handles another
5% of input tokens. No official source guarantees a proportional latency gain.
The likely gain is small compared with a measured 1-to-2-second pause. This is
an inference that must be checked with per-stage timings.

## Recommended next actions

1. Keep the present caching behavior for the next latency test.
2. Filter the OpenAI dashboard to this project, key, model, and test window.
3. Record cached, cache-write, and total input tokens for each model request.
4. Record OpenAI request start and first streamed token when Telnyx exposes them.
5. Measure final-speech to final-transcript time.
6. Measure final-transcript to first model token time.
7. Measure first model token to first audible audio time.
8. Ask Telnyx which OpenAI endpoint and cache fields its managed integration uses.
9. Ask Telnyx whether it can expose `prompt_cache_key` and explicit breakpoints.
10. Set a cache target only after token and latency traces show a real gap.

## Confirmed facts and inferences

| Claim | Status | Evidence |
| --- | --- | --- |
| GPT-5.6 supports implicit and explicit prompt caching | Confirmed | OpenAI prompt-caching guide |
| GPT-5.6 Luna charges 0.1 times for cache reads and 1.25 times for writes | Confirmed | OpenAI guide and Luna model page |
| OpenAI cache hits reduce prompt-processing time | Confirmed | OpenAI prompt-caching guide |
| Cache hits do not skip new output generation | Confirmed | OpenAI prompt-caching guide |
| The dashboard ratio is a token ratio | Probable | OpenAI gives this formula and links the dashboard, but the dashboard page omits its contract |
| The managed Telnyx Assistant API exposes no cache controls | Confirmed for the public schema | Telnyx Create Assistant API and full Assistant documentation |
| Telnyx uses implicit OpenAI caching | Inferred | A 93% ratio is compatible with default caching; Telnyx does not document its request |
| The per-call tool token can limit cross-call prefix reuse | Inferred | OpenAI caches tool definitions; the application supplies a per-call token |
| Improving 93% to 98% will not remove the observed pause | Inferred | Caching covers one latency stage; measure the actual stages |
| A custom LLM gateway can inject more OpenAI controls | Feasible but unverified end to end | Telnyx accepts an OpenAI-compatible endpoint; a benchmark is still required |

