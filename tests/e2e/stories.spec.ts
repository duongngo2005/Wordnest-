import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("renders historical stories read-only without exposing parked AI actions", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Historical story ${testInfo.testId.slice(-8)}`,
      cards: { create: { term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } },
    },
  });
  deckId = deck.id;

  await db.story.create({
    data: {
      deckId: deck.id,
      title: "An Apple on the Trail",
      content: "Maya packed an apple before a difficult hike.",
      cefr: "B1",
      length: "short",
      topic: "Travel",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["apple"],
        usage: [{ term: "apple", usedAs: "apple" }],
        contextualTranslations: [{ term: "apple", usedAs: "apple", meaningVi: "quả táo" }],
        selectionTranslations: [],
      },
    },
  });

  await page.goto(`/decks/${deck.id}/story`);

  await expect(page.getByRole("heading", { name: "An Apple on the Trail" })).toBeVisible();
  await expect(page.getByText("Maya packed an apple before a difficult hike.")).toBeVisible();
  await expect(page.getByText("apple", { exact: true })).toBeVisible();
  await expect(page.getByText("Bản lưu chỉ để đọc; tra nghĩa AI và Story Cloze đang được tạm dừng.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo câu chuyện|Generate with WordNest AI/ })).toHaveCount(0);
});
