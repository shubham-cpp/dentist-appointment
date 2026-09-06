import { randomUUID } from "node:crypto";
import type { ControlledVoiceAttemptOutcome } from "@/lib/controlled-voice-attempt";
import type { VoiceCallContext } from "@/lib/voice-call-context";
import type { VoiceSchedulingAuthority, VoiceSchedulingResult } from "@/voice-core/scheduling-authority";
import type { Interpretation, Interpreter } from "./interpretation";

type Batch = Extract<VoiceSchedulingResult, { type: "slots_found" }>;
type Prepared = Extract<VoiceSchedulingResult, { type: "change_prepared" }>;
type Stage = "identity" | "reschedule" | "provider" | "slots" | "cancellation" | "confirmation" | "callback" | "callback_confirmation" | "ended";
export type ConversationReply = { text: string; terminal: boolean; outcome?: ControlledVoiceAttemptOutcome; readbackVersion?: number };

export class SchedulingConversation {
  private stage: Stage = "identity";
  private identity = false;
  private explained = false;
  private provider: "same" | "different" | "any" | undefined;
  private constraints: Partial<Record<"dateFrom" | "dateTo" | "timeFrom" | "timeTo", string>> = {};
  private batch?: Batch;
  private prepared?: Prepared;
  private callback?: NonNullable<Interpretation["callback"]>;
  private version = 0;
  private deliveredVersion?: number;
  private readbackVersion?: number;
  private active?: AbortController;
  private repairs = 0;
  private history: Array<{ role: "user" | "assistant"; text: string }> = [];

  constructor(private readonly options: {
    context: VoiceCallContext;
    interpreter: Interpreter;
    scheduling: VoiceSchedulingAuthority;
  }) {}

  snapshot() {
    return structuredClone({ stage: this.stage, identity: this.identity, explained: this.explained,
      provider: this.provider, constraints: this.constraints, batch: this.batch, prepared: this.prepared,
      callback: this.callback, version: this.version, readbackVersion: this.readbackVersion,
      deliveredVersion: this.deliveredVersion, history: this.history.slice(-8),
      appointment: this.options.context.appointment,
      callStartedAt: this.options.context.callStartedAt, clinicTimeZone: this.options.context.clinicTimeZone,
    });
  }

  greeting(): ConversationReply {
    return this.reply(`Hello, I am Willow from ${this.options.context.clinicName}. Am I speaking with ${this.options.context.patientFirstName}?`);
  }

  // Only the transport's verified delivery contract may invoke this method.
  readbackDelivered(version: number) {
    if (version === this.readbackVersion) this.deliveredVersion = version;
  }

  interrupt() {
    this.active?.abort();
    this.version += 1;
    this.deliveredVersion = undefined;
  }

  close() { this.interrupt(); this.stage = "ended"; }

  async respond(text: string): Promise<ConversationReply | undefined> {
    if (this.stage === "ended") return;
    this.active?.abort();
    const controller = new AbortController();
    this.active = controller;
    const version = ++this.version;
    this.history.push({ role: "user", text });
    try {
      const meaning = await this.options.interpreter({ text, state: this.snapshot(), signal: controller.signal });
      if (controller.signal.aborted || version !== this.version) return;
      const evidence = meaning.providerEvidence?.trim().toLocaleLowerCase();
      if (!evidence || !text.toLocaleLowerCase().includes(evidence)) meaning.provider = null;
      const constraintsEvidence = meaning.appointmentConstraintsEvidence?.trim().toLocaleLowerCase();
      if (!constraintsEvidence || !text.toLocaleLowerCase().includes(constraintsEvidence)) {
        meaning.dateFrom = meaning.dateTo = meaning.timeFrom = meaning.timeTo = null;
        meaning.clearConstraints = [];
      }
      return await this.apply(meaning);
    } catch {
      if (controller.signal.aborted || version !== this.version) return;
      return this.repair("I couldn't process that reply. Could you say it once more?");
    }
  }

  private reply(text: string, terminal = false, readback = false): ConversationReply {
    text = text.replace(/\bDr\.?(?=\s)/gi, "Doctor");
    if (terminal) this.stage = "ended";
    if (readback) {
      this.readbackVersion = this.version;
      this.deliveredVersion = undefined;
    }
    this.history.push({ role: "assistant", text });
    this.history = this.history.slice(-16);
    const authorityOutcome = this.options.scheduling.outcome();
    const outcome: ControlledVoiceAttemptOutcome = authorityOutcome === "cancelled" ? "canceled"
      : authorityOutcome === "identity_failed" ? "identity_failed"
      : authorityOutcome === "rescheduled" ? "rescheduled"
      : authorityOutcome === "staff_follow_up" ? "staff_follow_up"
      : authorityOutcome === "uncertain" ? "unknown" : "declined";
    return { text, terminal, ...(terminal ? { outcome } : {}), ...(readback ? { readbackVersion: this.readbackVersion } : {}) };
  }

