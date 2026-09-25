import { describe, expect, it } from "vitest";
import { buildStoryPrompt } from "./story-prompt";

describe("buildStoryPrompt", () => {
  it("carries every learner choice into a JSON-only prompt", () => {
    const prompt = buildStoryPrompt({
      targetWords: ["allocate", "reliable", "cloud computing"],
      cefr: "C1",
      length: "long",
      topic: "A first day on an engineering team",
    });

    expect(prompt).toContain('["allocate","reliable","cloud computing"]');
    expect(prompt).toContain("CEFR C1");
    expect(prompt).toContain("Reading length: long");
    expect(prompt).toContain("A first day on an engineering team");
    expect(prompt).toContain("Return ONLY one valid JSON object");
    expect(prompt).toContain('"contextualTranslations"');
  });
});
