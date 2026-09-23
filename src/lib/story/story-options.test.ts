import { describe, expect, it } from "vitest";
import { getStoryGenerationGuidance } from "./story-options";

describe("Story generation guidance", () => {
  it("scales each reading length and vocabulary target for a large selection", () => {
    expect(getStoryGenerationGuidance("short", 60)).toMatchObject({
      minWords: 390,
      maxWords: 550,
      vocabularyTarget: { min: 24, max: 30 },
    });
    expect(getStoryGenerationGuidance("medium", 60)).toMatchObject({
      minWords: 770,
      maxWords: 940,
      vocabularyTarget: { min: 36, max: 45 },
    });
    expect(getStoryGenerationGuidance("long", 60)).toMatchObject({
      minWords: 1030,
      maxWords: 1290,
      vocabularyTarget: { min: 48, max: 54 },
    });
  });

  it("keeps a readable minimum range for a small selection", () => {
    expect(getStoryGenerationGuidance("short", 3)).toMatchObject({
      minWords: 100,
      maxWords: 150,
      vocabularyTarget: { min: 2, max: 2 },
    });
  });
});
