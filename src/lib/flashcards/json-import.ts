import { z } from "zod";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { normalizeVocabularyTerm } from "@/lib/vocabulary/term-normalization";

export const JSON_FLASHCARD_IMPORT_MAX_CARDS = 100;

const optionalNullableText = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable().optional();

const requiredText = (maxLength: number) =>
  z.string().trim().min(1, "Required field is missing.").max(maxLength);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isSafeExternalImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLocalHostname =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".localdomain");

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !isLocalHostname &&
      !hostname.includes(":") &&
      !isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

const imageUrlSchema = z
  .string()
  .trim()
  .url("Must be a valid HTTPS URL.")
  .refine(isSafeExternalImageUrl, "Must be a public HTTPS URL.")
  .nullable()
  .optional();

export const jsonFlashcardSchema = z
  .object({
    term: z.string().trim().min(1, "Required field is missing.").max(200),
    meaningVi: z.string().trim().min(1, "Required field is missing.").max(2_000),
    partOfSpeech: z.enum(PART_OF_SPEECH_OPTIONS).nullable().optional(),
    ipa: optionalNullableText(200),
    definitionEn: optionalNullableText(2_000),
    exampleEn: optionalNullableText(4_000),
    exampleVi: optionalNullableText(4_000),
    cefr: z.enum(CEFR_LEVELS).nullable().optional(),
    imageUrl: imageUrlSchema,
  })
  .strict();

export const jsonFlashcardImportSchema = z
  .object({
    schemaVersion: z.literal(1, "Only schemaVersion 1 is supported."),
    cards: z.array(jsonFlashcardSchema).min(1).max(JSON_FLASHCARD_IMPORT_MAX_CARDS),
  })
  .strict();

export type JsonFlashcardImport = z.infer<typeof jsonFlashcardImportSchema>;
export type JsonFlashcard = z.infer<typeof jsonFlashcardSchema>;

/**
 * The V3 flow is intentionally stricter than the long-lived manual/legacy
 * import shape above. Keeping the schemas separate lets old exports remain
 * importable while an external-AI response receives an exact contract.
 */
export const externalAiV3FlashcardSchema = z
  .object({
    term: requiredText(200),
    meaningVi: requiredText(2_000),
    partOfSpeech: z.enum(PART_OF_SPEECH_OPTIONS),
    ipa: optionalNullableText(200),
    definitionEn: requiredText(2_000),
    exampleEn: requiredText(4_000),
    exampleVi: requiredText(4_000),
    cefr: z.enum(CEFR_LEVELS).nullable().optional().default(null),
    imageUrl: imageUrlSchema.default(null),
  })
  .strict();

export const externalAiV3ImportSchema = z
  .object({
    schemaVersion: z.literal(1, "Only schemaVersion 1 is supported."),
    cards: z.array(externalAiV3FlashcardSchema).min(1).max(JSON_FLASHCARD_IMPORT_MAX_CARDS),
  })
  .strict();

const externalManifestTermSchema = z.string().trim().min(1).max(200);

export const externalAiV3ManifestSchema = z
  .object({
    terms: z.array(externalManifestTermSchema).min(1).max(JSON_FLASHCARD_IMPORT_MAX_CARDS),
  })
  .strict()
  .superRefine(({ terms }, context) => {
    const seen = new Set<string>();
    for (const [index, term] of terms.entries()) {
      const normalized = normalizeManifestTerm(term);
      if (seen.has(normalized)) {
        context.addIssue({
          code: "custom",
          path: ["terms", index],
          message: `Duplicate manifest term: "${term}".`,
        });
      }
      seen.add(normalized);
    }
  });

export type ExternalAiV3Import = z.infer<typeof externalAiV3ImportSchema>;
export type ExternalAiV3Manifest = z.infer<typeof externalAiV3ManifestSchema>;

