import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEECH_PREFERENCES,
  parseSpeechPreferences,
} from "./speech-preferences";

describe("parseSpeechPreferences", () => {
  it("uses the stored voice and a supported reading speed", () => {
    expect(
      parseSpeechPreferences(JSON.stringify({ voiceURI: "Samantha", rate: 1.15 }))
    ).toEqual({ voiceURI: "Samantha", rate: 1.15 });
  });

  it("keeps valid values when another saved field is invalid", () => {
    expect(
      parseSpeechPreferences(JSON.stringify({ voiceURI: "Google US English", rate: 2 }))
    ).toEqual({ voiceURI: "Google US English", rate: 0.9 });
  });

  it("falls back to defaults for missing or malformed saved data", () => {
    expect(parseSpeechPreferences(null)).toEqual(DEFAULT_SPEECH_PREFERENCES);
    expect(parseSpeechPreferences("not json")).toEqual(DEFAULT_SPEECH_PREFERENCES);
    expect(parseSpeechPreferences(JSON.stringify(["voice", 1]))).toEqual(
      DEFAULT_SPEECH_PREFERENCES
    );
  });
});
