import { expect, test, type Locator, type Page } from "@playwright/test";
import { db } from "@/lib/db";
import { FlashcardStatus } from "@prisma/client";

let testDeckId: string | null = null;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 900 },
  { width: 1024, height: 900 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
] as const;

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Expected visible element to have a bounding box");
  return box;
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectTodayActionsToFit(page: Page, viewportWidth: number) {
  const primaryAction = page.getByTestId("today-primary-action");
  const dueTypingAction = page.getByTestId("today-due-typing-action");
  const typingAction = page.getByTestId("today-typing-action");
  const mascot = page.locator(".wn-postcard__mascot-wrapper");

  await expect(primaryAction).toBeVisible();
  await expect(dueTypingAction).toBeVisible();
  await expect(typingAction).toBeVisible();
  await expect(primaryAction).toHaveAttribute("href", "/review");
  await expect(dueTypingAction).toHaveAttribute("href", "/practice/typing?source=due");
  await expect(typingAction).toHaveAttribute("href", "/practice/typing");

  const [primaryBox, dueTypingBox, typingBox, mascotBox] = await Promise.all([
    getRequiredBox(primaryAction),
    getRequiredBox(dueTypingAction),
    getRequiredBox(typingAction),
    getRequiredBox(mascot),
  ]);

  expect(rectanglesOverlap(primaryBox, typingBox)).toBe(false);
  expect(rectanglesOverlap(primaryBox, dueTypingBox)).toBe(false);
  expect(rectanglesOverlap(dueTypingBox, typingBox)).toBe(false);
  expect(rectanglesOverlap(mascotBox, primaryBox)).toBe(false);
  expect(rectanglesOverlap(mascotBox, dueTypingBox)).toBe(false);
  expect(rectanglesOverlap(mascotBox, typingBox)).toBe(false);
  expect(typingBox.y - (primaryBox.y + primaryBox.height)).toBeGreaterThanOrEqual(8);
  expect(dueTypingBox.y - (primaryBox.y + primaryBox.height)).toBeGreaterThanOrEqual(8);
  expect(typingBox.y - (dueTypingBox.y + dueTypingBox.height)).toBeGreaterThanOrEqual(8);
  expect(primaryBox.x).toBeGreaterThanOrEqual(0);
  expect(dueTypingBox.x).toBeGreaterThanOrEqual(0);
  expect(typingBox.x).toBeGreaterThanOrEqual(0);
  expect(primaryBox.x + primaryBox.width).toBeLessThanOrEqual(viewportWidth);
  expect(dueTypingBox.x + dueTypingBox.width).toBeLessThanOrEqual(viewportWidth);
  expect(typingBox.x + typingBox.width).toBeLessThanOrEqual(viewportWidth);
  expect(primaryBox.height).toBeGreaterThanOrEqual(44);
  expect(dueTypingBox.height).toBeGreaterThanOrEqual(44);
  expect(typingBox.height).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({}, testInfo) => {
  // Create a test deck with 1 due card and 1 reviewed today card for full visual testing
  const now = new Date();
  const termPrefix = `postcard-${testInfo.testId}`.toLowerCase();
  const deck = await db.deck.create({
    data: {
      name: `Postcard Test Deck ${Date.now()}`,
      cards: {
        create: [
          {
            term: `${termPrefix}-due`,
            normalizedTerm: `${termPrefix}-due`,
            meaningVi: "phù du, chóng tàn",
            status: FlashcardStatus.LEARNING,
            state: 1,
            due: new Date(now.getTime() - 60_000), // Due now
          },
          {
            term: `${termPrefix}-reviewed`,
            normalizedTerm: `${termPrefix}-reviewed`,
            meaningVi: "sự kiên cường",
            status: FlashcardStatus.LEARNING,
            state: 2,
            due: new Date(now.getTime() + 86_400_000), // Due tomorrow
          },
        ],
      },
    },
    include: { cards: true },
  });
  testDeckId = deck.id;

  // Log a review for the second card today
  await db.reviewLog.create({
    data: {
      cardId: deck.cards[1].id,
      rating: 3,
      state: 2,
      due: new Date(now.getTime() + 86_400_000),
      stability: 2.5,
      difficulty: 4.0,
      elapsedDays: 1,
      lastElapsedDays: 0,
      scheduledDays: 1,
      review: now,
    },
  });
});
test.afterEach(async () => {
  if (testDeckId) {
    await db.reviewLog.deleteMany({
      where: { card: { deckId: testDeckId } },
    });
    await db.flashcard.deleteMany({
      where: { deckId: testDeckId },
    });
    await db.deck.deleteMany({
      where: { id: testDeckId },
    });
    testDeckId = null;
  }
});

test("keeps Today postcard actions separate across target viewports and due-count labels", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const postcard = page.locator(".wn-postcard");
    await expect(postcard).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hôm nay" })).toBeVisible();
    await expect(page.getByTestId("today-progress")).toBeVisible();
    await expect(page.locator(".wn-postcard__mascot-wrapper")).toBeVisible();

    for (const dueCount of [0, 26, 999, 1000]) {
      await page.getByTestId("today-primary-action").locator("span").last().evaluate(
        (element, count) => {
          element.textContent = `Ôn ${count} thẻ đến hạn`;
        },
        dueCount
      );
      await expect(page.getByTestId("today-primary-action")).toContainText(`Ôn ${dueCount} thẻ đến hạn`);
      await expectTodayActionsToFit(page, viewport.width);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    if (viewport.width === 1440 || viewport.width === 390) {
      await postcard.screenshot({ path: `scratch/postcard-actions-${viewport.width}.png` });
    }
  }
});

test("renders the no-due postcard state without implying final mastery", async ({ page }) => {
  const now = new Date();
  const future = new Date(now.getTime() + 86_400_000);

  // Save all currently due cards to restore afterwards
  const dueCards = await db.flashcard.findMany({
    where: { state: { gt: 0 }, due: { lte: now } },
    select: { id: true, due: true },
  });

  try {
    // Postpone due cards temporarily so dueCount becomes 0
    if (dueCards.length > 0) {
      await db.flashcard.updateMany({
        where: { id: { in: dueCards.map((c) => c.id) } },
        data: { due: future },
      });
    }

    await page.goto("/");
    const postcard = page.locator(".wn-postcard");
    await expect(postcard).toBeVisible();

    // Due stat should now be 0
    const dueStat = page.getByTestId("today-due-stat");
    await expect(dueStat).toContainText("0");

    // Other decks can legitimately determine the global next action. The
    // postcard must not turn this no-due state into a false mastery claim.
    await expect(page.getByText("Đã xong hôm nay")).toHaveCount(0);

    // Capture celebration screenshot
    await postcard.screenshot({ path: "scratch/postcard-completed.png" });
  } finally {
    // Restore original due dates
    for (const card of dueCards) {
      await db.flashcard.updateMany({
        where: { id: card.id },
        data: { due: card.due },
      });
    }
  }
});
