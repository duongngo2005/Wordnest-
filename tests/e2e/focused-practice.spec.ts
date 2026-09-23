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
let storyId: string;
let cardAId: string;
let cardBId: string;
let cardCId: string;
let cardDId: string;
let cardEId: string;
let allCardIds: string[];

test.beforeEach(async () => {
  // Create isolated deck
  const deck = await db.deck.create({
    data: { name: `Focused Practice E2E ${crypto.randomUUID()}` },
  });
  deckId = deck.id;

  // Card A: "allocate" -> active recall (typed_vi_en) failure
  const cardA = await db.flashcard.create({
    data: {
      deckId,
      term: "allocate",
      normalizedTerm: "allocate",
      meaningVi: "phân bổ",
      definitionEn: "to distribute resources",
    },
  });
  cardAId = cardA.id;

  // Card B: "resilient" -> story contextual cloze failure
  const cardB = await db.flashcard.create({
    data: {
      deckId,
      term: "resilient",
      normalizedTerm: "resilient",
      meaningVi: "kiên cường",
      definitionEn: "able to recover quickly",
    },
  });
  cardBId = cardB.id;

  // Create story containing Card B for story cloze context
  const story = await db.story.create({
    data: {
      deckId,
      title: "Resilience in Action",
      content: "The team remained resilient during the sudden crisis.",
      cefr: "B2",
      length: "Short",
      topic: "Workplace",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["resilient"],
        usage: [{ term: "resilient", usedAs: "resilient" }],
      },
    },
  });
  storyId = story.id;

  // Card C: "ephemeral" -> 3 successful attempts -> RECENTLY_SUCCESSFUL
  const cardC = await db.flashcard.create({
    data: {
      deckId,
      term: "ephemeral",
      normalizedTerm: "ephemeral",
      meaningVi: "phù du",
    },
  });
  cardCId = cardC.id;

  // Card D: "pristine" -> 0 attempts -> NO_EVIDENCE
  const cardD = await db.flashcard.create({
    data: {
      deckId,
      term: "pristine",
      normalizedTerm: "pristine",
      meaningVi: "nguyên sơ",
    },
  });
  cardDId = cardD.id;

  // Card E: "serendipity" -> 1 attempt -> INSUFFICIENT_DATA
  const cardE = await db.flashcard.create({
    data: {
      deckId,
      term: "serendipity",
      normalizedTerm: "serendipity",
      meaningVi: "sự tình cờ may mắn",
    },
  });
  cardEId = cardE.id;

  allCardIds = [cardAId, cardBId, cardCId, cardDId, cardEId];

  const now = Date.now();

  // Seed Card A: 2 failed typed attempts
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardAId,
        sessionId: "ses-seed-a1",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "alocat",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 3000,
        createdAt: new Date(now - 10000),
      },
      {
        flashcardId: cardAId,
        sessionId: "ses-seed-a2",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "allocat",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 2800,
        createdAt: new Date(now - 5000),
      },
    ],
  });

  // Seed Card B: 2 failed story cloze attempts
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardBId,
        sessionId: "ses-seed-b1",
        questionType: "story_cloze",
        mode: "quiz",
        attemptNumber: 1,
        answer: "resil",
        expectedAnswer: "resilient",
        correct: false,
        responseMs: 4000,
        createdAt: new Date(now - 12000),
      },
      {
        flashcardId: cardBId,
        sessionId: "ses-seed-b2",
        questionType: "story_cloze",
        mode: "quiz",
        attemptNumber: 1,
        answer: "resiliant",
        expectedAnswer: "resilient",
        correct: false,
        responseMs: 3500,
        createdAt: new Date(now - 6000),
      },
    ],
  });

  // Seed Card C: 3 successful attempts
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardCId,
        sessionId: "ses-seed-c1",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "ephemeral",
        expectedAnswer: "ephemeral",
        correct: true,
        responseMs: 2000,
        createdAt: new Date(now - 15000),
      },
      {
        flashcardId: cardCId,
        sessionId: "ses-seed-c2",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "ephemeral",
        expectedAnswer: "ephemeral",
        correct: true,
        responseMs: 1800,
        createdAt: new Date(now - 10000),
      },
      {
        flashcardId: cardCId,
        sessionId: "ses-seed-c3",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "ephemeral",
        expectedAnswer: "ephemeral",
        correct: true,
        responseMs: 1500,
        createdAt: new Date(now - 5000),
      },
    ],
  });

  // Seed Card E: 1 attempt (incorrect) -> INSUFFICIENT_DATA
  await db.practiceAttempt.create({
    data: {
      flashcardId: cardEId,
      sessionId: "ses-seed-e1",
      questionType: "typed_vi_en",
      mode: "quiz",
      attemptNumber: 1,
      answer: "seren",
      expectedAnswer: "serendipity",
      correct: false,
      responseMs: 4000,
      createdAt: new Date(now - 4000),
    },
  });
});

