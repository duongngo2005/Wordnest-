import { expect, test, type Page } from "@playwright/test";
import { FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { practiceEvidenceService } from "@/services/vocabulary";

let deckId: string;
let cardIds: string[];

const FSRS_SELECT = {
  id: true,
  due: true,
  stability: true,
  difficulty: true,
  elapsedDays: true,
  scheduledDays: true,
  learningSteps: true,
  reps: true,
  lapses: true,
  state: true,
  lastReviewAt: true,
  schedulerVersion: true,
  status: true,
} as const;

async function getEvidenceSnapshot(targetDeckId: string) {
  const evidence = await practiceEvidenceService.getDeckPracticeEvidence(targetDeckId);
  const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(targetDeckId);

  return {
    counts: evidence.counts,
    summaries: [...evidence.summaries.values()].map((summary) => ({
      flashcardId: summary.flashcardId,
      classification: summary.classification,
      firstPassAttempts: summary.firstPassAttempts,
      firstPassCorrect: summary.firstPassCorrect,
      firstPassIncorrect: summary.firstPassIncorrect,
      retryAttempts: summary.retryAttempts,
      retryCorrect: summary.retryCorrect,
      retryIncorrect: summary.retryIncorrect,
      latestFirstPassCorrect: summary.latestFirstPassCorrect,
    })),
    candidates: candidates.map((candidate) => ({
      cardId: candidate.card.id,
      targetQuestionType: candidate.targetQuestionType,
      selectionReason: candidate.selectionReason,
    })),
  };
}

async function startPractice(page: Page, mode: "EN → VI" | "VI → EN" | "Mix" = "EN → VI") {
  await page.goto(`/decks/${deckId}/practice`);
  await expect(page.getByRole("heading", { name: "Luyện thẻ" })).toBeVisible();

  if (mode !== "EN → VI") {
    await page.getByText(mode, { exact: true }).click();
  }

  await expect(page.getByRole("radio", { name: mode })).toBeChecked();
  await page.getByRole("button", { name: "Bắt đầu luyện" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();
}

async function revealAndRate(page: Page, remembered: boolean) {
  await page.getByRole("button", { name: "Hiện đáp án" }).click();
  await page.getByRole("button", { name: remembered ? /^Đã nhớ/ : /^Chưa nhớ/ }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function clearKeyboardFocus(page: Page) {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
}

test.beforeEach(async () => {
  const deck = await db.deck.create({ data: { name: `Flashcard Practice ${crypto.randomUUID().slice(0, 8)}` } });
  deckId = deck.id;

  await db.flashcard.createMany({
    data: [
      {
        deckId,
        term: "apple",
        normalizedTerm: "apple",
        meaningVi: "quả táo",
        ipa: "/ˈæp.əl/",
        partOfSpeech: "noun",
        definitionEn: "a round fruit with crisp flesh",
        exampleEn: "She ate a red apple.",
        exampleVi: "Cô ấy ăn một quả táo đỏ.",
        imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23f87171'/%3E%3C/svg%3E",
        imageAuthor: "WordNest",
        imageSource: "Minh họa",
        status: FlashcardStatus.NEW,
        state: 0,
        due: new Date(),
      },
      { deckId, term: "banana", normalizedTerm: "banana", meaningVi: "quả chuối", partOfSpeech: "noun", status: FlashcardStatus.NEW, state: 0, due: new Date() },
      { deckId, term: "cat", normalizedTerm: "cat", meaningVi: "con mèo", status: FlashcardStatus.NEW, state: 0, due: new Date() },
      { deckId, term: "dog", normalizedTerm: "dog", meaningVi: "con chó", status: FlashcardStatus.NEW, state: 0, due: new Date() },
      { deckId, term: "elephant", normalizedTerm: "elephant", meaningVi: "con voi", status: FlashcardStatus.NEW, state: 0, due: new Date() },
    ],
  });

  const cards = await db.flashcard.findMany({ where: { deckId }, orderBy: { createdAt: "asc" } });
  cardIds = cards.map((card) => card.id);

  // Seed genuine, server-scored evidence so this test can prove that Flashcard
  // Practice does not modify Weak Evidence or Focused Practice selection.
  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cards[0]!.id,
        sessionId: `seed-${crypto.randomUUID()}`,
        questionId: "seed-1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong",
        expectedAnswer: cards[0]!.term,
        responseMs: 300,
      },
      {
        flashcardId: cards[0]!.id,
        sessionId: `seed-${crypto.randomUUID()}`,
        questionId: "seed-2",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong again",
        expectedAnswer: cards[0]!.term,
        responseMs: 320,
      },
    ],
  });
});

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } }).catch(() => {});
});

