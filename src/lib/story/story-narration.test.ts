import { describe, expect, it } from "vitest";
import { splitStoryIntoNarrationChunks } from "./story-narration";

describe("story narration chunks", () => {
  it("keeps sentences together when splitting a story for browser speech", () => {
    expect(
      splitStoryIntoNarrationChunks(
        "Mia opened the door.\n\nShe smiled at her friend. They walked home together.",
        50
      )
    ).toEqual([
      "Mia opened the door. She smiled at her friend.",
      "They walked home together.",
    ]);
  });

  it("splits an overlong sentence by words without dropping text", () => {
    const chunks = splitStoryIntoNarrationChunks(
      "One two three four five six seven eight nine ten.",
      20
    );

    expect(chunks).toEqual(["One two three four", "five six seven eight", "nine ten."]);
    expect(chunks.join(" ")).toBe("One two three four five six seven eight nine ten.");
  });
});
