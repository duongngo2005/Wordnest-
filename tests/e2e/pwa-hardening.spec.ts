import { expect, test } from "@playwright/test";
import { FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";

let deckId: string | null = null;
let cardId: string | null = null;

async function seedDeck(testId: string) {
  const deck = await db.deck.create({
    data: {
      name: `PWA hardening ${testId.slice(-8)}`,
      cards: {
        create: {
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
          status: FlashcardStatus.NEW,
          state: 0,
          due: new Date(),
        },
      },
    },
    include: { cards: true },
  });
  deckId = deck.id;
  cardId = deck.cards[0].id;
  return deck;
}

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
  cardId = null;
});

test.describe("iPhone PWA hardening", () => {
  test.use({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  });

  test("serves a standalone manifest with the WordNest icon set", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: "WordNest — Học Từ Vựng Thông Minh",
      short_name: "WordNest",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#FAF6EE",
      theme_color: "#FAF6EE",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
        expect.objectContaining({ src: "/icons/apple-touch-icon.png", sizes: "180x180" }),
      ])
    );
  });

  test("keeps Typed Recall unzoomed and reachable at 430×932", async ({ page }, testInfo) => {
    const deck = await seedDeck(testInfo.testId);
    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);

    const input = page.getByLabel("Nhập từ hoặc cụm từ tiếng Anh tương ứng:");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("autocorrect", "off");
    await expect(input).toHaveAttribute("autocapitalize", "off");
    await expect(input).toHaveAttribute("spellcheck", "false");
    await expect(input).toHaveAttribute("inputmode", "text");
    await expect(input).toHaveAttribute("enterkeyhint", "done");
    await expect(input).toHaveCSS("font-size", "16px");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    await input.fill("allocate");
    await expect(page.getByRole("button", { name: "Kiểm tra" })).toBeVisible();
  });

  test("never advances or creates a review write when the server is unreachable", async ({ page }, testInfo) => {
    const deck = await seedDeck(testInfo.testId);
    const requests: Array<{ reviewEventId: string; expectedSchedulerVersion: number }> = [];

    await page.route(`**/api/cards/${cardId}/review`, async (route) => {
      const body = route.request().postDataJSON() as { reviewEventId: string; expectedSchedulerVersion: number };
      requests.push(body);
      await route.abort();
    });

    await page.goto(`/decks/${deck.id}/study`);
    await page.getByRole("button", { name: "Hiện đáp án" }).tap();
    await page.getByRole("button", { name: /Good/ }).tap();
    await expect(page.getByText("Không kết nối được máy chủ WordNest")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gửi lại" })).toBeVisible();

    await page.getByRole("button", { name: "Gửi lại" }).tap();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toEqual(requests[0]);

    const card = await db.flashcard.findUniqueOrThrow({ where: { id: cardId! } });
    expect(card).toMatchObject({
      status: FlashcardStatus.NEW,
      state: 0,
      reps: 0,
      lapses: 0,
      schedulerVersion: 0,
      lastReviewAt: null,
    });
  });
});
