import { describe, expect, it, vi } from "vitest";
import {
  AzureSpeechProvider,
  CloudTtsUnavailableError,
  buildAzureSpeechSsml,
} from "./azure-speech-provider";
import { getCloudTtsVoice } from "./voice-catalog";

describe("AzureSpeechProvider", () => {
  it("is unavailable without server credentials", async () => {
    const provider = new AzureSpeechProvider({ key: "", region: "" });

    expect(provider.isAvailable()).toBe(false);
    await expect(
      provider.synthesize({ text: "hello", voice: getCloudTtsVoice("wordnest:ava")! })
    ).rejects.toBeInstanceOf(CloudTtsUnavailableError);
  });

  it("sends escaped SSML to the configured Azure region and returns MP3 audio", async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(new Uint8Array([73, 68, 51]), { status: 200 });
    });
    const provider = new AzureSpeechProvider({ key: "server-only-key", region: "eastus", fetcher });

    const audio = await provider.synthesize({
      text: "Tom & <Mia>",
      voice: getCloudTtsVoice("wordnest:ava")!,
    });

    expect(new Uint8Array(audio)).toEqual(new Uint8Array([73, 68, 51]));
    expect(fetcher).toHaveBeenCalledWith(
      "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Ocp-Apim-Subscription-Key": "server-only-key",
          "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
        }),
      })
    );
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain("Tom &amp; &lt;Mia&gt;");
  });

  it("uses the provider voice ID only on the server-side SSML boundary", () => {
    expect(buildAzureSpeechSsml("Small steps.", "wordnest:sonia")).toContain(
      "en-GB-Sonia:DragonHDLatestNeural"
    );
  });
});
