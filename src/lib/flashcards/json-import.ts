import { z } from "zod";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";

export const JSON_FLASHCARD_IMPORT_MAX_CARDS = 100;

const optionalNullableText = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable().optional();

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

export type JsonImportParseResult =
  | { valid: true; payload: JsonFlashcardImport }
  | { valid: false; errors: string[] };

function stripSingleOuterJsonFence(rawJson: string): string {
  const match = rawJson.trim().match(/^```(?:json)?\s*\r?\n([\s\S]*)\r?\n```$/i);
  return match ? match[1].trim() : rawJson.trim();
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

/** Parses only strict JSON, optionally wrapped in one chatbot markdown fence. */
export function parseJsonFlashcardImport(rawJson: string): JsonImportParseResult {
  const preparedJson = stripSingleOuterJsonFence(rawJson);
  if (!preparedJson) {
    return { valid: false, errors: ["JSON không được để trống."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(preparedJson);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid JSON syntax.";
    return { valid: false, errors: [`JSON không hợp lệ: ${reason}`] };
  }

  const validation = jsonFlashcardImportSchema.safeParse(parsed);
  return validation.success
    ? { valid: true, payload: validation.data }
    : { valid: false, errors: formatValidationErrors(validation.error) };
}
