# Controlled voice demo runbook

## Purpose

This runbook starts one fictional appointment scheduling call.

The system calls only `CALL_TO_NUMBER`. It changes only the fictional demo appointment.

Never use a patient phone number or real patient data.

## Select one runtime

Set one value in `.env.local` and `.voice-preflight.env`.

| Mode | `VOICE_RUNTIME` | Dialogue owner | Local Codex proxy |
| --- | --- | --- | --- |
| Baseline | `conversation-relay` | Local fixed dialogue runtime | Required |
| Trial | `telnyx-ai-assistant` | Telnyx AI Assistant | Not used |

One change back to `conversation-relay` restores the baseline runtime.

Do not remove the baseline runtime during the controlled trial.

## Before you start

Use your own test phone. Do not use a patient phone number.

Both modes need these items:

- A voice-capable Telnyx number.
- The account public key for Ed25519 webhook checks.
- A public HTTPS address for local port 3001.
- One approved test destination.

ConversationRelay also needs a TeXML application and local `claude-code-proxy` login.

The managed runtime needs these items:

- A Telnyx Voice API connection ID.
- The approved trial assistant ID.
- The configured assistant tool integration secret.
- A Telnyx OpenAI integration secret for `openai/gpt-5.6-luna`.
- Eight shared scheduling webhook tools.

Phase 5 creates or updates managed Telnyx resources only after approval.

The provisioning command reads `TELNYX_OPENAI_API_KEY` only when it must create
the Telnyx secret. The gateway does not use this key at runtime.

Provisioning requires the explicit `--confirm` flag. It can create a secret and
promote a new main assistant version. It never places a call.

Run the read-only checks after each assistant configuration change:

```bash
pnpm test:telnyx:assistant-chat -- --verify
pnpm test:telnyx:assistant-call -- --verify
```

Both commands reject a main assistant that is not on `openai/gpt-5.6-luna`.
The call check also verifies Flux settings and the diagnostic receiver.
Neither command places a call or runs inference.

Account setup: [voice-telnyx-setup.md](voice-telnyx-setup.md).

Copy [voice-demo.env.example](voice-demo.env.example) into your local `.env.local` file. Replace the account, phone, public key, and secret placeholders. Do not commit that file.

Copy [voice-preflight.env.example](voice-preflight.env.example) into `.voice-preflight.env`. Use the same gateway secret and loopback URL. Do not commit that file.

Keep `VOICE_GATEWAY_INTERNAL_URL` on a loopback address.

Keep `VOICE_AI_BASE_URL` on loopback in ConversationRelay mode.

## Start the local services

ConversationRelay users must sign in to the local Codex proxy once.

```bash
claude-code-proxy codex auth login
```

Start the full local demo stack with one command.

```bash
pnpm dev
```

The command starts the gateway, dashboard, and ngrok tunnel.

It starts the local Codex proxy only for ConversationRelay.

It then runs the non-billable preflight check.

You can leave the public URL placeholders in both files when you use `pnpm dev`.
Set both values to a real ngrok URL when you run the gateway or preflight alone.

Stop manually started dashboard, gateway, and proxy processes first. The script
stops only the services that it starts.

Use `pnpm dev -- --no-ngrok` when an approved tunnel already forwards port 3001.

Use `pnpm dev -- --skip-proxy` for focused Relay work without classification.

Use `pnpm dev:dashboard` when you only need Next.js.

The preflight command loads `.env.local` and `.voice-preflight.env`. The
development script overrides only the public gateway URL with the current
ngrok tunnel URL.

Existing shell variables take precedence over this file. Clear conflicting gateway variables before you run the command.

Both modes check the internal and public gateway health routes.

Both routes must reach the same process and selected runtime.

ConversationRelay also checks the local classifier and public Relay WebSocket.

Managed preflight skips both Relay checks. It does not place a phone call.

## Run the isolated managed call

Keep `pnpm dev` running in one terminal.
Run the billable isolated call in a second terminal.

```bash
pnpm test:telnyx:assistant-call -- --confirm
```

The call uses fictional Oliver data and no scheduling tools.
Speak normally and end the call within 60 seconds.

The command writes a JSON report below `.voice-logs`.
The report has the signed transcript and Telnyx event timestamps.
It reports answer-to-greeting and user-to-assistant timing proxies.
These values are not handset audio timestamps.

The ConversationRelay classifier uses the OpenAI Responses adapter.

The request includes these values:

```text
reasoning.context = all_turns
parallel_tool_calls = false
```

In AI SDK provider options, use `reasoningContext` and `parallelToolCalls`.

