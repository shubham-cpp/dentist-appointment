# Twilio voice choices for the call test

Research checked: 15 August 2026.

This note covers the fixed `<Say>` message in
`scripts/test-twilio-call.mjs`. It does not change the script.

## Short answer

Yes. The current test TwiML has a `<Say>` tag with no `voice` or
`language` attributes. It uses the Twilio account default. That default may
be a Basic `man` or `woman` voice, which would explain the robotic result.

For an India-focused MVP, start by listening to `Polly.Kajal-Neural` with
`language="en-IN"`. It is a higher-quality voice and also supports Hindi.
It is the best first test because it is not a public-beta generative voice.

Test a Google neural voice as a second candidate. Try
`Google.en-IN-Neural2-A` or `Google.en-IN-Neural2-D`. Voice preference is
subjective, so hear both through the same Indian mobile route.

Sources: [Twilio `<Say>`](https://www.twilio.com/docs/voice/twiml/say),
[Twilio TTS voices](https://www.twilio.com/docs/voice/twiml/say/text-speech).

## Options for the current static call

| Option | Indian language support | Cost and operating trade-off | Verdict |
| --- | --- | --- | --- |
| Twilio Basic `man` or `woman` | Limited. Defaults use `en-US` unless changed. | No TTS charge. Twilio says Basic voices lack the human qualities needed for production calls. | Do not use for the MVP message. |
| Polly Standard `Polly.Aditi` or `Polly.Raveena` | `Aditi` supports Indian English and Hindi. `Raveena` is Indian English. | Low price. Less natural inflection than Neural. | A low-cost fallback. |
| Polly Neural `Polly.Kajal-Neural` | Indian English and Hindi. Kajal is fully bilingual. | Neural-tier price. Suitable for a short call. | Recommended first choice. |
| Google Neural `Google.en-IN-Neural2-A` or `Google.en-IN-Neural2-D` | English India. Google also lists Hindi Neural2 voices. | Neural-tier price. More voice choices than Polly. | Recommended comparison test. |
| Generative Polly `Polly.Kajal-Generative` | English India only. | Best quality on paper. Twilio labels Generative `<Say>` voices Public Beta with no SLA. | Test later, not the first MVP default. |
| Generative Google `Google.en-IN-Chirp3-HD-Aoede` | English India. Twilio also lists Hindi Chirp3-HD voices, such as `Google.hi-IN-Chirp3-HD-Puck`. | Same beta and change risk through Twilio. Google describes Chirp 3 HD as conversational and low-latency in its direct API. | Good sound experiment. Test the live route before use. |

Twilio accepts a provider prefix for `<Say>`, such as `Polly.Kajal-Neural`
or `Google.en-IN-Neural2-A`. The selected `language` must match the voice.
An invalid pair can fail the `<Say>` instruction.

Sources: [Twilio voice inventory](https://www.twilio.com/docs/voice/twiml/say/text-speech),
[Amazon Polly voices](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html),
[Google Cloud TTS voices](https://cloud.google.com/text-to-speech/docs/list-voices-and-types).

## English, Hindi, and mixed speech

Amazon Polly documents Aditi and Kajal as fully bilingual Indian English and
Hindi voices. Kajal Neural supports both `en-IN` and `hi-IN`. It can speak
English and Hindi in one message. It also handles Devanagari and Romanized
Hindi. Use `hi-IN` when Hindi number pronunciation matters.

Polly Kajal Generative is listed for `en-IN`, not `hi-IN`. Do not assume it
will give the same Hindi behavior as Kajal Neural.

Google offers Indian English and Hindi in Standard, Neural2, WaveNet, and
Chirp3-HD inventories. Google voices are a good choice when you want a
specific English or Hindi voice. They are not documented here as one
fully-bilingual voice.

Sources: [Amazon Polly bilingual voices](https://docs.aws.amazon.com/polly/latest/dg/bilingual-voices.html),
[Amazon Polly Generative voices](https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html),
[Google Cloud TTS voice inventory](https://cloud.google.com/text-to-speech/docs/list-voices-and-types).

## Cost, latency, and reliability

Twilio bills Standard, Neural, and Generative `<Say>` speech in 100-character
blocks. The minimum is 100 characters. The published Twilio price references
list Standard from $0.0008, Neural at $0.0032, and Generative at $0.013 per
100 characters. These charges add to the outbound call charge.

The test greeting is short. TTS cost will be tiny compared with the India
outbound call charge. Confirm current account pricing in the Twilio Console
before a larger campaign.

Twilio synthesizes `<Say>` text in real time. Its docs do not publish a fair
end-to-end latency comparison between these voices. Google says Chirp 3 HD
supports low-latency streaming in its direct API. That does not prove a
specific Twilio-to-India latency result.

Generative voices are Public Beta in Twilio. They are not covered by Twilio's
SLA. Twilio also warns that third-party voice inventories may change. Keep a
tested neural backup voice.

Sources: [Twilio TTS pricing and limits](https://www.twilio.com/docs/voice/twiml/say/text-speech#pricing),
[Twilio Standard and Neural prices](https://www.twilio.com/en-us/changelog/general-availability-google-voices-for-say),
[Twilio Generative price reference](https://www.twilio.com/en-us/changelog/generative-voices-say-public-beta),
[Google Chirp 3 HD](https://cloud.google.com/text-to-speech/docs/list-voices-and-types).

## Setup choices

There are two ways to select a `<Say>` voice.

1. Set an account default or a locale mapping in the Twilio Console.
   This changes any `<Say>` that does not state a voice.
2. Set `voice` and `language` on this script's `<Say>` tag.
   This affects only this message and wins over account defaults.

Twilio documents this path through Console settings and TwiML voice names.
It does not document a separate AWS or Google credential step for `<Say>`.

The Console includes a TTS test page. Listen there first. Then make one
manual `--confirm` call. It is billable and tests real telephone audio.

Sources: [Twilio TTS settings and testing](https://www.twilio.com/docs/voice/twiml/say/text-speech#text-to-speech-settings),
[per-call voice override](https://www.twilio.com/docs/voice/twiml/say/text-speech#override-default-voices).

## Future voice-agent choice

Twilio ConversationRelay can use Amazon, Google, or ElevenLabs voices. It is
not a drop-in replacement for the present `<Say>` call. It needs a secure
WebSocket service and agent code. Twilio lists ConversationRelay at $0.07 per
minute, plus normal Voice charges.

ConversationRelay defaults to ElevenLabs TTS. Its documented defaults include
`en-IN` and `hi-IN`. This is worth evaluating when the rescheduling flow needs
a live conversation. It is too much machinery for the current fixed greeting.

Sources: [ConversationRelay voice configuration](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration),
[ConversationRelay reference](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay),
[ConversationRelay pricing](https://www.twilio.com/en-us/products/conversational-ai/pricing).

## Later script change

When you choose a voice, change only the current test message's `<Say>` tag.
Add the chosen `voice` and matching `language` attributes. Keep the rest of
the call safety limits unchanged. Add a unit test that asserts both values.

Do not rely only on a more expensive voice. Short, spoken-style sentences and
small SSML pauses can make a bigger difference. `<Say>` supports SSML for
non-Basic voices, but support varies by provider. Test the exact message.

Source: [Twilio SSML support](https://www.twilio.com/docs/voice/twiml/say/text-speech#speech-synthesis-markup-language-ssml).