  private end(text: string) {
    return this.reply(`${text} Thank you for your time with ${this.options.context.clinicName}. Goodbye.`, true);
  }

  private repair(text: string) {
    this.repairs += 1;
    return this.repairs > 2 ? this.end("I'm sorry we couldn't finish this request. No new change has been confirmed.") : this.reply(text);
  }

  private async apply(m: Interpretation): Promise<ConversationReply> {
    const previousStage = this.stage;
    const scheduling = this.options.scheduling;
    const operationId = () => randomUUID();
    if (m.intent === "end") return this.end("No further changes will be made.");
    if (m.identity === "wrong_person") {
      await scheduling.execute({ name: "verify_identity", result: "wrong_person", operationId: operationId() });
      return this.end("I'm sorry for the mistaken call.");
    }
    if (!this.identity && m.identity === "confirmed") {
      await scheduling.execute({ name: "verify_identity", result: "confirmed", operationId: operationId() });
      this.identity = true;
      if (this.stage === "identity") this.stage = "reschedule";
    }
    if (m.intent === "repeat") return this.repeatPending();
    const collectingCallback = this.stage === "callback" || this.stage === "callback_confirmation";
    if (m.intent === "callback" || (collectingCallback && m.callback)) return this.prepareCallback(m);
    if (this.stage === "callback" && m.intent === "unclear") return this.prepareCallback(m);
    if (m.provider) this.provider = m.provider;
    for (const key of m.clearConstraints) delete this.constraints[key];
    for (const key of ["dateFrom", "dateTo", "timeFrom", "timeTo"] as const) {
      if (m[key]) this.constraints[key] = m[key];
    }
    if (this.stage === "callback_confirmation" && m.intent === "confirm") {
      if (!this.confirmationDelivered()) return this.callbackReadback();
      const callback = this.callback!;
      await scheduling.execute({ name: "request_staff_follow_up", operationId: operationId(), reason: "caller_request",
        callback: { date: callback.date!, time: callback.time!, ...(callback.timeEnd ? { timeEnd: callback.timeEnd } : {}),
          timeZone: this.options.context.clinicTimeZone, confirmed: true } });
      return this.end("I've recorded your callback request. In this demo, staff can start that callback from the dashboard.");
    }
    if (this.stage === "callback_confirmation" && m.intent === "decline") {
      this.stage = "callback";
      if (this.callback) { this.callback.time = null; this.callback.timeEnd = null; }
      this.deliveredVersion = undefined;
      return this.reply("What callback time would work better for you?");
    }
    if (!this.identity) return this.repair(`Am I speaking with ${this.options.context.patientFirstName}?`);
    if (this.stage === "confirmation" && m.intent === "confirm" && (!m.slotId || m.slotId === this.prepared?.replacement?.id) && !m.provider
      && !m.dateFrom && !m.dateTo && !m.timeFrom && !m.timeTo && m.clearConstraints.length === 0) {
      if (!this.confirmationDelivered()) return this.readback();
      const result = await scheduling.execute({ name: "commit_change", actionToken: this.prepared!.actionToken,
        confirmed: true, operationId: operationId() });
      if (result.type !== "change_committed") throw new Error("Unexpected commit result");
      return this.end(result.result.kind === "rescheduled"
        ? "Your appointment has been rescheduled. A confirmation message is simulated in this demo."
        : "Your appointment has been canceled. A confirmation message is simulated in this demo.");
    }
    if (m.intent === "cancel" || (this.stage === "cancellation" && m.intent === "confirm")) {
      const result = await scheduling.execute({ name: "prepare_change", kind: "cancellation", operationId: operationId() });
      if (result.type !== "change_prepared") throw new Error("Unexpected prepared result");
      this.prepared = result;
      return this.readback();
    }
    if (m.intent === "decline") {
      if (this.stage === "confirmation") {
        const wasCancellation = this.prepared?.kind === "cancellation";
        this.prepared = undefined;
        this.deliveredVersion = undefined;
        if (wasCancellation) return this.end("I have not canceled your appointment.");
        if (this.batch) return this.offer(this.batch, "I have not changed your appointment. ");
      }
      this.prepared = undefined;
      this.deliveredVersion = undefined;
      if (this.stage === "cancellation") return this.end("I have not canceled your appointment.");
      this.stage = "cancellation";
      return this.reply("I'm sorry for the inconvenience. Would you like to cancel the appointment instead?");
    }
    let explanation = "";
    if (!this.explained) {
      const appointment = this.options.context.appointment;
      explanation = `I'm calling about rescheduling your appointment on ${appointment.dateLabel} at ${appointment.time}, because ${appointment.provider.name} is unavailable. `;
      this.explained = true;
    }
    const changedPreferences = Boolean(m.provider || m.dateFrom || m.dateTo || m.timeFrom || m.timeTo || m.clearConstraints.length);
    if (m.slotId && !changedPreferences && this.batch?.slots.some(slot => slot.id === m.slotId)) {
      const result = await scheduling.execute({ name: "prepare_change", kind: "reschedule", slotId: m.slotId, operationId: operationId() });
      if (result.type !== "change_prepared") throw new Error("Unexpected prepared result");
      this.prepared = result;
      return this.readback();
    }
    const wantsSearch = m.intent === "reschedule" || m.intent === "more" || m.intent === "correct" || changedPreferences;
    if (wantsSearch || (previousStage === "reschedule" && m.intent === "confirm")) {
      if (!this.provider) {
        return this.askProvider(explanation);
      }
      this.prepared = undefined;
      this.deliveredVersion = undefined;
      const result = await scheduling.execute({ name: "find_slots", operationId: operationId(), provider: this.provider,
        mode: m.intent === "more" ? "more" : "search", limit: 3, ...this.constraints, clearConstraints: m.clearConstraints });
      if (result.type !== "slots_found") throw new Error("Unexpected availability result");
      this.batch = result;
      return this.offer(result, explanation);
    }
    if (explanation) return this.reply(`${explanation}Would you like to reschedule?`);
    return this.repair(m.clarification ?? "Could you tell me what you would like to change?");
  }

