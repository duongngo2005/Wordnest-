import { describe, it, expect } from "vitest";
import {
  normalizeSurfaceForm,
  getAcceptedTypedAnswers,
  normalizeTypedAnswer,
  isTypedAnswerMatch,
} from "./quiz-service";

describe("Phase 2A: Typed Answer Normalization & Matching", () => {
  describe("Surface Form Normalization", () => {
    it("handles basic trimming, lowercase, and whitespace collapsing", () => {
      expect(normalizeSurfaceForm("  Allocate  ")).toBe("allocate");
      expect(normalizeSurfaceForm("figure   out")).toBe("figure out");
      expect(normalizeSurfaceForm("  come   up   with  ")).toBe("come up with");
    });

    it("normalizes Unicode decomposed (NFD) to precomposed (NFC)", () => {
      const decomposed = "cafe\u0301";
      const precomposed = "caf\u00E9";
      expect(normalizeSurfaceForm(decomposed)).toBe("café");
      expect(normalizeSurfaceForm(precomposed)).toBe("café");
      expect(isTypedAnswerMatch(decomposed, precomposed)).toBe(true);
    });

    it("normalizes smart/curly quotes, apostrophes, and backticks to straight apostrophe", () => {
      expect(normalizeSurfaceForm("don’t")).toBe("don't");
      expect(normalizeSurfaceForm("it‘s")).toBe("it's");
      expect(normalizeSurfaceForm("father`s")).toBe("father's");
      expect(normalizeSurfaceForm("“quote”")).toBe("quote");
    });

    it("strips insignificant edge punctuation while preserving internal words", () => {
      expect(normalizeSurfaceForm(".allocate.")).toBe("allocate");
      expect(normalizeSurfaceForm("!allocate?")).toBe("allocate");
      expect(normalizeSurfaceForm("(allocate)")).toBe("allocate");
      expect(normalizeSurfaceForm("\"allocate\"")).toBe("allocate");
    });

    it("normalizes internal hyphens and dashes to spaces for open/hyphenated compound equivalence", () => {
      expect(normalizeSurfaceForm("time-consuming")).toBe("time consuming");
      expect(normalizeSurfaceForm("long-term")).toBe("long term");
      expect(normalizeSurfaceForm("decision-making")).toBe("decision making");
      expect(normalizeSurfaceForm("state–of—the-art")).toBe("state of the art"); // en-dash and em-dash
    });
  });

  describe("Accepted Candidate Extraction (getAcceptedTypedAnswers)", () => {
    it("splits slash-separated alternatives", () => {
      expect(getAcceptedTypedAnswers("movie / film")).toEqual(
        expect.arrayContaining(["movie", "film"])
      );
      expect(getAcceptedTypedAnswers("organize / organise")).toEqual(
        expect.arrayContaining(["organize", "organise"])
      );
    });

    it("strips trailing parenthetical annotations while retaining the clean term", () => {
      expect(getAcceptedTypedAnswers("book (n)")).toEqual(
        expect.arrayContaining(["book", "book (n)"])
      );
      expect(getAcceptedTypedAnswers("present (v)")).toEqual(
        expect.arrayContaining(["present", "present (v)"])
      );
      expect(getAcceptedTypedAnswers("lead (metal)")).toEqual(
        expect.arrayContaining(["lead", "lead (metal)"])
      );
    });

    it("does not blindly strip non-trailing internal parentheses", () => {
      // If a term somehow has internal parentheses like "B(e)low", it does not strip them with trailing pattern
      const candidates = getAcceptedTypedAnswers("co(n)tact");
      expect(candidates).toContain("co(n)tact");
    });

    it("combines slash separation with trailing parentheticals", () => {
      const candidates = getAcceptedTypedAnswers("movie (n) / film (n)");
      expect(candidates).toContain("movie");
      expect(candidates).toContain("film");
    });
  });

  describe("Deterministic Exact Comparison (isTypedAnswerMatch)", () => {
    // 1. Hyphen <-> Space Equivalence
    it("accepts hyphenated target when user types spaces, and vice-versa", () => {
      expect(isTypedAnswerMatch("time consuming", "time-consuming")).toBe(true);
      expect(isTypedAnswerMatch("time-consuming", "time consuming")).toBe(true);
      expect(isTypedAnswerMatch("long term", "long-term")).toBe(true);
      expect(isTypedAnswerMatch("long-term", "long term")).toBe(true);
      expect(isTypedAnswerMatch("decision making", "decision-making")).toBe(true);
      expect(isTypedAnswerMatch("decision-making", "decision making")).toBe(true);
    });

    // 2. Slash-separated alternatives
    it("accepts either variant for slash-separated expected terms", () => {
      expect(isTypedAnswerMatch("movie", "movie / film")).toBe(true);
      expect(isTypedAnswerMatch("film", "movie / film")).toBe(true);
      expect(isTypedAnswerMatch("organize", "organize / organise")).toBe(true);
      expect(isTypedAnswerMatch("organise", "organize / organise")).toBe(true);
    });

    // 3. Trailing parentheticals
    it("accepts base term when expected has trailing parenthetical annotation", () => {
      expect(isTypedAnswerMatch("book", "book (n)")).toBe(true);
      expect(isTypedAnswerMatch("present", "present (v)")).toBe(true);
      expect(isTypedAnswerMatch("lead", "lead (metal)")).toBe(true);
      expect(isTypedAnswerMatch("book (n)", "book (n)")).toBe(true);
    });

    // 4. Multi-word phrases and phrasal verbs
    it("handles multi-word terms and phrasal verbs correctly", () => {
      expect(isTypedAnswerMatch("Come up with", "come up with")).toBe(true);
      expect(isTypedAnswerMatch("bring together", "Bring Together.")).toBe(true);
      expect(isTypedAnswerMatch("follow up", "follow-up")).toBe(true);
    });

    // 5. Strictly rejects incorrect particles or omissions (NO FUZZY)
    it("strictly rejects omitted particles or incomplete phrases", () => {
      expect(isTypedAnswerMatch("come with", "come up with")).toBe(false);
      expect(isTypedAnswerMatch("bring", "bring together")).toBe(false);
      expect(isTypedAnswerMatch("take", "take off")).toBe(false);
    });

    // 6. Strictly rejects typos / similar words (NO LEVENSHTEIN / NO STEMMING)
    it("strictly rejects spelling errors and distinct lexical items", () => {
      expect(isTypedAnswerMatch("affect", "effect")).toBe(false);
      expect(isTypedAnswerMatch("effect", "affect")).toBe(false);
      expect(isTypedAnswerMatch("desert", "dessert")).toBe(false);
      expect(isTypedAnswerMatch("dessert", "desert")).toBe(false);
      expect(isTypedAnswerMatch("alocate", "allocate")).toBe(false);
      expect(isTypedAnswerMatch("relient", "resilient")).toBe(false);
      expect(isTypedAnswerMatch("buy", "purchase")).toBe(false);
    });

    // 7. Rejects empty or invalid inputs
    it("rejects empty or whitespace-only inputs", () => {
      expect(isTypedAnswerMatch("", "allocate")).toBe(false);
      expect(isTypedAnswerMatch("   ", "allocate")).toBe(false);
      expect(isTypedAnswerMatch("allocate", "")).toBe(false);
    });

    // 8. Backward compatibility wrapper
    it("preserves normalizeTypedAnswer signature", () => {
      expect(normalizeTypedAnswer("  Allocate.  ")).toBe("allocate");
      expect(normalizeTypedAnswer("time-consuming")).toBe("time consuming");
    });
  });
});
