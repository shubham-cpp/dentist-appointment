import { spawn } from "node:child_process";
import { once } from "node:events";
import { startRelayProbeTunnel } from "../src/voice-experiment/relay-probe-tunnel";
import { createRelayGateway } from "../src/voice-relay/gateway";
import { loadRelayConfig } from "../src/voice-relay/config";

const controller = new AbortController();
let resolveStopped!: () => void;
const stopped = new Promise<void>(resolve => { resolveStopped = resolve; });
const stop = () => { controller.abort(); resolveStopped(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
let tunnel: Awaited<ReturnType<typeof startRelayProbeTunnel>> | undefined;
let gateway: Awaited<ReturnType<typeof createRelayGateway>> | undefined;
let dashboard: ReturnType<typeof spawn> | undefined;
let dashboardClosed: Promise<unknown> | undefined;
try {
  // Validate credentials before opening a tunnel. The real URL replaces this placeholder.
  loadRelayConfig({ ...process.env, VOICE_GATEWAY_PUBLIC_BASE_URL: "https://relay.invalid" });
  tunnel = await startRelayProbeTunnel(Number(process.env.VOICE_GATEWAY_PORT ?? 3001), { signal: controller.signal });
  void tunnel.closed.then(stop);
  const environment = { ...process.env, VOICE_RUNTIME: "telnyx-relay", VOICE_GATEWAY_PUBLIC_BASE_URL: tunnel.publicBaseUrl };
  const config = loadRelayConfig(environment);
  gateway = await createRelayGateway(config);
  await gateway.app.listen({ host: "127.0.0.1", port: config.VOICE_GATEWAY_PORT });
  const health = await fetch(`${tunnel.publicBaseUrl}/health`, { headers: { "ngrok-skip-browser-warning": "1" }, signal: AbortSignal.timeout(10_000) });
  if (!health.ok || (await health.json()).runtime !== "telnyx-relay") throw new Error("Public tunnel did not reach the relay gateway.");
  const preflight = await gateway.app.inject({ url: "/internal/preflight", headers: { "x-voice-gateway-secret": config.VOICE_GATEWAY_INTERNAL_SECRET } });
  if (preflight.statusCode !== 200) throw new Error("Provider/model preflight failed. No call placed.");
  controller.signal.throwIfAborted();
  dashboard = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", process.env.VOICE_DASHBOARD_PORT ?? "3000"], {
    env: { ...environment, VOICE_GATEWAY_INTERNAL_URL: `http://127.0.0.1:${config.VOICE_GATEWAY_PORT}` }, stdio: "inherit",
  });
  dashboardClosed = once(dashboard, "close");
  dashboard.on("error", stop);
  void dashboardClosed.then(stop, stop);
  console.log(`Custom relay gateway ready. When Next.js reports ready, open http://localhost:${process.env.VOICE_DASHBOARD_PORT ?? "3000"}/dashboard and use the controlled Call button. No call placed by startup.`);
  await stopped;
} finally {
  controller.abort();
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  if (dashboard && dashboard.exitCode === null && dashboard.signalCode === null) {
    dashboard.kill("SIGTERM");
    const force = setTimeout(() => dashboard?.kill("SIGKILL"), 5_000);
    try { await dashboardClosed; } finally { clearTimeout(force); }
  }
  try { await gateway?.app.close(); } finally { await tunnel?.stop(); }
}
