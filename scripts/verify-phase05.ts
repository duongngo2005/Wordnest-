import { FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  fsrsService,
  Rating,
  State,
} from "@/services/fsrs/fsrs-service";
import { quizService } from "@/services/vocabulary/quiz-service";

type SchedulerSnapshot = {
  due: number;
  stability: number;
  difficulty: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  schedulerVersion: number;
  lastReviewAt: number | null;
  status: FlashcardStatus;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(card: {
  due: Date;
  stability: number;
  difficulty: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  schedulerVersion: number;
  lastReviewAt: Date | null;
  status: FlashcardStatus;
}): SchedulerSnapshot {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    schedulerVersion: card.schedulerVersion,
    lastReviewAt: card.lastReviewAt?.getTime() ?? null,
    status: card.status,
  };
}

async function createCard(deckId: string, term: string, overrides: Record<string, unknown> = {}) {
  return db.flashcard.create({
    data: {
      deckId,
      term,
      normalizedTerm: term,
      meaningVi: `nghĩa ${term}`,
      ...overrides,
    },
  });
}

async function reviewLogCount(cardId: string) {
  return db.reviewLog.count({ where: { cardId } });
}

async function main() {
  const suffix = crypto.randomUUID();
  const folder = await db.folder.create({
    data: { name: `Phase 0.5 UAT ${suffix}`, normalizedName: `phase-05-uat-${suffix}` },
  });
  const deck = await db.deck.create({ data: { name: `Phase 0.5 FSRS ${suffix}`, folderId: folder.id } });
  const quizDeck = await db.deck.create({ data: { name: `Phase 0.5 Quiz ${suffix}` } });
  const emptyDeck = await db.deck.create({ data: { name: `Phase 0.5 Empty ${suffix}` } });
  const now = new Date("2026-09-22T15:00:00.000Z");

  try {
    const goodCard = await createCard(deck.id, "uat-good");
    const firstGood = await fsrsService.processScheduledReview(goodCard.id, {
      rating: Rating.Good,
      reviewEventId: crypto.randomUUID(),
      expectedSchedulerVersion: goodCard.schedulerVersion,
      now,
    });
    assert(firstGood.card.state === State.Learning, "First Good must enter Learning.");
    assert(firstGood.card.learningSteps > 0, "First Good must persist a learning step.");
    assert(firstGood.card.schedulerVersion === 1, "First Good must increment schedulerVersion.");
    assert(await reviewLogCount(goodCard.id) === 1, "First Good must create one ReviewLog.");

    const reloadedGood = await db.flashcard.findUniqueOrThrow({ where: { id: goodCard.id } });
    assert(reloadedGood.learningSteps === firstGood.card.learningSteps, "Reload must retain learningSteps.");
    const secondGood = await fsrsService.processScheduledReview(goodCard.id, {
      rating: Rating.Good,
      reviewEventId: crypto.randomUUID(),
      expectedSchedulerVersion: reloadedGood.schedulerVersion,
      now: new Date(reloadedGood.due.getTime() + 1),
    });
    assert(secondGood.card.state === State.Review, "Second Good after reload must graduate to Review.");
    assert(secondGood.card.learningSteps === 0, "Graduated card must clear learning steps.");

    const againCard = await createCard(deck.id, "uat-again");
    const again = await fsrsService.processScheduledReview(againCard.id, {
      rating: Rating.Again,
      reviewEventId: crypto.randomUUID(),
      expectedSchedulerVersion: againCard.schedulerVersion,
      now,
    });
    assert(again.card.state === State.Learning, "Again must enter Learning.");
    assert(again.card.schedulerVersion === 1 && await reviewLogCount(againCard.id) === 1, "Again must write exactly one event.");
    assert((await db.flashcard.findUniqueOrThrow({ where: { id: againCard.id } })).learningSteps === again.card.learningSteps, "Again continuation must survive reload.");

    const hardCard = await createCard(deck.id, "uat-hard");
    const hard = await fsrsService.processScheduledReview(hardCard.id, {
      rating: Rating.Hard,
      reviewEventId: crypto.randomUUID(),
      expectedSchedulerVersion: hardCard.schedulerVersion,
      now,
    });
    assert(hard.card.state === State.Learning, "Hard must enter Learning.");
    assert(hard.card.schedulerVersion === 1 && await reviewLogCount(hardCard.id) === 1, "Hard must write exactly one event.");
    assert(hard.card.due > now, "Hard must schedule a future due time.");

    const duplicateCard = await createCard(deck.id, "uat-duplicate");
    const duplicateInput = {
      rating: Rating.Again,
      reviewEventId: crypto.randomUUID(),
      expectedSchedulerVersion: duplicateCard.schedulerVersion,
      now,
    };
    const duplicateFirst = await fsrsService.processScheduledReview(duplicateCard.id, duplicateInput);
    const duplicateRetry = await fsrsService.processScheduledReview(duplicateCard.id, duplicateInput);
    assert(!duplicateFirst.idempotent && duplicateRetry.idempotent, "Duplicate event must be idempotent.");
    assert((await db.flashcard.findUniqueOrThrow({ where: { id: duplicateCard.id } })).schedulerVersion === 1, "Duplicate event must increment once.");
    assert(await reviewLogCount(duplicateCard.id) === 1, "Duplicate event must create one ReviewLog.");

    const concurrentCard = await createCard(deck.id, "uat-concurrent");
    const concurrentResults = await Promise.allSettled([
      fsrsService.processScheduledReview(concurrentCard.id, { rating: Rating.Again, reviewEventId: crypto.randomUUID(), expectedSchedulerVersion: 0, now }),
      fsrsService.processScheduledReview(concurrentCard.id, { rating: Rating.Good, reviewEventId: crypto.randomUUID(), expectedSchedulerVersion: 0, now }),
    ]);
    assert(concurrentResults.filter((result) => result.status === "fulfilled").length === 1, "Exactly one stale concurrent event may succeed.");
    assert(concurrentResults.filter((result) => result.status === "rejected").length === 1, "One stale concurrent event must conflict.");
    assert((await db.flashcard.findUniqueOrThrow({ where: { id: concurrentCard.id } })).schedulerVersion === 1, "Concurrent review must increment once.");
    assert(await reviewLogCount(concurrentCard.id) === 1, "Concurrent review must create one log.");

    const dueCard = await createCard(deck.id, "uat-due", { state: State.Learning, status: FlashcardStatus.LEARNING, due: new Date(now.getTime() - 1) });
    const futureCard = await createCard(deck.id, "uat-future", { state: State.Learning, status: FlashcardStatus.LEARNING, due: new Date(now.getTime() + 60_000) });
    await Promise.all([
      createCard(deck.id, "uat-new-one"),
      createCard(deck.id, "uat-new-two"),
      createCard(deck.id, "uat-new-three"),
    ]);
    const deckQueue = await fsrsService.getReviewQueue({ deckId: deck.id, now, newLimit: 2 });
    assert(deckQueue.dueCards.some((card) => card.id === dueCard.id), "Due card must be queued.");
    assert(!deckQueue.queue.some((card) => card.id === futureCard.id), "Future card must not be queued.");
    assert(deckQueue.newCards.length === 2, "New limit must be respected.");
    assert(deckQueue.queue.slice(0, deckQueue.dueCards.length).every((card) => card.state > State.New), "Due cards must precede New cards.");
    const folderQueue = await fsrsService.getReviewQueue({ folderId: folder.id, now, newLimit: 2 });
    assert(folderQueue.queue.map((card) => card.id).join(",") === deckQueue.queue.map((card) => card.id).join(","), "Folder queue must share canonical semantics.");

    await createCard(emptyDeck.id, "uat-empty-future", { state: State.Learning, status: FlashcardStatus.LEARNING, due: new Date(now.getTime() + 60_000) });
    assert((await fsrsService.getReviewQueue({ deckId: emptyDeck.id, now })).queue.length === 0, "Empty queue must not fall back to all cards.");

    const [quizFirst, quizSecond] = await Promise.all([
      createCard(quizDeck.id, "uat-quiz-one"),
      createCard(quizDeck.id, "uat-quiz-two"),
    ]);
    const schedulerBefore = new Map(
      (await db.flashcard.findMany({ where: { id: { in: [quizFirst.id, quizSecond.id] } } })).map((card) => [card.id, snapshot(card)])
    );
    const quiz = await quizService.getDeckQuiz(quizDeck.id, 2);
    const quizResult = await quizService.submitQuizResult(quizDeck.id, {
      sessionId: quiz.sessionId,
      answers: quiz.questions.map((question, index) => ({
        questionId: question.id,
        answer: index === 0 ? question.correctAnswer : question.options.find((option) => option !== question.correctAnswer)!,
      })),
    });
    assert(quizResult.cardsUpdatedCount === 0, "Quiz must not update scheduler cards.");
    const schedulerAfter = await db.flashcard.findMany({ where: { id: { in: [quizFirst.id, quizSecond.id] } } });
    for (const card of schedulerAfter) {
      assert(JSON.stringify(snapshot(card)) === JSON.stringify(schedulerBefore.get(card.id)), "Quiz changed scheduler state.");
    }

    console.log(JSON.stringify({
      good: { firstState: firstGood.card.state, firstLearningSteps: firstGood.card.learningSteps, secondState: secondGood.card.state },
      again: { state: again.card.state, learningSteps: again.card.learningSteps },
      hard: { state: hard.card.state, learningSteps: hard.card.learningSteps },
      duplicate: { idempotent: duplicateRetry.idempotent },
      concurrency: concurrentResults.map((result) => result.status),
      queue: { due: deckQueue.dueCards.length, new: deckQueue.newCards.length },
      quiz: { score: quizResult.score, total: quizResult.total, cardsUpdatedCount: quizResult.cardsUpdatedCount },
    }, null, 2));
  } finally {
    await db.deck.deleteMany({ where: { id: { in: [deck.id, quizDeck.id, emptyDeck.id] } } });
    await db.folder.delete({ where: { id: folder.id } });
    await db.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
