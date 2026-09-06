export type VoiceScenarioMode = "live" | "simulation";

export type VoiceScenarioCallerTurn = {
  delivery: "interrupt" | "silence" | "speech";
  intent: string;
  utterances: string[];
};

export type VoiceScenario = {
  allowDuplicateOperationIds?: boolean;
  callerTurns: VoiceScenarioCallerTurn[];
  expected: {
    forbiddenChanges: string[];
    requiredFacts: string[];
    resultState: string;
    toolOrder: string[];
  };
  id: string;
  title: string;
};

export type VoiceScenarioObservation = {
  changes: string[];
  factsSpoken: string[];
  resultState: string;
  toolCalls: Array<{
    name: string;
    operationId?: string;
  }>;
};

export type VoiceScenarioAdapter = {
  execute(input: {
    mode: VoiceScenarioMode;
    scenario: VoiceScenario;
  }): Promise<VoiceScenarioObservation>;
};

export type VoiceScenarioAssertion = {
  actual: unknown;
  expected: unknown;
  kind:
    | "facts-spoken"
    | "forbidden-changes"
    | "operation-ids"
    | "result-state"
    | "tool-order";
  passed: boolean;
};

export type VoiceScenarioResult = {
  assertions: VoiceScenarioAssertion[];
  mode: VoiceScenarioMode;
  observation: VoiceScenarioObservation;
  passed: boolean;
  scenarioId: string;
};

export type VoiceScenarioCorpusResult = {
  failedScenarioIds: string[];
  mode: VoiceScenarioMode;
  passed: boolean;
  passedCount: number;
  results: VoiceScenarioResult[];
};

const identityTool = ["verify_identity"];
const rescheduleTools = [
  ...identityTool,
  "find_slots",
  "prepare_change",
  "commit_change",
];
const rescheduleForbidden = [
  "appointment.cancelled",
  "appointment.changed_without_confirmation",
  "other_patient.changed",
];

function spoken(intent: string, ...utterances: string[]): VoiceScenarioCallerTurn {
  return { delivery: "speech", intent, utterances };
}

function interrupted(intent: string, ...utterances: string[]): VoiceScenarioCallerTurn {
  return { delivery: "interrupt", intent, utterances };
}

