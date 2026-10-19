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
  await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
  await page.getByRole("button", { name: "AI JSON", exact: true }).click();
  const textarea = page.getByLabel("JSON flashcard");
  await textarea.fill(invalidJson);
  await page.getByRole("button", { name: "Kiểm tra và xem trước" }).click();
  await expect(page.getByText("cards[0].meaningVi", { exact: false })).toBeVisible();
  await expect(textarea).toHaveValue(invalidJson);
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);

  await textarea.fill(validJson);
  await page.getByRole("button", { name: "Kiểm tra và xem trước" }).click();
  await expect(page.getByText("Tổng thẻ")).toBeVisible();
  await page.getByRole("button", { name: "Sửa chi tiết apple" }).click();
  await expect(page.getByText("a round fruit with red, green, or yellow skin", { exact: true })).toBeVisible();
  await expect(page.getByText("Cô ấy ăn một quả táo sau bữa trưa.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 term mới" }).click();
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
  await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
  await page.getByRole("button", { name: "AI JSON", exact: true }).click();
  const textarea = page.getByLabel("JSON flashcard");
  await textarea.fill(rawJson);
  await page.getByRole("button", { name: "Kiểm tra và xem trước" }).click();
  await page.getByRole("button", { name: "Import 1 term mới" }).click();

  await expect(page.getByText("Term was added elsewhere.", { exact: true }).first()).toBeVisible();
  await expect(textarea).toHaveValue(rawJson);
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
});

test("External AI V3 reviews duplicate rows and imports one mixed decision set without linking existing vocabulary to the target deck", async ({ page }, testInfo) => {
  const source = await db.deck.create({ data: { name: `V3 source ${testInfo.testId.slice(-8)}` } });
  const target = await db.deck.create({ data: { name: `V3 target ${testInfo.testId.slice(-8)}` } });
  const prefix = `v3-e2e-${testInfo.testId.slice(-8).toLowerCase()}`;
  const terms = Array.from({ length: 50 }, (_, index) => `${prefix}-${index + 1}`);
  const existingTerms = terms.slice(0, 8);
  const rawJson = JSON.stringify({
    schemaVersion: 1,
    cards: terms.map((term) => ({
      term,
      meaningVi: `nghĩa AI ${term}`,
      partOfSpeech: "noun",
      ipa: null,
      definitionEn: `a concise definition for ${term}`,
      exampleEn: `This is an example for ${term}.`,
      exampleVi: `Đây là ví dụ cho ${term}.`,
      cefr: null,
      imageUrl: null,
    })),
  });

  try {
    await Promise.all(existingTerms.map((term) => db.flashcard.create({
      data: { deckId: source.id, term, normalizedTerm: term, meaningVi: `nghĩa cũ ${term}`, partOfSpeech: "noun" },
    })));
    const existing = await db.flashcard.findMany({ where: { normalizedTerm: { in: existingTerms } } });

    await page.goto(`/decks/${target.id}`);
    await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
    await page.getByRole("button", { name: "AI JSON", exact: true }).click();
    await page.getByLabel("Danh sách từ").fill(terms.join("\n"));
    await page.getByRole("button", { name: "Xem prompt" }).click();
    await page.getByLabel("JSON flashcard").fill(rawJson);
    await page.getByRole("button", { name: "Kiểm tra và xem trước" }).click();

    await expect(page.getByText("Đối soát flashcard trùng")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Giữ cũ" }).first()).toBeChecked();
    await expect(page.getByText("42", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`${existingTerms[0]}.*Xem so sánh`) }).click();
    await expect(page.getByLabel("Flashcard hiện có")).toHaveCount(1);
    await expect(page.getByLabel("Flashcard AI mới")).toHaveCount(1);
    await page.getByRole("button", { name: "Ghi đè tất cả" }).click();

    for (const term of existingTerms.slice(3)) {
      const row = page.getByRole("article", { name: `Đối soát ${term}` });
      await row.getByRole("radio", { name: "Giữ cũ" }).check();
    }
    await expect(page.getByText("42 thêm mới · 3 ghi đè · 5 giữ nguyên")).toBeVisible();
    await page.getByRole("button", { name: "Áp dụng thay đổi và nhập flashcard" }).click();

    await expect.poll(() => db.deckVocabularyMembership.count({ where: { deckId: target.id } })).toBe(42);
    await expect.poll(() => db.flashcard.count({ where: { normalizedTerm: { in: terms } } })).toBe(50);
    const updated = await db.flashcard.findMany({ where: { normalizedTerm: { in: existingTerms } } });
    expect(updated.filter((card) => card.meaningVi.startsWith("nghĩa AI"))).toHaveLength(3);
    expect(await db.deckVocabularyMembership.count({ where: { deckId: target.id, flashcardId: { in: existing.map((card) => card.id) } } })).toBe(0);
    await page.reload();
    await expect(page.getByText(terms[8], { exact: true }).first()).toBeVisible();
  } finally {
    await db.flashcard.deleteMany({ where: { normalizedTerm: { in: terms } } });
    await db.deck.deleteMany({ where: { id: { in: [source.id, target.id] } } });
  }
});
