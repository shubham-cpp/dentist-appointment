import {
  applyVoiceIntent,
  classifyLocalVoiceIntent,
  createVoiceConversationState,
  type VoiceConversationReply,
  type VoiceConversationState,
  voiceIntentSchema,
} from "./conversation";
import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceIntentClassifier } from "./intent-classifier";

export class VoiceConversationSession {
  private activeRequest?: AbortController;
  private closed = false;
  private epoch = 0;
  private state: VoiceConversationState = createVoiceConversationState();

  constructor(
    private readonly classifier: VoiceIntentClassifier,
    private readonly context: VoiceCallContext,
  ) {}

  get phase() {
    return this.state.phase;
  }

  canProcessLocally(callerText: string) {
    return Boolean(classifyLocalVoiceIntent(this.state, callerText));
  }

  async respondToFinalPrompt(callerText: string): Promise<VoiceConversationReply | undefined> {
    if (this.closed || this.state.phase === "ended") return undefined;

    const requestEpoch = ++this.epoch;
    const controller = new AbortController();
    this.activeRequest?.abort();
    this.activeRequest = controller;

    try {
      const localIntent = classifyLocalVoiceIntent(this.state, callerText);
      const intent = voiceIntentSchema.parse(localIntent ?? await this.classifier.classify({
        callerText,
        context: this.context,
        state: this.state,
      }, controller.signal));

      if (this.closed || requestEpoch !== this.epoch) return undefined;

      const reply = applyVoiceIntent(this.context, this.state, intent);
      this.state = reply.nextState;
      return reply;
    } catch (error) {
      if (controller.signal.aborted || this.closed || requestEpoch !== this.epoch) return undefined;
      throw error;
    } finally {
      if (requestEpoch === this.epoch) this.activeRequest = undefined;
    }
  }

  interrupt() {
    this.epoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = undefined;
  }

  close() {
    this.closed = true;
    this.interrupt();
  }
}