const externalAiV3ReviewSnapshotSchema = z.object({
  normalizedTerm: z.string().trim().min(1).max(200),
  classification: z.enum(["new", "existing", "ambiguous"]),
  /** SHA-256 of the reviewed AI payload; prevents client-side content swaps after preview. */
  incomingFingerprint: z.string().regex(/^[a-f0-9]{64}$/i, "Review snapshots require an incoming content fingerprint."),
  flashcardId: z.string().min(1).optional(),
  contentVersion: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((snapshot, context) => {
  const hasIdentity = Boolean(snapshot.flashcardId && snapshot.contentVersion);
  if (snapshot.classification === "existing" && !hasIdentity) {
    context.addIssue({ code: "custom", message: "Existing review snapshots require a flashcard ID and content version." });
  }
  if (snapshot.classification !== "existing" && (snapshot.flashcardId || snapshot.contentVersion)) {
    context.addIssue({ code: "custom", message: "Only existing review snapshots may identify a flashcard." });
  }
});

const externalAiV3OverwriteDecisionSchema = z.object({
  flashcardId: z.string().min(1),
  action: z.literal("overwrite"),
  /** Required only when the server detects a part-of-speech change. */
  confirmsPartOfSpeechChange: z.boolean().optional().default(false),
}).strict();

/**
 * A review is a transient commit precondition, not part of the external AI
 * JSON contract. The server independently re-derives every value before it
 * writes anything.
 */
export const externalAiV3ImportReviewSchema = z.object({
  snapshots: z.array(externalAiV3ReviewSnapshotSchema).min(1).max(JSON_FLASHCARD_IMPORT_MAX_CARDS),
  decisions: z.array(externalAiV3OverwriteDecisionSchema).max(JSON_FLASHCARD_IMPORT_MAX_CARDS),
}).strict().superRefine((review, context) => {
  const snapshots = new Set<string>();
  for (const [index, snapshot] of review.snapshots.entries()) {
    if (snapshots.has(snapshot.normalizedTerm)) {
      context.addIssue({ code: "custom", path: ["snapshots", index, "normalizedTerm"], message: "Review snapshots must be unique by normalized term." });
    }
    snapshots.add(snapshot.normalizedTerm);
  }
  const decisions = new Set<string>();
  for (const [index, decision] of review.decisions.entries()) {
    if (decisions.has(decision.flashcardId)) {
      context.addIssue({ code: "custom", path: ["decisions", index, "flashcardId"], message: "A flashcard can receive only one overwrite decision." });
    }
    decisions.add(decision.flashcardId);
  }
});

export type ExternalAiV3ImportReview = z.infer<typeof externalAiV3ImportReviewSchema>;

export interface ExternalAiV3OrderMismatch {
  index: number;
  expected: string;
  received: string;
}

export interface ExternalAiV3SpellingChange {
  expected: string;
  received: string;
}

export interface ExternalAiV3ManifestComparison {
  expectedCount: number;
  receivedCount: number;
  missingTerms: string[];
  unexpectedTerms: string[];
  duplicateTerms: string[];
  spellingChanges: ExternalAiV3SpellingChange[];
  orderMismatches: ExternalAiV3OrderMismatch[];
  isExactMatch: boolean;
}

export type JsonImportParseResult =
  | { valid: true; payload: JsonFlashcardImport }
  | { valid: false; errors: string[] };

export type ExternalAiV3ImportParseResult =
  | { valid: true; payload: ExternalAiV3Import; comparison: ExternalAiV3ManifestComparison }
  | {
    valid: false;
    errors: string[];
    comparison: ExternalAiV3ManifestComparison;
    /**
     * A structurally valid response can still fail only the manifest check
     * (for example, cards are in the wrong order). Keep those cards available
     * to the preview so the user can explicitly repair and revalidate them.
     */
    recoverableCards?: ExternalAiV3Import["cards"];
  };

function stripSingleOuterJsonFence(rawJson: string): string {
  const match = rawJson.trim().match(/^```(?:json)?\s*\r?\n([\s\S]*)\r?\n```$/i);
  return match ? match[1].trim() : rawJson.trim();
}

function normalizeManifestTerm(term: string): string {
  return normalizeVocabularyTerm(term);
}

function parseRawJson(rawJson: string):
  | { valid: true; value: unknown }
  | { valid: false; errors: string[] } {
  const preparedJson = stripSingleOuterJsonFence(rawJson);
  if (!preparedJson) return { valid: false, errors: ["JSON không được để trống."] };

  try {
    return { valid: true, value: JSON.parse(preparedJson) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid JSON syntax.";
    return { valid: false, errors: [`JSON không hợp lệ: ${reason}`] };
  }
}

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    return typeof segment === "number"
      ? `${formatted}[${segment}]`
      : formatted
      ? `${formatted}.${String(segment)}`
      : String(segment);
  }, "");
}

