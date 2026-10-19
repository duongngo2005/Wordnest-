-- V1.3 shared vocabulary memberships.
--
-- The migration is deliberately data-preserving: every existing Flashcard
-- retains its primary key and all learning-history rows continue to reference
-- that same key. A legacy source membership is backfilled before `deckId` is
-- made nullable and non-destructive.

-- Prisma's SQLite migration executor does not make every DDL statement atomic
-- on its own. Disable FK enforcement before starting the explicit transaction
-- (SQLite cannot change this pragma inside a transaction), then commit every
-- membership/table/trigger change as one unit.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "deck_vocabulary_memberships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deck_vocabulary_memberships_deckId_fkey"
      FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deck_vocabulary_memberships_flashcardId_fkey"
      FOREIGN KEY ("flashcardId") REFERENCES "flashcards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The existing deck is retained as a source association, with a stable,
-- deterministic membership ID for straightforward data-audit comparison.
INSERT INTO "deck_vocabulary_memberships" ("id", "deckId", "flashcardId", "createdAt")
SELECT
    'legacy-membership-' || "id",
    "deckId",
    "id",
    "createdAt"
FROM "flashcards";

CREATE UNIQUE INDEX "deck_vocabulary_memberships_deckId_flashcardId_key"
ON "deck_vocabulary_memberships"("deckId", "flashcardId");

CREATE INDEX "deck_vocabulary_memberships_flashcardId_idx"
ON "deck_vocabulary_memberships"("flashcardId");

-- SQLite requires a table rebuild to change the foreign-key action. The exact
-- Flashcard columns are copied one-for-one; no card or learning history row is
-- regenerated. Existing identity triggers are recreated after the rebuild.

CREATE TABLE "new_flashcards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "meaningVi" TEXT NOT NULL,
    "definitionEn" TEXT,
    "ipa" TEXT,
    "partOfSpeech" TEXT,
    "cefr" TEXT,
    "exampleEn" TEXT,
    "exampleVi" TEXT,
    "imageUrl" TEXT,
    "imageSource" TEXT,
    "imageSearchQuery" TEXT,
    "imagePageUrl" TEXT,
    "imageAuthor" TEXT,
    "imageLicense" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewAt" DATETIME,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "schedulerVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "flashcards_deckId_fkey"
      FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_flashcards" (
    "id", "deckId", "term", "normalizedTerm", "meaningVi", "definitionEn", "ipa", "partOfSpeech", "cefr", "exampleEn", "exampleVi",
    "imageUrl", "imageSource", "imageSearchQuery", "imagePageUrl", "imageAuthor", "imageLicense", "status", "due", "lastReviewAt",
    "reps", "lapses", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "state", "schedulerVersion", "createdAt", "updatedAt"
)
SELECT
    "id", "deckId", "term", "normalizedTerm", "meaningVi", "definitionEn", "ipa", "partOfSpeech", "cefr", "exampleEn", "exampleVi",
    "imageUrl", "imageSource", "imageSearchQuery", "imagePageUrl", "imageAuthor", "imageLicense", "status", "due", "lastReviewAt",
    "reps", "lapses", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "state", "schedulerVersion", "createdAt", "updatedAt"
FROM "flashcards";

DROP TABLE "flashcards";
ALTER TABLE "new_flashcards" RENAME TO "flashcards";

CREATE INDEX "flashcards_deckId_idx" ON "flashcards"("deckId");
CREATE INDEX "flashcards_due_idx" ON "flashcards"("due");
CREATE INDEX "flashcards_deckId_due_idx" ON "flashcards"("deckId", "due");
CREATE UNIQUE INDEX "flashcards_deckId_normalizedTerm_key" ON "flashcards"("deckId", "normalizedTerm");

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

CREATE TRIGGER "flashcards_global_identity_before_delete"
BEFORE DELETE ON "flashcards"
FOR EACH ROW
BEGIN
  DELETE FROM "vocabulary_identities"
  WHERE "canonicalFlashcardId" = OLD."id"
    AND "hasHistoricalDuplicates" = false;
END;

PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
