import { voiceReschedulingConversationGuidance } from "@/voice-core/conversation-guidance";
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceDialogueModel } from "./twilio-dialogue-session";
import type { VoiceEvidenceEvent } from "@/voice-core/evidence-recorder";
import {
  voiceSchedulingToolBodySchemas,
  voiceSchedulingToolDescriptions,
  type VoiceSchedulingAuthority,
  type VoiceSchedulingCommand,
} from "@/voice-core/scheduling-authority";

type VoiceToolEvent = Omit<VoiceEvidenceEvent, "channel">;

export function createVoiceSchedulingTools(
  scheduling: VoiceSchedulingAuthority,
  onToolEvent?: (event: VoiceToolEvent) => void | Promise<void>,
) {
  async function execute(command: VoiceSchedulingCommand) {
    const common = {
      observedAt: new Date().toISOString(),
      source: "voice-scheduling-authority",
    };
    await onToolEvent?.({
      ...common,
      monotonicMs: performance.now(),
      payload: { command, name: command.name, operationId: command.operationId },
      type: "tool.started",
    });
    try {
      const result = await scheduling.execute(command);
      await onToolEvent?.({
        ...common,
        monotonicMs: performance.now(),
        payload: { name: command.name, operationId: command.operationId, result },
        type: "tool.completed",
      });
      return result;
    } catch (error) {
      await onToolEvent?.({
        ...common,
        monotonicMs: performance.now(),
        payload: {
          error: error instanceof Error ? error.message : "unknown_tool_error",
          name: command.name,
          operationId: command.operationId,
        },
        type: "tool.failed",
      });
      throw error;
    }
  }

  return {
    verify_identity: tool({
      description: voiceSchedulingToolDescriptions.verify_identity,
      inputSchema: voiceSchedulingToolBodySchemas.verify_identity,
      execute: (input) => execute({ name: "verify_identity", ...input }),
    }),
    find_slots: tool({
      description: voiceSchedulingToolDescriptions.find_slots,
      inputSchema: voiceSchedulingToolBodySchemas.find_slots,
      execute: (input) => execute({ name: "find_slots", ...input }),
    }),
    prepare_change: tool({
      description: voiceSchedulingToolDescriptions.prepare_change,
      inputSchema: voiceSchedulingToolBodySchemas.prepare_change,
      execute: (input) => execute({ name: "prepare_change", ...input }),
    }),
    commit_change: tool({
      description: voiceSchedulingToolDescriptions.commit_change,
      inputSchema: voiceSchedulingToolBodySchemas.commit_change,
      execute: (input) => execute({ name: "commit_change", ...input }),
    }),
    request_staff_follow_up: tool({
      description: voiceSchedulingToolDescriptions.request_staff_follow_up,
      inputSchema: voiceSchedulingToolBodySchemas.request_staff_follow_up,
      execute: (input) => execute({ name: "request_staff_follow_up", ...input }),
    }),
  };
}

type VoiceSchedulingTools = ReturnType<typeof createVoiceSchedulingTools>;

export type VoiceModelRunInput = {
  messages: ModelMessage[];
  signal: AbortSignal;
  system: string;
  tools: VoiceSchedulingTools;
  toolsEnabled: boolean;
};

export type VoiceModelRunner = {
  run(input: VoiceModelRunInput): {
    responseMessages: PromiseLike<ModelMessage[]>;
    textStream: AsyncIterable<string>;
  };
};

export function createTwilioCandidateSystemPrompt(context: VoiceCallContext) {
  return [
    `You are Willow, the scheduling assistant for ${context.clinicName}.`,
    `This fictional call concerns ${context.patientName}.`,
    voiceReschedulingConversationGuidance(),
    `The clinic timezone is ${context.clinicTimeZone}. The current clinic date is ${context.currentDateLabel}.`,
  ].join(" ");
}

function createAiSdkRunner(model: LanguageModel): VoiceModelRunner {
  return {
    run(input) {
      const result = streamText({
        abortSignal: input.signal,
        maxRetries: 0,
        messages: input.messages,
        model,
        providerOptions: {
          openai: {
            parallelToolCalls: false,
            reasoningContext: "all_turns",
            reasoningEffort: "none",
            store: false,
          } satisfies OpenAIResponsesProviderOptions,
        },
        stopWhen: stepCountIs(8),
        system: input.system,
        tools: input.toolsEnabled ? input.tools : undefined,
      });
      return {
        responseMessages: result.responseMessages,
        textStream: result.textStream,
      };
    },
  };
}

export function createOpenAiVoiceDialogueModel(options: {
  context: VoiceCallContext;
  onToolEvent?: (event: VoiceToolEvent) => void | Promise<void>;
  runner: VoiceModelRunner;
  scheduling: VoiceSchedulingAuthority;
}): VoiceDialogueModel {
  const messages: ModelMessage[] = [];
  const system = createTwilioCandidateSystemPrompt(options.context);
  const tools = createVoiceSchedulingTools(options.scheduling, options.onToolEvent);

  return {
    async *generate(turn) {
      const userMessage: ModelMessage = { content: turn.callerText, role: "user" };
      const requestMessages = [...messages, userMessage];
      const result = options.runner.run({
        messages: requestMessages,
        signal: turn.signal,
        system,
        tools,
        toolsEnabled: true,
      });
      for await (const token of result.textStream) {
        if (turn.signal.aborted) return;
        yield token;
      }
      if (turn.signal.aborted) return;
      messages.push(userMessage, ...await result.responseMessages);
    },
  };
}

export function createLocalOpenAiVoiceDialogueModel(options: {
  apiKey: string;
  baseUrl: string;
  context: VoiceCallContext;
  modelName?: string;
  onToolEvent?: (event: VoiceToolEvent) => void | Promise<void>;
  scheduling: VoiceSchedulingAuthority;
}) {
  const provider = createOpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });
  const model = provider.responses(options.modelName ?? "gpt-5.6-luna-fast");
  return createOpenAiVoiceDialogueModel({
    context: options.context,
    onToolEvent: options.onToolEvent,
    runner: createAiSdkRunner(model),
    scheduling: options.scheduling,
  });
}

export type { VoiceSchedulingCommand };
