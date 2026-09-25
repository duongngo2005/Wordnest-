import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

test.describe("Deck deletion from DeckView page", () => {
  let deckId: string;
  let folderId: string;

  test.beforeEach(async () => {
    const folder = await db.folder.create({
      data: {
        name: `Delete Test Folder ${Date.now()}`,
        normalizedName: `delete-test-folder-${Date.now()}`.toLowerCase(),
      },
    });
    folderId = folder.id;

    const deck = await db.deck.create({
      data: {
        name: `Deck To Delete ${Date.now()}`,
        folderId: folder.id,
      },
    });
    deckId = deck.id;

    // Create 5 flashcards to ensure page has content
    for (let i = 1; i <= 5; i++) {
      await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: `word-${i}`,
          normalizedTerm: `word-${i}`,
          meaningVi: `nghĩa-${i}`,
        },
      });
    }
  });

  test.afterEach(async () => {
    if (deckId) {
      await db.flashcard.deleteMany({ where: { deckId } }).catch(() => null);
      await db.deck.deleteMany({ where: { id: deckId } }).catch(() => null);
    }
    if (folderId) {
      await db.folder.deleteMany({ where: { id: folderId } }).catch(() => null);
    }
  });

  test("opens centered confirmation modal when clicking Xóa bộ từ and cancels properly", async ({ page }) => {
    await page.goto(`/decks/${deckId}`);
    await page.waitForLoadState("networkidle");

    // Click kebab menu in header
    const menuBtn = page.getByLabel("Thêm tùy chọn");
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Click "Xóa bộ từ"
    const deleteBtn = page.getByRole("button", { name: "Xóa bộ từ" });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // The modal alertdialog MUST be visible immediately in viewport
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Xóa bộ từ");

    // Click Hủy bỏ to dismiss
    const cancelBtn = dialog.getByRole("button", { name: "Hủy bỏ" });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Dialog should be dismissed
    await expect(dialog).not.toBeVisible();
  });

  test("confirms deletion, redirects to home, shows success toast, and deletes deck from database", async ({ page }) => {
    await page.goto(`/decks/${deckId}`);
    await page.waitForLoadState("networkidle");

    // Click kebab menu
    const menuBtn = page.getByLabel("Thêm tùy chọn");
    await menuBtn.click();

    // Click "Xóa bộ từ"
    const deleteBtn = page.getByRole("button", { name: "Xóa bộ từ" });
    await deleteBtn.click();

    // The modal alertdialog is visible
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Click confirm "Xóa bộ từ" inside the dialog
    const confirmDeleteBtn = dialog.getByRole("button", { name: "Xóa bộ từ" });
    await confirmDeleteBtn.click();

    // Should redirect to "/"
    await page.waitForURL((url) => url.pathname === "/", { timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/");

    // Toast success notification should appear
    await expect(page.getByText(/Đã xóa bộ từ/)).toBeVisible();

    // Verify deck is deleted from database
    const deckInDb = await db.deck.findUnique({ where: { id: deckId } });
    expect(deckInDb).toBeNull();

    // Cards should also be deleted via cascade
    const cardsInDb = await db.flashcard.findMany({ where: { deckId } });
    expect(cardsInDb).toHaveLength(0);

    deckId = "";
  });
});
