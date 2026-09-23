/**
 * Normalizes text used to compare contextual-translation cache entries.
 * It intentionally preserves punctuation; punctuation can change a sentence's meaning.
 */
export function normalizeStoryContextText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function sameStoryContextText(first: string, second: string): boolean {
  return normalizeStoryContextText(first).toLocaleLowerCase() === normalizeStoryContextText(second).toLocaleLowerCase();
}

/**
 * Returns the first sentence containing a surface form. Story vocabulary metadata has
 * one `usedAs` per canonical term, so choosing the first occurrence is the v1 rule.
 */
export function extractSentenceContainingUsage(content: string, usage: string): string {
  const normalizedUsage = normalizeStoryContextText(usage);
  if (!normalizedUsage) return "";

  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeStoryContextText)
    .filter(Boolean);

  return (
    sentences.find((sentence) => sentence.toLocaleLowerCase().includes(normalizedUsage.toLocaleLowerCase())) ||
    ""
  );
}

/**
 * Extracts the first sentence containing the exact surface form matching whole word / phrase boundaries.
 * Prevents substring false positives (e.g. 'allocate' matching inside 'reallocated').
 */
export function extractSentenceContainingUsageWithBoundary(content: string, usage: string): string {
  const normalizedUsage = normalizeStoryContextText(usage);
  if (!normalizedUsage) return "";

  const escaped = normalizedUsage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");

  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeStoryContextText)
    .filter(Boolean);

  return sentences.find((sentence) => regex.test(sentence)) || "";
}

/**
 * Creates a contextual cloze prompt by replacing the exact usedAs occurrence with '______'.
 * Respects word/phrase boundaries.
 */
export function createStoryClozePrompt(
  sentence: string,
  usedAs: string
): { clozeSentence: string; found: boolean } {
  if (!sentence || !usedAs) {
    return { clozeSentence: sentence || "", found: false };
  }

  const escaped = usedAs.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");

  if (regex.test(sentence)) {
    return {
      clozeSentence: sentence.replace(regex, "______"),
      found: true,
    };
  }

  return { clozeSentence: sentence, found: false };
}

export function findStorySelectionCacheIndex(
  entries: readonly { selectedText: string; surroundingSentence: string }[],
  selectedText: string,
  surroundingSentence: string
): number {
  return entries.findIndex(
    (entry) =>
      sameStoryContextText(entry.selectedText, selectedText) &&
      sameStoryContextText(entry.surroundingSentence, surroundingSentence)
  );
}

