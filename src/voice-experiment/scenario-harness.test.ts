import assert from "node:assert/strict";
import test from "node:test";
import {
  runVoiceScenarioCorpus,
  runVoiceScenario,
  voiceScenarioCorpus,
  type VoiceScenarioAdapter,
  type VoiceScenarioObservation,
} from "./scenario-harness";

test("defines the provider-neutral conversation scenarios", () => {
  assert.equal(voiceScenarioCorpus.length, 16);
  assert.equal(new Set(voiceScenarioCorpus.map((scenario) => scenario.id)).size, voiceScenarioCorpus.length);
  for (const scenario of voiceScenarioCorpus) {
    assert.ok(scenario.callerTurns.length > 0, `${scenario.id} needs caller turns`);
    assert.ok(scenario.expected.requiredFacts.length > 0, `${scenario.id} needs spoken facts`);
    assert.ok(scenario.expected.resultState, `${scenario.id} needs a result state`);
    assert.ok(Array.isArray(scenario.expected.toolOrder), `${scenario.id} needs a tool order`);
    assert.ok(
      scenario.expected.forbiddenChanges.length > 0,
      `${scenario.id} needs forbidden changes`,
    );
  }
  assert.doesNotMatch(JSON.stringify(voiceScenarioCorpus), /twilio|telnyx/i);
});

test("uses only the five approved deterministic tool names", () => {
  const names = new Set(voiceScenarioCorpus.flatMap((scenario) => scenario.expected.toolOrder));
  assert.deepEqual([...names].sort(), [
    "commit_change",
    "find_slots",
    "prepare_change",
    "request_staff_follow_up",
    "verify_identity",
  ]);
});

test("passes the same scenario meaning to simulation and live adapters", async () => {
  const scenario = voiceScenarioCorpus[0]!;
  const received = [] as Array<{ mode: string; scenario: unknown }>;
  const observation: VoiceScenarioObservation = {
    changes: ["appointment.rescheduled"],
    factsSpoken: scenario.expected.requiredFacts,
    resultState: scenario.expected.resultState,
    toolCalls: scenario.expected.toolOrder.map((name, index) => ({
      name,
      operationId: `operation-${index}`,
    })),
  };
  const adapter: VoiceScenarioAdapter = {
    async execute(input) {
      received.push({ mode: input.mode, scenario: input.scenario });
      return observation;
    },
  };

  const simulation = await runVoiceScenario({ adapter, mode: "simulation", scenario });
  const live = await runVoiceScenario({ adapter, mode: "live", scenario });

  assert.equal(simulation.passed, true);
  assert.equal(live.passed, true);
  assert.equal(received[0]!.scenario, scenario);
  assert.equal(received[1]!.scenario, scenario);
  assert.deepEqual(received.map((entry) => entry.mode), ["simulation", "live"]);
});

test("reports tool, fact, result, and forbidden-change failures together", async () => {
  const scenario = voiceScenarioCorpus[0]!;
  const adapter: VoiceScenarioAdapter = {
    async execute() {
      return {
        changes: [scenario.expected.forbiddenChanges[0]!],
        factsSpoken: [],
        resultState: "unchanged",
        toolCalls: [{ name: "commit_reschedule", operationId: "too-early" }],
      };
    },
  };

  const result = await runVoiceScenario({ adapter, mode: "simulation", scenario });

  assert.equal(result.passed, false);
  assert.deepEqual(result.assertions.map((assertion) => assertion.kind), [
    "tool-order",
    "facts-spoken",
    "result-state",
    "forbidden-changes",
  ]);
  assert.equal(result.assertions.every((assertion) => assertion.passed === false), true);
});

test("allows repeated availability reads without making the conversation static", async () => {
  const scenario = voiceScenarioCorpus[0]!;
  const adapter: VoiceScenarioAdapter = {
    async execute() {
      return {
        changes: [],
        factsSpoken: scenario.expected.requiredFacts,
        resultState: scenario.expected.resultState,
        toolCalls: [
          { name: "verify_identity", operationId: "identity-1" },
          { name: "find_slots", operationId: "slots-1" },
          { name: "find_slots", operationId: "slots-2" },
          { name: "prepare_change", operationId: "prepare-1" },
          { name: "commit_change", operationId: "commit-1" },
        ],
      };
    },
  };

  const result = await runVoiceScenario({ adapter, mode: "simulation", scenario });

  assert.equal(result.assertions.find((item) => item.kind === "tool-order")?.passed, true);
});

test("rejects duplicate operation IDs unless the scenario tests duplicate delivery", async () => {
  const normalScenario = voiceScenarioCorpus[0]!;
  const duplicateScenario = voiceScenarioCorpus[11]!;
  const adapter: VoiceScenarioAdapter = {
    async execute({ scenario }) {
      return {
        changes: [],
        factsSpoken: scenario.expected.requiredFacts,
        resultState: scenario.expected.resultState,
        toolCalls: scenario.expected.toolOrder.map((name) => ({
          name,
          operationId: "duplicate-operation",
        })),
      };
    },
  };

  const normalResult = await runVoiceScenario({
    adapter,
    mode: "simulation",
    scenario: normalScenario,
  });
  const duplicateResult = await runVoiceScenario({
    adapter,
    mode: "simulation",
    scenario: duplicateScenario,
  });

  assert.equal(normalResult.assertions.find((item) => item.kind === "operation-ids")?.passed, false);
  assert.equal(duplicateResult.assertions.find((item) => item.kind === "operation-ids")?.passed, true);
});

test("runs a complete corpus and preserves every failed scenario", async () => {
  const failedId = voiceScenarioCorpus[3]!.id;
  const adapter: VoiceScenarioAdapter = {
    async execute({ scenario }) {
      return {
        changes: [],
        factsSpoken: scenario.expected.requiredFacts,
        resultState: scenario.id === failedId ? "unchanged" : scenario.expected.resultState,
        toolCalls: scenario.expected.toolOrder.map((name, index) => ({
          name,
          operationId: `operation-${index}`,
        })),
      };
    },
  };

  const report = await runVoiceScenarioCorpus({ adapter, mode: "simulation" });

  assert.equal(report.passed, false);
  assert.equal(report.results.length, voiceScenarioCorpus.length);
  assert.deepEqual(report.failedScenarioIds, [failedId]);
  assert.equal(report.passedCount, voiceScenarioCorpus.length - 1);
});
