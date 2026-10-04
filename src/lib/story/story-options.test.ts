import { describe, expect, it } from "vitest";
import { getStoryGenerationGuidance } from "./story-options";

describe("Story generation guidance", () => {
  it("scales each reading length and vocabulary target for a large selection", () => {
    expect(getStoryGenerationGuidance("short", 60)).toMatchObject({
      minWords: 390,
      maxWords: 550,
      vocabularyTarget: { min: 60, max: 60 },
    });
    expect(getStoryGenerationGuidance("medium", 60)).toMatchObject({
      minWords: 770,
      maxWords: 940,
      vocabularyTarget: { min: 60, max: 60 },
    });
    expect(getStoryGenerationGuidance("long", 60)).toMatchObject({
      minWords: 1030,
      maxWords: 1290,
      vocabularyTarget: { min: 60, max: 60 },
    });
  });

  it("keeps a readable minimum range for a small selection", () => {
    expect(getStoryGenerationGuidance("short", 3)).toMatchObject({
      minWords: 100,
      maxWords: 150,
      vocabularyTarget: { min: 3, max: 3 },
    });
  });

  it("targets every selected vocabulary concept regardless of reading length", () => {
    expect(getStoryGenerationGuidance("medium", 8).vocabularyTarget).toEqual({ min: 8, max: 8 });
    expect(getStoryGenerationGuidance("long", 62).vocabularyTarget).toEqual({ min: 62, max: 62 });
  });
});
