import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";

const FSRS_SELECT = {
  id: true,
  due: true,
  state: true,
  status: true,
  stability: true,
  difficulty: true,
  elapsedDays: true,
  scheduledDays: true,
  learningSteps: true,
  reps: true,
  lapses: true,
  lastReviewAt: true,
  schedulerVersion: true,
} as const;

let deckId: string;
let cardAId: string;
let cardBId: string;
let cardCId: string;
let cardDId: string;
let cardEId: string;
let cardFId: string;
let allCardIds: string[];

test.beforeEach(async () => {
  // Create an isolated test deck
  const deck = await db.deck.create({
    data: { name: `Weak Evidence E2E ${crypto.randomUUID()}` },
  });
  deckId = deck.id;

  // Create isolated test cards
  // Card A: "allocate" -> typed wrong on 1st pass, corrected on retry
  const cardA = await db.flashcard.create({
    data: { deckId, term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" },
  });
  cardAId = cardA.id;

  // Card B: "resilient" -> typed wrong on 1st pass, STILL wrong on retry
  const cardB = await db.flashcard.create({
    data: { deckId, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
  });
  cardBId = cardB.id;

  // Card C: "ephemeral" -> 2 successful attempts (1 typed, 1 MC)
  const cardC = await db.flashcard.create({
    data: { deckId, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
  });
  cardCId = cardC.id;

  // Card D: "meticulous" -> 5 MC correct, 2 typed wrong (recognition vs recall distinction)
  const cardD = await db.flashcard.create({
    data: { deckId, term: "meticulous", normalizedTerm: "meticulous", meaningVi: "tỉ mỉ" },
  });
  cardDId = cardD.id;

  // Card E: "pristine" -> 0 practice attempts (NO_EVIDENCE)
  const cardE = await db.flashcard.create({
    data: { deckId, term: "pristine", normalizedTerm: "pristine", meaningVi: "nguyên sơ" },
  });
  cardEId = cardE.id;

  // Card F: "serendipity" -> exactly 1 attempt (INSUFFICIENT_DATA)
  const cardF = await db.flashcard.create({
    data: { deckId, term: "serendipity", normalizedTerm: "serendipity", meaningVi: "sự tình cờ may mắn" },
  });
  cardFId = cardF.id;

  allCardIds = [cardAId, cardBId, cardCId, cardDId, cardEId, cardFId];

  // Insert PracticeAttempt records
  const now = Date.now();
  const sessionId = `session-${crypto.randomUUID()}`;

  // Card A: 2 first pass attempts (incorrect), attempt 2 correct on retry (correctedOnRetry)
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardAId,
        sessionId: "session-prev",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "alocat",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 4500,
        createdAt: new Date(now - 14000),
      },
      {
        flashcardId: cardAId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "alocate",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 4000,
        createdAt: new Date(now - 10000),
      },
      {
        flashcardId: cardAId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 2,
        answer: "allocate",
        expectedAnswer: "allocate",
        correct: true,
        responseMs: 2500,
        createdAt: new Date(now - 8000),
      },
    ],
  });

  // Card B: 2 first pass attempts (incorrect), attempt 2 incorrect on retry (stillIncorrectOnRetry)
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardBId,
        sessionId: "session-prev",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "resil",
        expectedAnswer: "resilient",
        correct: false,
        responseMs: 5000,
        createdAt: new Date(now - 15000),
      },
      {
        flashcardId: cardBId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "resiliant",
        expectedAnswer: "resilient",
        correct: false,
        responseMs: 6000,
        createdAt: new Date(now - 12000),
      },
      {
        flashcardId: cardBId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 2,
        answer: "resiliance",
        expectedAnswer: "resilient",
        correct: false,
        responseMs: 5000,
        createdAt: new Date(now - 9000),
      },
    ],
  });

  // Card C: 2 correct attempts
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardCId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "ephemeral",
        expectedAnswer: "ephemeral",
        correct: true,
        responseMs: 1500,
        createdAt: new Date(now - 15000),
      },
      {
        flashcardId: cardCId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "phù du",
        expectedAnswer: "phù du",
        correct: true,
        responseMs: 1200,
        createdAt: new Date(now - 13000),
      },
    ],
  });

  // Card D: 5 MC correct, 2 Typed incorrect
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "tỉ mỉ",
        expectedAnswer: "tỉ mỉ",
        correct: true,
        responseMs: 1000,
        createdAt: new Date(now - 20000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "tỉ mỉ",
        expectedAnswer: "tỉ mỉ",
        correct: true,
        responseMs: 1100,
        createdAt: new Date(now - 18000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "tỉ mỉ",
        expectedAnswer: "tỉ mỉ",
        correct: true,
        responseMs: 950,
        createdAt: new Date(now - 16000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "tỉ mỉ",
        expectedAnswer: "tỉ mỉ",
        correct: true,
        responseMs: 1200,
        createdAt: new Date(now - 14000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "multiple_choice",
        mode: "quiz",
        attemptNumber: 1,
        answer: "tỉ mỉ",
        expectedAnswer: "tỉ mỉ",
        correct: true,
        responseMs: 1050,
        createdAt: new Date(now - 12000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "meticulus",
        expectedAnswer: "meticulous",
        correct: false,
        responseMs: 5500,
        createdAt: new Date(now - 6000),
      },
      {
        flashcardId: cardDId,
        sessionId,
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "meticilous",
        expectedAnswer: "meticulous",
        correct: false,
        responseMs: 4800,
        createdAt: new Date(now - 4000),
      },
    ],
  });

  // Card E has 0 attempts

  // Card F has 1 attempt (incorrect)
  await db.practiceAttempt.create({
    data: {
      flashcardId: cardFId,
      sessionId,
      questionType: "typed_vi_en",
      mode: "quiz",
      attemptNumber: 1,
      answer: "serendipityy",
      expectedAnswer: "serendipity",
      correct: false,
      responseMs: 7000,
      createdAt: new Date(now - 5000),
    },
  });
});