test("mobile EN → VI reveals safely, ignores 1/2 before reveal, and keeps first-pass result through one retry", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await startPractice(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("link", { name: "Quay lại bộ từ" })).toHaveCount(0);

  const firstCard = page.getByTestId("practice-card");
  const firstCardId = await firstCard.getAttribute("data-card-id");
  await expect(firstCard).toHaveAttribute("data-direction", "en_vi");
  await expect(firstCard.getByRole("button", { name: /Phát âm/ })).toBeVisible();
  await expect(firstCard.getByText("quả táo", { exact: true })).toHaveCount(0);
  await expect(firstCard.locator("img")).toHaveCount(0);

  await clearKeyboardFocus(page);
  await page.keyboard.press("Digit1");
  await page.keyboard.press("Digit2");
  await expect(firstCard).toHaveAttribute("data-card-id", firstCardId ?? "");

  await page.keyboard.press("Space");
  await expect(firstCard.getByText("quả táo", { exact: true })).toBeVisible();
  await expect(firstCard.getByRole("img", { name: "Minh họa cho apple" })).toBeVisible();
  const forgottenButtonBox = await firstCard.getByRole("button", { name: /^Chưa nhớ/ }).boundingBox();
  const rememberedButtonBox = await firstCard.getByRole("button", { name: /^Đã nhớ/ }).boundingBox();
  expect(forgottenButtonBox?.height).toBeGreaterThanOrEqual(44);
  expect(rememberedButtonBox?.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);

  await firstCard.getByRole("button", { name: /^Đã nhớ/ }).focus();
  await page.keyboard.press("Digit1");
  await expect(firstCard).toHaveAttribute("data-card-id", firstCardId ?? "");

  await clearKeyboardFocus(page);
  await page.keyboard.press("Digit1");
  await expect(firstCard).not.toHaveAttribute("data-card-id", firstCardId ?? "");

  await revealAndRate(page, true);
  await revealAndRate(page, true);
  await revealAndRate(page, false);
  await revealAndRate(page, true);

  await expect(page.getByText("Lượt đầu", { exact: true })).toBeVisible();
  await expect(page.getByText("3 / 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Luyện lại 2 thẻ chưa nhớ" }).click();

  const retriedIds = new Set<string>();
  for (let index = 0; index < 2; index += 1) {
    const retryCard = page.getByTestId("practice-card");
    const retryCardId = await retryCard.getAttribute("data-card-id");
    expect(retryCardId).toBeTruthy();
    retriedIds.add(retryCardId!);
    await expect(retryCard).toHaveAttribute("data-direction", "en_vi");
    await revealAndRate(page, true);
  }

  expect(retriedIds.size).toBe(2);
  await expect(page.getByText("Lượt đầu", { exact: true })).toBeVisible();
  await expect(page.getByText("3 / 5", { exact: true })).toBeVisible();
  await expect(page.getByText("Luyện lại", { exact: true })).toBeVisible();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("desktop VI → EN never exposes English audio or image before reveal, then supports keyboard rating", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startPractice(page, "VI → EN");

  const practiceCard = page.getByTestId("practice-card");
  await expect(practiceCard).toHaveAttribute("data-direction", "vi_en");
  await expect(practiceCard.getByText("quả táo", { exact: true })).toBeVisible();
  await expect(practiceCard.getByText("apple", { exact: true })).toHaveCount(0);
  await expect(practiceCard.getByRole("button", { name: /Phát âm/ })).toHaveCount(0);
  await expect(practiceCard.locator("img")).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect(practiceCard.getByRole("heading", { name: "apple" })).toBeVisible();
  await expect(practiceCard.getByRole("button", { name: /Phát âm "apple"/ })).toBeVisible();
  await expect(practiceCard.getByRole("img", { name: "Minh họa cho apple" })).toBeVisible();

  await page.keyboard.press("Digit2");
  await expect(page.getByTestId("practice-card")).toHaveAttribute("data-card-id", cardIds[1]!);
});

