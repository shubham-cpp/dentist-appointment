import assert from "node:assert/strict";
import test from "node:test";
import { voiceScenarioCorpus } from "./scenario-harness";
import {
  TELNYX_DIALOGUE_TEST_SUITE,
  createTelnyxDialogueTestDrafts,
  evaluateTelnyxDialogueRun,
  sameTelnyxDialogueTest,
  telnyxDialogueTestApiBody,
} from "./telnyx-dialogue-qualification";

test("builds one flexible web-chat test for every shared scenario", () => {
  const drafts = createTelnyxDialogueTestDrafts("assistant-test");

  assert.equal(drafts.length, 12);
  assert.deepEqual(
    drafts.map((draft) => draft.scenarioId),
    voiceScenarioCorpus.map((scenario) => scenario.id),
  );
  assert.ok(drafts.every((draft) => draft.destination === "assistant-test"));
  assert.ok(drafts.every((draft) => draft.telnyx_conversation_channel === "web_chat"));
  assert.ok(drafts.every((draft) => draft.test_suite === TELNYX_DIALOGUE_TEST_SUITE));
  assert.ok(drafts.every((draft) => draft.rubric.length === 4));
  assert.ok(drafts.every((draft) => /paraphrase|adapt naturally/i.test(draft.instructions)));
  assert.ok(drafts.every((draft) => /Never combine numbered steps/i.test(draft.instructions)));
  assert.ok(drafts.every((draft) => /replace Jamie with Olivia/i.test(draft.instructions)));
  assert.ok(drafts.every((draft) => /first reply must contain only step 1/i.test(draft.instructions)));
  assert.ok(drafts.every((draft) => !draft.rubric[3]!.criteria.includes("operation ID")));
});

test("keeps tool names in evaluation criteria, not caller directions", () => {
  const drafts = createTelnyxDialogueTestDrafts("assistant-test");
  const toolNames = [
    "verify_identity",
    "find_slots",
    "prepare_change",
    "commit_change",
    "request_staff_follow_up",
  ];

  for (const draft of drafts) {
    assert.ok(toolNames.every((name) => !draft.instructions.includes(name)));
    assert.doesNotMatch(draft.instructions, /record_identity|search_slots|commit_reschedule/);
  }
  assert.match(JSON.stringify(drafts[0]?.rubric), /verify_identity/);
});

test("compares provider records and checks provider plus local tool evidence", () => {
  const draft = createTelnyxDialogueTestDrafts("assistant-test")[0]!;
  const apiBody = telnyxDialogueTestApiBody(draft);
  assert.equal("scenarioId" in apiBody, false);
  assert.equal(sameTelnyxDialogueTest({ ...apiBody, test_id: "test-1" }, draft), true);
  assert.equal(evaluateTelnyxDialogueRun({
    providerStatus: "passed",
    scenario: voiceScenarioCorpus[0]!,
    toolCalls: voiceScenarioCorpus[0]!.expected.toolOrder.map((name, index) => ({
      name,
      operationId: `operation-${index}`,
    })),
  }).passed, true);
  assert.equal(evaluateTelnyxDialogueRun({
    providerStatus: "passed",
    scenario: voiceScenarioCorpus[0]!,
    toolCalls: [{ name: "verify_identity" }],
  }).passed, false);
});
