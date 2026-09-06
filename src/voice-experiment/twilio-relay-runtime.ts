import type { VoiceEvidenceEvent } from "@/voice-core/evidence-recorder";
import type { TwilioDialogueSession } from "./twilio-dialogue-session";

export type TwilioRelaySetup = {
  callSid: string;
  customParameters: { relayToken: string; [key: string]: unknown };
  sessionId: string;
  type: "setup";
};

export type TwilioRelayMessage =
  | TwilioRelaySetup
  | { last: boolean; type: "prompt"; voicePrompt: string }
  | {
    durationUntilInterruptMs: number;
    type: "interrupt";
    utteranceUntilInterrupt: string;
  }
  | { type: "tokens-played" }
  | { description: string; type: "error" };

export class TwilioRelayRuntimeError extends Error {
  constructor(
    readonly code: "duplicate_setup" | "provider_error" | "setup_required",
    message: string,
  ) {
    super(message);
    this.name = "TwilioRelayRuntimeError";
  }
}

export type TwilioRelayRuntime = {
  close(): void;
  handle(message: TwilioRelayMessage): Promise<void>;
};

export function createTwilioRelayRuntime(options: {
  createSession(setup: TwilioRelaySetup): TwilioDialogueSession;
  monotonicNow?: () => number;
  now?: () => Date;
  record(event: VoiceEvidenceEvent): Promise<void>;
}): TwilioRelayRuntime {
  let session: TwilioDialogueSession | undefined;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const now = options.now ?? (() => new Date());

  async function record(
    channel: VoiceEvidenceEvent["channel"],
    type: string,
    payload: Record<string, unknown>,
  ) {
    await options.record({
      channel,
      monotonicMs: monotonicNow(),
      observedAt: now().toISOString(),
      payload,
      source: "twilio-conversation-relay",
      type,
    });
  }

  return {
    close() {
      session?.close();
    },
    async handle(message) {
      if (message.type === "setup") {
        if (session) {
          throw new TwilioRelayRuntimeError("duplicate_setup", "Relay setup is already complete.");
        }
        session = options.createSession(message);
        await record("events", "relay.setup", message);
        return;
      }

      if (!session) {
        throw new TwilioRelayRuntimeError("setup_required", "Relay setup is required.");
      }

      if (message.type === "prompt") {
        await record(
          "transcript",
          message.last ? "transcript.final" : "transcript.partial",
          message,
        );
        if (message.last) {
          const result = await session.respond(message.voicePrompt);
          await record("model", `model.output.${result.status}`, result);
        }
        return;
      }

      if (message.type === "interrupt") {
        session.interrupt();
        await record("events", "relay.interrupt", message);
        return;
      }

      if (message.type === "tokens-played") {
        await record("events", "relay.tokens_played", message);
        return;
      }

      await record("events", "relay.error", message);
      session.close();
      throw new TwilioRelayRuntimeError("provider_error", "ConversationRelay reported an error.");
    },
  };
}
