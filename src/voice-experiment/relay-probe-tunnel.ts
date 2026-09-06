import { spawn, type ChildProcess } from "node:child_process";

export async function startRelayProbeTunnel(port: number, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  launch?: () => ChildProcess;
} = {}) {
  options.signal?.throwIfAborted();
  const child = options.launch?.() ?? spawn("ngrok", [
    "http", String(port), "--name=custom-relay-probe", "--inspect=false", "--log=stdout", "--log-format=json",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 3_000);
    try { await closed; } finally { clearTimeout(force); }
  })();
  let rejectReady: (error: Error) => void = () => {};
  const abort = () => {
    rejectReady(new Error("Probe tunnel startup canceled."));
    void stop();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  const ready = new Promise<string>((resolve, reject) => {
    rejectReady = reject;
    let buffer = "";
    child.once("error", () => reject(new Error("Could not start ngrok. Install ngrok and configure its auth token first.")));
    child.once("close", () => reject(new Error("ngrok exited before creating the probe tunnel. Check ngrok authentication and endpoint limits.")));
    child.stderr?.resume(); // Do not echo provider logs or credentials into our output.
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 65_536) { reject(new Error("Unexpected ngrok startup output.")); return; }
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        try {
          const entry = JSON.parse(line);
          if (entry.msg !== "started tunnel" || typeof entry.url !== "string") continue;
          const url = new URL(entry.url);
          if (url.protocol === "https:" && !url.username && !url.password) resolve(url.origin);
        } catch { /* Ignore non-JSON progress lines. */ }
      }
    });
  });
  const timeout = setTimeout(() => rejectReady(new Error("ngrok did not create a probe tunnel within the startup deadline.")), options.timeoutMs ?? 20_000);
  try {
    const publicBaseUrl = await ready;
    options.signal?.throwIfAborted();
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Probe tunnel stopped during startup.");
    return { publicBaseUrl, stop, closed };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    clearTimeout(timeout);
    // The caller owns normal shutdown after readiness.
    options.signal?.removeEventListener("abort", abort);
  }
}
