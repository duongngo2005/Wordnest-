import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("JSON import validates before writing, imports the entire preview, and preserves text on errors", async ({ page }, testInfo) => {
  const deck = await db.deck.create({ data: { name: `JSON E2E ${testInfo.testId.slice(-8)}` } });
  deckId = deck.id;
  const invalidJson = "{\"schemaVersion\": 1, \"cards\": [{\"term\": \"apple\"}]}";
  const validJson = JSON.stringify({
    schemaVersion: 1,
    cards: [
      {
        term: "apple",
        meaningVi: "quả táo",
        partOfSpeech: "noun",
        ipa: "/ˈæpəl/",
        definitionEn: "a round fruit with red, green, or yellow skin",
        exampleEn: "She ate an apple after lunch.",
        exampleVi: "Cô ấy ăn một quả táo sau bữa trưa.",
        cefr: "A1",
      },
      { term: "banana", meaningVi: "quả chuối" },
    ],
  });

  await page.goto(`/decks/${deck.id}`);
  await page.getByRole("button", { name: "Thêm từ" }).click();
  await page.getByRole("tab", { name: "Nhập JSON" }).click();
  const textarea = page.getByLabel("JSON flashcard");
  await textarea.fill(invalidJson);
  await page.getByRole("button", { name: "Validate & Preview" }).click();
  await expect(page.getByText("cards[0].meaningVi", { exact: false })).toBeVisible();
  await expect(textarea).toHaveValue(invalidJson);
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);

  await textarea.fill(validJson);
  await page.getByRole("button", { name: "Validate & Preview" }).click();
  await expect(page.getByText("Tổng thẻ")).toBeVisible();
  await page.getByRole("button", { name: "Xem chi tiết apple" }).click();
  await expect(page.getByText("a round fruit with red, green, or yellow skin", { exact: true })).toBeVisible();
  await expect(page.getByText("Cô ấy ăn một quả táo sau bữa trưa.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 flashcard" }).click();
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(2);
});

test("JSON import keeps the textarea when the import request fails", async ({ page }, testInfo) => {
  const deck = await db.deck.create({ data: { name: `JSON error ${testInfo.testId.slice(-8)}` } });
  deckId = deck.id;
  const rawJson = JSON.stringify({ schemaVersion: 1, cards: [{ term: "pear", meaningVi: "quả lê" }] });
  let requestCount = 0;

  await page.route(`**/api/decks/${deck.id}/cards/json-import`, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({ json: { success: true, data: { valid: true, cards: [{ term: "pear", meaningVi: "quả lê" }], errors: [] } } });
      return;
    }
    await route.fulfill({ status: 400, json: { success: false, error: "Term was added elsewhere.", details: ["cards[0].term: This term already exists in the destination deck."] } });
  });

  await page.goto(`/decks/${deck.id}`);
  await page.getByRole("button", { name: "Thêm từ" }).click();
  await page.getByRole("tab", { name: "Nhập JSON" }).click();
  const textarea = page.getByLabel("JSON flashcard");
  await textarea.fill(rawJson);
  await page.getByRole("button", { name: "Validate & Preview" }).click();
  await page.getByRole("button", { name: "Import 1 flashcard" }).click();

  await expect(page.locator("#add-cards-form").getByText("Term was added elsewhere.", { exact: true })).toBeVisible();
  await expect(textarea).toHaveValue(rawJson);
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
});
