import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { practiceEvidenceService } from "./practice-evidence-service";

describe("PracticeEvidenceService.getDeckWeakCardCounts", () => {
  const deckIds: string[] = [];

  afterEach(async () => {
    await db.deck.deleteMany({ where: { id: { in: deckIds.splice(0) } } });
    vi.restoreAllMocks();
  });

  it("batches deck counts without hydrating PracticeAttempt history and keeps axis weakness semantics", async () => {
    const [weakDeck, stableDeck] = await Promise.all([
      db.deck.create({ data: { name: `Today weak ${crypto.randomUUID()}` } }),
      db.deck.create({ data: { name: `Today stable ${crypto.randomUUID()}` } }),
    ]);
    deckIds.push(weakDeck.id, stableDeck.id);
    const [weakCard, stableCard, insufficientCard] = await Promise.all([
      db.flashcard.create({
        data: { deckId: weakDeck.id, term: "fragile", normalizedTerm: `fragile-${crypto.randomUUID()}`, meaningVi: "mong manh" },
      }),
      db.flashcard.create({
        data: { deckId: stableDeck.id, term: "stable", normalizedTerm: `stable-${crypto.randomUUID()}`, meaningVi: "ổn định" },
      }),
      db.flashcard.create({
        data: { deckId: stableDeck.id, term: "single", normalizedTerm: `single-${crypto.randomUUID()}`, meaningVi: "một lần" },
      }),
    ]);

    await db.practiceAttempt.createMany({
      data: [
        ...[0, 1].map((index) => ({
          flashcardId: weakCard.id,
          sessionId: `weak-${index}`,
          questionId: `weak-q-${index}`,
          questionType: "multiple_choice_en_vi",
          mode: "quiz",
          attemptNumber: 1,
          correct: false,
          answer: "sai",
          expectedAnswer: "fragile",
          createdAt: new Date(`2026-01-0${index + 1}T10:00:00.000Z`),
        })),
        ...[0, 1].map((index) => ({
          flashcardId: stableCard.id,
          sessionId: `stable-${index}`,
          questionId: `stable-q-${index}`,
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          correct: true,
          answer: "stable",
          expectedAnswer: "stable",
          createdAt: new Date(`2026-01-0${index + 3}T10:00:00.000Z`),
        })),
        {
          flashcardId: insufficientCard.id,
          sessionId: "insufficient",
          questionId: "insufficient-q",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          correct: false,
          answer: "sai",
          expectedAnswer: "single",
        },
      ],
    });

    const historySpy = vi.spyOn(db.practiceAttempt, "findMany");
    const counts = await practiceEvidenceService.getDeckWeakCardCounts([weakDeck.id, stableDeck.id]);
    const fullEvidence = await practiceEvidenceService.getDeckPracticeEvidence([weakDeck.id, stableDeck.id]);
    const expectedWeakCounts = new Map<string, number>([
      [weakDeck.id, 0],
      [stableDeck.id, 0],
    ]);
    for (const item of fullEvidence.needPracticeCards) {
      expectedWeakCounts.set(item.card.deckId, (expectedWeakCounts.get(item.card.deckId) ?? 0) + 1);
    }

    expect(counts.get(weakDeck.id)).toBe(1);
    expect(counts.get(stableDeck.id)).toBe(0);
    expect(counts).toEqual(expectedWeakCounts);
    expect(historySpy).not.toHaveBeenCalled();
  });
});
