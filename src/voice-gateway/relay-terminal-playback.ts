import type { ControlledVoiceAttemptOutcome } from "@/lib/controlled-voice-attempt";

type TerminalOutcome = Exclude<ControlledVoiceAttemptOutcome, "none">;
type FinishReason = "played" | "timeout";

export class RelayTerminalPlayback {
  private pendingOutcome?: TerminalOutcome;
  private timeout?: ReturnType<typeof setTimeout>;
  private unconfirmedSpeechCount = 0;

  constructor(
    private readonly timeoutMs: number,
    private readonly onFinish: (outcome: TerminalOutcome, reason: FinishReason) => void,
  ) {}

  get isPending() {
    return this.pendingOutcome !== undefined;
  }

  recordSpeechSent() {
    this.unconfirmedSpeechCount += 1;
  }

  begin(outcome: TerminalOutcome) {
    this.cancel();
    this.pendingOutcome = outcome;
    this.timeout = setTimeout(() => {
      const pendingOutcome = this.pendingOutcome;
      this.cancel();
      if (pendingOutcome) this.onFinish(pendingOutcome, "timeout");
    }, this.timeoutMs);
  }

  confirmPlayback() {
    if (this.unconfirmedSpeechCount === 0) return false;
    this.unconfirmedSpeechCount -= 1;

    const pendingOutcome = this.pendingOutcome;
    if (!pendingOutcome || this.unconfirmedSpeechCount > 0) return false;

    this.cancel();
    this.onFinish(pendingOutcome, "played");
    return true;
  }

  cancel() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.pendingOutcome = undefined;
  }

  reset() {
    this.cancel();
    this.unconfirmedSpeechCount = 0;
  }
}
