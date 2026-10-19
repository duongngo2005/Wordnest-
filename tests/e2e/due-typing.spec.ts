import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;
let dueCardIds: string[] = [];
let deferredDueCards: Array<{ id: string; due: Date }> = [];

test.beforeEach(async () => {
  const now = new Date();
  const later = new Date(now.getTime() + 86_400_000);
  deferredDueCards = await db.flashcard.findMany({
    where: { state: { gt: 0 }, due: { lte: now } },
    select: { id: true, due: true },
  });
  if (deferredDueCards.length > 0) {
    await db.flashcard.updateMany({
      where: { id: { in: deferredDueCards.map((card) => card.id) } },
      data: { due: later },
    });
  }

  const deck = await db.deck.create({ data: { name: `Due typing ${crypto.randomUUID()}` } });
  deckId = deck.id;
  const [firstDue, secondDue] = await Promise.all([
    db.flashcard.create({
      data: {
        deckId,
        term: "abundance",
        normalizedTerm: `abundance-${crypto.randomUUID()}`,
        meaningVi: "sự dồi dào",
        partOfSpeech: "noun",
        state: 2,
        due: new Date(now.getTime() - 2_000),
        stability: 5,
        difficulty: 4,
        reps: 3,
      },
    }),
    db.flashcard.create({
      data: {
        deckId,
        term: "resilient",
        normalizedTerm: `resilient-${crypto.randomUUID()}`,
        meaningVi: "kiên cường",
        partOfSpeech: "adjective",
        state: 2,
        due: new Date(now.getTime() - 1_000),
        stability: 8,
        difficulty: 3.5,
        reps: 6,
      },
    }),
  ]);
  dueCardIds = [firstDue.id, secondDue.id];
  await Promise.all([
    db.flashcard.create({
      data: {
        deckId,
        term: "future",
        normalizedTerm: `future-${crypto.randomUUID()}`,
        meaningVi: "tương lai",
        partOfSpeech: "noun",
        state: 2,
        due: later,
      },
    }),
    db.flashcard.create({
      data: {
        deckId,
        term: "newcomer",
        normalizedTerm: `newcomer-${crypto.randomUUID()}`,
        meaningVi: "người mới",
        partOfSpeech: "noun",
        state: 0,
        due: now,
      },
    }),
  ]);
});

test.afterEach(async () => {
  if (deckId) {
    await db.deckVocabularyMembership.deleteMany({ where: { deckId } });
    await db.flashcard.deleteMany({ where: { deckId } });
    await db.deck.delete({ where: { id: deckId } });
  }
  for (const card of deferredDueCards) {
    await db.flashcard.updateMany({ where: { id: card.id }, data: { due: card.due } });
  }
  deckId = null;
  dueCardIds = [];
  deferredDueCards = [];
});

test("due typing stays on the due snapshot and never submits an FSRS review", async ({ page }) => {
  const before = await db.flashcard.findMany({
    where: { id: { in: dueCardIds } },
    select: {
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
    },
    orderBy: { id: "asc" },
  });
  const reviewLogCountBefore = await db.reviewLog.count();
  let scheduledReviewRequests = 0;
  await page.route("**/api/cards/*/review", async (route) => {
    scheduledReviewRequests += 1;
    await route.abort();
  });

  await page.goto("/");
  const dueAction = page.getByTestId("today-due-typing-action");
  await expect(dueAction).toHaveText("Luyện gõ 2 từ đến hạn");
  await dueAction.click();
  await expect(page).toHaveURL(/\/practice\/typing\?source=due/);

  const sessionResponse = page.waitForResponse((response) =>
    response.url().includes("/api/practice/due-typing") && response.request().method() === "GET"
  );
  await page.getByRole("button", { name: "Bắt đầu luyện gõ từ đến hạn" }).click();
  const response = await sessionResponse;
  const body = await response.json();
  expect(new Set(body.data.questions.map((question: { cardId: string }) => question.cardId))).toEqual(new Set(dueCardIds));
  expect(
    body.data.questions.every(
      (question: { correctAnswer?: string; spellingHints?: unknown; letterHint?: string }) =>
        question.correctAnswer === undefined &&
        question.spellingHints === undefined &&
        typeof question.letterHint === "string" &&
        question.letterHint.includes("_")
    )
  ).toBe(true);

  const stored = await db.quizSession.findUniqueOrThrow({ where: { id: body.data.sessionId } });
  const questions = stored.questions as Array<{ id: string; correctAnswer: string }>;
  const input = page.getByPlaceholder("Nhập đáp án tiếng Anh...");
  await input.fill("still here");
  await page.getByRole("button", { name: "Bật gợi ý chữ cái" }).click();
  const firstHint = page.getByTestId("random-letter-hint");
  const stableHint = await firstHint.textContent();
  expect(stableHint).toContain("_");
  await expect(input).toHaveValue("still here");
  await page.getByRole("button", { name: "Tắt gợi ý chữ cái" }).click();
  await expect(firstHint).toHaveCount(0);
  await expect(input).toHaveValue("still here");
  await page.getByRole("button", { name: "Bật gợi ý chữ cái" }).click();
  await expect(firstHint).toHaveText(stableHint ?? "");
  await expect(input).toHaveValue("still here");

  for (const [index, question] of questions.entries()) {
    await input.fill(question.correctAnswer);
    await input.press("Enter");
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();
    await page.getByRole("button", { name: index + 1 === questions.length ? "Xem kết quả bài Quiz" : "Câu tiếp theo" }).click();
    if (index + 1 < questions.length) {
      await expect(firstHint).toBeVisible();
      await expect(page.getByRole("button", { name: "Tắt gợi ý chữ cái" })).toBeVisible();
    }
  }

  await expect(page.getByRole("heading", { name: "Hoàn thành phiên luyện gõ" })).toBeVisible();
  const after = await db.flashcard.findMany({
    where: { id: { in: dueCardIds } },
    select: {
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
    },
    orderBy: { id: "asc" },
  });

  expect(scheduledReviewRequests).toBe(0);
  expect(after).toEqual(before);
  await expect(db.reviewLog.count()).resolves.toBe(reviewLogCountBefore);
});
