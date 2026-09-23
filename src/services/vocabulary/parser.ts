export const MAX_VOCABULARY_TERMS = 30;

/**
 * Normalizes a vocabulary term for comparison and database indexing:
 * trims leading/trailing whitespace, converts to lowercase, collapses internal spaces.
 */
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ParseResult {
  terms: string[];
  normalizedTerms: string[];
  error?: string;
  totalFound: number;
  uniqueCount: number;
  duplicateCount: number;
}

/**
 * Parses raw vocabulary input separated by semicolons (;) or new lines.
 *
 * Rules:
 * 1. Split by ';' or a line break
 * 2. Trim whitespace
 * 3. Remove empty values
 * 4. Deduplicate case-insensitively
 * 5. Preserve the first readable casing/value encountered
 * 6. Supports single words and multi-word phrases
 * 7. Enforces MVP limit of max 30 terms
 */
export function parseVocabularyInput(
  rawInput: string,
  maxLimit = MAX_VOCABULARY_TERMS
): ParseResult {
  if (!rawInput || typeof rawInput !== "string") {
    return {
      terms: [],
      normalizedTerms: [],
      totalFound: 0,
      uniqueCount: 0,
      duplicateCount: 0,
    };
  }

  const rawTokens = rawInput.split(/[;\r\n]+/);
  const seen = new Set<string>();
  const terms: string[] = [];
  const normalizedTerms: string[] = [];
  let totalFound = 0;

  for (const token of rawTokens) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    totalFound += 1;
    const normalized = normalizeTerm(trimmed);

    if (!seen.has(normalized)) {
      seen.add(normalized);
      terms.push(trimmed);
      normalizedTerms.push(normalized);
    }
  }

  const duplicateCount = totalFound - terms.length;

  let error: string | undefined;
  if (terms.length > maxLimit) {
    error = `Tối đa ${maxLimit} từ/cụm từ cho mỗi lần tạo (phát hiện ${terms.length} từ). Vui lòng bớt lại.`;
  }

  return {
    terms,
    normalizedTerms,
    error,
    totalFound,
    uniqueCount: terms.length,
    duplicateCount,
  };
}
