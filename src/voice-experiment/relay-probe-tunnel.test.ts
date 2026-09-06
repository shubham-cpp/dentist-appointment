import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { startRelayProbeTunnel } from "./relay-probe-tunnel";

function launch(code: string) {
  return spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"] });
}

test("discovers a split JSON HTTPS URL and stops only its own child", async () => {
  const unrelated = launch("setInterval(() => {}, 1000)");
  let owned: ChildProcess | undefined;
  try {
    const tunnel = await startRelayProbeTunnel(3002, { launch: () => {
      owned = launch('process.stdout.write("progress\\n{\\"msg\\":\\"started tunnel\\",");setTimeout(()=>process.stdout.write("\\"url\\":\\"https://probe.example\\"}\\n"),20);setInterval(()=>{},1000)');
      return owned;
    } });
    assert.equal(tunnel.publicBaseUrl, "https://probe.example");
    await tunnel.stop();
    await tunnel.stop();
    assert.notEqual(owned?.signalCode, null);
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.signalCode, null);
  } finally {
    owned?.kill("SIGTERM");
    unrelated.kill("SIGTERM");
    await once(unrelated, "close");
  }
});

test("early ngrok exit reports failure without exposing its output", async () => {
  await assert.rejects(startRelayProbeTunnel(3002, { launch: () => launch('console.error("secret-example");process.exit(1)') }), /ngrok exited before creating/);
});

test("startup deadline terminates a child that never announces a URL", async () => {
  let child: ChildProcess | undefined;
  await assert.rejects(startRelayProbeTunnel(3002, { timeoutMs: 50, launch: () => {
    child = launch("setInterval(() => {}, 1000)");
    return child;
  } }), /startup deadline/);
  assert.notEqual(child?.signalCode, null);
});

test("abort during startup cleans up its child", async () => {
  const controller = new AbortController();
  let child: ChildProcess | undefined;
  const starting = startRelayProbeTunnel(3002, { signal: controller.signal, launch: () => {
    child = launch("setInterval(() => {}, 1000)");
    return child;
  } });
  controller.abort();
  await assert.rejects(starting, /canceled/);
  assert.notEqual(child?.signalCode, null);
});

test("missing ngrok produces an actionable error", async () => {
  await assert.rejects(startRelayProbeTunnel(3002, { launch: () => spawn("/nonexistent/relay-probe-ngrok", []) }), /Install ngrok/);
});
