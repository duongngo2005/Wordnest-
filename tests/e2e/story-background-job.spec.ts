import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

test.describe("Story Generation Background Job E2E", () => {
  test.setTimeout(360_000); // 6 minutes safety ceiling for long 62-term C1 story pipeline

  let deckId: string | null = null;

  test.beforeEach(async () => {
    // Clean up any stale or previous jobs
    await db.aiJob.deleteMany().catch(() => {});
  });

  test.afterEach(async () => {
    if (deckId) {
      // Clean up test deck and created stories
      await db.story.deleteMany({ where: { deckId } }).catch(() => {});
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  test("creates a 62-word C1 Long story as a background job, closes modal, tracks progress, and opens via toast CTA", async ({
    page,
  }, testInfo) => {
    // 1. Get or create deck with 62 words
    const existingDeck = await db.deck.findFirst({
      where: { name: { contains: "General Bussiness" } },
      include: { cards: true },
    });

    let deck = existingDeck;
    if (!deck || deck.cards.length < 62) {
      // Create a test deck with 62 terms
      const sampleTerms = Array.from({ length: 62 }, (_, i) => ({
        term: `business_term_${i + 1}`,
        normalizedTerm: `business_term_${i + 1}`,
        meaningVi: `nghĩa tiếng việt ${i + 1}`,
      }));
      deck = await db.deck.create({
        data: {
          name: `Test Deck 62 Words ${testInfo.testId.slice(-6)}`,
          cards: { create: sampleTerms },
        },
        include: { cards: true },
      });
      deckId = deck.id;
    }

    const testDeckId = deck.id;
    console.log(`[E2E] Step 1: Using deck ${deck.name} (${testDeckId}) with ${deck.cards.length} cards`);

    // 2. Navigate to Deck Story page with AI creation mode
    console.log(`[E2E] Step 2: Navigating to /decks/${testDeckId}/story?create=ai`);
    await page.goto(`/decks/${testDeckId}/story?create=ai`);

    // 3. Verify dialog is open in AI mode
    console.log(`[E2E] Step 3: Waiting for dialog`);
    const dialog = page.getByRole("dialog", { name: "Tạo truyện từ deck" });
    await expect(dialog).toBeVisible();

    // 4. Select all 62 words
    console.log(`[E2E] Step 4: Clicking 'Chọn tất cả'`);
    await dialog.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
    await expect(dialog.getByText("62/62", { exact: true })).toBeVisible();

    // 5. Select CEFR C1
    console.log(`[E2E] Step 5: Clicking CEFR C1 pill`);
    await dialog.getByRole("radio", { name: "CEFR C1" }).check({ force: true });

    // 6. Select Length Long ("Dài (Long)")
    console.log(`[E2E] Step 6: Clicking Length Long pill`);
    await dialog.getByRole("radio", { name: "Dài (Long)" }).check({ force: true });

    // 7. Click "Tạo truyện bằng AI"
    console.log(`[E2E] Step 7: Clicking 'Tạo truyện bằng AI'`);
    const submitBtn = dialog.getByRole("button", { name: "Tạo truyện bằng AI" });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 8. Verify confirmation in modal that background job has started
    console.log(`[E2E] Step 8: Waiting for background job started banner in modal`);
    await expect(dialog.getByText("Đã bắt đầu tạo truyện trên nền")).toBeVisible({ timeout: 15_000 });

    // 9. Close modal to continue using the app
    console.log(`[E2E] Step 9: Clicking 'Ẩn và tiếp tục học' to close modal`);
    const hideBtn = dialog.getByRole("button", { name: "Ẩn và tiếp tục học" });
    await hideBtn.click();
    await expect(dialog).toBeHidden();

    // 10. User continues using the app - navigate to deck flashcards or view cards
    console.log(`[E2E] Step 10: Navigating to deck page /decks/${testDeckId} while job runs in background`);
    await page.goto(`/decks/${testDeckId}`);
    await expect(page.getByRole("heading", { name: deck.name })).toBeVisible();

    // 11. Verify AI indicator appears in the header with running state
    console.log(`[E2E] Step 11: Checking AI indicator button in header`);
    const aiIndicator = page.getByRole("button", { name: "Tác vụ AI" });
    await expect(aiIndicator).toBeVisible({ timeout: 10_000 });

    // Open indicator to inspect stage & progress
    console.log(`[E2E] Step 11b: Opening AI indicator popover`);
    await aiIndicator.click();
    const taskDialog = page.getByRole("dialog", { name: "Danh sách tác vụ AI" });
    await expect(taskDialog).toBeVisible();
    await expect(taskDialog.getByText(/Truyện C1 · 62 từ/).first()).toBeVisible();

    // Close indicator popover
    await page.keyboard.press("Escape");

    // 12. Wait for completion toast with action CTA: "✨ Truyện của bạn đã sẵn sàng"
    console.log(`[E2E] Step 12: Waiting for completion toast (Ollama generation running on GPU)...`);
    const toastElem = page.locator("[data-sonner-toast]").filter({ hasText: "Truyện của bạn đã sẵn sàng" }).first();
    await expect(toastElem).toBeVisible({ timeout: 330_000 });

    // Verify toast description contains words and CEFR
    await expect(toastElem).toContainText("62 từ");
    await expect(toastElem).toContainText("C1");

    // 13. Click the CTA button "Xem truyện" inside toast
    console.log(`[E2E] Step 13: Clicking CTA button 'Xem truyện' in toast`);
    const viewStoryCta = toastElem.getByRole("button", { name: "Xem truyện" });
    await expect(viewStoryCta).toBeVisible();
    await viewStoryCta.click();

    // 14. Verify navigation to the new Story page
    console.log(`[E2E] Step 14: Verifying navigation to story page`);
    await expect(page).toHaveURL(new RegExp(`/decks/${testDeckId}/story\\?storyId=`));

    // Verify story content is visible on page
    await expect(page.getByLabel("Tùy chọn truyện")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Verify story exists in database
    const url = new URL(page.url());
    const storyId = url.searchParams.get("storyId");
    expect(storyId).toBeTruthy();

    const savedStory = await db.story.findUnique({ where: { id: storyId! } });
    expect(savedStory).not.toBeNull();
    expect(savedStory?.cefr).toBe("C1");
    expect(savedStory?.length).toBe("long");
    expect(savedStory?.content.length).toBeGreaterThan(100);
    console.log(`[E2E] PASSED! Created story "${savedStory?.title}" (ID: ${savedStory?.id}) with ${savedStory?.content.split(/\s+/).length} words.`);
  });
});
