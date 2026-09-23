/**
 * Browser-safe representation of the FlashcardStatus Prisma enum.
 *
 * Client Components must not import @prisma/client just to render or update a
 * status; doing so pulls database runtime code into the browser bundle.
 */
export const FlashcardStatus = {
  NEW: "NEW",
  LEARNING: "LEARNING",
  KNOWN: "KNOWN",
} as const;

export type FlashcardStatus =
  (typeof FlashcardStatus)[keyof typeof FlashcardStatus];
