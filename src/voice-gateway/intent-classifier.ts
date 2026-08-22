import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { Output, streamText, type LanguageModel } from "ai";
import { createVoiceCallContext, type VoiceCallContext } from "@/lib/voice-call-context";
import {
  createVoiceConversationState,
  type VoiceConversationState,
  type VoiceIntent,
  type VoiceIntentModelOutput,
  voiceIntentModelOutputSchema,
  voiceIntentSchema,
} from "./conversation";
import type { VoiceGatewayConfig } from "./config";

export type VoiceIntentClassificationRequest = {
  callerText: string;
  context: VoiceCallContext;
  state: VoiceConversationState;
};

export type VoiceIntentClassifier = {
  checkReady(signal?: AbortSignal): Promise<void>;
  classify(request: VoiceIntentClassificationRequest, signal?: AbortSignal): Promise<VoiceIntent>;
};

function localIntentSystemPrompt() {
  return [
    "Classify one final patient utterance for a fictional dental scheduling call.",
    "Return only the requested structured object.",
    "Never write caller-facing speech or invent an appointment time.",
    "The scheduling system, not you, decides availability.",
    "Use the supplied call date and America/New_York timezone to resolve relative dates.",
    "Resolve Tuesday and this Tuesday to the closest future Tuesday.",
    "Resolve next Tuesday to Tuesday in the following calendar week.",
    "Use an ISO YYYY-MM-DD date for request_time.",
    "Normalize a broad time preference to morning, afternoon, or evening.",
    "Use select_slot only when the caller clearly chooses a supplied offered slot.",
    "Use cancel only when the caller asks to cancel the active appointment.",
    "Use clinical_question for clinical advice or treatment questions.",
    "Use unknown when the meaning is ambiguous.",
    "slotId must be empty unless intent is select_slot.",
    "requestedDate and timePreference must be empty unless intent is request_time.",
  ].join(" ");
}

function classifyPrompt(request: VoiceIntentClassificationRequest) {
  const offeredSlots = request.context.availableSlots.filter((slot) => (
    request.state.offeredSlotIds.includes(slot.id)
  ));

  return JSON.stringify({
    call: {
      callStartedAt: request.context.callStartedAt,
      clinicTimeZone: request.context.clinicTimeZone,
      currentDateLabel: request.context.currentDateLabel,
    },
    callerText: request.callerText,
    currentAppointment: request.context.appointment,
    eligibleFreeTimes: request.context.availableSlots,
    offeredSlots,
    patient: {
      firstName: request.context.patientFirstName,
      name: request.context.patientName,
    },
    state: request.state,
  });
}

function toVoiceIntent(
  output: VoiceIntentModelOutput,
  request: VoiceIntentClassificationRequest,
): VoiceIntent {
  const intent = voiceIntentSchema.parse(output);

  if (intent.intent === "select_slot") {
    const valid = request.state.offeredSlotIds.includes(intent.slotId)
      && request.context.availableSlots.some((slot) => slot.id === intent.slotId);
    if (!valid) throw new Error("The model selected a slot that was not offered.");
  }

  if (intent.intent === "request_time" && intent.requestedDate) {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(intent.requestedDate);
    if (!validDate) throw new Error("The model returned an invalid requested date.");
  }

  return intent;
}

export function createStructuredVoiceIntentClassifier(
  model: LanguageModel,
  timeoutMs: number,
): VoiceIntentClassifier {
  async function classify(request: VoiceIntentClassificationRequest, signal?: AbortSignal) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const abortSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const result = streamText({
      abortSignal,
      maxRetries: 0,
      messages: [{ content: classifyPrompt(request), role: "user" }],
      model,
      output: Output.object({
        description: "One narrow scheduling intent with an offered slot or normalized preference when applicable.",
        name: "voice_call_intent",
        schema: voiceIntentModelOutputSchema,
      }),
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningContext: "all_turns",
          reasoningEffort: "low",
          store: false,
        } satisfies OpenAIResponsesProviderOptions,
      },
      system: localIntentSystemPrompt(),
    });

    return toVoiceIntent(await result.output, request);
  }

  return {
    async checkReady(signal?: AbortSignal) {
      const context = createVoiceCallContext();
      await classify({
        callerText: "This is Olivia.",
        context,
        state: createVoiceConversationState(),
      }, signal);
    },
    classify,
  };
}

export function createLocalCodexIntentClassifier(config: VoiceGatewayConfig): VoiceIntentClassifier {
  const provider = createOpenAI({
    apiKey: config.aiApiKey,
    baseURL: config.aiBaseUrl,
  });

  return createStructuredVoiceIntentClassifier(
    provider.responses(config.aiModel),
    config.aiTimeoutMs,
  );
}
