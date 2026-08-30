import assert from "node:assert/strict";
import test from "node:test";
import {
  createTelnyxCandidateClient,
  TelnyxCandidateApiError,
} from "./telnyx-candidate-client";

test("uses authenticated assistant, test-run, and idempotent Dial APIs", async () => {
  const requests: Array<{ body?: unknown; headers: Headers; method: string; url: string }> = [];
  const client = createTelnyxCandidateClient({
    apiKey: "telnyx-test-key",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        url,
      });
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer telnyx-test-key");
      if (url.endsWith("/calls")) {
        return Response.json({
          data: {
            call_control_id: "v3:test-call",
            call_leg_id: "11111111-1111-4111-8111-111111111111",
            call_session_id: "22222222-2222-4222-8222-222222222222",
          },
        });
      }
      if (url.endsWith("/ai/assistants") && init?.method === "POST") {
        return Response.json({ id: "assistant-created", version_id: "version-created" });
      }
      if (url.endsWith("/ai/assistants/assistant-test") && init?.method === "POST") {
        return Response.json({ id: "assistant-test", version_id: "version-updated" });
      }
      if (url.endsWith("/ai/assistants/tests") && init?.method === "POST") {
        return Response.json({ test_id: "test-created" });
      }
      if (url.endsWith("/ai/assistants/tests/test-created/runs") && init?.method === "POST") {
        return Response.json({ run_id: "run-created", status: "pending", test_id: "test-created" });
      }
      if (url.endsWith("/ai/assistants/tests/test-created/runs/run-created")) {
        return Response.json({ run_id: "run-created", status: "passed", test_id: "test-created" });
      }
      if (url.endsWith("/ai/assistants/tests/test-created") && init?.method === "PUT") {
        return Response.json({ name: "updated", test_id: "test-created" });
      }
      if (url.includes("/ai/assistants/tests?") && init?.method !== "POST") {
        return Response.json({ data: [{ name: "test", test_id: "test-created" }] });
      }
      if (url.includes("/ai/assistants/tests/test-created/runs?")) {
        return Response.json({ data: [{ run_id: "run-created", status: "passed" }] });
      }
      if (url.includes("/ai/conversations/conversation-test/messages")) {
        return Response.json({ data: [{ role: "assistant", text: "Hello" }] });
      }
      return Response.json({ data: { id: "assistant-test", version_id: "version-test" } });
    },
  });

  const assistant = await client.getAssistant("assistant-test");
  assert.equal(assistant.id, "assistant-test");

  const created = await client.createAssistant({ instructions: "test", name: "candidate" });
  assert.equal(created.id, "assistant-created");
  const updated = await client.updateAssistant("assistant-test", { version_name: "qualification" });
  assert.equal(updated.version_id, "version-updated");
  assert.equal((await client.createAssistantTest({
    destination: "assistant-test",
    instructions: "test",
    name: "test",
    rubric: [{ criteria: "safe", name: "Safety" }],
  })).test_id, "test-created");
  assert.equal((await client.updateAssistantTest("test-created", {
    destination: "assistant-test",
    instructions: "updated",
    name: "updated",
    rubric: [{ criteria: "safe", name: "Safety" }],
  })).name, "updated");
  assert.equal((await client.listAssistantTests("suite"))[0]?.test_id, "test-created");
  assert.equal((await client.listAssistantTestRuns("test-created"))[0]?.run_id, "run-created");
  assert.equal((await client.triggerAssistantTest({
    idempotencyKey: "qualification-test-created",
    testId: "test-created",
    versionId: "version-updated",
  })).run_id, "run-created");
  assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "qualification-test-created");
  assert.equal((await client.getAssistantTestRun("test-created", "run-created")).status, "passed");
  assert.equal((await client.listConversationMessages("conversation-test"))[0]?.role, "assistant");

  const call = await client.dial({
    assistant: { dynamic_variables: {}, id: "assistant-test" },
    client_state: "e30",
    command_id: "command-test",
    connection_id: "connection-test",
    from: "+12025550112",
    to: "+12025550111",
  });
  assert.equal(call.callControlId, "v3:test-call");
  assert.equal(requests.at(-1)?.method, "POST");
  assert.equal((requests.at(-1)?.body as { command_id: string }).command_id, "command-test");
});

test("treats a lost Dial response as an uncertain creation", async () => {
  const client = createTelnyxCandidateClient({
    apiKey: "telnyx-test-key",
    fetch: async () => {
      throw new TypeError("network lost");
    },
  });

  await assert.rejects(
    () => client.dial({
      assistant: { dynamic_variables: {}, id: "assistant-test" },
      client_state: "e30",
      command_id: "command-test",
      connection_id: "connection-test",
      from: "+12025550112",
      to: "+12025550111",
    }),
    (error: unknown) => error instanceof Error && error.name === "TelnyxDialUncertainError",
  );
});

test("preserves a safe Telnyx validation reason", async () => {
  const client = createTelnyxCandidateClient({
    apiKey: "telnyx-test-key",
    fetch: async () => Response.json({
      errors: [{
        code: "10015",
        detail: "The client_state field must contain standard Base64.",
        title: "Invalid request payload",
      }],
    }, { status: 422 }),
  });

  await assert.rejects(
    () => client.dial({
      assistant: { dynamic_variables: {}, id: "assistant-test" },
      client_state: "e30",
      command_id: "command-test",
      connection_id: "connection-test",
      from: "+12025550112",
      to: "+12025550111",
    }),
    (error: unknown) => error instanceof TelnyxCandidateApiError
      && error.status === 422
      && error.providerCode === "10015"
      && error.providerDetail === "The client_state field must contain standard Base64."
      && /Invalid request payload/.test(error.message),
  );
});

test("accepts direct assistant and voice catalog response shapes", async () => {
  const client = createTelnyxCandidateClient({
    apiKey: "telnyx-test-key",
    fetch: async (input) => String(input).includes("voices")
      ? Response.json({ voices: [{ id: "voice-test" }] })
      : Response.json({ id: "assistant-test", version_id: "version-test" }),
  });

  assert.equal((await client.getAssistant("assistant-test")).version_id, "version-test");
  assert.deepEqual(await client.listVoices(), [{ id: "voice-test" }]);
});
