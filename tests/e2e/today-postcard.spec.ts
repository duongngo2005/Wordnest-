import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";
import { FlashcardStatus } from "@prisma/client";

let testDeckId: string | null = null;

test.beforeEach(async () => {
  // Create a test deck with 1 due card and 1 reviewed today card for full visual testing
  const now = new Date();
  const deck = await db.deck.create({
    data: {
      name: `Postcard Test Deck ${Date.now()}`,
      cards: {
        create: [
          {
            term: "ephemeral",
            normalizedTerm: "ephemeral",
            meaningVi: "phù du, chóng tàn",
            status: FlashcardStatus.LEARNING,
            state: 1,
            due: new Date(now.getTime() - 60_000), // Due now
          },
          {
            term: "resilience",
            normalizedTerm: "resilience",
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

test("renders WordNest Daily Postcard on Desktop and iPhone 15 Pro Max without overflow", async ({ page }) => {
  // 1. Desktop Viewport (1440 × 900)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const postcard = page.locator(".wn-postcard");
  await expect(postcard).toBeVisible();
  await expect(page.locator(".wn-postcard__layout")).toBeVisible();

  // Check Heading
  await expect(page.getByRole("heading", { name: "Hôm nay" })).toBeVisible();

  // Check Postcard Tag & Vintage Postmark
  await expect(page.locator(".wn-postcard__postmark-desktop")).toBeVisible();

  // Check Motivational Quote
  const quote = page.locator(".wn-postcard__quote");
  await expect(quote).toBeVisible();
  const quoteText = await quote.textContent();
  expect(quoteText?.length).toBeGreaterThan(5);

  // Check Stats
  const dueStat = page.getByTestId("today-due-stat");
  await expect(dueStat).toBeVisible();
  await expect(dueStat).toContainText("cần ôn");

  const reviewedStat = page.getByTestId("today-reviewed-stat");
  await expect(reviewedStat).toBeVisible();
  await expect(reviewedStat).toContainText("đã ôn");

  // Check Progress
  const progress = page.getByTestId("today-progress");
  await expect(progress).toBeVisible();

  // Check Mascot
  const mascot = page.locator(".wn-postcard__mascot-wrapper");
  await expect(mascot).toBeVisible();
  await expect(page.locator(".wn-postcard__mascot-wrapper [aria-hidden='true']").first()).toBeVisible();

  // Check CTA Ôn tập button
  const cta = page.getByRole("link", { name: "Ôn tập" }).first();
  await expect(cta).toBeVisible();

  // Check Touch Target on Desktop
  const ctaBox = await cta.boundingBox();
  expect(ctaBox).toBeTruthy();
  expect(ctaBox!.height).toBeGreaterThanOrEqual(44);

  // Check No Horizontal Overflow on Desktop
  const hasOverflowDesktop = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflowDesktop).toBe(false);

  // Screenshot on Desktop
  await postcard.screenshot({ path: "scratch/postcard-desktop-card.png" });
  await page.screenshot({ path: "scratch/postcard-desktop-1440.png" });

  // 2. iPhone 15 Pro Max Viewport (430 × 932)
  await page.setViewportSize({ width: 430, height: 932 });
  await page.reload();

  await expect(postcard).toBeVisible();
  await expect(page.locator(".wn-postcard__postmark-mobile")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hôm nay" })).toBeVisible();
  await expect(dueStat).toBeVisible();
  await expect(reviewedStat).toBeVisible();
  await expect(cta).toBeVisible();

  // Check Touch Target on Mobile
  const mobileCtaBox = await cta.boundingBox();
  expect(mobileCtaBox).toBeTruthy();
  expect(mobileCtaBox!.height).toBeGreaterThanOrEqual(44);

  // Check No Horizontal Overflow on iPhone 15 Pro Max
  const hasOverflowMobile = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflowMobile).toBe(false);

  // Screenshot on iPhone 15 Pro Max
  await postcard.screenshot({ path: "scratch/postcard-mobile-card.png" });
  await page.screenshot({ path: "scratch/postcard-mobile-430.png" });
});

test("renders completed state with celebration badge when today's reviews are done", async ({ page }) => {
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

    // Status should show celebration badge
    const completedBadge = page.locator(".wn-postcard__completed-pill");
    await expect(completedBadge).toBeVisible();
    await expect(completedBadge).toContainText("Đã xong hôm nay");

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
