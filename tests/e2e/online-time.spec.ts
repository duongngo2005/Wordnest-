import { expect, test, type Page } from "@playwright/test";
import { db } from "@/lib/db";
import { DEFAULT_STUDY_TIMEZONE, getTodayDateKey, offsetDateKey } from "@/lib/study-timezone";

let originalActivity: Array<{ date: string; activeSeconds: number }> = [];
let activityDates: string[] = [];

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async () => {
  const today = getTodayDateKey(DEFAULT_STUDY_TIMEZONE);
  const yesterday = offsetDateKey(today, -1);
  activityDates = [yesterday, today];
  originalActivity = await db.dailyOnlineActivity.findMany({
    where: { date: { in: activityDates } },
    select: { date: true, activeSeconds: true },
  });

  await db.dailyOnlineActivity.deleteMany({ where: { date: { in: activityDates } } });
  await db.dailyOnlineActivity.createMany({
    data: [
      { date: yesterday, activeSeconds: 5_700 },
      { date: today, activeSeconds: 1_500 },
    ],
  });
});

test.afterEach(async () => {
  await db.dailyOnlineActivity.deleteMany({ where: { date: { in: activityDates } } });
  if (originalActivity.length > 0) {
    await db.dailyOnlineActivity.createMany({ data: originalActivity });
  }
  originalActivity = [];
  activityDates = [];
});

test("shows one responsive usage chart and reveals only the selected day", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/progress");

  const panel = page.getByTestId("online-time-panel");
  await expect(panel.getByRole("heading", { name: "Thời gian sử dụng" })).toBeVisible();
  await expect(panel.getByText("Hôm nay", { exact: true })).toBeVisible();
  await expect(panel.getByText("Tổng 14 ngày", { exact: true })).toBeVisible();
  await expect(panel.getByText("Ngày hoạt động", { exact: true })).toBeVisible();
  await expect(panel.locator("button[data-testid^='online-time-day-']")).toHaveCount(14);
  await expect(panel.getByText("Xem thời lượng theo ngày", { exact: true })).toHaveCount(0);

  const yesterday = panel.getByTestId(`online-time-day-${activityDates[0]}`);
  await yesterday.focus();
  await page.keyboard.press("Enter");
  await expect(yesterday).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText("1 giờ 35 phút", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/progress");
  await expect(panel.getByRole("heading", { name: "Thời gian sử dụng" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
