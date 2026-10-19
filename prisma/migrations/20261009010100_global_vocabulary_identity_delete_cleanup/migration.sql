-- A vocabulary identity follows its sole canonical Flashcard when that card is
-- explicitly deleted (including deck cascade deletion). Historical duplicate
-- identities remain reserved because they intentionally have no canonical row
-- and need an explicit reconciliation workflow.
CREATE TRIGGER "flashcards_global_identity_before_delete"
BEFORE DELETE ON "flashcards"
FOR EACH ROW
BEGIN
  DELETE FROM "vocabulary_identities"
  WHERE "canonicalFlashcardId" = OLD."id"
    AND "hasHistoricalDuplicates" = false;
END;
