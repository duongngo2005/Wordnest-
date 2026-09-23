import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

let deckId: string | null = null;
test.afterEach(async () => { if (deckId) await db.deck.delete({ where: { id: deckId } }); });

test("create deck → add card → review → typed retry → focused practice works without AI", async ({ page }, testInfo) => {
  const deckName = `Daily core ${testInfo.testId.slice(-8)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Bộ từ", exact: true }).tap();
  await page.getByLabel("Tên bộ từ").fill(deckName);
  await page.getByRole("button", { name: "Tạo", exact: true }).tap();
  await page.waitForURL(/\/decks\/[^/]+$/);
  deckId = page.url().match(/\/decks\/([^/]+)$/)?.[1] ?? null;
  expect(deckId).toBeTruthy();

  await page.getByRole("button", { name: "Thêm thẻ" }).tap();
  await page.getByLabel("Từ", { exact: true }).fill("allocate");
  await page.getByLabel("Nghĩa tiếng Việt").fill("phân bổ");
  await page.getByRole("button", { name: "Thêm thẻ" }).last().tap();
  await expect.poll(() => db.flashcard.count({ where: { deckId: deckId! } })).toBe(1);

  await page.getByRole("link", { name: "Ôn tập" }).tap();
  await page.getByRole("button", { name: "Hiện đáp án" }).tap();
  await page.getByRole("button", { name: /Good/ }).tap();
  await page.goto(`/decks/${deckId}/quiz?mode=typed`);
  await page.locator("#typed-recall-input").fill("alocate");
  await page.getByRole("button", { name: "Kiểm tra" }).tap();
  await page.getByRole("button", { name: "Luyện lại 1 câu sai" }).tap();
  await page.locator("#typed-recall-input").fill("allocate");
  await page.getByRole("button", { name: "Kiểm tra" }).tap();
  await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).tap();
  await expect(page.getByText("Kết quả bài Quiz", { exact: true })).toBeVisible();
  await page.goto(`/decks/${deckId}/quiz?mode=typed`);
  await page.locator("#typed-recall-input").fill("alocate");
  await page.getByRole("button", { name: "Kiểm tra" }).tap();
  await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).tap();
  await expect(page.getByText("Kết quả bài Quiz", { exact: true })).toBeVisible();
  await page.goto(`/decks/${deckId}`);
  await page.getByTestId("btn-start-focused-practice").tap();
  await expect(page.getByText("Luyện tập trung", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