test.afterEach(async () => {
  if (deckId) {
    await db.practiceAttempt.deleteMany({ where: { flashcardId: { in: allCardIds } } });
    await db.flashcard.deleteMany({ where: { deckId } });
    await db.deck.delete({ where: { id: deckId } });
  }
});

test.describe("Phase 3A: Weak Vocabulary Evidence & 'Cần luyện thêm'", () => {
  test("Transparent weak-signal aggregation, deterministic ordering, and strict FSRS zero-write isolation", async ({
    page,
  }) => {
    // 1. Snapshot all 12 FSRS fields before viewing the deck
    const schedulerBefore = await db.flashcard.findMany({
      where: { id: { in: allCardIds } },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });

    // 2. Navigate to Deck View
    await page.goto(`/decks/${deckId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 3. Verify Dedicated "Cần luyện thêm" Banner Section exists
    const needPracticeSection = page.locator('[data-testid="need-practice-section"]');
    await expect(needPracticeSection).toBeVisible();
    await expect(needPracticeSection.getByText(/Cần luyện thêm/)).toBeVisible();

    // 4. The compact banner preserves the deterministic candidate count and a
    // contextual launch point without dumping all evidence into the deck header.
    await expect(needPracticeSection.getByTestId("btn-start-focused-practice")).toContainText("3 từ");

    // 5. Verify Recognition vs Recall Distinction on Card D ("meticulous")
    // Should show "Trắc nghiệm: 5/5" and "Gõ từ: 0/2", NOT a blended single score
    const cardDArticle = page.locator(`article[aria-label="Thẻ từ vựng: meticulous"]`);
    await expect(cardDArticle).toBeVisible();
    await cardDArticle.getByText("Xem ví dụ và chi tiết").click();
    await expect(cardDArticle.getByText(/Trắc nghiệm:\s*5\/5/)).toBeVisible();
    await expect(cardDArticle.getByText(/Gõ từ:\s*0\/2/)).toBeVisible();

    // 6. Verify Card E ("pristine") has NO practice badge
    const cardEBadge = page.locator(`[data-testid="practice-badge-${cardEId}"]`);
    await expect(cardEBadge).toHaveCount(0);

    // 7. Verify Card F ("serendipity") has INSUFFICIENT_DATA badge ("Cần thêm dữ liệu")
    const cardFBadge = page.locator(`[data-testid="practice-badge-${cardFId}"]`);
    await expect(cardFBadge).toBeVisible();
    await expect(cardFBadge).toHaveText("Cần thêm dữ liệu");

    // 8. Verify Card C ("ephemeral") has "Thực hành tốt" badge
    const cardCBadge = page.locator(`[data-testid="practice-badge-${cardCId}"]`);
    await expect(cardCBadge).toBeVisible();
    await expect(cardCBadge).toHaveText("Thực hành tốt");

    // 9. Verify "Cần luyện thêm" Filter Pill
    const filterBtn = page.locator('[data-testid="filter-need-practice"]');
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // After filtering: Card E (pristine - no evidence), Card C (ephemeral - good), and Card F (serendipity - insufficient data) must NOT be shown
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: pristine"]`)).toHaveCount(0);
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: ephemeral"]`)).toHaveCount(0);
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: serendipity"]`)).toHaveCount(0);

    // Cards B, A, D should be present in the filtered view
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: resilient"]`)).toBeVisible();
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: allocate"]`)).toBeVisible();
    await expect(page.locator(`article[aria-label="Thẻ từ vựng: meticulous"]`)).toBeVisible();

    // 10. Verify ReviewLog count is 0 (no memory reviews written)
    const reviewLogCount = await db.reviewLog.count({
      where: { cardId: { in: allCardIds } },
    });
    expect(reviewLogCount).toBe(0);

    // 11. Strict FSRS Invariant: Snapshot all 12 FSRS fields after test and compare
    const schedulerAfter = await db.flashcard.findMany({
      where: { id: { in: allCardIds } },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    expect(schedulerAfter).toEqual(schedulerBefore);
  });
});
