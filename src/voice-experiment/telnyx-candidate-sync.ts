import { createTelnyxAssistantDraft } from "./telnyx-candidate";
import { telnyxAssistantConfigurationMatches } from "./telnyx-candidate-preflight";

type SynchronizationDependencies = {
  getAssistant(assistantId: string): Promise<Record<string, unknown>>;
  updateAssistant(assistantId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
};

function versionId(value: Record<string, unknown>) {
  if (typeof value.version_id !== "string" || !value.version_id) {
    throw new Error("Telnyx did not return an assistant version ID.");
  }
  return value.version_id;
}

export async function synchronizeTelnyxCandidateAssistant(options: {
  assistantId: string;
  dataRetentionEnabled?: boolean;
  dependencies: SynchronizationDependencies;
  publicBaseUrl: string;
  recordingEnabled?: boolean;
}) {
  const expected = createTelnyxAssistantDraft({
    dataRetentionEnabled: options.dataRetentionEnabled,
    publicBaseUrl: options.publicBaseUrl,
    recordingEnabled: options.recordingEnabled,
  });
  const current = await options.dependencies.getAssistant(options.assistantId);
  if (telnyxAssistantConfigurationMatches(current, expected)) {
    return { changed: false, versionId: versionId(current) } as const;
  }

  const updated = await options.dependencies.updateAssistant(options.assistantId, {
    ...expected,
    promote_to_main: true,
    version_name: "Local voice candidate",
  });
  return { changed: true, versionId: versionId(updated) } as const;
}
