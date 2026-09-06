export type VoiceDialogueMessage = {
  content: string;
  role: "assistant" | "user";
};

export type VoiceDialogueTurn = {
  callerText: string;
  history: VoiceDialogueMessage[];
  signal: AbortSignal;
};

export type VoiceDialogueModel = {
  generate(turn: VoiceDialogueTurn): AsyncIterable<string>;
};

export type TwilioTextMessage = {
  interruptible: true;
  last: boolean;
  preemptible: true;
  token: string;
  type: "text";
};

export type TwilioDialogueSession = {
  close(): void;
  interrupt(): void;
  respond(callerText: string): Promise<{ status: "completed" | "interrupted"; text: string }>;
};

export function createTwilioDialogueSession(options: {
  model: VoiceDialogueModel;
  send(message: TwilioTextMessage): void;
}): TwilioDialogueSession {
  const history: VoiceDialogueMessage[] = [];
  let activeGeneration: AbortController | undefined;
  let closed = false;

  return {
    close() {
      closed = true;
      activeGeneration?.abort();
    },
    interrupt() {
      activeGeneration?.abort();
    },
    async respond(callerText) {
      if (closed) throw new Error("The dialogue session is closed.");
      activeGeneration?.abort();
      const controller = new AbortController();
      activeGeneration = controller;
      let assistantText = "";
      const turn: VoiceDialogueTurn = {
        callerText,
        history: structuredClone(history),
        signal: controller.signal,
      };

      try {
        for await (const token of options.model.generate(turn)) {
          if (controller.signal.aborted || closed) break;
          assistantText += token;
          options.send({
            interruptible: true,
            last: false,
            preemptible: true,
            token,
            type: "text",
          });
        }
        const interrupted = controller.signal.aborted || closed;
        if (!interrupted) {
          options.send({
            interruptible: true,
            last: true,
            preemptible: true,
            token: "",
            type: "text",
          });
        }
        history.push({ content: callerText, role: "user" });
        if (assistantText) history.push({ content: assistantText, role: "assistant" });
        return { status: interrupted ? "interrupted" : "completed", text: assistantText };
      } catch (error) {
        if (controller.signal.aborted || closed) {
          history.push({ content: callerText, role: "user" });
          if (assistantText) history.push({ content: assistantText, role: "assistant" });
          return { status: "interrupted", text: assistantText };
        }
        throw error;
      } finally {
        if (activeGeneration === controller) activeGeneration = undefined;
      }
    },
  };
}
