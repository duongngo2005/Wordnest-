import { expect, test } from "@playwright/test";
import { FlashcardStatus } from "@prisma/client";
import { db } from "../../src/lib/db";

let deckId: string;
let cardId: string;

test.beforeEach(async () => {
  const deck = await db.deck.create({ data: { name: `Inline edit ${crypto.randomUUID()}` } });
  deckId = deck.id;
  const card = await db.flashcard.create({
    data: {
      deckId,
      term: "integrity",
      normalizedTerm: "integrity",
      meaningVi: "tính toàn vẹn",
      definitionEn: "the quality of being honest and morally strong",
      partOfSpeech: "noun",
      cefr: "B2",
      exampleEn: "She acted with integrity.",
      exampleVi: "Cô ấy hành động với sự chính trực.",
      status: FlashcardStatus.LEARNING,
      state: 1,
      due: new Date(),
      stability: 4.2,
      difficulty: 5.1,
      reps: 3,
      lapses: 1,
      elapsedDays: 2,
      scheduledDays: 5,
      learningSteps: 0,
      schedulerVersion: 3,
      lastReviewAt: new Date("2026-10-14T09:00:00.000Z"),
    },
  });
  cardId = card.id;
});

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } }).catch(() => {});
});

test("edits a revealed review card in place without recording an FSRS review", async ({ page }) => {
  const cardBefore = await db.flashcard.findUniqueOrThrow({ where: { id: cardId } });
  const logsBefore = await db.reviewLog.findMany({ where: { cardId } });

  await page.goto(`/decks/${deckId}/study`);
  await page.getByRole("button", { name: "Hiện đáp án" }).click();
  await page.getByRole("button", { name: "Chỉnh sửa thẻ integrity" }).click();

  const editor = page.getByRole("dialog", { name: "Chỉnh sửa thẻ" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nghĩa tiếng Việt").fill("tính chính trực");
  await editor.getByLabel("Ví dụ tiếng Anh").fill("Integrity builds trust.");
  await editor.getByLabel("Dịch ví dụ").fill("Sự chính trực xây dựng niềm tin.");
  await editor.getByRole("button", { name: "Lưu", exact: true }).click();

  await expect(editor).toBeHidden();
  await expect(page.getByText("tính chính trực")).toBeVisible();
  await expect(page.getByText("Integrity builds trust.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Again/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Hard/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Good/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Easy/ })).toBeEnabled();

  const cardAfter = await db.flashcard.findUniqueOrThrow({ where: { id: cardId } });
  expect(cardAfter).toMatchObject({
    meaningVi: "tính chính trực",
    exampleEn: "Integrity builds trust.",
    exampleVi: "Sự chính trực xây dựng niềm tin.",
  });
  for (const field of [
    "due",
    "state",
    "status",
    "stability",
    "difficulty",
    "elapsedDays",
    "scheduledDays",
    "learningSteps",
    "reps",
    "lapses",
    "lastReviewAt",
    "schedulerVersion",
  ] as const) {
    expect(cardAfter[field]).toEqual(cardBefore[field]);
  }
  expect(await db.reviewLog.findMany({ where: { cardId } })).toEqual(logsBefore);
});
