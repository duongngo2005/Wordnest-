/**
 * Transcript Normalization & Deterministic Word-level Similarity Engine
 * for WordNest Shadowing.
 *
 * Implements token-level Levenshtein alignment and Word Error Rate (WER)
 * without calling any external LLM or cloud API.
 */

export type WordMatchStatus =
  | "match"
  | "substitution"
  | "omission"
  | "insertion";

export interface WordAlignment {
  reference?: string;
  spoken?: string;
  status: WordMatchStatus;
}

export interface ShadowingSimilarityResult {
  similarity: number; // 0 to 100 percentage
  wer: number;        // Word Error Rate (e.g. 0.15)
  alignment: WordAlignment[];
}

/**
 * Common English contraction expansions.
 */
export function expandContractions(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\bwon't\b/gi, "will not")
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\blet's\b/gi, "let us")
    .replace(/\bshan't\b/gi, "shall not")
    .replace(/n't\b/gi, " not")
    .replace(/'ll\b/gi, " will")
    .replace(/'re\b/gi, " are")
    .replace(/'ve\b/gi, " have")
    .replace(/'m\b/gi, " am")
    .replace(/'d\b/gi, " would");
}

/**
 * Normalizes user spoken transcript or reference text for clean comparison.
 * Collapses whitespace, strips surrounding punctuation, normalizes curly apostrophes.
 */
export function normalizeTranscript(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes a single token, keeping letters, digits, and internal apostrophes.
 */
export function normalizeToken(token: string): string {
  if (!token) return "";
  return token
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^['"\s.,\/#!$%\^&\*;:{}=\-_`~()–—]+|['"\s.,\/#!$%\^&\*;:{}=\-_`~()–—]+$/g, "")
    .trim();
}

/**
 * Tests whether two tokens match directly or via normalization.
 */
function areTokensMatching(refToken: string, transToken: string): boolean {
  if (refToken === transToken) return true;
  if (!refToken || !transToken) return false;

  const r = normalizeToken(refToken);
  const t = normalizeToken(transToken);
  if (r === t) return true;

  // Compare expanded forms if needed
  const rExp = normalizeToken(expandContractions(r));
  const tExp = normalizeToken(expandContractions(t));
  if (rExp === tExp) return true;

  return false;
}

/**
 * Computes word-level alignment, Word Error Rate (WER), and similarity score (0-100%)
 * between reference sentence and user speech transcript.
 */
export function computeWordSimilarity(
  reference: string,
  transcript: string
): ShadowingSimilarityResult {
  const cleanRef = expandContractions(reference || "");
  const cleanTrans = expandContractions(transcript || "");

  const refTokens = cleanRef.trim().split(/\s+/).filter(Boolean);
  const transTokens = cleanTrans.trim().split(/\s+/).filter(Boolean);

  const m = refTokens.length;
  const n = transTokens.length;

  // Edge cases
  if (m === 0) {
    return {
      similarity: n === 0 ? 100 : 0,
      wer: n === 0 ? 0 : 1,
      alignment: transTokens.map((w) => ({ spoken: w, status: "insertion" })),
    };
  }

  if (n === 0) {
    return {
      similarity: 0,
      wer: 1,
      alignment: refTokens.map((w) => ({ reference: w, status: "omission" })),
    };
  }

  const normRef = refTokens.map(normalizeToken);
  const normTrans = transTokens.map(normalizeToken);

  // Wagner-Fischer Dynamic Programming Table for Levenshtein Distance
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (areTokensMatching(normRef[i - 1], normTrans[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j - 1], // substitution
          dp[i - 1][j],     // omission
          dp[i][j - 1]      // insertion
        );
      }
    }
  }

  // Backtracking to construct word alignment
  let i = m;
  let j = n;
  const alignment: WordAlignment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && areTokensMatching(normRef[i - 1], normTrans[j - 1])) {
      alignment.unshift({
        reference: refTokens[i - 1],
        spoken: transTokens[j - 1],
        status: "match",
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      alignment.unshift({
        reference: refTokens[i - 1],
        spoken: transTokens[j - 1],
        status: "substitution",
      });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) {
      alignment.unshift({
        reference: refTokens[i - 1],
        status: "omission",
      });
      i--;
    } else {
      alignment.unshift({
        spoken: transTokens[j - 1],
        status: "insertion",
      });
      j--;
    }
  }

  let substitutions = 0;
  let omissions = 0;
  let insertions = 0;

  for (const item of alignment) {
    if (item.status === "substitution") substitutions++;
    else if (item.status === "omission") omissions++;
    else if (item.status === "insertion") insertions++;
  }

  const wer = Number(((substitutions + omissions + insertions) / m).toFixed(2));
  const rawSimilarity = (1 - Math.min(1, wer)) * 100;
  const similarity = Math.max(0, Math.min(100, Math.round(rawSimilarity)));

  return {
    similarity,
    wer,
    alignment,
  };
}
