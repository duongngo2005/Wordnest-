import { describe, expect, it } from "vitest";
import {
  CLOUD_TTS_VOICES,
  isCloudTtsVoiceId,
  normalizeTtsText,
} from "./voice-catalog";

describe("WordNest Kokoro voice catalog", () => {
  it("exposes a small curated English allowlist", () => {
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
  });

  it("accepts only curated client voice IDs and normalizes equivalent text", () => {
    expect(isCloudTtsVoiceId("wordnest:andrew")).toBe(true);
    expect(isCloudTtsVoiceId("unconfigured:voice")).toBe(false);
    expect(normalizeTtsText("  Small   steps\n every day.  ")).toBe("Small steps every day.");
  });
});
