import { db } from "@/lib/db";
import { Rating, fsrsService } from "@/services/fsrs/fsrs-service";
import { deckService } from "@/services/vocabulary/deck-service";
import { folderService } from "@/services/vocabulary/folder-service";

function requireIsolatedClone() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes(".test.db")) {
    throw new Error("Refusing to mutate a non-test database. Set DATABASE_URL to an isolated *.test.db clone.");
  }
}

function schedulerSnapshot(card: {
  id: string;
  deckId: string | null;
  due: Date;
  lastReviewAt: Date | null;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  state: number;
  schedulerVersion: number;
}) {
  return {
    id: card.id,
    due: card.due.toISOString(),
    lastReviewAt: card.lastReviewAt?.toISOString() ?? null,
    reps: card.reps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    state: card.state,
    schedulerVersion: card.schedulerVersion,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  requireIsolatedClone();
  const suffix = crypto.randomUUID();
  const probeFolder = await folderService.createFolder({ name: `V1.3 clone verification ${suffix}` });
  const importDeck = await deckService.createDeck({
    name: `V1.3 existing-link ${suffix}`,
    description: undefined,
    folderId: probeFolder.id,
  });

  const candidates = await db.flashcard.findMany({
    take: 50,
    orderBy: { createdAt: "asc" },
    include: {
      canonicalVocabularyIdentity: true,
      deckMemberships: true,
    },
  });
  const existingCard = candidates.find(
    (card) => card.deckMemberships.length > 0 && !card.canonicalVocabularyIdentity?.hasHistoricalDuplicates
  );
  assert(existingCard, "No unambiguous existing vocabulary was available in the clone.");

  const existingBefore = await db.flashcard.findUniqueOrThrow({ where: { id: existingCard.id } });
  const [existingReviewLogsBefore, existingPracticeBefore] = await Promise.all([
    db.reviewLog.count({ where: { cardId: existingCard.id } }),
    db.practiceAttempt.count({ where: { flashcardId: existingCard.id } }),
  ]);

  const externalJson = JSON.stringify({
    schemaVersion: 1,
    cards: [{
      term: existingCard.term,
      meaningVi: "Bản nháp dùng để xác nhận liên kết nguồn.",
      partOfSpeech: "noun",
      ipa: null,
      definitionEn: "A verification draft for an existing vocabulary record.",
      exampleEn: "This draft confirms a source association without replacing content.",
      exampleVi: "Bản nháp này xác nhận liên kết nguồn mà không thay thế nội dung.",
      cefr: null,
      imageUrl: null,
    }],
  });
  const importResult = await deckService.importJsonFlashcards(importDeck.id, externalJson, {
    mode: "external-ai-v3",
    manifest: { terms: [existingCard.term] },
    linkExistingCardIds: [existingCard.id],
  });
  assert(importResult.cardsCreated === 0 && importResult.linkedExistingCards === 1, "Existing external-AI card was not linked exactly once.");

  const existingAfterLink = await db.flashcard.findUniqueOrThrow({ where: { id: existingCard.id } });
  assert(
    JSON.stringify(schedulerSnapshot(existingAfterLink)) === JSON.stringify(schedulerSnapshot(existingBefore)),
    "Linking an existing card changed its FSRS state."
  );
  assert(
    await db.reviewLog.count({ where: { cardId: existingCard.id } }) === existingReviewLogsBefore &&
      await db.practiceAttempt.count({ where: { flashcardId: existingCard.id } }) === existingPracticeBefore,
    "Linking an existing card changed its learning history."
  );

  const folderImpact = await folderService.getFolderDeletionImpact(probeFolder.id);
  assert(folderImpact.canonicalFlashcardsDeleted === 0 && folderImpact.learningHistoriesDeleted === 0, "Folder impact reported destructive behavior.");
  await folderService.deleteFolder(probeFolder.id);
  const retainedImportDeck = await db.deck.findUniqueOrThrow({ where: { id: importDeck.id } });
  assert(retainedImportDeck.folderId === null, "Folder deletion did not retain its Deck as uncategorized.");
  assert(
    await db.deckVocabularyMembership.findUnique({
      where: { deckId_flashcardId: { deckId: importDeck.id, flashcardId: existingCard.id } },
    }),
    "Folder deletion removed a retained vocabulary membership."
  );

  const primaryDeck = await deckService.createDeck({ name: `V1.3 FSRS source ${suffix}`, description: undefined });
  const secondaryDeck = await deckService.createDeck({ name: `V1.3 FSRS source two ${suffix}`, description: undefined });
  const newTerm = `v13-clone-${suffix}`;
  await deckService.createManualCards(primaryDeck.id, [{ term: newTerm, meaningVi: "từ kiểm thử V1.3" }]);
  const newCard = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: newTerm } });
  const review = await fsrsService.processScheduledReview(newCard.id, {
    rating: Rating.Good,
    reviewEventId: `v13-clone-review-${suffix}`,
    expectedSchedulerVersion: newCard.schedulerVersion,
  });
  await deckService.linkExistingVocabularyToDeck(secondaryDeck.id, newCard.id);
  assert(
    await db.deckVocabularyMembership.count({ where: { flashcardId: newCard.id } }) === 2,
    "A shared vocabulary card did not receive two source memberships."
  );
  const reviewedSnapshot = schedulerSnapshot(review.card);
  const reviewedLogs = await db.reviewLog.count({ where: { cardId: newCard.id } });

  await deckService.deleteDeck(primaryDeck.id);
  const afterFirstSourceDelete = await db.flashcard.findUniqueOrThrow({ where: { id: newCard.id } });
  assert(
    JSON.stringify(schedulerSnapshot(afterFirstSourceDelete)) === JSON.stringify(reviewedSnapshot),
    "Deleting one source changed the shared FSRS state."
  );
  assert(await db.reviewLog.count({ where: { cardId: newCard.id } }) === reviewedLogs, "Deleting one source changed ReviewLogs.");
  assert(
    await db.deckVocabularyMembership.count({ where: { flashcardId: newCard.id } }) === 1,
    "Deleting one source removed the remaining membership."
  );

  await deckService.deleteDeck(secondaryDeck.id);
  const unassignedCard = await db.flashcard.findUniqueOrThrow({ where: { id: newCard.id } });
  assert(unassignedCard.deckId === null, "Deleting the final source did not leave the card unassigned.");
  assert(
    JSON.stringify(schedulerSnapshot(unassignedCard)) === JSON.stringify(reviewedSnapshot),
    "Deleting the final source changed the retained FSRS state."
  );
  assert(await db.reviewLog.count({ where: { cardId: newCard.id } }) === reviewedLogs, "Deleting the final source changed ReviewLogs.");
  assert(await db.deckVocabularyMembership.count({ where: { flashcardId: newCard.id } }) === 0, "Unassigned card still has a source membership.");

  const foreignKeyViolations = await db.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
  assert(foreignKeyViolations.length === 0, "Foreign-key integrity check failed after V1.3 workflow verification.");

  console.log(JSON.stringify({
    verification: "passed",
    existingCardId: existingCard.id,
    linkedExistingCards: importResult.linkedExistingCards,
    retainedUnassignedCardId: newCard.id,
    reviewLogsRetained: reviewedLogs,
    folderImpact,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
