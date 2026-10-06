import { describe, it, expect } from "vitest";
import { segmentSentences } from "./sentence-segmenter";

describe("sentence-segmenter", () => {
  it("returns empty array for empty or whitespace-only text", () => {
    expect(segmentSentences("")).toEqual([]);
    expect(segmentSentences("   \n\t  ")).toEqual([]);
    expect(segmentSentences(null as unknown as string)).toEqual([]);
  });

  it("splits normal sentences with periods, questions, and exclamations", () => {
    const text = "Hello world. How are you? I am doing great! Let's get started.";
    const result = segmentSentences(text);
    expect(result).toEqual([
      "Hello world.",
      "How are you?",
      "I am doing great!",
      "Let's get started.",
    ]);
  });

  it("handles honorifics and titles (Dr., Mr., Mrs., Ms., Prof.) without breaking sentences", () => {
    const text = "Dr. Smith arrived early. Mr. Brown is here with Mrs. Davis and Prof. Taylor.";
    const result = segmentSentences(text);
    expect(result).toEqual([
      "Dr. Smith arrived early.",
      "Mr. Brown is here with Mrs. Davis and Prof. Taylor.",
    ]);
  });

  it("handles times and inline abbreviations (a.m., p.m., e.g., etc.)", () => {
    const text = "The meeting starts at 9 a.m. tomorrow. We should bring snacks, e.g., fruit and nuts. Please arrive before 8 p.m.";
    const result = segmentSentences(text);
    expect(result).toEqual([
      "The meeting starts at 9 a.m. tomorrow.",
      "We should bring snacks, e.g., fruit and nuts.",
      "Please arrive before 8 p.m.",
    ]);
  });

  it("handles monetary and numeric decimals ($3.50, 3.14)", () => {
    const text = "The coffee costs $3.50 per cup. Pi is roughly 3.14159. That is affordable.";
    const result = segmentSentences(text);
    expect(result).toEqual([
      "The coffee costs $3.50 per cup.",
      "Pi is roughly 3.14159.",
      "That is affordable.",
    ]);
  });

  it("handles quotations and dialogue cleanly", () => {
    const text = 'She said, "I\'ll be there tomorrow." He replied, "Wait!" and ran outside. Is everything ready? Yes! Let\'s begin.';
    const result = segmentSentences(text);
    expect(result).toEqual([
      'She said, "I\'ll be there tomorrow."',
      'He replied, "Wait!" and ran outside.',
      "Is everything ready?",
      "Yes!",
      "Let's begin.",
    ]);
  });

  it("handles multiline paragraphs and newlines", () => {
    const text = `The quick brown fox jumps over the lazy dog.
    
It was an energetic morning.
Another day begins.`;
    const result = segmentSentences(text);
    expect(result).toEqual([
      "The quick brown fox jumps over the lazy dog.",
      "It was an energetic morning.",
      "Another day begins.",
    ]);
  });

  it("passes all 7 audit test cases specifically requested in Phase 4 audit", () => {
    expect(segmentSentences("Dr. Smith arrived at 9 a.m. He was early.")).toEqual([
      "Dr. Smith arrived at 9 a.m.",
      "He was early.",
    ]);

    expect(segmentSentences("Mr. Brown paid $3.50.")).toEqual([
      "Mr. Brown paid $3.50.",
    ]);

    expect(segmentSentences("The value is 2.75. Is that correct?")).toEqual([
      "The value is 2.75.",
      "Is that correct?",
    ]);

    expect(segmentSentences('She said, "I\'ll come tomorrow." Then she left.')).toEqual([
      'She said, "I\'ll come tomorrow."',
      "Then she left.",
    ]);

    expect(segmentSentences("I met Prof. Smith, Jr. yesterday.")).toEqual([
      "I met Prof. Smith, Jr. yesterday.",
    ]);

    expect(segmentSentences("Use this, e.g. when testing examples.")).toEqual([
      "Use this, e.g. when testing examples.",
    ]);

    expect(segmentSentences("The score was 3.5 vs. 4.0.")).toEqual([
      "The score was 3.5 vs. 4.0.",
    ]);
  });
});
