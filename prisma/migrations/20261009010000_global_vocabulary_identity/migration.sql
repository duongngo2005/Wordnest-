-- Global vocabulary identity registry.
--
-- Existing cards are deliberately not deleted, merged, reassigned, or
-- rewritten. A normalized term with exactly one historical Flashcard becomes
-- its canonical identity. A historical duplicate group gets one reserved
-- identity with no canonical Flashcard and is blocked from receiving a new
-- card until a user performs an explicit future resolution.

CREATE TABLE "vocabulary_identities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedTerm" TEXT NOT NULL,
    "canonicalFlashcardId" TEXT,
    "hasHistoricalDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "historicalDuplicateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vocabulary_identities_canonicalFlashcardId_fkey"
      FOREIGN KEY ("canonicalFlashcardId") REFERENCES "flashcards" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

-- Use an existing Flashcard id when a group is unambiguous. Duplicate groups
-- have no chosen canonical record: selection or history merging must never be
-- inferred by a migration.
INSERT INTO "vocabulary_identities" (
  "id", "normalizedTerm", "canonicalFlashcardId",
  "hasHistoricalDuplicates", "historicalDuplicateCount", "createdAt", "updatedAt"
)
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN MIN("id")
    ELSE 'legacy-duplicate-' || lower(hex(randomblob(16)))
  END,
  "normalizedTerm",
  CASE WHEN COUNT(*) = 1 THEN MIN("id") ELSE NULL END,
  CASE WHEN COUNT(*) > 1 THEN true ELSE false END,
  CASE WHEN COUNT(*) > 1 THEN COUNT(*) ELSE 0 END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "flashcards"
GROUP BY "normalizedTerm";

CREATE UNIQUE INDEX "vocabulary_identities_normalizedTerm_key"
ON "vocabulary_identities"("normalizedTerm");

CREATE UNIQUE INDEX "vocabulary_identities_canonicalFlashcardId_key"
ON "vocabulary_identities"("canonicalFlashcardId");

CREATE INDEX "vocabulary_identities_canonicalFlashcardId_idx"
ON "vocabulary_identities"("canonicalFlashcardId");

-- The registry is the final database guard for all new Flashcard rows. It is
-- intentionally implemented as triggers because a global unique index on the
-- legacy flashcards table cannot be installed while historical duplicates are
-- preserved intact.
CREATE TRIGGER "flashcards_global_identity_before_insert"
BEFORE INSERT ON "flashcards"
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM "vocabulary_identities"
  WHERE "normalizedTerm" = NEW."normalizedTerm"
)
BEGIN
  SELECT RAISE(ABORT, 'GLOBAL_VOCABULARY_DUPLICATE');
END;

CREATE TRIGGER "flashcards_global_identity_after_insert"
AFTER INSERT ON "flashcards"
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM "vocabulary_identities"
  WHERE "normalizedTerm" = NEW."normalizedTerm"
)
BEGIN
  INSERT INTO "vocabulary_identities" (
    "id", "normalizedTerm", "canonicalFlashcardId",
    "hasHistoricalDuplicates", "historicalDuplicateCount", "createdAt", "updatedAt"
  ) VALUES (
    NEW."id", NEW."normalizedTerm", NEW."id",
    false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER "flashcards_global_identity_before_term_update"
BEFORE UPDATE OF "normalizedTerm" ON "flashcards"
FOR EACH ROW
WHEN NEW."normalizedTerm" <> OLD."normalizedTerm"
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "vocabulary_identities"
    WHERE "normalizedTerm" = NEW."normalizedTerm"
  ) THEN RAISE(ABORT, 'GLOBAL_VOCABULARY_DUPLICATE') END;

  -- Removing only the unambiguous old identity keeps historical duplicate
  -- groups reserved for later human reconciliation.
  DELETE FROM "vocabulary_identities"
  WHERE "canonicalFlashcardId" = OLD."id"
    AND "normalizedTerm" = OLD."normalizedTerm"
    AND "hasHistoricalDuplicates" = false;
END;

CREATE TRIGGER "flashcards_global_identity_after_term_update"
AFTER UPDATE OF "normalizedTerm" ON "flashcards"
FOR EACH ROW
WHEN NEW."normalizedTerm" <> OLD."normalizedTerm"
BEGIN
  INSERT INTO "vocabulary_identities" (
    "id", "normalizedTerm", "canonicalFlashcardId",
    "hasHistoricalDuplicates", "historicalDuplicateCount", "createdAt", "updatedAt"
  ) VALUES (
    NEW."id", NEW."normalizedTerm", NEW."id",
    false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END;
