const loopbackHostnames = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLoopbackHttpUrl(url: URL) {
  return url.protocol === "http:" && loopbackHostnames.has(url.hostname);
}
