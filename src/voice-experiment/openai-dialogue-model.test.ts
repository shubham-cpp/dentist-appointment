import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceCallContext } from "@/lib/voice-call-context";
import { createVoiceSchedulingAuthority } from "@/voice-core/scheduling-authority";
import {
  createOpenAiVoiceDialogueModel,
  createTwilioCandidateSystemPrompt,
  createVoiceSchedulingTools,
  type VoiceModelRunner,
} from "./openai-dialogue-model";

test("uses a flexible persona prompt with deterministic scheduling boundaries", () => {
  const prompt = createTwilioCandidateSystemPrompt(createVoiceCallContext());

  assert.match(prompt, /Brightview Dental/);
  assert.match(prompt, /Olivia Garcia/);
  assert.match(prompt, /natural conversation/i);
  assert.match(prompt, /Never claim.*appointment.*changed/i);
  assert.match(prompt, /commit_change/);
  assert.match(prompt, /clinical advice/i);
  assert.doesNotMatch(prompt, /ask these questions in order|script/i);
});

test("exposes exactly the five approved scheduling tools", async () => {
  const authority = createVoiceSchedulingAuthority({ context: createVoiceCallContext() });
  const events: Array<{ payload: Record<string, unknown>; type: string }> = [];
  const tools = createVoiceSchedulingTools(authority, (event) => {
    events.push(event);
  });

  assert.deepEqual(Object.keys(tools), [
    "verify_identity",
    "find_slots",
    "prepare_change",
    "commit_change",
    "request_staff_follow_up",
  ]);

  const execute = tools.verify_identity.execute as (
    input: { operationId: string; result: "confirmed" },
    options: unknown,
  ) => Promise<unknown>;
  const result = await execute({ operationId: "identity-tool-1", result: "confirmed" }, {});
  assert.equal((result as { result: string }).result, "confirmed");
  assert.equal((result as { type: string }).type, "identity_recorded");
  assert.equal((result as { currentAppointment: { id: string } }).currentAppointment.id, "olivia");
  assert.deepEqual(events.map((event) => event.type), ["tool.started", "tool.completed"]);
  assert.equal(events[0]!.payload.operationId, "identity-tool-1");
  assert.equal(events[1]!.payload.name, "verify_identity");
});

test("keeps model and tool history across generated turns", async () => {
  const requests: Array<{ messages: unknown[]; toolsEnabled: boolean }> = [];
  const runner: VoiceModelRunner = {
    run(input) {
      requests.push({ messages: structuredClone(input.messages), toolsEnabled: input.toolsEnabled });
      const reply = requests.length === 1 ? "Which day works for you?" : "Thursday afternoon is available.";
      return {
        responseMessages: Promise.resolve([{ content: reply, role: "assistant" }]),
        textStream: (async function* () {
          yield reply;
        })(),
      };
    },
  };
  const model = createOpenAiVoiceDialogueModel({
    context: createVoiceCallContext(),
    runner,
    scheduling: createVoiceSchedulingAuthority({ context: createVoiceCallContext() }),
  });

  assert.equal("prefetch" in model, false);

  for await (const token of model.generate({
    callerText: "I need to move my appointment.",
    history: [],
    signal: new AbortController().signal,
  })) {
    assert.equal(typeof token, "string");
  }
  for await (const token of model.generate({
    callerText: "Thursday afternoon.",
    history: [],
    signal: new AbortController().signal,
  })) {
    assert.equal(typeof token, "string");
  }

  assert.equal(requests[0]!.toolsEnabled, true);
  assert.deepEqual(requests[1]!.messages, [
    { content: "I need to move my appointment.", role: "user" },
    { content: "Which day works for you?", role: "assistant" },
    { content: "Thursday afternoon.", role: "user" },
  ]);
});
