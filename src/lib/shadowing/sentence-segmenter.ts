/**
 * Sentence Segmenter for WordNest Shadowing.
 *
 * Uses native Intl.Segmenter("en", { granularity: "sentence" }) where available,
 * complemented with abbreviation and honorific stitching to avoid erroneous splits
 * on titles (Dr., Mr., Mrs.), abbreviations (a.m., p.m., e.g., etc.), and decimals ($3.50).
 * Provides a deterministic fallback for older environments.
 */

// Titles & honorifics that should NEVER end a standalone sentence:
const TITLES_REGEX = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr)\.$/i;

// Inline abbreviations that only stitch if the following segment starts with lowercase or digit:
const INLINE_ABBR_REGEX = /(?:^|\s)(?:etc|e\.g|i\.e|a\.m|p\.m|Inc|Ltd|Corp|Co|vs|[A-Z])\.$/i;

// Quoted trailing punctuation: e.g. "Wait!" followed by lowercase dialog continuation:
const TRAILING_QUOTE_REGEX = /["'”’]$/;

// Fallback regex for splitting when Intl.Segmenter is not present:
const FALLBACK_SENTENCE_REGEX = /[^.!?]+(?:[.!?]+(?:['"”’]+)?|$)/g;

/**
 * Segments a passage into clean, natural sentences suitable for shadowing.
 */
export function segmentSentences(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  // Normalize newlines and collapse redundant whitespace
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];

  const rawSegments = getRawSegments(normalized);
  if (rawSegments.length === 0) return [];

  return stitchAbbreviations(rawSegments);
}

function getRawSegments(normalizedText: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      return Array.from(segmenter.segment(normalizedText), (s) => s.segment.trim()).filter(Boolean);
    } catch {
      // Fall through to fallback
    }
  }

  // Deterministic fallback regex
  const matches = normalizedText.match(FALLBACK_SENTENCE_REGEX);
  if (!matches) return [normalizedText];
  return matches.map((m) => m.trim()).filter(Boolean);
}

function stitchAbbreviations(rawSegments: string[]): string[] {
  const stitched: string[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    let curr = rawSegments[i];

    while (i + 1 < rawSegments.length) {
      const next = rawSegments[i + 1];

      const isTitle = TITLES_REGEX.test(curr);
      const isInlineWithLower = INLINE_ABBR_REGEX.test(curr) && /^[a-z0-9]/.test(next);
      const isQuoteWithLower = TRAILING_QUOTE_REGEX.test(curr) && /^[a-z]/.test(next);

      if (isTitle || isInlineWithLower || isQuoteWithLower) {
        i++;
        curr += " " + next;
      } else {
        break;
      }
    }

    stitched.push(curr);
  }

  return stitched;
}
