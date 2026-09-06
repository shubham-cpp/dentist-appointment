import { loadRelayConfig } from "./config";
import { createRelayGateway } from "./gateway";

export async function startRelayServer(environment: Record<string, string | undefined> = process.env) {
  const config = loadRelayConfig(environment);
  const runtime = await createRelayGateway(config);
  await runtime.app.listen({ host: "127.0.0.1", port: config.VOICE_GATEWAY_PORT });
  const stop = () => { void runtime.app.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`Custom Telnyx relay gateway listening on ${config.VOICE_GATEWAY_PORT}`);
  return runtime;
}
