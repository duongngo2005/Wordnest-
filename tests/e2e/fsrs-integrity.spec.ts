import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";
import { FlashcardStatus } from "@prisma/client";

let deckId: string;
let cardId: string;

test.beforeEach(async () => {
  const deck = await db.deck.create({ data: { name: `FSRS UI ${crypto.randomUUID()}` } });
  deckId = deck.id;
  const card = await db.flashcard.create({
    data: {
      deckId,
      term: "integrity",
      normalizedTerm: "integrity",
      meaningVi: "tính toàn vẹn",
      status: FlashcardStatus.NEW,
      state: 0,
      due: new Date(),
    },
  });
  cardId = card.id;
});

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
});

test.describe("FSRS integrity UI", () => {
  test("Scheduled Review disables rating controls and ignores repeated keyboard ratings while pending", async ({ page }) => {
    let reviewRequests = 0;
    let releaseRequest: (() => void) | undefined;
    const requestHeld = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route(`**/api/cards/${cardId}/review`, async (route) => {
      reviewRequests += 1;
      await requestHeld;
      await route.abort();
    });

    await page.goto(`/decks/${deckId}/study`);
    await page.getByRole("button", { name: "Hiện đáp án" }).click();
    await page.getByRole("button", { name: /Good/ }).click();

    await expect(page.getByRole("button", { name: /Again/ })).toBeDisabled();
    await page.keyboard.press("Digit3");
    await page.keyboard.press("Digit3");
    expect(reviewRequests).toBe(1);

    releaseRequest?.();
    await expect(page.getByText("Lượt ôn chưa được lưu:")).toBeVisible();
  });

  test("Free Practice has no Scheduled Review controls or scheduler request", async ({ page }) => {
    const schedulerBefore = await db.flashcard.findUniqueOrThrow({ where: { id: cardId } });
    let reviewRequests = 0;
    await page.route(`**/api/cards/${cardId}/review`, async (route) => {
      reviewRequests += 1;
      await route.abort();
    });

    await page.goto(`/decks/${deckId}/practice`);
    await page.getByRole("button", { name: "Hiện đáp án" }).click();
    await expect(page.getByRole("button", { name: /Again/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Thẻ tiếp theo" }).click();

    expect(reviewRequests).toBe(0);
    const schedulerAfter = await db.flashcard.findUniqueOrThrow({ where: { id: cardId } });
    expect(schedulerAfter).toMatchObject({
      due: schedulerBefore.due,
      state: schedulerBefore.state,
      status: schedulerBefore.status,
      stability: schedulerBefore.stability,
      difficulty: schedulerBefore.difficulty,
      reps: schedulerBefore.reps,
      lapses: schedulerBefore.lapses,
      learningSteps: schedulerBefore.learningSteps,
      schedulerVersion: schedulerBefore.schedulerVersion,
      lastReviewAt: schedulerBefore.lastReviewAt,
    });
  });
});
