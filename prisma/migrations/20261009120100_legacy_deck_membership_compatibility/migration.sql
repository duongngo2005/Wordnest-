-- Preserve compatibility for legacy/direct Flashcard creation while V1.3
-- services move to explicit DeckVocabularyMembership writes. The trigger never
-- creates a Flashcard; it only mirrors an explicitly supplied legacy deckId
-- into the new organizational relation.

CREATE TRIGGER "flashcards_legacy_deck_after_insert_membership"
AFTER INSERT ON "flashcards"
FOR EACH ROW
WHEN NEW."deckId" IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO "deck_vocabulary_memberships" (
    "id", "deckId", "flashcardId", "createdAt"
  ) VALUES (
    'legacy-membership-' || NEW."id",
    NEW."deckId",
    NEW."id",
    CURRENT_TIMESTAMP
  );
END;
