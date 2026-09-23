import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("manual add → review → typed retry → needs practice → focused practice works without AI", async ({ page }, testInfo) => {
  const deckName = `Daily core ${testInfo.testId.slice(-8)}`;

  await page.goto("/");
  await page.locator("#add-vocabulary").getByRole("button", { name: "Thêm từ" }).tap();
  await page.getByLabel("Tên bộ từ vựng (tùy chọn)").fill(deckName);
  await page.getByLabel("Word *").fill("allocate");
  await page.getByLabel("Meaning Vietnamese *").fill("phân bổ");
  await page.getByRole("button", { name: "Lưu flashcard" }).click();
  await page.waitForURL(/\/decks\/[^/]+$/);

  const match = page.url().match(/\/decks\/([^/]+)$/);
  expect(match?.[1]).toBeTruthy();
  const createdDeckId = match?.[1];
  if (!createdDeckId) throw new Error("Manual card creation did not navigate to a deck.");
  deckId = createdDeckId;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("link", { name: "Ôn tập" }).click();
  await page.getByRole("button", { name: "Hiện đáp án" }).click();
  await page.getByRole("button", { name: /Good/ }).click();
  await expect(page.getByText("Xuất sắc! Đã hoàn thành!")).toBeVisible();

  await page.goto(`/decks/${createdDeckId}/quiz?mode=typed`);
  await page.locator("#typed-recall-input").fill("alocate");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await expect(page.getByText("Chưa chính xác.")).toBeVisible();
  await page.getByRole("button", { name: "Luyện lại 1 câu sai" }).click();
  await page.locator("#typed-recall-input").fill("allocate");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();
  await expect(page.getByText(/Lần đầu:\s*0\/1\.\s*Bạn đã sửa đúng\s*1\/1/)).toBeVisible();

  await page.goto(`/decks/${createdDeckId}/quiz?mode=typed`);
  await page.locator("#typed-recall-input").fill("alocate");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();
  await expect(page.getByRole("heading", { name: "Cố gắng lên! Mỗi lần làm là một lần nhớ sâu hơn!" })).toBeVisible();

  await page.goto(`/decks/${createdDeckId}`);
  const focusedPractice = page.getByTestId("btn-start-focused-practice");
  await expect(focusedPractice).toBeVisible();
  await focusedPractice.click();
  await expect(page.getByText("Luyện tập trung", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const practiceAttempts = await db.practiceAttempt.findMany({
    where: { flashcard: { deckId: createdDeckId } },
    orderBy: { createdAt: "asc" },
  });
  expect(practiceAttempts.filter((attempt) => attempt.attemptNumber === 1 && !attempt.correct)).toHaveLength(2);
  expect(practiceAttempts.filter((attempt) => attempt.attemptNumber === 2 && attempt.correct)).toHaveLength(1);
});
