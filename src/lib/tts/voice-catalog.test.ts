import { describe, expect, it } from "vitest";
import {
  CLOUD_TTS_VOICES,
  isCloudTtsVoiceId,
  normalizeTtsText,
} from "./voice-catalog";
import { getAzureSpeechVoiceId } from "./azure-voice-catalog";

describe("WordNest cloud voice catalog", () => {
  it("exposes a small curated English allowlist with verified provider voice IDs", () => {
    expect(CLOUD_TTS_VOICES).toHaveLength(8);
    expect(CLOUD_TTS_VOICES.map((voice) => voice.id)).toEqual([
      "wordnest:ava",
      "wordnest:emma",
      "wordnest:jenny",
      "wordnest:andrew",
      "wordnest:davis",
      "wordnest:brian",
      "wordnest:sonia",
      "wordnest:ryan",
    ]);
    expect(getAzureSpeechVoiceId("wordnest:ava")).toBe(
      "en-US-Ava:DragonHDLatestNeural"
    );
    expect(getAzureSpeechVoiceId("wordnest:sonia")).toBe(
      "en-GB-Sonia:DragonHDLatestNeural"
    );
  });

  it("accepts only curated client voice IDs and normalizes equivalent text", () => {
    expect(isCloudTtsVoiceId("wordnest:andrew")).toBe(true);
    expect(isCloudTtsVoiceId("en-US-Ava:DragonHDLatestNeural")).toBe(false);
    expect(normalizeTtsText("  Small   steps\n every day.  ")).toBe("Small steps every day.");
  });
});
