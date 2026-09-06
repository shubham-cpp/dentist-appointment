# Telnyx isolated voice tests

Use these steps to create the Telnyx account objects for the live dashboard demo and for `pnpm test:telnyx`.

Official sources:

- [Voice API getting started](https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-fundamentals)
- [TeXML setup](https://developers.telnyx.com/docs/voice/programmable-voice/texml-setup)
- [TwiML to TeXML](https://developers.telnyx.com/docs/voice/programmable-voice/twiml-compatibility)
- [Conversation Relay](https://developers.telnyx.com/docs/voice/programmable-voice/conversation-relay)
- [Outbound TeXML call](https://developers.telnyx.com/api-reference/texml-rest-commands/initiate-an-outbound-call)
- [Trial account limits](https://developers.telnyx.com/docs/account-setup/levels-and-capabilities/trial)
- [API keys](https://support.telnyx.com/en/articles/4305158-api-keys-and-how-to-use-them)

## Create the Telnyx account objects

Current portal routes:

- API keys: `https://portal.telnyx.com/#/api-keys`
- Account level: `https://portal.telnyx.com/#/account/account-levels`
- TeXML applications: `https://portal.telnyx.com/#/call-control/texml`
- Outbound Voice Profiles: `https://portal.telnyx.com/#/outbound-profiles`
- Telnyx-owned numbers: `https://portal.telnyx.com/#/voice/my-numbers`
- Verified caller-ID numbers: `https://portal.telnyx.com/#/voice/verified-numbers`

1. Create a Telnyx account.
2. Check the account level.
   Trial accounts get test credit, but outbound voice can dial only a verified phone number. Trial accounts can have only one API key and one Outbound Voice Profile.
3. Add billing or upgrade before you buy a number or enable wider outbound dialing.
   Paid status needs a verified phone number, service address, 2FA, and a credit-card payment.
4. Create an API key from `/#/api-keys`. Put it in `TELNYX_API_KEY`. Do not commit it.
   Telnyx shows a new API key only once.
5. Copy the account public key from `/#/api-keys`. Put it in `TELNYX_PUBLIC_KEY`.
   The gateway uses it to check Ed25519 webhook signatures.
6. Use the API key to call `GET https://api.telnyx.com/v2/whoami`.
   Put the returned `organization_id` in `TELNYX_ACCOUNT_SID`.
7. Create an Outbound Voice Profile at `/#/outbound-profiles`.
   Enable the country of `CALL_TO_NUMBER`. Enable India if that number is `+91`.
8. Create or edit a TeXML Application at `/#/call-control/texml`.
   Attach the Outbound Voice Profile. Copy the Application ID into `TELNYX_APPLICATION_SID`.
9. Buy a Voice number from `/#/voice/my-numbers/buy`.
   Put it in `TELNYX_PHONE_NUMBER`.
10. Assign the Voice number to the TeXML Application.
11. Keep `CALL_TO_NUMBER` as your own test phone. Do not use a patient number.

Copy the Telnyx names from [voice-demo.env.example](voice-demo.env.example) into `.env.local`.

## Managed assistant model

The managed scheduling assistant uses `openai/gpt-5.6-sol`. The September 5 regression comparison selected it for callback confirmation and terminal-state handling.

The approved provisioning command performs these actions:

1. Build the five-tool assistant draft.
2. Show the proposed model, voice, privacy, and recording settings without `--apply`.
3. Create the assistant, or compare and update the configured assistant with `--apply`.
4. Promote a version only when the approved settings differ.
5. Write the assistant ID and pinned version to the local environment files.

```bash
pnpm voice:telnyx-candidate:provision
pnpm voice:telnyx-candidate:provision -- --apply
pnpm voice:preflight
```

The first command and preflight are read-only. None of these commands places a call.

The approved voice profile uses Deepgram Flux.
It sets `eager_eot_threshold` to `0.4` and `eot_threshold` to `0.7`.
It sets the end-of-turn timeout to 600 milliseconds.
It also enables message-history callbacks for the local diagnostic report.

Keep `pnpm dev` running. Start the controlled call from the local dashboard.
The gateway writes redacted local evidence with restricted file permissions.

Official references:

- [Create an assistant](https://developers.telnyx.com/api-reference/assistants/create-an-assistant)
- [Update an assistant](https://developers.telnyx.com/api-reference/assistants/update-an-assistant)
- [Create an integration secret](https://developers.telnyx.com/api-reference/integration-secrets/create-a-secret)
- [OpenAI integration](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

## How the outbound call is created

The scripts call the TeXML REST API with bearer authentication:

- `POST https://api.telnyx.com/v2/texml/Accounts/{TELNYX_ACCOUNT_SID}/Calls`
- `Authorization: Bearer {TELNYX_API_KEY}`
- JSON body fields:
  - `ApplicationSid`: `TELNYX_APPLICATION_SID`
  - `From`: `TELNYX_PHONE_NUMBER`
  - `To`: `CALL_TO_NUMBER`
  - `Texml`: inline TeXML instructions
  - `Timeout` and `TimeLimit`: short test limits

Before a billable call, `--verify` checks that:

- `TELNYX_PHONE_NUMBER` exists on the account.
- The number is active.
- The number is assigned to a Voice connection or application.
- `TELNYX_APPLICATION_SID` exists.
- The TeXML Application has an Outbound Voice Profile.

## Script 1. One message, then hang up

This call proves the number, the profile, and voice quality. It does not start a conversation.

```bash
pnpm test:telnyx -- --dry-run
pnpm test:telnyx -- --verify
pnpm test:telnyx -- --confirm
```

Answer the call. You should hear a Telnyx NaturalHD voice, not a basic robotic voice.

`--confirm` is billable. If the create request dies or returns no CallSid, do not retry. Check Telnyx Call Logs.

## Script 2. Three-turn Oliver sandbox

This call is the place to test intent and latency. It does not write the calendar.

Scripted lines (see `AGENT_LINES` in the script for the exact wording):

1. Agent greets with `<Say>` as soon as you answer. Asks if you are Oliver.
2. You confirm. Local matcher handles “Yeah I'm Oliver” and similar. Terra is not used.
3. Agent asks to move 25 August to 26 August.
4. You agree. Local matcher handles “I'm ok with the 26th” and similar.
5. Agent says the visit is rescheduled, waits for playback, then hangs up.

Unclear leftovers in this isolated script still use its own legacy settings. The dashboard gateway uses `gpt-5.6-luna-fast` with `reasoningEffort: "none"`. The model does not invent dates. Sandbox phrases (Oliver, 26th) are demo-only. The product matcher uses the live patient name and offered times.

Current architecture: [research/telnyx-sandbox-current-architecture.md](research/telnyx-sandbox-current-architecture.md).

### Local services

`--verify` and `--confirm` start these for this process only, then stop only what they started:

1. `claude-code-proxy` on `VOICE_AI_BASE_URL` (default `http://127.0.0.1:18765/v1`), with `CCP_CODEX_RESPONSES_API=1`.
2. `ngrok http 3002`. The public URL stays in memory. It is not written to `.env.local`.

If the proxy is already running (`pnpm dev`), the script reuses it and does not kill it. Sign in once with `claude-code-proxy codex auth login`.

If `pnpm dev` already has ngrok on port 3001, this script tries to add a second tunnel to that agent. A free ngrok account often allows only one tunnel. In that case stop `pnpm dev`, or run `ngrok http 3002` yourself and use `--no-ngrok` with `TELNYX_PUBLIC_BASE_URL`.

`--verify` checks a local confirm on “Yeah I'm Oliver”, then one model fallback. Local should be near 0 ms. If the model sample is still thousands of ms, that is fallback-only cost.

Use `--skip-proxy` only when you already run claude-code-proxy yourself.

```bash
pnpm test:telnyx:conversation -- --dry-run
pnpm test:telnyx:conversation -- --verify
pnpm test:telnyx:conversation -- --confirm
```

After `--confirm`, each turn prints:

```
TURN identity partial
  since_agent_ms=1926
  eot_ms=400
  intent_ms=3806
  tts_send_ms=1
  dead_air_ms=4206
```

- `since_agent_ms` includes you talking. Do not treat it as silence.
- `eot_ms` is last transcript growth to “we decided the turn ended”.
- `intent_ms` is the classifier only. That is the pause after STT.
- `tts_send_ms` is the WebSocket send. Telnyx does not send playback timestamps.
- `dead_air_ms` is last transcript growth to queued agent text. That is the closest measure of silence after you stop.

The script also prints unknown Conversation Relay frame types. Keep those. They tell us which Twilio knobs Telnyx actually has.

## Unit tests

```bash
pnpm test:telnyx:unit
pnpm test:telnyx:conversation:unit
```

These tests do not place a call.
