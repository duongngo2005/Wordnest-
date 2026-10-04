import { describe, expect, it, vi } from "vitest";
import {
  KokoroSpeechProvider,
  KokoroTtsSynthesisError,
  KokoroTtsUnavailableError,
} from "./kokoro-speech-provider";
import { getCloudTtsVoice } from "./voice-catalog";

describe("KokoroSpeechProvider", () => {
  it("sends a curated WordNest voice to the local OpenAI-compatible Kokoro endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([73, 68, 51]), { status: 200 }));
    const provider = new KokoroSpeechProvider({
      baseUrl: "http://127.0.0.1:8000",
      fetcher,
    });

    await expect(provider.synthesize({
      text: "Small steps",
      voice: getCloudTtsVoice("wordnest:ava")!,
    })).resolves.toEqual(new Uint8Array([73, 68, 51]).buffer);

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "kokoro",
          input: "Small steps",
          voice: "af_heart",
          response_format: "mp3",
        }),
      })
    );
  });

  it("is unavailable when no local Kokoro endpoint is configured", async () => {
    const provider = new KokoroSpeechProvider({ baseUrl: "" });

    expect(provider.isAvailable()).toBe(false);
    await expect(provider.synthesize({
      text: "Small steps",
      voice: getCloudTtsVoice("wordnest:ava")!,
    })).rejects.toBeInstanceOf(KokoroTtsUnavailableError);
  });

  it("fails closed when Kokoro returns an error", async () => {
    const provider = new KokoroSpeechProvider({
      baseUrl: "http://127.0.0.1:8000",
      fetcher: vi.fn(async () => new Response("not ready", { status: 503 })),
    });

    await expect(provider.synthesize({
      text: "Small steps",
      voice: getCloudTtsVoice("wordnest:ava")!,
    })).rejects.toBeInstanceOf(KokoroTtsSynthesisError);
  });
});
