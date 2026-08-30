import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceDialogueModel } from "./twilio-dialogue-session";
import type { VoiceEvidenceEvent } from "./evidence-recorder";
import type {
  VoiceSchedulingAuthority,
  VoiceSchedulingCommand,
} from "./scheduling-authority";

const operationId = z.string().min(1).max(100);

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
      description: "Record whether the caller is the intended fictional patient. Use this before appointment facts.",
      inputSchema: z.object({
        operationId,
        result: z.enum(["confirmed", "unclear", "wrong_person"]),
      }).strict(),
      execute: (input) => execute({ name: "verify_identity", ...input }),
    }),
    find_slots: tool({
      description: "Return eligible fictional replacement times after identity confirmation.",
      inputSchema: z.object({
        dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(6).optional(),
        operationId,
        provider: z.enum(["any", "current"]),
        timePreference: z.enum(["morning", "afternoon", "evening"]).optional(),
      }).strict(),
      execute: (input) => execute({ name: "find_slots", ...input }),
    }),
    prepare_change: tool({
      description: "Prepare one server-side reschedule or cancellation. This does not change the appointment.",
      inputSchema: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("reschedule"),
          operationId,
          slotId: z.string().min(1),
        }).strict(),
        z.object({
          kind: z.literal("cancellation"),
          operationId,
        }).strict(),
      ]),
      execute: (input) => execute({ name: "prepare_change", ...input }),
    }),
    commit_change: tool({
      description: "Commit only the prepared server-side action after the caller gives exact confirmation.",
      inputSchema: z.object({
        actionToken: z.string().min(1),
        confirmed: z.boolean(),
        operationId,
      }).strict(),
      execute: (input) => execute({ name: "commit_change", ...input }),
    }),
    request_staff_follow_up: tool({
      description: "Record a staff follow-up when automation cannot continue safely.",
      inputSchema: z.object({
        operationId,
        reason: z.string().min(1).max(200),
      }).strict(),
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
    "Use warm, concise American English and natural conversation.",
    "Respond directly to questions, corrections, silence, and topic changes.",
    "Keep the caller's goal after an interruption. Do not restart answered questions.",
    "Use verify_identity before you disclose appointment details.",
    "Use find_slots for every availability claim. Never invent a date, time, or provider.",
    "Use prepare_change after the caller selects one returned slot or requests cancellation.",
    "Ask for exact confirmation of the complete change before you use commit_change.",
    "Never claim that an appointment changed unless commit_change returns change_committed.",
    "Do not give clinical advice. Refer clinical questions to clinic staff, then resume scheduling when appropriate.",
    "Use request_staff_follow_up when identity fails, a tool fails, or safe automation cannot continue.",
    "Keep most replies under two short sentences. Ask one useful question at a time.",
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
    async prefetch(turn) {
      const result = options.runner.run({
        messages: [...messages, { content: turn.callerText, role: "user" }],
        signal: turn.signal,
        system,
        tools,
        toolsEnabled: false,
      });
      for await (const token of result.textStream) {
        void token;
        if (turn.signal.aborted) return;
      }
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
