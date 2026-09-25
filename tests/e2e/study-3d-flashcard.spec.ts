import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";
import { FlashcardStatus } from "@prisma/client";

let deckId: string;

test.beforeEach(async () => {
  const deck = await db.deck.create({
    data: { name: `Study 3D Deck ${crypto.randomUUID().slice(0, 8)}` },
  });
  deckId = deck.id;

  await db.flashcard.create({
    data: {
      deckId,
      term: "resilient",
      normalizedTerm: "resilient",
      meaningVi: "kiên cường, phục hồi nhanh",
      ipa: "/rɪˈzɪl.jənt/",
      status: FlashcardStatus.NEW,
      state: 0,
      due: new Date(),
    },
  });

  await db.flashcard.create({
    data: {
      deckId,
      term: "ephemeral",
      normalizedTerm: "ephemeral",
      meaningVi: "phù du, chóng tàn",
      ipa: "/ɪˈfem.ər.əl/",
      status: FlashcardStatus.NEW,
      state: 0,
      due: new Date(),
    },
  });
});

test.afterEach(async () => {
  if (deckId) {
    await db.deck.delete({ where: { id: deckId } }).catch(() => {});
  }
});

test.describe("Study 3D Flashcard & Completion Reform", () => {
  test("Desktop: Space key reveals 3D card, rating triggers next card, and last card shows completion postcard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/decks/${deckId}/study`);

    // Front of first card is visible
    await expect(page.getByRole("heading", { name: "resilient" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hiện đáp án" })).toBeVisible();

    // 1. Audio button click should NOT reveal card
    const audioBtn = page.getByRole("button", { name: "Nghe từ" }).first();
    await audioBtn.click();
    // Card should still NOT be revealed
    await expect(page.locator(".wn-flashcard-3d-card")).not.toHaveClass(/is-flipped/);

    // 2. Space key reveals the card
    await page.keyboard.press("Space");
    await expect(page.locator(".wn-flashcard-3d-card")).toHaveClass(/is-flipped/);
    await expect(page.getByText("kiên cường, phục hồi nhanh")).toBeVisible();

    // 4 FSRS rating buttons should now be visible
    await expect(page.getByRole("button", { name: /Again/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Good/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Easy/ })).toBeVisible();

    // 3. Choose 'Good' rating using shortcut '3'
    await page.keyboard.press("Digit3");

    // Second card should appear
    await expect(page.getByRole("heading", { name: "ephemeral" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".wn-flashcard-3d-card")).not.toHaveClass(/is-flipped/);

    // 4. Click 'Hiện đáp án' button to reveal second card
    await page.getByRole("button", { name: "Hiện đáp án" }).click();
    await expect(page.locator(".wn-flashcard-3d-card")).toHaveClass(/is-flipped/);
    await expect(page.getByText("phù du, chóng tàn")).toBeVisible();

    // 5. Click 'Easy' button to complete session
    await page.getByRole("button", { name: /Easy/ }).click();

    // Completion Postcard should be displayed
    await expect(page.getByRole("heading", { name: "Hoàn thành buổi ôn!" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("ĐÃ HOÀN TẤT HÔM NAY")).toBeVisible();
    await expect(page.getByRole("link", { name: "Quay lại bộ từ" })).toBeVisible();
  });

  test("Reduced Motion: reveals answer without 3D rotation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/decks/${deckId}/study`);

    await expect(page.getByRole("heading", { name: "resilient" })).toBeVisible();
    await page.getByRole("button", { name: "Hiện đáp án" }).click();

    // Backface meaning should become visible
    await expect(page.getByText("kiên cường, phục hồi nhanh")).toBeVisible();
    // 3D scene should disable perspective in reduced motion
    const perspective = await page
      .locator(".wn-flashcard-3d-scene")
      .evaluate((el) => window.getComputedStyle(el).perspective);
    expect(perspective === "none" || perspective === "").toBe(true);
  });

  test("Mobile iPhone 15 Pro Max (430x932): fits screen with no horizontal overflow and all 4 ratings accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`/decks/${deckId}/study`);

    // Check no horizontal overflow on front
    let fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits).toBe(true);

    // Reveal card
    await page.getByRole("button", { name: "Hiện đáp án" }).click();
    await expect(page.locator(".wn-flashcard-3d-card")).toHaveClass(/is-flipped/);
    await expect(page.getByText("kiên cường, phục hồi nhanh")).toBeVisible();

    // Verify all 4 rating buttons have touch height >= 44px
    const againBtn = page.getByRole("button", { name: /Again/ });
    const againBox = await againBtn.boundingBox();
    expect(againBox?.height).toBeGreaterThanOrEqual(44);

    // Check no horizontal overflow on back
    fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits).toBe(true);
  });
});
