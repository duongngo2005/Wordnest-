import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { practiceEvidenceService } from "./practice-evidence-service";
import { todayLearningService } from "./today-learning-service";

describe("TodayLearningService", () => {
  const deckIds: string[] = [];

  afterEach(async () => {
    await db.deck.deleteMany({ where: { id: { in: deckIds.splice(0) } } });
    vi.restoreAllMocks();
  });

  it("counts only cards currently reviewable under the FSRS queue's due <= now rule", async () => {
    const deck = await db.deck.create({ data: { name: `Today due semantics ${crypto.randomUUID()}` } });
    deckIds.push(deck.id);
    const now = new Date("2026-10-08T10:00:00.000Z");

    await db.flashcard.createMany({
      data: [
        {
          deckId: deck.id,
          term: "due-now",
          normalizedTerm: `due-now-${crypto.randomUUID()}`,
          meaningVi: "đến hạn",
          state: 1,
          due: new Date("2026-10-08T09:59:00.000Z"),
        },
        {
          deckId: deck.id,
          term: "future-today",
          normalizedTerm: `future-today-${crypto.randomUUID()}`,
          meaningVi: "chưa đến hạn",
          state: 1,
          due: new Date("2026-10-08T15:00:00.000Z"),
        },
        {
          deckId: deck.id,
          term: "new-card",
          normalizedTerm: `new-card-${crypto.randomUUID()}`,
          meaningVi: "mới",
          state: 0,
        },
      ],
    });

    const states = await todayLearningService.getTodayDeckStates(now);
    expect(states.find((state) => state.deckId === deck.id)).toMatchObject({
      totalCards: 3,
      dueCount: 1,
      newCount: 1,
    });
  });

  it("uses fixed batched queries and one evidence projection for 100 decks", async () => {
    const decks = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        db.deck.create({ data: { name: `Today batch ${index} ${crypto.randomUUID()}` } })
      )
    );
    deckIds.push(...decks.map((deck) => deck.id));

    const weakCountsSpy = vi.spyOn(practiceEvidenceService, "getDeckWeakCardCounts");
    const fullEvidenceSpy = vi.spyOn(practiceEvidenceService, "getDeckPracticeEvidence");
    const groupBySpy = vi.spyOn(db.flashcard, "groupBy");

    const states = await todayLearningService.getTodayDeckStates(new Date("2026-10-08T10:00:00.000Z"));

    expect(states.filter((state) => deckIds.includes(state.deckId))).toHaveLength(100);
    expect(weakCountsSpy).toHaveBeenCalledTimes(1);
    expect(weakCountsSpy).toHaveBeenCalledWith(expect.arrayContaining(decks.map((deck) => deck.id)));
    expect(fullEvidenceSpy).not.toHaveBeenCalled();
    expect(groupBySpy).toHaveBeenCalledTimes(3);
  });

  it("is read-only and does not create learning evidence or mutate FSRS cards", async () => {
    const deck = await db.deck.create({ data: { name: `Today read only ${crypto.randomUUID()}` } });
    deckIds.push(deck.id);
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "read-only",
        normalizedTerm: `read-only-${crypto.randomUUID()}`,
        meaningVi: "chỉ đọc",
        state: 1,
        due: new Date("2026-10-08T09:00:00.000Z"),
      },
    });

    const reviewLogCreateSpy = vi.spyOn(db.reviewLog, "create");
    const practiceAttemptCreateSpy = vi.spyOn(db.practiceAttempt, "create");
    const quizAttemptCreateSpy = vi.spyOn(db.quizAttempt, "create");
    const flashcardUpdateSpy = vi.spyOn(db.flashcard, "update");
    const flashcardUpdateManySpy = vi.spyOn(db.flashcard, "updateMany");

    await todayLearningService.getTodayDeckStates(new Date("2026-10-08T10:00:00.000Z"));

    expect(reviewLogCreateSpy).not.toHaveBeenCalled();
    expect(practiceAttemptCreateSpy).not.toHaveBeenCalled();
    expect(quizAttemptCreateSpy).not.toHaveBeenCalled();
    expect(flashcardUpdateSpy).not.toHaveBeenCalled();
    expect(flashcardUpdateManySpy).not.toHaveBeenCalled();
  });
});
