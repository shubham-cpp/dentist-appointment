import assert from "node:assert/strict";
import test from "node:test";
import {
  assertApprovedTelnyxRequest,
  getConfiguration,
  renderAssistantTestTemplate,
  runCommand,
} from "./run-telnyx-ai-assistant-safety-corpus.mjs";

const assistantId = "assistant-8b41cac9-9f80-4ca7-8d38-868f076abaaa";
const metadata = {
  assistant: { id: assistantId },
  integrationSecret: { identifier: "trial_secret" },
  publicBaseUrl: "https://voice.example.test",
  tools: [
    "record_identity",
    "load_safe_case",
    "search_slots",
    "prepare_reschedule",
    "commit_reschedule",
    "prepare_cancellation",
    "commit_cancellation",
    "staff_follow_up",
    "hangup",
  ].map((name, index) => ({ id: `tool-valid-${index}`, name })),
};
const env = {
  TELNYX_AI_ASSISTANT_ID: assistantId,
  TELNYX_API_KEY: "test-api-key",
  VOICE_ASSISTANT_TEST_MODE: "true",
  VOICE_ASSISTANT_TEST_TOOL_TOKEN: "t".repeat(43),
  VOICE_GATEWAY_INTERNAL_SECRET: "internal-secret",
  VOICE_GATEWAY_INTERNAL_URL: "http://127.0.0.1:3001",
  VOICE_GATEWAY_PUBLIC_BASE_URL: "https://voice.example.test",
};

test("allows only Phase 5 AI resource endpoints", () => {
  assert.doesNotThrow(() => assertApprovedTelnyxRequest("GET", "/v2/ai/tools?page[size]=100"));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "POST",
    `/v2/ai/assistants/${assistantId}`,
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "POST",
    `/v2/ai/assistants/${assistantId}/tools/tool-valid-1/test`,
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "GET",
    "/v2/ai/conversations/123e4567-e89b-12d3-a456-426614174000/messages?page[size]=100",
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "POST",
    "/v2/ai/assistants/tests/test-suites/dental-scheduling-safety-v1/runs",
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "PUT",
    "/v2/ai/assistants/tests/test-valid-1",
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "GET",
    `/v2/ai/assistants/${assistantId}/versions/20260826T070808581933`,
  ));
  assert.doesNotThrow(() => assertApprovedTelnyxRequest(
    "PATCH",
    "/v2/ai/tools/tool-valid-1",
  ));
  assert.throws(
    () => assertApprovedTelnyxRequest("POST", "/v2/calls"),
    /outside the Phase 5 Assistant Test allowlist/,
  );
  assert.throws(
    () => assertApprovedTelnyxRequest("DELETE", "/v2/ai/tools/tool-valid-1"),
    /outside the Phase 5 Assistant Test allowlist/,
  );
});

test("requires explicit fictional test mode and a loopback internal URL", () => {
  assert.equal(getConfiguration(env, metadata).assistantId, assistantId);
  assert.throws(
    () => getConfiguration({ ...env, VOICE_ASSISTANT_TEST_MODE: "false" }, metadata),
    /must be true/,
  );
  assert.throws(
    () => getConfiguration({
      ...env,
      VOICE_GATEWAY_INTERNAL_URL: "https://gateway.example.test",
    }, metadata),
    /loopback host/,
  );
});

test("renders fictional Assistant Test variables without changing production templates", () => {
  const template = "Hello {{patient_first_name}} from {{clinic_name}} on {{clinic_current_date}} in {{clinic_time_zone}}.";
  const rendered = renderAssistantTestTemplate(template, {
    clinic_current_date: "2026-08-26",
    clinic_name: "Brightview Dental",
    clinic_time_zone: "Asia/Kolkata",
    patient_first_name: "Olivia",
  });

  assert.equal(
    rendered,
    "Hello Olivia from Brightview Dental on 2026-08-26 in Asia/Kolkata.",
  );
  assert.match(template, /\{\{patient_first_name\}\}/);
  assert.throws(
    () => renderAssistantTestTemplate(template, {}),
    /Assistant Test variable/,
  );
});

test("dry-run validates 52 local cases without a network request", async () => {
  let fetchCount = 0;
  const output: string[] = [];
  const result = await runCommand({
    args: ["--dry-run"],
    env,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("unexpected fetch");
    },
    readMetadata: async () => metadata,
    write: (message) => output.push(message),
  });
  assert.equal(result, 0);
  assert.equal(fetchCount, 0);
  assert.match(output.join("\n"), /52 fictional scenarios/);
});
