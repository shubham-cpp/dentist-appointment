import twilio from "twilio";
import type { VoiceCallContext } from "@/lib/voice-call-context";

export const twilioCandidateDefaults = {
  eotThreshold: 0.8,
  ignoreBackchannel: true,
  interruptSensitivity: "high",
  language: "en-US",
  partialPrompts: true,
  reportInputDuringAgentSpeech: "speech",
  speechModel: "flux",
  speechTimeoutMs: 600,
  transcriptionProvider: "Deepgram",
  ttsLanguage: "en-US",
  ttsProvider: "ElevenLabs",
  voice: "g6xIsTj2HwM6VR4iXFCw-flash_v2_5-1.0_0.5_0.75",
} as const;

function baseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function experimentWebSocketUrl(publicBaseUrl: string, attemptId: string) {
  const url = new URL(baseUrl(publicBaseUrl));
  url.protocol = "wss:";
  url.pathname = "/voice-experiment/twilio/relay";
  url.search = `attempt=${encodeURIComponent(attemptId)}`;
  return url.toString();
}

export function createTwilioCandidateGreeting(context: VoiceCallContext) {
  return `Hello, this is Willow calling from ${context.clinicName}. Am I speaking with ${context.patientName}?`;
}

export function createTwilioCandidateTwiML(input: {
  attemptId: string;
  context: VoiceCallContext;
  publicBaseUrl: string;
  relayToken: string;
}) {
  const root = baseUrl(input.publicBaseUrl);
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect({
    action: `${root}/voice-experiment/twilio/relay-complete?attempt=${encodeURIComponent(input.attemptId)}`,
    method: "POST",
  });
  const relay = connect.conversationRelay({
    dtmfDetection: false,
    eotThreshold: twilioCandidateDefaults.eotThreshold,
    events: "tokens-played",
    ignoreBackchannel: twilioCandidateDefaults.ignoreBackchannel,
    interruptSensitivity: twilioCandidateDefaults.interruptSensitivity,
    interruptible: "speech",
    language: twilioCandidateDefaults.language,
    partialPrompts: twilioCandidateDefaults.partialPrompts,
    preemptible: true,
    reportInputDuringAgentSpeech: twilioCandidateDefaults.reportInputDuringAgentSpeech,
    speechModel: twilioCandidateDefaults.speechModel,
    speechTimeout: twilioCandidateDefaults.speechTimeoutMs,
    transcriptionProvider: twilioCandidateDefaults.transcriptionProvider,
    ttsLanguage: twilioCandidateDefaults.ttsLanguage,
    ttsProvider: twilioCandidateDefaults.ttsProvider,
    url: experimentWebSocketUrl(input.publicBaseUrl, input.attemptId),
    voice: twilioCandidateDefaults.voice,
    welcomeGreeting: createTwilioCandidateGreeting(input.context),
    welcomeGreetingInterruptible: "any",
  } as unknown as Parameters<typeof connect.conversationRelay>[0]);
  relay.parameter({ name: "relayToken", value: input.relayToken });
  return response.toString();
}

export function createTwilioCandidateCallRequest(input: {
  attemptId: string;
  callToNumber: string;
  publicBaseUrl: string;
  twilioPhoneNumber: string;
}) {
  const root = baseUrl(input.publicBaseUrl);
  const attempt = encodeURIComponent(input.attemptId);
  return {
    from: input.twilioPhoneNumber,
    record: true,
    recordingChannels: "dual" as const,
    recordingStatusCallback: `${root}/voice-experiment/twilio/recording?attempt=${attempt}`,
    recordingStatusCallbackEvent: ["completed", "failed"] as const,
    statusCallback: `${root}/voice-experiment/twilio/status?attempt=${attempt}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] as const,
    statusCallbackMethod: "POST" as const,
    timeLimit: 180,
    timeout: 20,
    to: input.callToNumber,
    url: `${root}/voice-experiment/twilio/twiml?attempt=${attempt}`,
  };
}
