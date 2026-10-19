import { afterEach } from "vitest";
import { db } from "@/lib/db";

// V1.3 intentionally preserves canonical cards when a Deck is deleted. Test
// fixtures therefore cannot rely on the former Deck -> Flashcard cascade to
// clean up static terms between tests. Keep this test-only cleanup explicit so
// every test starts with an empty, migration-current database.
afterEach(async () => {
  await db.practiceAttempt.deleteMany();
  await db.reviewLog.deleteMany();
  await db.quizAttempt.deleteMany();
  await db.quizSession.deleteMany();
  await db.story.deleteMany();
  await db.lesson.deleteMany();
  await db.deckVocabularyMembership.deleteMany();
  await db.flashcard.deleteMany();
  await db.vocabularyIdentity.deleteMany();
  await db.aiJobItem.deleteMany();
  await db.aiJob.deleteMany();
  await db.deck.deleteMany();
  await db.folder.deleteMany();
});
