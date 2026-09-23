import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

let deckId: string;
let cardId: string;

test.beforeEach(async () => {
  const deck = await db.deck.create({ data: { name: `V1 mobile ${crypto.randomUUID()}` } });
  deckId = deck.id;
  const card = await db.flashcard.create({
    data: {
      deckId,
      term: "allocate",
      normalizedTerm: "allocate",
      meaningVi: "phân bổ",
    },
  });
  cardId = card.id;

  await db.practiceAttempt.createMany({
    data: [
      {
        flashcardId: cardId,
        sessionId: "v1-mobile-a",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "alocate",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 1200,
      },
      {
        flashcardId: cardId,
        sessionId: "v1-mobile-b",
        questionType: "typed_vi_en",
        mode: "quiz",
        attemptNumber: 1,
        answer: "alocat",
        expectedAnswer: "allocate",
        correct: false,
        responseMs: 1100,
      },
    ],
  });
});

test.afterEach(async () => {
  await db.deck.delete({ where: { id: deckId } });
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test("keeps the daily mobile path prominent and advanced reinforcement reachable", async ({ page }) => {
  await page.goto(`/decks/${deckId}`);

  await expect(page.getByRole("link", { name: "Ôn tập" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Luyện", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm từ" })).toBeVisible();
  await expect(page.getByText("Thêm tuỳ chọn")).toBeVisible();
  await expect(page.getByRole("link", { name: "Truyện đã lưu" })).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.getByText("Thêm tuỳ chọn").tap();
  await expect(page.getByRole("link", { name: "Truyện đã lưu" })).toBeVisible();

  await page.getByRole("button", { name: "Thêm từ" }).tap();
  await expect(page.getByLabel("Word *")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/decks/${deckId}/study`);
  await expect(page.getByText("allocate", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/decks/${deckId}/quiz?mode=typed`);
  await expect(page.getByLabel("Nhập từ hoặc cụm từ tiếng Anh tương ứng:")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/decks/${deckId}/quiz?mode=focused_practice`);
  await expect(page.getByText("Luyện tập trung", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
