import { fileURLToPath } from "node:url";
import { startGateway } from "@/voice-gateway/server";
import { loadVoiceRuntimeSelection } from "./runtime-switch";
import { startTwilioCandidateServer } from "./twilio-candidate-server";
import { startTelnyxCandidateServer } from "./telnyx-candidate-server";

export async function startSelectedVoiceRuntime(
  environment: Record<string, string | undefined> = process.env,
) {
  const runtime = loadVoiceRuntimeSelection(environment);
  if (runtime === "current-gateway") return startGateway(environment);
  if (runtime === "twilio-candidate") return startTwilioCandidateServer(environment);
  return startTelnyxCandidateServer(environment);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startSelectedVoiceRuntime();
}
