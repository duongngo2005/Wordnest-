import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fsrsService, Rating, State } from "./fsrs-service";
import { db } from "@/lib/db";
import { FlashcardStatus } from "@prisma/client";

describe("FSRSService", () => {
  describe("formatInterval", () => {
    it("formats short minutes correctly", () => {
      const now = new Date("2026-09-19T10:00:00Z");
      const due10m = new Date("2026-09-19T10:10:00Z");
      expect(fsrsService.formatInterval(due10m, now)).toBe("10m");
    });

    it("formats hours correctly", () => {
      const now = new Date("2026-09-19T10:00:00Z");
      const due3h = new Date("2026-09-19T13:00:00Z");
      expect(fsrsService.formatInterval(due3h, now)).toBe("3h");
    });

    it("formats days correctly", () => {
      const now = new Date("2026-09-19T10:00:00Z");
      const due4d = new Date("2026-09-23T10:00:00Z");
      expect(fsrsService.formatInterval(due4d, now)).toBe("4d");
    });

    it("handles past or zero interval gracefully", () => {
      const now = new Date("2026-09-19T10:00:00Z");
      const duePast = new Date("2026-09-19T09:00:00Z");
      expect(fsrsService.formatInterval(duePast, now)).toBe("< 1m");
    });
  });

  describe("previewNextReviews", () => {
    it("generates valid preview for all 4 ratings on a new card", () => {
      const now = new Date("2026-09-19T10:00:00Z");
      const newCard = {
        due: now,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReviewAt: null,
      };

      const preview = fsrsService.previewNextReviews(newCard, now);
      expect(preview.again.rating).toBe(Rating.Again);
      expect(preview.hard.rating).toBe(Rating.Hard);
      expect(preview.good.rating).toBe(Rating.Good);
      expect(preview.easy.rating).toBe(Rating.Easy);

      // Again, Hard, Good, Easy should have due dates >= now
      expect(preview.again.due.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(preview.hard.due.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(preview.good.due.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(preview.easy.due.getTime()).toBeGreaterThan(preview.good.due.getTime());

      // Interval text should be present
      expect(preview.again.intervalText).toBeTruthy();
      expect(preview.good.intervalText).toBeTruthy();
      expect(preview.easy.intervalText).toBeTruthy();
    });
  });

  describe("mapStateToFlashcardStatus", () => {
    it("maps States to correct FlashcardStatus", () => {
      expect(fsrsService.mapStateToFlashcardStatus(State.New)).toBe(FlashcardStatus.NEW);
      expect(fsrsService.mapStateToFlashcardStatus(State.Learning)).toBe(FlashcardStatus.LEARNING);
      expect(fsrsService.mapStateToFlashcardStatus(State.Relearning)).toBe(FlashcardStatus.LEARNING);
      expect(fsrsService.mapStateToFlashcardStatus(State.Review)).toBe(FlashcardStatus.KNOWN);
    });
  });

  it("round-trips every persisted ts-fsrs continuation field", () => {
    const mapped = fsrsService.toFSRSCard({
      due: new Date("2026-09-19T12:00:00Z"),
      stability: 4.5,
      difficulty: 6.2,
      elapsedDays: 3,
      scheduledDays: 5,
      learningSteps: 1,
      reps: 7,
      lapses: 2,
      state: State.Learning,
      lastReviewAt: new Date("2026-09-16T12:00:00Z"),
    });

    expect(mapped).toMatchObject({
      stability: 4.5,
      difficulty: 6.2,
      elapsed_days: 3,
      scheduled_days: 5,
      learning_steps: 1,
      reps: 7,
      lapses: 2,
      state: State.Learning,
    });
  });

  describe("processScheduledReview integration with MySQL", () => {
    let testDeckId: string;
    let testCardId: string;

    beforeEach(async () => {
      const deck = await db.deck.create({
        data: {
          name: "Test FSRS Deck",
          description: "Testing FSRS reviews",
        },
      });
      testDeckId = deck.id;

      const card = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "ephemeral",
          normalizedTerm: "ephemeral",
          meaningVi: "phù du, ngắn ngủi",
          definitionEn: "lasting for a very short time",
          exampleEn: "Fame in the digital age can be ephemeral.",
          exampleVi: "Danh tiếng trong thời đại số có thể rất phù du.",
          status: FlashcardStatus.NEW,
          state: 0,
          reps: 0,
          lapses: 0,
          stability: 0,
          difficulty: 0,
          due: new Date(),
        },
      });
      testCardId = card.id;
    });

    afterEach(async () => {
      if (testDeckId) {
        await db.deck.delete({ where: { id: testDeckId } });
      }
    });

    it("persists learningSteps so Good → reload → Good follows ts-fsrs continuity", async () => {
      const now = new Date("2026-09-19T12:00:00Z");
      const first = await fsrsService.processScheduledReview(testCardId, {
        rating: Rating.Good,
        reviewEventId: "00000000-0000-4000-8000-000000000001",
        expectedSchedulerVersion: 0,
        now,
      });

      expect(first.card.reps).toBe(1);
      expect(first.card.stability).toBeGreaterThan(0);
      expect(first.card.learningSteps).toBeGreaterThan(0);
      expect(first.card.state).toBe(State.Learning);

      const reloaded = await db.flashcard.findUniqueOrThrow({ where: { id: testCardId } });
      expect(reloaded.learningSteps).toBe(first.card.learningSteps);
      const second = await fsrsService.processScheduledReview(testCardId, {
        rating: Rating.Good,
        reviewEventId: "00000000-0000-4000-8000-000000000002",
        expectedSchedulerVersion: reloaded.schedulerVersion,
        now: new Date(reloaded.due.getTime() + 1),
      });

      // ts-fsrs v5 graduates this Learning card only when its first step survives reload.
      expect(second.card.state).toBe(State.Review);
      expect(second.card.learningSteps).toBe(0);
      expect(second.card.schedulerVersion).toBe(2);
    });

    it("persists the full scheduler update and status projection", async () => {
      const now = new Date("2026-09-19T12:00:00Z");
      const result = await fsrsService.processScheduledReview(testCardId, {
        rating: Rating.Again,
        reviewEventId: "00000000-0000-4000-8000-000000000003",
        expectedSchedulerVersion: 0,
        now,
      });

      expect(result.card.reps).toBe(1);
      expect(result.log.rating).toBe(Rating.Again);
      expect(result.status).toBe(FlashcardStatus.LEARNING);
      expect(result.card.status).toBe(FlashcardStatus.LEARNING);
      expect(result.card.lastReviewAt).toEqual(now);
      expect(result.card.schedulerVersion).toBe(1);
      expect(result.log.reviewEventId).toBe("00000000-0000-4000-8000-000000000003");
    });

    it("applies the same review event once and returns an idempotent result on retry", async () => {
      const input = {
        rating: Rating.Again,
        reviewEventId: "00000000-0000-4000-8000-000000000004",
        expectedSchedulerVersion: 0,
        now: new Date("2026-09-19T12:00:00Z"),
      };
      const first = await fsrsService.processScheduledReview(testCardId, input);
      const retry = await fsrsService.processScheduledReview(testCardId, input);

      expect(first.idempotent).toBe(false);
      expect(retry.idempotent).toBe(true);
      expect((await db.flashcard.findUniqueOrThrow({ where: { id: testCardId } })).schedulerVersion).toBe(1);
      expect(await db.reviewLog.count({ where: { cardId: testCardId } })).toBe(1);
    });

    it("keeps concurrent retries of the same event idempotent", async () => {
      const input = {
        rating: Rating.Again,
        reviewEventId: "00000000-0000-4000-8000-000000000007",
        expectedSchedulerVersion: 0,
        now: new Date("2026-09-19T12:00:00Z"),
      };
      const results = await Promise.all([
        fsrsService.processScheduledReview(testCardId, input),
        fsrsService.processScheduledReview(testCardId, input),
      ]);

      expect(results.filter((result) => !result.idempotent)).toHaveLength(1);
      expect(results.filter((result) => result.idempotent)).toHaveLength(1);
      expect((await db.flashcard.findUniqueOrThrow({ where: { id: testCardId } })).schedulerVersion).toBe(1);
      expect(await db.reviewLog.count({ where: { cardId: testCardId } })).toBe(1);
    });

    it("rejects a different stale event instead of overwriting newer FSRS state", async () => {
      const now = new Date("2026-09-19T12:00:00Z");
      const [first, second] = await Promise.allSettled([
        fsrsService.processScheduledReview(testCardId, {
          rating: Rating.Again,
          reviewEventId: "00000000-0000-4000-8000-000000000005",
          expectedSchedulerVersion: 0,
          now,
        }),
        fsrsService.processScheduledReview(testCardId, {
          rating: Rating.Good,
          reviewEventId: "00000000-0000-4000-8000-000000000006",
          expectedSchedulerVersion: 0,
          now,
        }),
      ]);

      expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect([first, second].filter((result) => result.status === "rejected")).toHaveLength(1);
      expect((await db.flashcard.findUniqueOrThrow({ where: { id: testCardId } })).schedulerVersion).toBe(1);
      expect(await db.reviewLog.count({ where: { cardId: testCardId } })).toBe(1);
    });

    it("returns only due cards plus the configured limited number of New cards", async () => {
      const now = new Date("2026-09-19T12:00:00Z");
      const [dueCard, futureCard, newCard] = await Promise.all([
        db.flashcard.create({
          data: { deckId: testDeckId, term: "due", normalizedTerm: "due", meaningVi: "đến hạn", state: State.Learning, status: FlashcardStatus.LEARNING, due: new Date(now.getTime() - 1) },
        }),
        db.flashcard.create({
          data: { deckId: testDeckId, term: "future", normalizedTerm: "future", meaningVi: "tương lai", state: State.Learning, status: FlashcardStatus.LEARNING, due: new Date(now.getTime() + 60_000) },
        }),
        db.flashcard.create({
          data: { deckId: testDeckId, term: "new", normalizedTerm: "new", meaningVi: "mới", state: State.New, status: FlashcardStatus.NEW, due: now },
        }),
      ]);

      const queue = await fsrsService.getReviewQueue({ deckId: testDeckId, now, newLimit: 1 });
      expect(queue.dueCards.map((card) => card.id)).toContain(dueCard.id);
      expect(queue.queue.map((card) => card.id)).not.toContain(futureCard.id);
      expect(queue.newCards).toHaveLength(1);
      expect(queue.newCards[0]?.id).not.toBe(futureCard.id);
      expect(queue.queue.some((card) => card.id === newCard.id)).toBe(queue.newCards[0]?.id === newCard.id);
    });
  });
});
