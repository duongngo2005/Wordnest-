/**
 * Canonical identity key for vocabulary terms.
 *
 * This intentionally normalizes presentation-only differences while keeping
 * lexical differences intact: it does not stem, remove punctuation, or merge
 * hyphenated and space-separated forms.
 */
export function normalizeVocabularyTerm(term: string): string {
  return term
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