export const voiceScenarioCorpus: VoiceScenario[] = [
  {
    id: "standard-current-provider-reschedule",
    title: "Standard reschedule with the current provider",
    callerTurns: [
      spoken("confirm_identity", "Yes, this is Jamie."),
      spoken("request_current_provider", "Can we move it and keep the same dentist?"),
      spoken("select_slot", "The first time works."),
      spoken("confirm_reschedule", "Yes, please reschedule it."),
    ],
    expected: {
      forbiddenChanges: rescheduleForbidden,
      requiredFacts: ["current_appointment", "selected_provider", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "earliest-qualified-provider",
    title: "Earliest time with any qualified provider",
    callerTurns: [
      spoken("confirm_identity", "Speaking."),
      spoken("request_earliest_any_provider", "Whoever can see me first is fine."),
      spoken("select_slot", "Let's take the earliest one."),
      spoken("confirm_reschedule", "Go ahead."),
    ],
    expected: {
      forbiddenChanges: rescheduleForbidden,
      requiredFacts: ["current_appointment", "provider_may_change", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "broad-date-time-constraints",
    title: "Broad date and time constraints",
    callerTurns: [
      spoken("confirm_identity", "Yes."),
      spoken("set_constraints", "Anything next week after lunch should work."),
      spoken("select_slot", "Wednesday afternoon sounds good."),
      spoken("confirm_reschedule", "Please make that change."),
    ],
    expected: {
      forbiddenChanges: rescheduleForbidden,
      requiredFacts: ["date_constraint", "time_constraint", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "correction-after-selection",
    title: "Correction after a slot selection",
    callerTurns: [
      spoken("confirm_identity", "This is Jamie."),
      spoken("select_slot", "Tuesday at two works."),
      spoken("correct_slot", "Sorry, I meant Thursday, not Tuesday."),
      spoken("confirm_reschedule", "Thursday is correct. Please book it."),
    ],
    expected: {
      forbiddenChanges: [...rescheduleForbidden, "discarded_slot.booked"],
      requiredFacts: ["discarded_slot", "corrected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: [...identityTool, "find_slots", "find_slots", "prepare_change", "commit_change"],
    },
  },
  {
    id: "interrupt-normal-reply",
    title: "Interruption during a normal reply",
    callerTurns: [
      spoken("confirm_identity", "Yes, this is Jamie."),
      interrupted("request_earliest", "Sorry to interrupt. Just give me the earliest time."),
      spoken("select_slot", "That one works."),
      spoken("confirm_reschedule", "Yes, change it."),
    ],
    expected: {
      forbiddenChanges: [...rescheduleForbidden, "pre_interruption_goal.used"],
      requiredFacts: ["interruption_acknowledged", "latest_goal", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "interrupt-final-confirmation",
    title: "Interruption during final confirmation",
    callerTurns: [
      spoken("confirm_identity", "Yes."),
      spoken("select_slot", "Friday morning."),
      interrupted("reject_then_correct", "Wait, don't change it to Friday. Make it Monday."),
      spoken("confirm_reschedule", "Monday is right. Please change it."),
    ],
    expected: {
      forbiddenChanges: [...rescheduleForbidden, "rejected_slot.booked"],
      requiredFacts: ["rejected_slot", "corrected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: [...identityTool, "find_slots", "find_slots", "prepare_change", "commit_change"],
    },
  },
  {
    id: "silence-retry-safe-termination",
    title: "Silence, retry, and safe termination",
    callerTurns: [
      { delivery: "silence", intent: "no_response", utterances: [] },
      { delivery: "silence", intent: "no_response", utterances: [] },
      { delivery: "silence", intent: "no_response", utterances: [] },
    ],
    expected: {
      forbiddenChanges: ["appointment.rescheduled", "appointment.cancelled", "staff_follow_up.created"],
      requiredFacts: ["retry_prompt", "safe_termination"],
      resultState: "unchanged",
      toolOrder: [],
    },
  },
  {
    id: "unexpected-question-return",
    title: "Unexpected question followed by return to scheduling",
    callerTurns: [
      spoken("confirm_identity", "Yes, this is Jamie."),
      spoken("ask_unexpected_question", "Before that, where can I park?"),
      spoken("return_to_scheduling", "Thanks. Now can we move the appointment?"),
      spoken("select_slot", "The second option."),
      spoken("confirm_reschedule", "Yes, please."),
    ],
    expected: {
      forbiddenChanges: rescheduleForbidden,
      requiredFacts: ["question_answered_or_deferred", "scheduling_goal_retained", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "clinical-question-redirection",
    title: "Clinical question and safe redirection",
    callerTurns: [
      spoken("confirm_identity", "Yes."),
      spoken("ask_clinical_question", "Should I stop taking my medicine before the visit?"),
      spoken("return_to_scheduling", "Okay. Let's still move the appointment."),
      spoken("select_slot", "Thursday morning."),
      spoken("confirm_reschedule", "Yes."),
    ],
    expected: {
      forbiddenChanges: [...rescheduleForbidden, "clinical_advice.given"],
      requiredFacts: ["clinical_boundary", "staff_or_clinician_referral", "selected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "wrong-person-ambiguous-identity",
    title: "Wrong person and ambiguous identity",
    callerTurns: [
      spoken("deny_identity", "Jamie isn't here. I'm their roommate."),
      spoken("claim_ambiguous_permission", "They probably want me to handle it."),
    ],
    expected: {
      forbiddenChanges: ["appointment.disclosed", "appointment.rescheduled", "appointment.cancelled"],
      requiredFacts: ["identity_not_confirmed", "no_appointment_disclosure", "safe_termination"],
      resultState: "unchanged",
      toolOrder: ["verify_identity"],
    },
  },
  {
    id: "confirmed-cancellation",
    title: "Confirmed cancellation",
    callerTurns: [
      spoken("confirm_identity", "This is Jamie."),
      spoken("request_cancellation", "I need to cancel the appointment."),
      spoken("confirm_cancellation", "Yes, cancel it."),
    ],
    expected: {
      forbiddenChanges: ["appointment.rescheduled", "appointment.cancelled_without_confirmation", "other_patient.changed"],
      requiredFacts: ["current_appointment", "cancellation_effect", "cancellation_confirmed"],
      resultState: "cancelled",
      toolOrder: [...identityTool, "prepare_change", "commit_change"],
    },
  },
  {
    id: "tool-failure-duplicate-staff-follow-up",
    title: "Tool failure, duplicate delivery, and staff follow-up",
    allowDuplicateOperationIds: true,
    callerTurns: [
      spoken("confirm_identity", "Yes."),
      spoken("request_reschedule", "Please move it to the first available time."),
      spoken("confirm_reschedule", "Yes, make the change."),
      spoken("accept_staff_follow_up", "A staff callback is fine."),
    ],
    expected: {
      forbiddenChanges: ["appointment.partially_changed", "appointment.duplicated", "other_patient.changed"],
      requiredFacts: ["tool_failure_acknowledged", "outcome_not_claimed", "staff_follow_up_promised"],
      resultState: "staff_follow_up",
      toolOrder: [
        ...identityTool,
        "find_slots",
        "prepare_change",
        "commit_change",
        "commit_change",
        "request_staff_follow_up",
      ],
    },
  },
  {
    id: "identity-and-relative-callback",
    title: "Identity and tomorrow at the same time in one reply",
    callerTurns: [
      spoken("confirm_identity_and_defer", "You have the right person, but I'm heading out. Try me this time tomorrow.", "Speaking. Can't chat now, tomorrow at this hour?"),
      spoken("confirm_callback_readback", "Yes, that works."),
    ],
    expected: {
      forbiddenChanges: ["appointment.rescheduled", "appointment.cancelled", "callback.unconfirmed"],
      requiredFacts: ["no_repeated_greeting", "relative_callback_resolved", "callback_confirmed", "demo_callback_disclosed"],
      resultState: "staff_follow_up",
      toolOrder: ["verify_identity", "request_staff_follow_up"],
    },
  },
  {
    id: "tentative-evening-callback",
    title: "Tentative callback period without redundant questions",
    callerTurns: [
      spoken("confirm_identity", "Yes, you are."),
      spoken("defer_with_tentative_period", "I'm tied up. Could we try tomorrow evening maybe?", "Now isn't good. Tomorrow evening might work."),
      spoken("confirm_callback_window", "That window is fine, yes."),
    ],
    expected: {
      forbiddenChanges: ["appointment.rescheduled", "appointment.cancelled", "callback.unconfirmed"],
      requiredFacts: ["no_repeated_greeting", "callback_window_retained", "callback_confirmed", "demo_callback_disclosed"],
      resultState: "staff_follow_up",
      toolOrder: ["verify_identity", "request_staff_follow_up"],
    },
  },
  {
    id: "compound-preferences-repeat-and-correct",
    title: "Compound preferences, repeated options, and correction in one reply",
    callerTurns: [
      spoken("confirm_identity", "That's me."),
      spoken("provider_and_time_preference", "A different dentist is okay. Just make it after lunch."),
      spoken("repeat_current_options", "Could you read those same choices once more?"),
      spoken("correct_selection_in_same_turn", "Number one, no sorry, I meant number three."),
      spoken("confirm_reschedule", "Yes, please make that change."),
    ],
    expected: {
      forbiddenChanges: [...rescheduleForbidden, "discarded_slot.booked", "repeated_batch.advanced"],
      requiredFacts: ["time_constraint", "batch_repeated", "corrected_slot", "change_confirmed"],
      resultState: "rescheduled",
      toolOrder: rescheduleTools,
    },
  },
  {
    id: "decline-rescheduling-without-cancelling",
    title: "Declining rescheduling does not authorize cancellation",
    callerTurns: [
      spoken("confirm_identity", "Speaking."),
      spoken("decline_rescheduling", "I'd rather not rearrange it."),
      spoken("decline_cancellation_and_end", "No, don't cancel anything. Let's leave it there. Goodbye."),
    ],
    expected: {
      forbiddenChanges: ["appointment.rescheduled", "appointment.cancelled"],
      requiredFacts: ["cancellation_offered_not_assumed", "safe_termination"],
      resultState: "unchanged",
      toolOrder: ["verify_identity"],
    },
  },
];

function collapseRepeatableReads(sequence: string[]) {
  return sequence.filter((name, index) => (
    name !== "find_slots" || sequence[index - 1] !== "find_slots"
  ));
}

export function matchesVoiceToolOrder(actual: string[], expected: string[]) {
  const normalizedActual = collapseRepeatableReads(actual);
  const normalizedExpected = collapseRepeatableReads(expected);
  return normalizedActual.length === normalizedExpected.length
    && normalizedActual.every((value, index) => value === normalizedExpected[index]);
}

export async function runVoiceScenario(input: {
  adapter: VoiceScenarioAdapter;
  mode: VoiceScenarioMode;
  scenario: VoiceScenario;
}): Promise<VoiceScenarioResult> {
  const observation = await input.adapter.execute({
    mode: input.mode,
    scenario: input.scenario,
  });
  const actualToolOrder = observation.toolCalls.map((call) => call.name);
  const missingFacts = input.scenario.expected.requiredFacts.filter(
    (fact) => !observation.factsSpoken.includes(fact),
  );
  const forbiddenChanges = observation.changes.filter(
    (change) => input.scenario.expected.forbiddenChanges.includes(change),
  );
  const assertions: VoiceScenarioAssertion[] = [
    {
      actual: actualToolOrder,
      expected: input.scenario.expected.toolOrder,
      kind: "tool-order",
      passed: matchesVoiceToolOrder(actualToolOrder, input.scenario.expected.toolOrder),
    },
    {
      actual: missingFacts,
      expected: [],
      kind: "facts-spoken",
      passed: missingFacts.length === 0,
    },
    {
      actual: observation.resultState,
      expected: input.scenario.expected.resultState,
      kind: "result-state",
      passed: observation.resultState === input.scenario.expected.resultState,
    },
    {
      actual: forbiddenChanges,
      expected: [],
      kind: "forbidden-changes",
      passed: forbiddenChanges.length === 0,
    },
  ];

  const operationIds = observation.toolCalls
    .map((call) => call.operationId)
    .filter((operationId): operationId is string => Boolean(operationId));
  const hasDuplicateOperationIds = new Set(operationIds).size !== operationIds.length;
  if (hasDuplicateOperationIds || input.scenario.allowDuplicateOperationIds) {
    assertions.push({
      actual: operationIds,
      expected: input.scenario.allowDuplicateOperationIds ? "duplicates allowed" : "unique values",
      kind: "operation-ids",
      passed: input.scenario.allowDuplicateOperationIds === true,
    });
  }

  return {
    assertions,
    mode: input.mode,
    observation,
    passed: assertions.every((assertion) => assertion.passed),
    scenarioId: input.scenario.id,
  };
}

export async function runVoiceScenarioCorpus(input: {
  adapter: VoiceScenarioAdapter;
  mode: VoiceScenarioMode;
  scenarios?: VoiceScenario[];
}): Promise<VoiceScenarioCorpusResult> {
  const results: VoiceScenarioResult[] = [];
  for (const scenario of input.scenarios ?? voiceScenarioCorpus) {
    results.push(await runVoiceScenario({
      adapter: input.adapter,
      mode: input.mode,
      scenario,
    }));
  }
  const failedScenarioIds = results
    .filter((result) => !result.passed)
    .map((result) => result.scenarioId);
  return {
    failedScenarioIds,
    mode: input.mode,
    passed: failedScenarioIds.length === 0,
    passedCount: results.length - failedScenarioIds.length,
    results,
  };
}
