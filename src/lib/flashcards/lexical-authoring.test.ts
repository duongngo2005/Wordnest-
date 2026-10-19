import { describe, expect, it } from "vitest";
import { validateLexicalDraft } from "./lexical-authoring";

const validDraft = {
  requestedTerm: "address",
  term: "address",
  meaningVi: "đề cập và xử lý (một vấn đề)",
  definitionEn: "to deal with a problem or concern",
  exampleEn: "We need to address this problem before Friday.",
  exampleVi: "Chúng ta cần xử lý vấn đề này trước thứ Sáu.",
  partOfSpeech: "verb",
};

describe("Flashcard draft structural validation", () => {
  it("accepts a structurally valid draft for adding a Story term", () => {
    expect(validateLexicalDraft(validDraft, { requestedTerm: "address", requireRequestedTerm: true })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects missing or unsupported POS and obvious malformed recall cues", () => {
    expect(validateLexicalDraft({ ...validDraft, partOfSpeech: "noun/verb" })).toMatchObject({ valid: false });
    expect(validateLexicalDraft({ ...validDraft, meaningVi: "đề cập; xử lý; giải quyết" })).toMatchObject({ valid: false });
    expect(validateLexicalDraft({ ...validDraft, definitionEn: "" })).toMatchObject({ valid: false });
    expect(validateLexicalDraft({ ...validDraft, requestedTerm: "location" }, { requestedTerm: "address", requireRequestedTerm: true })).toMatchObject({ valid: false });
  });
});