function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = formatPath(issue.path);
    if (issue.code === "unrecognized_keys") {
      return `${path || "payload"}: Unsupported field: ${issue.keys.join(", ")}.`;
    }
    return `${path || "payload"}: ${issue.message}`;
  });
}

function cardLabel(value: unknown, index: number): string {
  if (typeof value === "object" && value !== null && "term" in value) {
    const term = (value as { term?: unknown }).term;
    if (typeof term === "string" && term.trim()) return `"${term.trim()}"`;
  }
  return `card ${index + 1}`;
}

function extractCandidateTerms(value: unknown): string[] {
  if (typeof value !== "object" || value === null || !("cards" in value)) return [];
  const cards = (value as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => (
    typeof card === "object" && card !== null && "term" in card && typeof (card as { term?: unknown }).term === "string"
      ? (card as { term: string }).term.trim()
      : ""
  ));
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

/** Compares the external response against the exact client-side prompt manifest. */
export function compareExternalAiV3Manifest(
  expectedTerms: string[],
  receivedTerms: string[]
): ExternalAiV3ManifestComparison {
  const expectedByNormalized = new Map(expectedTerms.map((term) => [normalizeManifestTerm(term), term]));
  const receivedByNormalized = new Map<string, string[]>();
  for (const term of receivedTerms) {
    const normalized = normalizeManifestTerm(term);
    const entries = receivedByNormalized.get(normalized) ?? [];
    entries.push(term);
    receivedByNormalized.set(normalized, entries);
  }

  const duplicateTerms = Array.from(receivedByNormalized.values())
    .filter((terms) => terms.length > 1)
    .map((terms) => terms[0]);
  const missingTerms = expectedTerms.filter((term) => !receivedByNormalized.has(normalizeManifestTerm(term)));
  const unexpectedTerms = receivedTerms.filter((term) => !expectedByNormalized.has(normalizeManifestTerm(term)));
  const spellingChanges = receivedTerms.flatMap((term) => {
    const expected = expectedByNormalized.get(normalizeManifestTerm(term));
    return expected && expected !== term ? [{ expected, received: term }] : [];
  });
  const unmatchedExpected = expectedTerms.filter((term) => !receivedByNormalized.has(normalizeManifestTerm(term)));
  for (const received of unexpectedTerms) {
    const normalizedReceived = normalizeManifestTerm(received);
    const likelyExpected = unmatchedExpected.find((expected) => {
      const normalizedExpected = normalizeManifestTerm(expected);
      const threshold = Math.max(1, Math.floor(normalizedExpected.length * 0.2));
      return editDistance(normalizedExpected, normalizedReceived) <= threshold;
    });
    if (likelyExpected && !spellingChanges.some((change) => change.expected === likelyExpected && change.received === received)) {
      spellingChanges.push({ expected: likelyExpected, received });
    }
  }
  const orderMismatches = expectedTerms.flatMap((expected, index) => {
    const received = receivedTerms[index];
    return received !== undefined && received !== expected ? [{ index, expected, received }] : [];
  });

  return {
    expectedCount: expectedTerms.length,
    receivedCount: receivedTerms.length,
    missingTerms,
    unexpectedTerms,
    duplicateTerms,
    spellingChanges,
    orderMismatches,
    isExactMatch: missingTerms.length === 0 &&
      unexpectedTerms.length === 0 &&
      duplicateTerms.length === 0 &&
      spellingChanges.length === 0 &&
      orderMismatches.length === 0 &&
      expectedTerms.length === receivedTerms.length,
  };
}

function formatManifestErrors(comparison: ExternalAiV3ManifestComparison): string[] {
  const errors: string[] = [];
  if (comparison.expectedCount !== comparison.receivedCount) {
    errors.push(`Expected ${comparison.expectedCount} terms, received ${comparison.receivedCount}.`);
  }
  for (const term of comparison.missingTerms) errors.push(`Missing term: "${term}".`);
  for (const term of comparison.unexpectedTerms) errors.push(`Unexpected term: "${term}".`);
  for (const term of comparison.duplicateTerms) errors.push(`Duplicate term in imported JSON: "${term}".`);
  for (const change of comparison.spellingChanges) {
    errors.push(`Term spelling changed: expected "${change.expected}", received "${change.received}".`);
  }
  if (comparison.orderMismatches.length > 0) {
    errors.push("Imported terms are not in the same order as the prompt manifest.");
  }
  return errors;
}

function formatExternalAiV3ValidationErrors(error: z.ZodError, rawValue: unknown): string[] {
  const cards = typeof rawValue === "object" && rawValue !== null && "cards" in rawValue && Array.isArray((rawValue as { cards?: unknown }).cards)
    ? (rawValue as { cards: unknown[] }).cards
    : [];

  return error.issues.map((issue) => {
    const [root, index, field] = issue.path;
    if (root === "cards" && typeof index === "number" && typeof field === "string") {
      const label = cardLabel(cards[index], index);
      if (["term", "meaningVi", "definitionEn", "exampleEn", "exampleVi"].includes(field)) {
        return `Missing ${field} for ${label}.`;
      }
      if (field === "partOfSpeech") return `Invalid POS for ${label}.`;
      if (field === "cefr") return `Invalid CEFR for ${label}.`;
      if (field === "ipa" || field === "imageUrl") return `Invalid ${field} for ${label}.`;
    }
    return formatValidationErrors(error)[error.issues.indexOf(issue)] ?? issue.message;
  });
}

/** Parses only strict JSON, optionally wrapped in one chatbot markdown fence. */
export function parseJsonFlashcardImport(rawJson: string): JsonImportParseResult {
  const parsed = parseRawJson(rawJson);
  if (!parsed.valid) return parsed;

  const validation = jsonFlashcardImportSchema.safeParse(parsed.value);
  return validation.success
    ? { valid: true, payload: validation.data }
    : { valid: false, errors: formatValidationErrors(validation.error) };
}

/**
 * Parses a response from the V3 external prompt and enforces its manifest.
 * This proves format and requested-term fidelity only; it makes no claim that
 * an externally authored definition or translation has been semantically verified.
 */
export function parseExternalAiV3Import(
  rawJson: string,
  manifestInput: ExternalAiV3Manifest
): ExternalAiV3ImportParseResult {
  const manifest = externalAiV3ManifestSchema.safeParse(manifestInput);
  if (!manifest.success) {
    const comparison = compareExternalAiV3Manifest([], []);
    return { valid: false, errors: formatValidationErrors(manifest.error), comparison };
  }

  const parsed = parseRawJson(rawJson);
  if (!parsed.valid) {
    return {
      valid: false,
      errors: parsed.errors,
      comparison: compareExternalAiV3Manifest(manifest.data.terms, []),
    };
  }

  const comparison = compareExternalAiV3Manifest(manifest.data.terms, extractCandidateTerms(parsed.value));
  const validation = externalAiV3ImportSchema.safeParse(parsed.value);
  const errors = [
    ...(validation.success ? [] : formatExternalAiV3ValidationErrors(validation.error, parsed.value)),
    ...formatManifestErrors(comparison),
  ];

  if (!validation.success || errors.length > 0) {
    return {
      valid: false,
      errors: [...new Set(errors)],
      comparison,
      recoverableCards: validation.success ? validation.data.cards : undefined,
    };
  }

  return { valid: true, payload: validation.data, comparison };
}
