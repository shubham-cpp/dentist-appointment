import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import {
  createTwilioCandidateCallRequest,
  createTwilioCandidateTwiML,
  twilioCandidateDefaults,
} from "./twilio-candidate";

test("builds the locked Twilio ConversationRelay configuration", () => {
  const context = createVoiceCallContext(new Date("2026-08-28T12:00:00.000Z"));
  const xml = createTwilioCandidateTwiML({
    attemptId: "voice_twilio_1",
    context,
    publicBaseUrl: "https://voice.example.test",
    relayToken: "relay-token",
  });

  assert.match(xml, /language="en-US"/);
  assert.match(xml, /transcriptionProvider="Deepgram"/);
  assert.match(xml, /speechModel="flux"/);
  assert.match(xml, /eotThreshold="0.8"/);
  assert.match(xml, /speechTimeout="600"/);
  assert.match(xml, /partialPrompts="true"/);
  assert.match(xml, /interruptSensitivity="high"/);
  assert.match(xml, /reportInputDuringAgentSpeech="speech"/);
  assert.match(xml, /ignoreBackchannel="true"/);
  assert.match(xml, /ttsProvider="ElevenLabs"/);
  assert.match(xml, /g6xIsTj2HwM6VR4iXFCw-flash_v2_5-1\.0_0\.5_0\.75/);
  assert.match(
    xml,
    /Hello, this is Willow calling from Brightview Dental\. Am I speaking with Olivia Garcia\?/,
  );
  assert.doesNotMatch(JSON.stringify(twilioCandidateDefaults), /apiKey|deepgram.*key/i);
});

test("creates a recorded fixed-destination call request", () => {
  const request = createTwilioCandidateCallRequest({
    attemptId: "voice_twilio_2",
    callToNumber: "+12025550111",
    publicBaseUrl: "https://voice.example.test",
    twilioPhoneNumber: "+12025550112",
  });

  assert.deepEqual(request, {
    from: "+12025550112",
    record: true,
    recordingChannels: "dual",
    recordingStatusCallback: "https://voice.example.test/voice-experiment/twilio/recording?attempt=voice_twilio_2",
    recordingStatusCallbackEvent: ["completed", "failed"],
    statusCallback: "https://voice.example.test/voice-experiment/twilio/status?attempt=voice_twilio_2",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
    timeLimit: 180,
    timeout: 20,
    to: "+12025550111",
    url: "https://voice.example.test/voice-experiment/twilio/twiml?attempt=voice_twilio_2",
  });
});
