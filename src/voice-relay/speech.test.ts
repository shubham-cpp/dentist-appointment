import assert from "node:assert/strict";
import test from "node:test";
import { createSpeechSynthesizer } from "./speech";

test("confirmation synthesis returns verified audio through the working REST endpoint", async t => {
  const audio = Buffer.alloc(256);
  audio.write("ID3");
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.telnyx.com/v2/text-to-speech/speech");
    assert.equal(JSON.parse(String(init.body)).text, "Please confirm option three.");
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  });
  assert.deepEqual(await createSpeechSynthesizer("test")("Please confirm option three.", new AbortController().signal), audio);
});

for (const failure of ["http", "content-type", "empty", "invalid-mp3"]) {
  test(`confirmation synthesis rejects ${failure} instead of leaving the relay`, async t => {
    t.mock.method(globalThis, "fetch", async () => new Response(failure === "empty" ? "" : "x".repeat(256), {
      status: failure === "http" ? 503 : 200,
      headers: { "content-type": failure === "content-type" ? "application/json" : "audio/mpeg" },
    }));
    await assert.rejects(createSpeechSynthesizer("test")("Please confirm.", new AbortController().signal));
  });
}
