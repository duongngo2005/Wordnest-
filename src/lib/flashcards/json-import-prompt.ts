import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";

const EXTERNAL_AI_V3_TITLE = "WORDNEST — EXTERNAL AI FLASHCARD ENGINE V3";

/** Largest term manifest the external-AI prompt workflow can submit at once. */
export const EXTERNAL_AI_V3_PROMPT_TERM_LIMIT = 50;

const JSON_CONTRACT = `{
  "schemaVersion": 1,
  "cards": [
    {
      "term": "exact input term",
      "meaningVi": "natural Vietnamese meaning for one sense",
      "partOfSpeech": "one allowed partOfSpeech value",
      "ipa": null,
      "definitionEn": "clear English definition for the same sense",
      "exampleEn": "natural English example using the term",
      "exampleVi": "faithful, natural Vietnamese translation of exampleEn",
      "cefr": null,
      "imageUrl": null
    }
  ]
}`;

function promptSection(title: string, content: string): string {
  return `## ${title}\n${content}`;
}

export function getJsonFlashcardImportPrompt(context: {
  collectionName: string | null | undefined;
  deckName: string;
  terms?: string[];
  sourceContext?: string;
}): string {
  const collectionName = context.collectionName?.trim() || "Không thuộc Collection";
  const terms = context.terms?.filter(Boolean) ?? [];
  const vocabularyBlock = terms.length > 0
    ? terms.map((term, index) => `${index + 1}. ${term}`).join("\n")
    : "(Chưa có từ vựng)";
  const sourceContext = context.sourceContext?.trim();

  return [
    `# ${EXTERNAL_AI_V3_TITLE}`,
    "",
    "Bạn là English lexicographer, English usage editor và English–Vietnamese translator. Tạo flashcard chính xác, tự nhiên và hữu ích lâu dài cho người Việt học tiếng Anh.",
    "",
    promptSection("Context", [
      `- Collection: ${collectionName}`,
      `- Deck: ${context.deckName}`,
      "- Collection và Deck chỉ là metadata tổ chức, không bao giờ là bằng chứng cho nghĩa hoặc từ loại. Only explicitly provided learner semantic context may override the default lexical sense.",
      `- Ngữ cảnh người học (ưu tiên cao nhất): ${sourceContext ? JSON.stringify(sourceContext) : "không có"}.`,
      "- Nếu không có ngữ cảnh, chọn một nghĩa phổ biến, hiện đại, trung tính và hữu ích. Không mặc định IT, business, TOEIC, academic hoặc workplace.",
    ].join("\n")),
    "",
    promptSection("Requested terms — preserve exactly this spelling and order", vocabularyBlock),
    "",
    promptSection("Lexical rules", [
      "- ONE CARD = ONE INPUT TERM + ONE PRIMARY SENSE + ONE PRIMARY PART OF SPEECH.",
      "- Return exactly one card for every requested term. Preserve the exact requested term in term; do not add, omit, reorder, stem, singularize, pluralize, or replace it with a synonym.",
      "- When explicitly provided learner semantic context supplies meaning evidence, follow it. Otherwise select one well-established, useful modern sense that can be demonstrated naturally; do not merge senses or POS values, or invent usage-frequency evidence.",
      "- meaningVi is a concise, natural Vietnamese recall cue for that sense. Avoid literal dictionary translations, awkward calques, and broader, narrower, or unrelated lists; add a short clarification only when a direct equivalent misleads.",
      "- definitionEn must be accurate, concise, and focused on the selected sense. Avoid unsupported restrictions, unnecessary technical details, or wording that conflicts with meaningVi or exampleEn.",
      "- definitionEn, exampleEn and exampleVi must describe that same selected sense. exampleEn must be authentic contemporary English with natural collocations, grammar and prepositions; use the target lexical item in the selected POS, allowing natural inflections when needed. Examples may be original, but never present them as sourced quotations.",
      "- Prefer one realistic, memorable example over an artificial one. Use concrete context when it clarifies the sense, vary domains naturally, and aim for about 8–20 English words when appropriate.",
      "- exampleVi must faithfully and naturally translate exampleEn: preserve agent, action, negation, modality, important tense/aspect, cause/effect and the selected sense; do not mechanically copy English structure, omit meaning, or add unsupported information.",
      "- Use General American IPA consistently; do not mix dialect conventions; use null if uncertain. Use CEFR only when confident; do not fabricate source verification or usage-frequency evidence, and do not derive CEFR from Collection or Deck names.",
      "- imageUrl must be null. Do not invent image URLs or other metadata.",
    ].join("\n")),
    "",
    promptSection("Strict JSON contract", [
      "Return one JSON object only: no Markdown, code fence, explanation, comment, or extra fields.",
      "Every field shown below must be present. term, meaningVi, partOfSpeech, definitionEn, exampleEn and exampleVi are required non-empty strings; ipa, cefr and imageUrl are nullable.",
      `Allowed partOfSpeech values: ${PART_OF_SPEECH_OPTIONS.join(", ")}.`,
      `Allowed CEFR values: ${CEFR_LEVELS.join(", ")}.`,
      "partOfSpeech must be exactly one allowed value, never an enum description or list. schemaVersion must be the number 1.",
      JSON_CONTRACT,
    ].join("\n")),
    "",
    promptSection("Final internal check", [
      "Before responding, verify an exact one-to-one manifest match: count, spelling and order, with no missing, extra or duplicate terms; required lexical fields; valid POS/CEFR enums; schemaVersion 1; valid JSON; and no fields outside the contract.",
      "Check term ↔ partOfSpeech ↔ definitionEn ↔ meaningVi ↔ exampleEn ↔ exampleVi for one sense. If exampleEn is wrong, rewrite it and retranslate; if only exampleVi is awkward, revise only exampleVi.",
      "Do this check internally. Output only the JSON object.",
    ].join("\n")),
  ].join("\n");
}
