import { FlashcardStatus } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { db } from "@/lib/db";

let folderId: string | null = null;
let deckId: string | null = null;

async function createReviewLog(cardId: string, rating: 1 | 2 | 3 | 4, review: Date) {
  await db.reviewLog.create({
    data: {
      cardId,
      rating,
      state: 1,
      due: review,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      lastElapsedDays: 0,
      scheduledDays: 0,
      review,
    },
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.afterEach(async () => {
  if (deckId) await db.deck.deleteMany({ where: { id: deckId } });
  if (folderId) await db.folder.deleteMany({ where: { id: folderId } });
  deckId = null;
  folderId = null;
});

test("routes global, collection, and deck progress CTAs to the matching learning queue", async ({ page }, testInfo) => {
  const now = new Date();
  const folder = await db.folder.create({
    data: { name: `Progress routes ${testInfo.testId}`, normalizedName: `progress-routes-${testInfo.testId}`.toLowerCase() },
  });
  folderId = folder.id;
  const deck = await db.deck.create({ data: { name: `Queue deck ${testInfo.testId}`, folderId: folder.id } });
  deckId = deck.id;
  const [overdue] = await Promise.all([
    db.flashcard.create({ data: { deckId: deck.id, term: "overdue", normalizedTerm: "overdue", meaningVi: "quá hạn", status: FlashcardStatus.LEARNING, state: 1, due: new Date(now.getTime() - 86_400_000) } }),
    db.flashcard.create({ data: { deckId: deck.id, term: "today", normalizedTerm: "today", meaningVi: "hôm nay", status: FlashcardStatus.LEARNING, state: 1, due: new Date(now.getTime() + 3_600_000) } }),
    db.flashcard.create({ data: { deckId: deck.id, term: "future", normalizedTerm: "future", meaningVi: "tương lai", status: FlashcardStatus.KNOWN, state: 2, due: new Date(now.getTime() + 86_400_000) } }),
  ]);
  await createReviewLog(overdue.id, 1, new Date(now.getTime() - 2_000));
  await createReviewLog(overdue.id, 2, new Date(now.getTime() - 1_000));
  await db.practiceAttempt.createMany({
    data: [
      { flashcardId: overdue.id, sessionId: "progress-semantic-1", questionType: "typed_vi_en", mode: "quiz", attemptNumber: 1, answer: "overdu", expectedAnswer: "overdue", correct: false },
      { flashcardId: overdue.id, sessionId: "progress-semantic-2", questionType: "typed_vi_en", mode: "quiz", attemptNumber: 1, answer: "overdu", expectedAnswer: "overdue", correct: false },
    ],
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/progress");
  await expect(page.getByRole("link", { name: /^Ôn \d+ thẻ$/ })).toHaveAttribute("href", "/review");
  await expectNoHorizontalOverflow(page);

  await page.goto(`/progress/folders/${folder.id}`);
  await expect(page.getByRole("link", { name: "Ôn 1 thẻ", exact: true })).toHaveAttribute("href", `/folders/${folder.id}/review`);
  await expectNoHorizontalOverflow(page);

  await page.goto(`/progress/decks/${deck.id}`);
  await expect(page.getByRole("link", { name: "Ôn 1 thẻ", exact: true })).toHaveAttribute("href", `/decks/${deck.id}/study`);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Tiến độ học" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto(`/progress/folders/${folder.id}`);
  await expect(page.getByRole("heading", { name: folder.name })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto(`/progress/decks/${deck.id}`);
  await expect(page.getByRole("link", { name: "Ôn 1 thẻ", exact: true })).toHaveAttribute("href", `/decks/${deck.id}/study`);
  await expect(page.getByText("1 thẻ đã quá hạn", { exact: true })).toBeVisible();
  await expect(page.getByText("2 lượt FSRS", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Luyện tập trung", exact: true })).toHaveAttribute("href", `/decks/${deck.id}/quiz?mode=focused_practice`);
  await expect(page.getByRole("heading", { name: "7 ngày tới" })).toBeVisible();
  const futureChart = page.getByRole("img", { name: /7 ngày tới/ });
  await expect(futureChart.locator("[data-count='0']")).toHaveCount(5);
  await expect.poll(() => futureChart.locator("[data-count='0']").evaluateAll((bars) => bars.every((bar) => getComputedStyle(bar).height === "0px"))).toBe(true);
  await expectNoHorizontalOverflow(page);

  await page.goto("/review");
  await expect(page.getByText("Ôn tập", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hiện đáp án" })).toBeVisible();
});

test("shows an insufficient-practice state instead of a misleading zero weak-card count", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Progress evidence ${testInfo.testId}`,
      cards: { create: { term: "evidence", normalizedTerm: "evidence", meaningVi: "bằng chứng" } },
    },
  });
  deckId = deck.id;

  await page.goto(`/progress/decks/${deck.id}`);
  await expect(page.getByText("Chưa đủ dữ liệu để xác định từ cần luyện.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Cần chú ý" }).getByRole("link", { name: "Làm bài Quiz" })).toHaveAttribute("href", `/decks/${deck.id}/quiz`);
  await expect(page.getByTestId("today-needs-practice")).toHaveText(/Chưa đủ dữ liệu/);
});
