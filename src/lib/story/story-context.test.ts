import { describe, expect, it } from "vitest";
import {
  extractSentenceContainingUsage,
  findStorySelectionCacheIndex,
} from "./story-context";

describe("Story contextual translation helpers", () => {
  it("extracts the first matching sentence with normalized whitespace", () => {
    expect(
      extractSentenceContainingUsage(
        "The team allocated   funds carefully. They later reviewed the plan.",
        "allocated"
      )
    ).toBe("The team allocated funds carefully.");
  });

  it("returns an empty string rather than throwing when no sentence matches", () => {
    expect(extractSentenceContainingUsage("A short story.", "missing")).toBe("");
  });

  it("keeps selections in different sentence contexts separate", () => {
    const entries = [
      {
        selectedText: "bank",
        surroundingSentence: "They sat beside the river bank.",
      },
    ];
    expect(findStorySelectionCacheIndex(entries, " BANK ", "They sat beside the river   bank.")).toBe(0);
    expect(findStorySelectionCacheIndex(entries, "bank", "The bank approved the loan.")).toBe(-1);
  });
});
