import { TELNYX_MAEVE_VOICE } from "@/voice-experiment/telnyx-candidate";

export type SynthesizeSpeech = (text: string, signal: AbortSignal) => Promise<Buffer>;

export function createSpeechSynthesizer(apiKey: string): SynthesizeSpeech {
  return async (text, signal) => {
    const response = await fetch("https://api.telnyx.com/v2/text-to-speech/speech", {
      method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ text, voice: TELNYX_MAEVE_VOICE, output_type: "binary_output" }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/mpeg")) {
      throw new Error(`Speech generation failed: HTTP ${response.status}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 128 || audio.length > 2_000_000 ||
      !(audio.subarray(0, 3).toString() === "ID3" || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0))) {
      throw new Error("Speech generation did not return an MP3 file");
    }
    return audio;
  };
}
