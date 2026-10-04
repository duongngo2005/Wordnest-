import { describe, it, expect } from "vitest";

describe("Lesson Highlighting Logic Audit", () => {
  // Current implementation in LessonReader.tsx:
  // const terms = usages.map((u) => u.usedAs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // const regex = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
  // const parts = text.split(regex);

  function highlightWithCurrentLogic(text: string, usages: Array<{ term: string; usedAs: string }>) {
    if (usages.length === 0) return [text];
    const terms = usages.map((u) => u.usedAs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
    return text.split(regex);
  }

  function highlightWithImprovedLogic(text: string, usages: Array<{ term: string; usedAs: string }>) {
    if (usages.length === 0) return [text];
    // Sort longer terms first to prevent subphrase hijacking (e.g. "look forward to" before "look")
    const sorted = [...usages]
      .filter((u) => u.usedAs.trim().length > 0)
      .sort((a, b) => b.usedAs.length - a.usedAs.length);
    const pattern = sorted.map((u) => u.usedAs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(\\b(?:${pattern})\\b)`, "gi");
    return text.split(regex);
  }

  it("handles word boundaries: does not match 'car' inside 'careful'", () => {
    const text = "He was careful with his new car.";
    const usages = [{ term: "car", usedAs: "car" }];
    const parts = highlightWithCurrentLogic(text, usages);
    // Should match "car", not "careful"
    expect(parts).toContain("car");
    expect(parts.some((p) => p.includes("careful"))).toBe(true);
  });

  it("fails in current logic when a shorter term comes before a longer overlapping term", () => {
    const text = "We look forward to meeting you soon.";
    // Notice "look" is first, "look forward to" is second
    const usages = [
      { term: "look", usedAs: "look" },
      { term: "look forward to", usedAs: "look forward to" },
    ];
    const currentParts = highlightWithCurrentLogic(text, usages);
    // Current logic splits on "look", breaking "look forward to"!
    expect(currentParts).toContain("look");
    expect(currentParts).not.toContain("look forward to");

    // Improved logic (sorted by length descending) correctly matches "look forward to"
    const improvedParts = highlightWithImprovedLogic(text, usages);
    expect(improvedParts).toContain("look forward to");
  });

  it("handles multiple occurrences of the same word", () => {
    const text = "We negotiate today and negotiate tomorrow.";
    const usages = [{ term: "negotiate", usedAs: "negotiate" }];
    const parts = highlightWithImprovedLogic(text, usages);
    const matches = parts.filter((p) => p.toLowerCase() === "negotiate");
    expect(matches.length).toBe(2);
  });

  it("handles case insensitivity (e.g. 'Negotiate' at sentence start)", () => {
    const text = "Negotiate when possible.";
    const usages = [{ term: "negotiate", usedAs: "negotiate" }];
    const parts = highlightWithImprovedLogic(text, usages);
    expect(parts).toContain("Negotiate");
  });
});
