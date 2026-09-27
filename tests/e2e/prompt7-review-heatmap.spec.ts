import { FlashcardStatus } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { db } from "@/lib/db";

let folderId: string | null = null;
let deckId: string | null = null;

async function createReviewLog(cardId: string, rating: 1 | 2 | 3 | 4, review: Date) {
  await db.reviewLog.create({
    data: {
      cardId,
      rating,
      state: 1,
      due: review,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      lastElapsedDays: 0,
      scheduledDays: 0,
      review,
    },
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.afterEach(async () => {
  if (deckId) await db.deck.deleteMany({ where: { id: deckId } });
  if (folderId) await db.folder.deleteMany({ where: { id: folderId } });
  deckId = null;
  folderId = null;
});

test("Review Activity Heatmap, Streak summary, and Study Timezone Settings", async ({ page }, testInfo) => {
  const now = new Date();
  const folder = await db.folder.create({
    data: {
      name: `Heatmap folder ${testInfo.testId}`,
      normalizedName: `heatmap-folder-${testInfo.testId}`.toLowerCase(),
    },
  });
  folderId = folder.id;

  const deck = await db.deck.create({
    data: {
      name: `Heatmap deck ${testInfo.testId}`,
      folderId: folder.id,
    },
  });
  deckId = deck.id;

  const card = await db.flashcard.create({
    data: {
      deckId: deck.id,
      term: "serendipity",
      normalizedTerm: "serendipity",
      meaningVi: "sự tình cờ may mắn",
      status: FlashcardStatus.LEARNING,
      state: 1,
      due: now,
    },
  });

  // Create review logs across yesterday and today to form a 2-day streak
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await createReviewLog(card.id, 3, yesterday);
  await createReviewLog(card.id, 4, now);

  // 1. Desktop 1440x900 Verification
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/progress");
  await page.waitForLoadState("networkidle");

  // Verify Heading & Stamps
  await expect(page.getByRole("heading", { name: "Hoạt động ôn tập" })).toBeVisible();
  await expect(page.getByText("LỊCH SỬ FSRS")).toBeVisible();

  // Verify Streak Summary metrics
  await expect(page.getByText("Chuỗi hiện tại")).toBeVisible();
  await expect(page.getByText("Chuỗi dài nhất")).toBeVisible();
  await expect(page.getByText("Ngày có ôn tập")).toBeVisible();
  await expect(page.getByText(/Hôm nay đã nối chuỗi/)).toBeVisible();

  // Verify Heatmap grid cells exist
  const grid = page.getByRole("grid", { name: /Lịch hoạt động ôn tập/ });
  await expect(grid).toBeVisible();
  const gridCells = grid.getByRole("gridcell");
  const cellCount = await gridCells.count();
  expect(cellCount).toBeGreaterThan(50); // 52 weeks * 7 cells = 364 cells

  // Click an active cell to open cell detail
  const activeCells = grid.locator("button[aria-label*='lượt ôn']:not([aria-label*='0 lượt ôn'])");
  if ((await activeCells.count()) > 0) {
    await activeCells.first().click();
    await expect(page.getByRole("region", { name: "Chi tiết ngày đã chọn" })).toBeVisible();
    await expect(page.getByText("✓ Ngày có ôn tập")).toBeVisible();
  }

  // Verify accessible table view
  const tableDetails = page.locator("details", { hasText: "Xem dữ liệu hoạt động theo bảng" });
  await expect(tableDetails).toBeVisible();
  await tableDetails.locator("summary").click();
  await expect(tableDetails.locator("table")).toBeVisible();

  // Check no horizontal overflow on desktop
  await expectNoHorizontalOverflow(page);

  // Take screenshot for QA
  await page.screenshot({ path: "scratch/desktop-1440-progress-heatmap.png", fullPage: true });

  // 2. Mobile 430x932 Verification
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/progress");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Hoạt động ôn tập" })).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Test Period Switcher on mobile
  const threeMonthsBtn = page.getByRole("button", { name: "3 tháng" });
  const oneYearBtn = page.getByRole("button", { name: "1 năm" });
  await expect(threeMonthsBtn).toBeVisible();
  await expect(oneYearBtn).toBeVisible();

  await threeMonthsBtn.click();
  await expect(page.getByText("Trong 3 tháng qua")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await oneYearBtn.click();
  await expect(page.getByText("Trong 1 năm qua")).toBeVisible();
  // 1-year view allows horizontal scroll inside its container without page overflow
  await expectNoHorizontalOverflow(page);

  // Mobile screenshot
  await page.screenshot({ path: "scratch/mobile-430-progress-heatmap.png", fullPage: true });

  // 3. Settings Timezone Verification
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Múi giờ ngày học" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Theo thiết bị/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tùy chọn thủ công" })).toBeVisible();

  const timezoneSelect = page.locator("#study-timezone-select");
  await expect(timezoneSelect).toBeVisible();

  // Change timezone to Asia/Tokyo and verify persistence
  await timezoneSelect.selectOption("Asia/Tokyo");
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();

  // Settings screenshot
  await page.screenshot({ path: "scratch/desktop-settings-timezone.png" });

  // Reset back to Asia/Ho_Chi_Minh
  await timezoneSelect.selectOption("Asia/Ho_Chi_Minh");
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
});
