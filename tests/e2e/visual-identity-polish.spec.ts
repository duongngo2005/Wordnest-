import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";
import { FlashcardStatus } from "@/lib/flashcards/status";

test.describe("WordNest Visual Identity Polish Surfaces", () => {
  let deckId: string;
  let folderId: string;

  test.beforeAll(async () => {
    // Ensure we have a sample folder and deck with cards for visual inspection
    const folder = await db.folder.create({
      data: {
        name: "IELTS Core Vocabulary",
        normalizedName: "ielts core vocabulary",
        description: "Essential academic words and idioms for study notes",
      },
    });
    folderId = folder.id;

    const deck = await db.deck.create({
      data: {
        name: "Academic Word List 01",
        description: "High-yield academic vocabulary with example sentences",
        folderId: folder.id,
      },
    });
    deckId = deck.id;

    // Create 3 cards in the deck
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "ubiquitous",
        normalizedTerm: "ubiquitous",
        meaningVi: "phổ biến, có mặt ở khắp mọi nơi",
        definitionEn: "present, appearing, or found everywhere",
        ipa: "/juːˈbɪk.wə.təs/",
        partOfSpeech: "adjective",
        cefr: "C1",
        exampleEn: "Smartphones have become ubiquitous in modern society.",
        exampleVi: "Điện thoại thông minh đã trở nên phổ biến ở khắp nơi trong xã hội hiện đại.",
        status: FlashcardStatus.LEARNING,
        state: 1,
        due: new Date(Date.now() - 3600_000), // Due now
      },
    });

    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "resilient",
        normalizedTerm: "resilient",
        meaningVi: "kiên cường, có khả năng phục hồi nhanh",
        definitionEn: "able to withstand or recover quickly from difficult conditions",
        ipa: "/rɪˈzɪl.jənt/",
        partOfSpeech: "adjective",
        cefr: "B2",
        exampleEn: "She proved to be remarkably resilient after the setback.",
        exampleVi: "Cô ấy đã chứng tỏ mình kiên cường một cách đáng nể sau cú ngã.",
        status: FlashcardStatus.KNOWN,
        state: 2,
        due: new Date(Date.now() + 86400_000),
      },
    });
  });

  test.afterAll(async () => {
    if (deckId) {
      await db.flashcard.deleteMany({ where: { deckId } });
      await db.deck.deleteMany({ where: { id: deckId } });
    }
    if (folderId) {
      await db.folder.deleteMany({ where: { id: folderId } });
    }
  });

  test("Desktop (1440x900): Capture Postcard, Collection, Flashcard, Add Card, and Progress", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Home / Postcard & Collection
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".wn-postcard")).toBeVisible();
    await page.screenshot({ path: "scratch/desktop-1440-home.png", fullPage: true });

    // 2. Deck View / Flashcard index card & Add Card
    await page.goto(`/decks/${deckId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".wn-vocabulary-card").first()).toBeVisible();
    await page.screenshot({ path: "scratch/desktop-1440-deck.png", fullPage: true });

    // 3. Open Add Card Modal / Sheet
    const addCardBtn = page.getByRole("button", { name: "Thêm thẻ" });
    if (await addCardBtn.isVisible()) {
      await addCardBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: "scratch/desktop-1440-add-card.png" });
    }

    // 4. Progress Dashboard
    await page.goto("/progress");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "scratch/desktop-1440-progress.png", fullPage: true });
  });

  test("iPhone 15 Pro Max (430x932): Capture Mobile Layouts", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });

    // 1. Mobile Home / Postcard
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".wn-postcard")).toBeVisible();
    await page.screenshot({ path: "scratch/mobile-430-home.png", fullPage: true });

    // 2. Mobile Deck View
    await page.goto(`/decks/${deckId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "scratch/mobile-430-deck.png", fullPage: true });

    // 3. Mobile Add Card
    const addCardBtn = page.getByRole("button", { name: "Thêm thẻ" });
    if (await addCardBtn.isVisible()) {
      await addCardBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: "scratch/mobile-430-add-card.png" });
    }

    // 4. Mobile Progress Dashboard
    await page.goto("/progress");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "scratch/mobile-430-progress.png", fullPage: true });
  });
});
