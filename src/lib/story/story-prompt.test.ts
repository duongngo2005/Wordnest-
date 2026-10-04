import { describe, expect, it } from "vitest";
import {
  buildStoryPrompt,
  buildStoryPromptForStructuredJson,
  buildLocalCompactStoryPrompt,
  buildLocalCompactStoryPromptForStructuredJson,
} from "./story-prompt";

describe("WordNest Reading Engine prompt builder", () => {
  it("generates the full WordNest Reading Engine prompt with all sections and interpolated fields", () => {
    const prompt = buildStoryPrompt({
      targetWords: ["allocate", "reliable", "cloud computing"],
      cefr: "C1",
      length: "long",
      topic: "A first day on an engineering team",
    });

    // Persona & Mission
    expect(prompt).toContain("You are WordNest Reading Engine");
    expect(prompt).toContain("expert English-language writer, CEFR curriculum designer");

    // Input Section
    expect(prompt).toContain("TARGET_TERMS:\nallocate, reliable, cloud computing");
    expect(prompt).toContain("CEFR_LEVEL:\nC1");
    expect(prompt).toContain("LENGTH_MODE:\nLONG");
    expect(prompt).toContain("TARGET_WORD_COUNT:\n3");
    expect(prompt).toContain("DESIRED_PASSAGE_LENGTH:\n350 words");
    expect(prompt).toContain("TOPIC:\nA first day on an engineering team");

    // Core Principles
    expect(prompt).toContain("2. PRIMARY OBJECTIVE");
    expect(prompt).toContain("3. INTERNAL PLANNING — DO NOT OUTPUT");
    expect(prompt).toContain("4. TARGET TERM PRESERVATION");
    expect(prompt).toContain("5. NATURAL ENGLISH RULES");
    expect(prompt).toContain("6. AVOID GENERIC AI WRITING");
    expect(prompt).toContain("7. REPETITION CONTROL");
    expect(prompt).toContain("8. CEFR CONTROL");
    expect(prompt).toContain("9. PARAGRAPH AND DISCOURSE QUALITY");
    expect(prompt).toContain("10. STORY QUALITY");
    expect(prompt).toContain("11. INFORMATIONAL TEXT QUALITY");
    expect(prompt).toContain("12. GRAMMAR AND EDITING STANDARD");
    expect(prompt).toContain("13. LENGTH CONTROL");
    expect(prompt).toContain("14. VOCABULARY DENSITY");
    expect(prompt).toContain("15. FINAL SELF-REVIEW — DO NOT OUTPUT");

    // Output Rules
    expect(prompt).toContain("16. OUTPUT RULES");
    expect(prompt).toContain("Return ONLY:\n\nTITLE:\n<natural English title>\n\nPASSAGE:\n<final passage>");
    expect(prompt).toContain("Do not bold or specially mark target terms");
    expect(prompt).toContain("The application will detect and highlight target vocabulary separately.");
  });

  it("calculates desired passage lengths matching Reading Engine guidelines", () => {
    // 20 words examples from prompt specification:
    // Short ≈ 300 words, Medium ≈ 500 words, Long ≈ 800 words
    const target20 = Array.from({ length: 20 }, (_, i) => `word${i + 1}`);

    const promptShort = buildStoryPrompt({
      targetWords: target20,
      cefr: "B1",
      length: "short",
      topic: "Daily Life",
    });
    expect(promptShort).toContain("DESIRED_PASSAGE_LENGTH:\n300 words");

    const promptMedium = buildStoryPrompt({
      targetWords: target20,
      cefr: "B2",
      length: "medium",
      topic: "Workplace",
    });
    expect(promptMedium).toContain("DESIRED_PASSAGE_LENGTH:\n500 words");

    const promptLong = buildStoryPrompt({
      targetWords: target20,
      cefr: "C1",
      length: "long",
      topic: "Science",
    });
    expect(promptLong).toContain("DESIRED_PASSAGE_LENGTH:\n800 words");
  });

  it("adapts correctly for structured JSON output pipelines", () => {
    const jsonPrompt = buildStoryPromptForStructuredJson({
      targetWords: ["apply", "look up to"],
      cefr: "B2",
      length: "medium",
      topic: "Job interviews",
    });

    expect(jsonPrompt).toContain("You are WordNest Reading Engine");
    expect(jsonPrompt).toContain("Return ONLY a valid JSON object");
    expect(jsonPrompt).toContain('"title": "<natural English title>"');
    expect(jsonPrompt).toContain('"content":');
    expect(jsonPrompt).not.toContain("Return ONLY:\n\nTITLE:");
  });

  it("builds the local compact prompt preserving all 14 core invariants with much smaller footprint", () => {
    const compactPrompt = buildLocalCompactStoryPrompt({
      targetWords: ["apply", "candidate", "qualifications", "submit"],
      cefr: "B2",
      length: "medium",
      topic: "Recruitment",
    });

    expect(compactPrompt).toContain("You are WordNest Reading Engine");
    expect(compactPrompt).toContain("TARGET TERMS (4 items):\napply, candidate, qualifications, submit");
    expect(compactPrompt).toContain("CEFR LEVEL: B2");
    expect(compactPrompt).toContain("TARGET PASSAGE LENGTH:");
    expect(compactPrompt).toContain("1. GENUINE NARRATIVE STRUCTURE (STORY, NOT ESSAY):");
    expect(compactPrompt).toContain("2. VOCABULARY INTEGRATION, INFLECTION & AUTHENTIC SENSE:");
    expect(compactPrompt).toContain("3. ANTI-REPETITION & DISCOURSE VARIETY:");
    expect(compactPrompt).toContain("4. CEFR LEVEL REQUIREMENTS (B2):");
    expect(compactPrompt).toContain("5. SELF-AUDIT & CLEAN OUTPUT:");
    expect(compactPrompt).toContain("Return ONLY:\n\nTITLE:\n<natural English title>\n\nPASSAGE:\n<final passage>");

    // Ensure it is truly compact (less than 3000 characters before large vocabulary list)
    expect(compactPrompt.length).toBeLessThan(3500);
  });

  it("injects compact semantic hints for phrasal verbs and ambiguous terms", () => {
    const promptWithHints = buildLocalCompactStoryPrompt({
      targetWords: ["apply", "look up to", "call in"],
      cefr: "B2",
      length: "medium",
      topic: "Career Mentorship",
    });

    expect(promptWithHints).toContain("look up to [hint: admire/respect an experienced person or mentor]");
    expect(promptWithHints).toContain("call in [hint: request someone to come in or summon an expert/help]");
    expect(promptWithHints).toContain("apply");
    expect(promptWithHints).not.toContain("apply [hint:");
  });

  it("adapts local compact prompt for structured JSON output pipelines", () => {
    const compactJsonPrompt = buildLocalCompactStoryPromptForStructuredJson({
      targetWords: ["apply", "candidate"],
      cefr: "B1",
      length: "short",
      topic: "Daily Life",
    });

    expect(compactJsonPrompt).toContain("Return ONLY a valid JSON object");
    expect(compactJsonPrompt).toContain('"title": "<natural English title>"');
    expect(compactJsonPrompt).toContain('"content":');
    expect(compactJsonPrompt).not.toContain("PASSAGE:\n<final passage>");
  });
});