test.afterEach(async () => {
  if (deckId) {
    await db.practiceAttempt.deleteMany({ where: { flashcardId: { in: allCardIds } } });
    if (storyId) {
      await db.story.deleteMany({ where: { id: storyId } });
    }
    await db.flashcard.deleteMany({ where: { deckId } });
    await db.deck.delete({ where: { id: deckId } });
  }
});

test.describe("Phase 3B: Focused Adaptive Practice v1", () => {
  test("Launches focused practice, targets weak modalities, writes mode=focused_practice, and preserves FSRS integrity", async ({
    page,
  }) => {
    // 1. Snapshot all 12 FSRS fields across all cards BEFORE
    const schedulerBefore = await db.flashcard.findMany({
      where: { id: { in: allCardIds } },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    const reviewLogCountBefore = await db.reviewLog.count({
      where: { cardId: { in: allCardIds } },
    });
    expect(reviewLogCountBefore).toBe(0);

    // 2. Navigate to Deck View and verify "Luyện tập trung" CTA
    await page.goto(`/decks/${deckId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const needPracticeSection = page.locator('[data-testid="need-practice-section"]');
    await expect(needPracticeSection).toBeVisible();

    // Verify CTA button with count of eligible cards (2: Card A and Card B)
    const focusedPracticeBtn = page.locator('[data-testid="btn-start-focused-practice"]');
    await expect(focusedPracticeBtn).toBeVisible();
    await expect(focusedPracticeBtn).toContainText("Luyện tập trung (2 từ)");

    // 3. Click to start Focused Practice
    await focusedPracticeBtn.click();
    await page.waitForURL(`**/decks/${deckId}/quiz?mode=focused_practice`);

    // Verify Quiz header shows active Focused Practice mode
    await expect(page.locator('[data-testid="selection-reason-tag"]')).toBeVisible();

    // Process Question 1
    const reasonTag1 = await page.locator('[data-testid="selection-reason-tag"]').innerText();
    expect(reasonTag1).toContain("Mục tiêu:");

    const input = page.locator("#typed-recall-input");
    await expect(input).toBeVisible();

    // Determine target word from question prompt
    const prompt1 = await page.locator("h1").innerText();
    const answer1 = prompt1.includes("kiên cường") ? "resilient" : "allocate";

    await input.fill(answer1);
    await page.locator('button[type="submit"]:has-text("Kiểm tra")').click();

    // Verify success banner and proceed
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();
    const nextBtn1 = page.locator('button:has-text("Câu tiếp theo")');
    await expect(nextBtn1).toBeVisible();
    await nextBtn1.click();

    // Process Question 2
    await expect(page.locator('[data-testid="selection-reason-tag"]')).toBeVisible();
    const input2 = page.locator("#typed-recall-input");
    await expect(input2).toBeVisible();

    const prompt2 = await page.locator("h1").innerText();
    const answer2 = prompt2.includes("kiên cường") ? "resilient" : "allocate";

    await input2.fill(answer2);
    await page.locator('button[type="submit"]:has-text("Kiểm tra")').click();

    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();

    // Finish quiz
    const finishBtn = page.locator('button:has-text("Xem kết quả bài Quiz")');
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // 4. Verify Quiz Result screen
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();

    // 5. Verify database records: PracticeAttempt has mode="focused_practice"
    const focusedAttempts = await db.practiceAttempt.findMany({
      where: {
        flashcardId: { in: [cardAId, cardBId] },
        mode: "focused_practice",
      },
    });
    expect(focusedAttempts.length).toBeGreaterThanOrEqual(2);
    expect(focusedAttempts.every((a) => a.mode === "focused_practice")).toBe(true);

    // 6. Strict FSRS Zero-Write Invariant
    const schedulerAfter = await db.flashcard.findMany({
      where: { id: { in: allCardIds } },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    expect(schedulerAfter).toEqual(schedulerBefore);

    const reviewLogCountAfter = await db.reviewLog.count({
      where: { cardId: { in: allCardIds } },
    });
    expect(reviewLogCountAfter).toBe(0);
  });

  test("Verifies natural graduation out of focused practice candidates", async ({ page }) => {
    // Add 4 consecutive correct attempts for Card A ("allocate")
    const now = Date.now();
    await db.practiceAttempt.createMany({
      data: [
        {
          flashcardId: cardAId,
          sessionId: "ses-grad-1",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "allocate",
          expectedAnswer: "allocate",
          correct: true,
          responseMs: 1200,
          createdAt: new Date(now + 1000),
        },
        {
          flashcardId: cardAId,
          sessionId: "ses-grad-2",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "allocate",
          expectedAnswer: "allocate",
          correct: true,
          responseMs: 1100,
          createdAt: new Date(now + 2000),
        },
        {
          flashcardId: cardAId,
          sessionId: "ses-grad-3",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "allocate",
          expectedAnswer: "allocate",
          correct: true,
          responseMs: 1300,
          createdAt: new Date(now + 3000),
        },
        {
          flashcardId: cardAId,
          sessionId: "ses-grad-4",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "allocate",
          expectedAnswer: "allocate",
          correct: true,
          responseMs: 1000,
          createdAt: new Date(now + 4000),
        },
      ],
    });

    // Revisit Deck View: Card A should have graduated, only Card B left in "Cần luyện thêm"
    await page.goto(`/decks/${deckId}`);
    const focusedPracticeBtn = page.locator('[data-testid="btn-start-focused-practice"]');
    await expect(focusedPracticeBtn).toBeVisible();
    await expect(focusedPracticeBtn).toContainText("Luyện tập trung (1 từ)");

    // Card A should have badge "Thực hành tốt"
    const cardABadge = page.locator(`[data-testid="practice-badge-${cardAId}"]`);
    await expect(cardABadge).toHaveText("Thực hành tốt");
  });

  test("Renders graceful empty state when 0 cards need practice", async ({ page }) => {
    // Create empty deck with 0 attempts
    const emptyDeck = await db.deck.create({
      data: { name: `Empty Deck ${crypto.randomUUID()}` },
    });
    try {
      await db.flashcard.create({
        data: {
          deckId: emptyDeck.id,
          term: "harmony",
          normalizedTerm: "harmony",
          meaningVi: "hài hòa",
        },
      });

      await page.goto(`/decks/${emptyDeck.id}/quiz?mode=focused_practice`);
      const emptyState = page.locator('[data-testid="empty-focused-practice"]');
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText("Chưa có từ nào cần luyện tập trung");
      await expect(emptyState.locator(`a[href$="/quiz"]`)).toBeVisible();
    } finally {
      await db.flashcard.deleteMany({ where: { deckId: emptyDeck.id } });
      await db.deck.delete({ where: { id: emptyDeck.id } });
    }
  });
});
