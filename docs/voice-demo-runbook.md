# Controlled voice demo runbook

## Purpose

This runbook starts one fictional appointment-rescheduling call.

The system calls only `CALL_TO_NUMBER`. It can change only Olivia Garcia's fictional appointment.

Use a Twilio project that has ConversationRelay enabled. A Twilio trial account blocks this TwiML noun.

## Before you start

Use your own test phone. Do not use a patient phone number.

Get these items before you start:

- A Voice-capable Twilio number.
- A paid Twilio project with ConversationRelay onboarding complete.
- A public ngrok HTTPS address for local port 3001.
- A local `claude-code-proxy` login for the Codex Responses API.

Copy [voice-demo.env.example](voice-demo.env.example) into your local `.env.local` file. Replace the account, phone, and secret placeholders. Do not commit that file.

Copy [voice-preflight.env.example](voice-preflight.env.example) into `.voice-preflight.env`. Use the same gateway secret and loopback URL. Do not commit that file.

Keep `VOICE_GATEWAY_INTERNAL_URL` and `VOICE_AI_BASE_URL` on loopback addresses. Keep the proxy on `127.0.0.1`.

## Start the local services

If needed, sign in to the local Codex proxy once.

```bash
claude-code-proxy codex auth login
```

Start the full local demo stack with one command.

```bash
pnpm dev
```

The command starts the proxy, gateway, dashboard, and ngrok tunnel. It gets
the current ngrok HTTPS URL and uses it only in the child processes. It then
runs the non-billable preflight check.

You can leave the public URL placeholders in both files when you use `pnpm dev`.
Set both values to a real ngrok URL when you run the gateway or preflight alone.

Stop manually started dashboard, gateway, and proxy processes first. The script
stops only the services that it starts.

Use `pnpm dev -- --no-ngrok` when you already run an ngrok tunnel for port
3001. Use `pnpm dev -- --skip-proxy` when you only work on the dashboard.

Use `pnpm dev:dashboard` when you only need Next.js.

The preflight command loads `.env.local` and `.voice-preflight.env`. The
development script overrides only the public gateway URL with the current
ngrok tunnel URL.

Existing shell variables take precedence over this file. Clear conflicting gateway variables before you run the command.

It checks the local AI classifier. It also opens one signed WebSocket through
the public tunnel. It does not place a phone call.

## Safe browser check

Open `http://localhost:3000/dashboard`.

Select **Review rescheduling**. Open **Live phone demo**. Open **Call my test phone**.

Read the second confirmation. Select **Back**. This verifies the dashboard path without making a call.

## Place one test call

Place a call only after you decide to spend the call cost.

1. Open the second confirmation dialog.
2. Select **Call my test phone**.
3. Answer only from `CALL_TO_NUMBER`.
4. Confirm that you are Olivia Garcia.
5. Give permission to continue.
6. Choose the same dentist or another qualified dentist.
7. Choose one offered fictional time.
8. Confirm the exact date, time, and dentist.

Wait for each complete response before you speak. A successful call has these
dashboard events, in order: **Voice session connected**, **Caller reply
received**, and **Gateway response sent**. The call then ends after the final
reply plays.

Also test one silence path. Do not answer after the greeting. The system asks
once more after about eighteen seconds. It then ends safely and records staff
follow-up after about twenty more seconds.

Twilio provides speech-to-text and text-to-speech. Terra returns only a validated intent. Server templates generate all speech.

The dashboard applies a confirmed result once. A reschedule frees the old time. A cancellation removes the visit from the active calendar and keeps its audit record.

The dashboard shows redacted call progress. It does not show phone numbers, raw caller speech, prompts, or model output.

## Stop and recovery rules

Use **End test call** to ask Twilio to end an active call. If Twilio does not confirm it, use the button again.

Do not retry a `creation_uncertain` attempt. Check Twilio Call Logs first.

Treat a gateway restart, WebSocket loss, or final-speech timeout as an unknown
result. A durable ten-minute safety lock blocks another call after a restart.
Do not remove that lock unless you first confirm that no call is active.

The gateway ends a planned shutdown only after bounded Twilio stop attempts. It fails shutdown if Twilio never confirms the stop.

## After the test

Stop the gateway first. Set `VOICE_CALLS_ENABLED=false` in `.env.local` when you finish. Then stop ngrok and the local proxy.

## MVP limits

This is a local, controlled demo. It has one test destination, in-memory
attempt state, a durable ten-minute restart safety lock, one active call, and a
ten-minute cooldown.

Do not use it for real patient calls. Production needs durable storage, staff authentication, consent controls, auditing, and a compliant data policy.

## Sources

- [Twilio ConversationRelay message reference](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages)
- [Twilio ConversationRelay TwiML reference](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
- [Twilio trial Voice limits](https://www.twilio.com/docs/usage/trials/try-out-voice)
- [AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
