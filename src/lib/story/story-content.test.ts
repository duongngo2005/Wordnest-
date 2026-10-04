import { describe, expect, it } from "vitest";
import { normalizeStoryPlainText, parseStoryResponseText } from "./story-content";

describe("normalizeStoryPlainText", () => {
  it("removes only well-formed Markdown strong markers, including JSON-escaped legacy markers", () => {
    expect(normalizeStoryPlainText("Clara had **ability** and \\*\\*confidence\\*\\*."))
      .toBe("Clara had ability and confidence.");
  });

  it("preserves ordinary asterisks that are not paired emphasis markers", () => {
    expect(normalizeStoryPlainText("A * is an asterisk; 2 ** 3 is notation."))
      .toBe("A * is an asterisk; 2 ** 3 is notation.");
  });
});

describe("parseStoryResponseText", () => {
  it("parses WordNest Reading Engine standard output with multiline TITLE and PASSAGE labels", () => {
    const raw = `TITLE:
The Quiet Studio

PASSAGE:
Clara arrived at the design studio twenty minutes early.

She needed to allocate her remaining hours carefully between the new catalog and the upcoming inventory review.`;

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("The Quiet Studio");
    expect(parsed.content).toBe(
      "Clara arrived at the design studio twenty minutes early.\n\nShe needed to allocate her remaining hours carefully between the new catalog and the upcoming inventory review."
    );
  });

  it("parses WordNest Reading Engine output with inline labels (TITLE: ... PASSAGE: ...)", () => {
    const raw = `TITLE: Finding the Rhythm

PASSAGE: The workshop was unusually silent when Liam turned on the equipment. He made sure each calibration was precise.`;

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("Finding the Rhythm");
    expect(parsed.content).toBe(
      "The workshop was unusually silent when Liam turned on the equipment. He made sure each calibration was precise."
    );
  });

  it("parses JSON formatted stories and preserves optional usage metadata", () => {
    const raw = JSON.stringify({
      title: "An Engineering Day",
      content: "They had to allocate server capacity before deployment.",
      usage: [{ term: "allocate", usedAs: "allocate" }],
    });

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("An Engineering Day");
    expect(parsed.content).toBe("They had to allocate server capacity before deployment.");
    expect(parsed.usage).toEqual([{ term: "allocate", usedAs: "allocate" }]);
  });

  it("parses JSON inside Markdown code fences", () => {
    const raw = `Here is your story:

\`\`\`json
{
  "title": "Clean Code",
  "content": "Refactoring took the entire afternoon."
}
\`\`\`
Hope you enjoyed!`;

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("Clean Code");
    expect(parsed.content).toBe("Refactoring took the entire afternoon.");
  });

  it("parses markdown heading style (# Title followed by paragraphs)", () => {
    const raw = `# The Unexpected Journey

The morning express train was delayed by forty minutes.

Noah took the opportunity to review his notes.`;

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("The Unexpected Journey");
    expect(parsed.content).toBe(
      "The morning express train was delayed by forty minutes.\n\nNoah took the opportunity to review his notes."
    );
  });

  it("parses two-part plain text where first line is title followed by empty line", () => {
    const raw = `A New Beginning

Elena stepped into the office for the very first time. Everything smelled of fresh paint and possibility.`;

    const parsed = parseStoryResponseText(raw);
    expect(parsed.title).toBe("A New Beginning");
    expect(parsed.content).toBe(
      "Elena stepped into the office for the very first time. Everything smelled of fresh paint and possibility."
    );
  });

  it("throws an informative error when input is empty or invalid", () => {
    expect(() => parseStoryResponseText("")).toThrow("Nội dung trống");
    expect(() => parseStoryResponseText("   ")).toThrow("Nội dung trống");
    expect(() => parseStoryResponseText("Just a single sentence without structure."))
      .toThrow("Không thể nhận diện tiêu đề và nội dung truyện");
  });
});