An error for either field means the classifier request contract changed. Run the focused test before you retry:

```bash
node --test --import tsx src/voice-gateway/intent-classifier.test.ts
```

## Safe browser check

Open `http://localhost:3000/dashboard`.

Select **Review rescheduling**. Open **Live phone demo**. Open **Call my test phone**.

Read the second confirmation. Select **Back**. This verifies the dashboard path without making a call.

## Place an approved test call

A call incurs cost. Use the approved Phase 6 batch limit.

1. Open the second confirmation dialog.
2. Select **Call my test phone**.
3. Answer only from the approved test destination.
4. Complete the scenario assigned to that call.
5. Stop after any critical safety failure.

The managed assistant must verify identity before appointment disclosure.

It must understand provider, date, and time constraints in normal language.

It must offer only backend slots within 21 days.

It must prepare and read one exact action before final confirmation.

The backend result, Telnyx events, attempt state, and demo appointment must agree.

Do not treat a transcript as proof of a write.

## Evidence and latency

The debug log records redacted `voice.latency` events.

| Stage | Runtime | Meaning |
| --- | --- | --- |
| `answer_to_texml` | ConversationRelay | Answer callback to TeXML response. |
| `answer_to_relay_setup` | ConversationRelay | Relay setup indicator. It is not first audio. |
| `intent_classification` | ConversationRelay | Local or model classification time. |
| `final_transcript_to_response_sent` | ConversationRelay | Final transcript to response dispatch. |
| `answer_to_assistant_start` | Managed | Answer event to confirmed assistant start command. |
| Assistant tool duration | Managed | Tool request to local tool response. |

Use audio-based measurements for the first audible greeting and full turn latency.

Server timestamps cannot prove when the caller heard speech.

Recording needs separate approval and a retention plan.

Recording stays disabled by default.

Do not claim stable p95 latency from a small trial.

The dashboard applies a confirmed result once. A reschedule frees the old time. A cancellation removes the visit from the active calendar and keeps its audit record.

The dashboard shows redacted call progress. It does not show phone numbers, raw caller speech, prompts, or model output.

## Stop and recovery rules

Use **End test call** to ask Telnyx to end an active call. If Telnyx does not confirm it, use the button again.

Managed mode stops the assistant first. It then sends a Call Control Hangup command.

Do not retry a `creation_uncertain` attempt. Check Telnyx Call Logs first.

Treat a gateway restart, WebSocket loss, or unknown result as unsafe to retry
until you confirm that no call is active. A durable four-minute safety lock
blocks another call after a restart. Do not remove that lock unless you first
confirm that no call is active.

The gateway ends a planned shutdown only after bounded Telnyx stop attempts. It fails shutdown if Telnyx never confirms the stop.

## Rollback

1. Stop the active test call.
2. Confirm that no Telnyx call remains active.
3. Set `VOICE_RUNTIME=conversation-relay` in both local environment files.
4. Restart the gateway and dashboard.
5. Run `pnpm voice:preflight`.
6. Confirm that health reports `conversation-relay`.

This rollback changes no assistant resource and no traffic route.

## After the test

Stop the gateway first. Set `VOICE_CALLS_ENABLED=false` in `.env.local` when you finish. Then stop ngrok and the local proxy.

## MVP limits

This is a local, controlled demo. It has one test destination, in-memory
attempt state, a durable four-minute restart safety lock, one active call, and a
four-minute cooldown.

The conversational identity step is not strong authentication.

The demo does not prove HIPAA compliance or production readiness.

The fictional MVP does not announce automation. Do not treat this choice as a production policy.

Do not use it for real patient calls. Production needs durable storage, staff authentication, consent controls, auditing, and a compliant data policy.

## Sources

- [Telnyx Conversation Relay](https://developers.telnyx.com/docs/voice/programmable-voice/conversation-relay)
- [Telnyx outbound TeXML call](https://developers.telnyx.com/api-reference/texml-rest-commands/initiate-an-outbound-call)
- [Telnyx AI Assistant start](https://developers.telnyx.com/docs/voice/programmable-voice/ai-assistant-start)
- [Telnyx assistant API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant)
- [Telnyx OpenAI integration](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)
- [Telnyx Tools Library](https://developers.telnyx.com/docs/inference/ai-assistants/tools-library)
- [Telnyx transcription settings](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings)
- [Telnyx webhook signatures](https://developers.telnyx.com/docs/development/api-fundamentals/webhooks/receiving-webhooks)
- [AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [AI SDK OpenAI provider options](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
