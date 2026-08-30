import assert from "node:assert/strict";
import test from "node:test";
import { createTelnyxAssistantDraft } from "./telnyx-candidate";
import { synchronizeTelnyxCandidateAssistant } from "./telnyx-candidate-sync";

test("does not create a version when the current assistant matches", async () => {
  let updateCount = 0;
  const result = await synchronizeTelnyxCandidateAssistant({
    assistantId: "assistant-test",
    dependencies: {
      async getAssistant() {
        return {
          ...createTelnyxAssistantDraft({ publicBaseUrl: "https://active.example.test" }),
          id: "assistant-test",
          version_id: "version-current",
        };
      },
      async updateAssistant() {
        updateCount += 1;
        return {};
      },
    },
    publicBaseUrl: "https://active.example.test",
  });

  assert.deepEqual(result, { changed: false, versionId: "version-current" });
  assert.equal(updateCount, 0);
});

test("promotes one complete version when a tunnel rotates", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const result = await synchronizeTelnyxCandidateAssistant({
    assistantId: "assistant-test",
    dependencies: {
      async getAssistant() {
        return {
          ...createTelnyxAssistantDraft({ publicBaseUrl: "https://expired.example.test" }),
          id: "assistant-test",
          version_id: "version-old",
        };
      },
      async updateAssistant(_assistantId, body) {
        updates.push(body);
        return { id: "assistant-test", version_id: "version-new" };
      },
    },
    publicBaseUrl: "https://active.example.test",
  });

  assert.deepEqual(result, { changed: true, versionId: "version-new" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.promote_to_main, true);
  const tools = updates[0]?.tools as Array<Record<string, unknown>>;
  const webhooks = tools.filter((tool) => tool.type === "webhook");
  assert.equal(webhooks.length, 5);
  assert.ok(webhooks.every((tool) => (
    String((tool.webhook as Record<string, unknown>).url).startsWith("https://active.example.test/")
  )));
  assert.deepEqual(tools.at(-1), {
    hangup: {
      description: "End the call after a brief closing when the caller clearly asks to end it.",
    },
    type: "hangup",
  });
});

test("fails before startup when Telnyx omits the active version ID", async () => {
  await assert.rejects(
    () => synchronizeTelnyxCandidateAssistant({
      assistantId: "assistant-test",
      dependencies: {
        async getAssistant() {
          return {
            ...createTelnyxAssistantDraft({ publicBaseUrl: "https://active.example.test" }),
            id: "assistant-test",
          };
        },
        async updateAssistant() {
          return {};
        },
      },
      publicBaseUrl: "https://active.example.test",
    }),
    /version ID/i,
  );
});