test("Mix freezes a balanced direction per card and writes no scheduler, review, quiz, or practice evidence", async ({ page }) => {
  test.setTimeout(60_000);
  const schedulerBefore = await db.flashcard.findMany({
    where: { id: { in: cardIds } },
    orderBy: { id: "asc" },
    select: FSRS_SELECT,
  });
  const practiceAttemptsBefore = await db.practiceAttempt.count({ where: { flashcardId: { in: cardIds } } });
  const reviewLogsBefore = await db.reviewLog.count({ where: { cardId: { in: cardIds } } });
  const quizAttemptsBefore = await db.quizAttempt.count({ where: { deckId } });
  const quizSessionsBefore = await db.quizSession.count({ where: { deckId } });
  const evidenceBefore = await getEvidenceSnapshot(deckId);

  let reviewRequestCount = 0;
  await page.route("**/api/cards/**/review", async (route) => {
    reviewRequestCount += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 430, height: 932 });
  await startPractice(page, "Mix");
  await expectNoHorizontalOverflow(page);

  const directionByCardId = new Map<string, string>();
  for (let index = 0; index < 5; index += 1) {
    const practiceCard = page.getByTestId("practice-card");
    const cardId = await practiceCard.getAttribute("data-card-id");
    const direction = await practiceCard.getAttribute("data-direction");
    expect(cardId).toBeTruthy();
    expect(direction === "en_vi" || direction === "vi_en").toBe(true);
    directionByCardId.set(cardId!, direction!);

    if (direction === "en_vi") {
      await expect(practiceCard.getByRole("button", { name: /Phát âm/ })).toBeVisible();
    } else {
      await expect(practiceCard.getByRole("button", { name: /Phát âm/ })).toHaveCount(0);
    }
    await expect(practiceCard.locator("img")).toHaveCount(0);
    await revealAndRate(page, false);
  }

  const directions = [...directionByCardId.values()];
  const enViCount = directions.filter((direction) => direction === "en_vi").length;
  const viEnCount = directions.filter((direction) => direction === "vi_en").length;
  expect(directionByCardId.size).toBe(5);
  expect(enViCount).toBeGreaterThan(0);
  expect(viEnCount).toBeGreaterThan(0);
  expect(Math.abs(enViCount - viEnCount)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Luyện lại 5 thẻ chưa nhớ" }).click();
  const retryCardIds = new Set<string>();
  for (let index = 0; index < 5; index += 1) {
    const retryCard = page.getByTestId("practice-card");
    const cardId = await retryCard.getAttribute("data-card-id");
    expect(cardId).toBeTruthy();
    retryCardIds.add(cardId!);
    await expect(retryCard).toHaveAttribute("data-direction", directionByCardId.get(cardId!)!);
    await revealAndRate(page, true);
  }

  expect(retryCardIds).toEqual(new Set(directionByCardId.keys()));
  await expect(page.getByText("Lượt đầu", { exact: true })).toBeVisible();
  await expect(page.getByText("0 / 5", { exact: true })).toBeVisible();
  await expect(page.getByText("Luyện lại", { exact: true })).toBeVisible();
  await expect(page.getByText("5 / 5", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(reviewRequestCount).toBe(0);
  const schedulerAfter = await db.flashcard.findMany({
    where: { id: { in: cardIds } },
    orderBy: { id: "asc" },
    select: FSRS_SELECT,
  });
  expect(schedulerAfter).toEqual(schedulerBefore);
  expect(await db.reviewLog.count({ where: { cardId: { in: cardIds } } })).toBe(reviewLogsBefore);
  expect(await db.practiceAttempt.count({ where: { flashcardId: { in: cardIds } } })).toBe(practiceAttemptsBefore);
  expect(await db.quizAttempt.count({ where: { deckId } })).toBe(quizAttemptsBefore);
  expect(await db.quizSession.count({ where: { deckId } })).toBe(quizSessionsBefore);
  expect(await getEvidenceSnapshot(deckId)).toEqual(evidenceBefore);
});
