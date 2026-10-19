import { PART_OF_SPEECH_OPTIONS, isSupportedPartOfSpeech } from "@/lib/validation/flashcard";

export interface LexicalDraftShape {
  requestedTerm?: unknown;
  term?: unknown;
  meaningVi?: unknown;
  definitionEn?: unknown;
  exampleEn?: unknown;
  exampleVi?: unknown;
  partOfSpeech?: unknown;
}

export interface LexicalDraftValidationResult {
  valid: boolean;
  errors: string[];
}

const FIELD_LIMITS = {
  requestedTerm: 200,
  term: 200,
  meaningVi: 400,
  definitionEn: 1_000,
  exampleEn: 1_000,
  exampleVi: 1_000,
} as const;

const PLACEHOLDER_VALUES = new Set([
  "-",
  "...",
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "tbd",
  "todo",
]);

export function normalizeLexicalTarget(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isNonPlaceholderText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.length <= maxLength && !PLACEHOLDER_VALUES.has(trimmed.toLocaleLowerCase());
}

function hasObviousMeaningDump(value: string): boolean {
  // A recall cue must be compact. Semicolon-separated lists and line breaks are
  // deterministic red flags; semantic sense agreement remains a prompt/review task.
  return /[\r\n;]/.test(value);
}

/**
 * Structural safety checks for AI lexical drafts. This deliberately does not
 * claim to prove semantic consistency: that remains the authoring prompt plus
 * the learner's review before persistence.
 */
export function validateLexicalDraft(
  draft: LexicalDraftShape,
  options: { requestedTerm?: string; requireRequestedTerm?: boolean } = {}
): LexicalDraftValidationResult {
  const errors: string[] = [];

  for (const [field, maxLength] of Object.entries(FIELD_LIMITS)) {
    if (field === "requestedTerm" && !options.requireRequestedTerm) continue;
    if (!isNonPlaceholderText(draft[field as keyof LexicalDraftShape], maxLength)) {
      errors.push(`${field} is required and must be concise.`);
    }
  }

  if (typeof draft.meaningVi === "string" && hasObviousMeaningDump(draft.meaningVi.trim())) {
    errors.push("meaningVi must be one compact recall cue, not a multiline or semicolon list.");
  }

  if (typeof draft.partOfSpeech !== "string" || !isSupportedPartOfSpeech(draft.partOfSpeech.trim())) {
    errors.push(`partOfSpeech must be one controlled value: ${PART_OF_SPEECH_OPTIONS.join(", ")}.`);
  }

  if (options.requestedTerm) {
    if (typeof draft.requestedTerm !== "string") {
      errors.push("requestedTerm is required to reconcile the AI draft with the requested target.");
    } else if (normalizeLexicalTarget(draft.requestedTerm) !== normalizeLexicalTarget(options.requestedTerm)) {
      errors.push("requestedTerm does not match the requested target.");
    }
  }

  return { valid: errors.length === 0, errors };
}
