import assert from "node:assert/strict";
import test from "node:test";
import { createTelnyxAssistantDraft, TELNYX_MAEVE_VOICE } from "./telnyx-candidate";
import {
  TelnyxCandidatePreflightError,
  runTelnyxCandidatePreflight,
} from "./telnyx-candidate-preflight";

function readyDependencies() {
  return {
    async callbackReady() {
      return true;
    },
    async readProvider() {
      return {
        accountReady: true,
        assistant: {
          ...createTelnyxAssistantDraft({ publicBaseUrl: "https://voice.example.test" }),
          id: "assistant-test",
          version_id: "version-test",
        },
        connectionReady: true,
        phoneNumberOwned: true,
        publicKeyMatches: true,
        voices: [{ accent: "American", id: TELNYX_MAEVE_VOICE, language: "en-US" }],
      };
    },
  };
}

test("passes only when every locked non-billable Telnyx dependency is ready", async () => {
  const result = await runTelnyxCandidatePreflight({
    assistantId: "assistant-test",
    assistantVersionId: "version-test",
    dependencies: readyDependencies(),
    publicBaseUrl: "https://voice.example.test",
  });

  assert.ok(result.checks.every((check) => check.passed));
  assert.deepEqual(result.checks.map((check) => check.name), [
    "account",
    "connection",
    "source-number",
    "public-key",
    "callback",
    "maeve-voice",
    "assistant-version",
    "assistant-configuration",
  ]);
});

test("reports the old assistant as a failed hypothesis instead of accepting it", async () => {
  const dependencies: Parameters<typeof runTelnyxCandidatePreflight>[0]["dependencies"] = readyDependencies();
  dependencies.readProvider = async () => ({
    accountReady: true,
    assistant: {
      ...createTelnyxAssistantDraft({ publicBaseUrl: "https://voice.example.test" }),
      id: "assistant-test",
      model: "openai/gpt-5.6-luna",
      privacy_settings: { data_retention: false },
      telephony_settings: {
        recording_settings: { channels: "dual", enabled: false, format: "mp3", stop_on_conversation_end: false },
        send_message_history_updates: true,
      },
      tools: [{ webhook: { name: "old_scripted_tool" } }],
      transcription: {
        language: "en",
        model: "deepgram/flux",
        settings: { eager_eot_threshold: 0.3, eot_threshold: 0.8, eot_timeout_ms: 5_000 },
      },
      version_id: "old-version",
    },
    connectionReady: true,
    phoneNumberOwned: true,
    publicKeyMatches: true,
    voices: [{ accent: "American", id: TELNYX_MAEVE_VOICE, language: "en-US" }],
  });

  await assert.rejects(
    () => runTelnyxCandidatePreflight({
      assistantId: "assistant-test",
      assistantVersionId: "version-test",
      dependencies,
      publicBaseUrl: "https://voice.example.test",
    }),
    (error: unknown) => error instanceof TelnyxCandidatePreflightError
      && error.failedChecks.includes("assistant-version")
      && error.failedChecks.includes("assistant-configuration"),
  );
});

test("rejects assistant tool drift even when every tool name still matches", async (context) => {
  const mutations: Array<{
    mutate(tool: Record<string, unknown>): void;
    name: string;
  }> = [
    {
      name: "URL",
      mutate(tool) {
        (tool.webhook as Record<string, unknown>).url = "https://expired.example.test/voice-experiment/telnyx/tools/verify_identity";
      },
    },
    {
      name: "method",
      mutate(tool) {
        (tool.webhook as Record<string, unknown>).method = "GET";
      },
    },
    {
      name: "headers",
      mutate(tool) {
        (tool.webhook as Record<string, unknown>).headers = [];
      },
    },
    {
      name: "timeout",
      mutate(tool) {
        (tool.webhook as Record<string, unknown>).timeout_ms = 5_000;
      },
    },
    {
      name: "body schema",
      mutate(tool) {
        (tool.webhook as Record<string, unknown>).body_parameters = {
          properties: {},
          type: "object",
        };
      },
    },
  ];

  for (const mutation of mutations) {
    await context.test(mutation.name, async () => {
      const dependencies: Parameters<typeof runTelnyxCandidatePreflight>[0]["dependencies"] = readyDependencies();
      dependencies.readProvider = async () => {
        const assistant = structuredClone({
          ...createTelnyxAssistantDraft({ publicBaseUrl: "https://voice.example.test" }),
          id: "assistant-test",
          version_id: "version-test",
        }) as Record<string, unknown>;
        mutation.mutate((assistant.tools as Array<Record<string, unknown>>)[0]!);
        return {
          accountReady: true,
          assistant,
          connectionReady: true,
          phoneNumberOwned: true,
          publicKeyMatches: true,
          voices: [{ accent: "American", id: TELNYX_MAEVE_VOICE, language: "en-US" }],
        };
      };

      await assert.rejects(
        () => runTelnyxCandidatePreflight({
          assistantId: "assistant-test",
          assistantVersionId: "version-test",
          dependencies,
          publicBaseUrl: "https://voice.example.test",
        }),
        (error: unknown) => error instanceof TelnyxCandidatePreflightError
          && error.failedChecks.length === 1
          && error.failedChecks[0] === "assistant-configuration",
      );
    });
  }
});
