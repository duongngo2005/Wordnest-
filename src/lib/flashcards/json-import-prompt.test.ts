import { describe, expect, it } from "vitest";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { EXTERNAL_AI_V3_PROMPT_TERM_LIMIT, getJsonFlashcardImportPrompt } from "./json-import-prompt";

const prompt = getJsonFlashcardImportPrompt({
  collectionName: "10 Days Vocabulary",
  deckName: "Day 1",
  terms: ["allocate", "resilient"],
  sourceContext: "The team allocated funds to safety work.",
});

describe("getJsonFlashcardImportPrompt", () => {
  it("supports a 50-term prompt batch", () => {
    const terms = Array.from({ length: EXTERNAL_AI_V3_PROMPT_TERM_LIMIT }, (_, index) => `term-${index + 1}`);
    const largeBatchPrompt = getJsonFlashcardImportPrompt({
      collectionName: "Sample collection",
      deckName: "Sample deck",
      terms,
    });

    expect(EXTERNAL_AI_V3_PROMPT_TERM_LIMIT).toBe(50);
    expect(largeBatchPrompt).toContain("50. term-50");
  });

  it("injects the current collection name", () => {
    expect(prompt).toContain("Collection: 10 Days Vocabulary");
  });

  it("injects the current deck name", () => {
    expect(prompt).toContain("Deck: Day 1");
  });

  it("injects the exact selected vocabulary", () => {
    expect(prompt).toContain("1. allocate");
    expect(prompt).toContain("2. resilient");
  });

  it("requires the V1 JSON contract", () => {
    expect(prompt).toContain('"schemaVersion": 1');
  });

  it("states the one-card, one-sense, one-part-of-speech rule", () => {
    expect(prompt).toContain("ONE CARD = ONE INPUT TERM + ONE PRIMARY SENSE + ONE PRIMARY PART OF SPEECH");
  });

  it("requires complete lexical fields and a controlled non-null POS for AI-authored JSON", () => {
    expect(prompt).toContain("Every field shown below must be present. term, meaningVi, partOfSpeech, definitionEn, exampleEn and exampleVi are required non-empty strings; ipa, cefr and imageUrl are nullable.");
    expect(prompt).toContain('"partOfSpeech": "one allowed partOfSpeech value"');
    expect(prompt).toContain(`Allowed partOfSpeech values: ${PART_OF_SPEECH_OPTIONS.join(", ")}.`);
    expect(prompt).toContain(`Allowed CEFR values: ${CEFR_LEVELS.join(", ")}.`);
    expect(prompt).not.toContain('"partOfSpeech": "noun | verb');
  });

  it("forbids mixing parts of speech in one card", () => {
    expect(prompt).toContain("do not merge senses or POS values");
  });

  it("requires a well-established default sense without fabricated frequency evidence", () => {
    expect(prompt).toContain("well-established, useful modern sense");
    expect(prompt).toContain("do not merge senses or POS values, or invent usage-frequency evidence");
  });

  it("requires precise Vietnamese meanings and authentic bilingual examples", () => {
    expect(prompt).toContain("Avoid literal dictionary translations, awkward calques");
    expect(prompt).toContain("natural collocations, grammar and prepositions");
    expect(prompt).toContain("preserve agent, action, negation, modality, important tense/aspect, cause/effect");
    expect(prompt).toContain("allowing natural inflections when needed");
  });

  it("requires concise, sense-focused definitions that agree with the card evidence", () => {
    expect(prompt).toContain("definitionEn must be accurate, concise, and focused on the selected sense. Avoid unsupported restrictions, unnecessary technical details, or wording that conflicts with meaningVi or exampleEn.");
  });

  it("requires domain-neutral examples without explicit user context", () => {
    expect(prompt).toContain("Không mặc định IT, business, TOEIC, academic hoặc workplace");
    expect(prompt).toContain("Nếu không có ngữ cảnh, chọn một nghĩa phổ biến");
  });

  it("treats collection and deck names as metadata, not domain context", () => {
    expect(prompt).toContain("Collection và Deck chỉ là metadata tổ chức");
    expect(prompt).toContain("không bao giờ là bằng chứng cho nghĩa hoặc từ loại");
  });

  it("gives user-provided context the highest priority", () => {
    expect(prompt).toContain("Ngữ cảnh người học (ưu tiên cao nhất)");
    expect(prompt).toContain("The team allocated funds to safety work.");
    expect(prompt).toContain("Only explicitly provided learner semantic context may override the default lexical sense");
  });

  it("requires General American IPA and unsourced, contemporary examples", () => {
    expect(prompt).toContain("Use General American IPA consistently; do not mix dialect conventions; use null if uncertain.");
    expect(prompt).toContain("Examples may be original, but never present them as sourced quotations.");
  });

  it("keeps batch contrast awareness truthful", () => {
    expect(prompt).toContain("natural collocations");
  });

  it("forbids WordNest internal fields", () => {
    expect(prompt).toContain("extra fields");
  });

  it("makes images optional", () => {
    expect(prompt).toContain("imageUrl must be null");
  });

  it("requires null when an image URL cannot be verified", () => {
    expect(prompt).toContain('"imageUrl": null');
  });

  it("does not instruct the chatbot to use WordNest AI", () => {
    expect(prompt).not.toMatch(/gọi (?:WordNest )?AI/i);
    expect(prompt).not.toMatch(/WordNest AI/i);
  });

  it("identifies the external workflow as V3 and demands exact manifest order", () => {
    expect(prompt).toContain("EXTERNAL AI FLASHCARD ENGINE V3");
    expect(prompt).toContain("preserve exactly this spelling and order");
    expect(prompt).toContain("do not add, omit, reorder");
  });

  it("keeps V3 output validation and repair rules explicit", () => {
    expect(prompt).toContain("no missing, extra or duplicate terms");
    expect(prompt).toContain("valid POS/CEFR enums; schemaVersion 1");
    expect(prompt).toContain("If exampleEn is wrong, rewrite it and retranslate; if only exampleVi is awkward, revise only exampleVi.");
  });

  it("preserves a five-term manifest and the complete V3 JSON contract", () => {
    const fiveTermPrompt = getJsonFlashcardImportPrompt({
      collectionName: "Sample collection",
      deckName: "Sample deck",
      terms: ["bank", "allocate", "resilient", "run", "meticulous"],
    });

    expect(fiveTermPrompt).toContain("1. bank\n2. allocate\n3. resilient\n4. run\n5. meticulous");

    const contractMatch = fiveTermPrompt.match(/\{\n  "schemaVersion": 1,[\s\S]*?\n\}/);
    expect(contractMatch).not.toBeNull();
    expect(JSON.parse(contractMatch![0])).toEqual({
      schemaVersion: 1,
      cards: [{
        term: "exact input term",
        meaningVi: "natural Vietnamese meaning for one sense",
        partOfSpeech: "one allowed partOfSpeech value",
        ipa: null,
        definitionEn: "clear English definition for the same sense",
        exampleEn: "natural English example using the term",
        exampleVi: "faithful, natural Vietnamese translation of exampleEn",
        cefr: null,
        imageUrl: null,
      }],
    });
  });
});