  private askProvider(prefix = "") {
    this.stage = "provider";
    return this.reply(`${prefix}Would you prefer your current dentist, which may mean a later appointment, or another dentist who may have an earlier time?`);
  }

  private repeatPending(): ConversationReply {
    if (this.stage === "confirmation" && this.prepared) return this.readback();
    if (this.stage === "callback_confirmation" && this.callback) return this.callbackReadback();
    if (this.stage === "provider") return this.askProvider();
    if (this.stage === "slots" && this.batch) return this.offer(this.batch);
    const last = this.history.findLast(entry => entry.role === "assistant");
    return last ? this.reply(last.text) : this.greeting();
  }

  private confirmationDelivered() {
    return this.readbackVersion !== undefined && this.deliveredVersion === this.readbackVersion;
  }

  private readback() {
    this.stage = "confirmation";
    const prepared = this.prepared!;
    const slot = prepared.replacement;
    return this.reply(prepared.kind === "cancellation"
      ? `Please confirm: cancel your appointment on ${prepared.currentAppointment.dateLabel} at ${prepared.currentAppointment.time} with ${prepared.currentAppointment.provider.name}?`
      : `Please confirm: move your appointment to ${slot!.dateLabel} at ${slot!.time} with ${slot!.provider.name}?`, false, true);
  }

  private prepareCallback(m: Interpretation) {
    this.prepared = undefined;
    this.deliveredVersion = undefined;
    this.callback = { date: m.callback?.date ?? this.callback?.date ?? null,
      time: m.callback?.time ?? this.callback?.time ?? null,
      timeEnd: m.callback?.time ? m.callback.timeEnd : m.callback?.timeEnd ?? this.callback?.timeEnd ?? null };
    if (m.callbackTiming === "vague") { this.callback.time = null; this.callback.timeEnd = null; }
    this.stage = "callback";
    if (!this.callback.date || !this.callback.time) {
      return this.reply(m.clarification ?? (!this.callback.date ? "Which day would suit you for a callback?" : "What time would suit you that day?"));
    }
    return this.callbackReadback();
  }

  private callbackReadback() {
    this.stage = "callback_confirmation";
    return this.reply(`Would a callback on ${this.callback!.date} at ${this.callback!.time}${this.callback!.timeEnd ? ` to ${this.callback!.timeEnd}` : ""}, ${this.options.context.clinicTimeZone} time, work for you?`, false, true);
  }

  private offer(batch: Batch, prefix = "") {
    this.stage = "slots";
    if (batch.slots.length === 0) return this.repair("I couldn't find more matching times in the next 21 days. Would another dentist or a different time of day work?");
    this.repairs = 0;
    return this.reply(`${prefix}${batch.slots.map((slot, index) => `Option ${index + 1}: ${slot.dateLabel} at ${slot.timeLabel} with ${slot.providerName}.`).join(" ")} Which would suit you?`);
  }
}
