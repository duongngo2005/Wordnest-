import { expect, test } from "@playwright/test";
import { FlashcardStatus } from "@prisma/client";
import { db } from "../../src/lib/db";
import { deckService } from "../../src/services/vocabulary";

let targetDeckId: string;
let sourceDeckId: string;
let reviewCardId: string;

test.beforeEach(async () => {
  const targetDeck = await db.deck.create({ data: { name: `Study manual target ${crypto.randomUUID()}` } });
  const sourceDeck = await db.deck.create({ data: { name: `Study manual source ${crypto.randomUUID()}` } });
  targetDeckId = targetDeck.id;
  sourceDeckId = sourceDeck.id;

  const reviewTerm = `study-manual-review-${crypto.randomUUID()}`;
  await deckService.createManualCards(targetDeckId, [{ term: reviewTerm, meaningVi: "từ để mở phiên ôn" }]);
  const reviewCard = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: reviewTerm } });
  reviewCardId = reviewCard.id;
  await db.flashcard.update({
    where: { id: reviewCardId },
    data: { due: new Date(Date.now() - 60_000), state: 1, status: FlashcardStatus.LEARNING },
  });
});

test.afterEach(async () => {
  await db.flashcard.deleteMany({ where: { id: reviewCardId } }).catch(() => undefined);
  await db.flashcard.deleteMany({ where: { deckId: sourceDeckId } }).catch(() => undefined);
  await db.deck.deleteMany({ where: { id: { in: [targetDeckId, sourceDeckId] } } }).catch(() => undefined);
});

test("adds a new manual flashcard from a review session after checking global duplicates", async ({ page }) => {
  const term = `study-manual-new-${crypto.randomUUID()}`;

  await page.goto(`/decks/${targetDeckId}/study`);
  await page.getByRole("button", { name: "Thêm từ" }).click();

  const dialog = page.getByRole("dialog", { name: "Thêm từ trong lúc ôn" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Từ")).toBeFocused();
  await dialog.getByLabel("Từ").fill(term);
  await dialog.getByLabel("Nghĩa tiếng Việt").fill("từ được ghi trong lúc ôn");

  const checkResponse = page.waitForResponse((response) => response.url().endsWith("/cards/manual/check") && response.request().method() === "POST");
  const commitResponse = page.waitForResponse((response) => response.url().endsWith("/cards/manual/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Kiểm tra và thêm" }).click();
  expect((await checkResponse).status()).toBe(200);
  expect((await commitResponse).status()).toBe(201);
  await expect(dialog).toBeHidden();

  const created = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
  expect(created.meaningVi).toBe("từ được ghi trong lúc ôn");
  await expect(db.deckVocabularyMembership.count({ where: { deckId: targetDeckId, flashcardId: created.id } })).resolves.toBe(1);
  await db.flashcard.delete({ where: { id: created.id } });
});

test("shows the existing flashcard and only overwrites it after explicit confirmation", async ({ page }) => {
  const term = `study-manual-existing-${crypto.randomUUID()}`;
  await deckService.createManualCards(sourceDeckId, [{
    term,
    meaningVi: "nghĩa cũ",
    definitionEn: "the existing definition",
    exampleEn: "The existing example.",
  }]);
  const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
  const membershipsBefore = await db.deckVocabularyMembership.findMany({ where: { flashcardId: existing.id }, orderBy: { id: "asc" } });

  await page.goto(`/decks/${targetDeckId}/study`);
  await page.getByRole("button", { name: "Thêm từ" }).click();
  const entryDialog = page.getByRole("dialog", { name: "Thêm từ trong lúc ôn" });
  await entryDialog.getByLabel("Từ").fill(term);
  await entryDialog.getByLabel("Nghĩa tiếng Việt").fill("nghĩa mới sau khi ôn");

  await entryDialog.getByRole("button", { name: "Kiểm tra và thêm" }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "Thẻ đã tồn tại" });
  await expect(duplicateDialog).toBeVisible();
  await expect(duplicateDialog.getByText("Study manual source")).toBeVisible();
  await expect(duplicateDialog.getByText("nghĩa cũ")).toBeVisible();

  const commitResponse = page.waitForResponse((response) => response.url().endsWith("/cards/manual/commit") && response.request().method() === "POST");
  await duplicateDialog.getByRole("button", { name: "Ghi đè thẻ hiện có" }).click();
  expect((await commitResponse).status()).toBe(200);
  await expect(duplicateDialog).toBeHidden();

  const updated = await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } });
  expect(updated).toMatchObject({ id: existing.id, meaningVi: "nghĩa mới sau khi ôn", definitionEn: "the existing definition" });
  expect(await db.deckVocabularyMembership.findMany({ where: { flashcardId: existing.id }, orderBy: { id: "asc" } })).toEqual(membershipsBefore);
  await expect(db.deckVocabularyMembership.count({ where: { deckId: targetDeckId, flashcardId: existing.id } })).resolves.toBe(0);
  await db.flashcard.delete({ where: { id: existing.id } });
});
