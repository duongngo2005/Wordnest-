import { expect, test } from "@playwright/test";

test.describe("Interaction Foundation — Sound, Motion, Toast & Mobile", () => {
  test("iPhone 15 Pro Max (430x932): Settings UI Sound toggle persists and fits screen without horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/settings");

    // Check heading and SoundSettingsPanel
    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Âm thanh giao diện" })).toBeVisible();

    // Sound toggle buttons
    const turnOnBtn = page.getByRole("button", { name: "Bật" });
    const turnOffBtn = page.getByRole("button", { name: "Tắt" });
    await expect(turnOnBtn).toBeVisible();
    await expect(turnOffBtn).toBeVisible();

    // Turn off sound
    await turnOffBtn.click();
    await expect(turnOffBtn).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const val = window.localStorage.getItem("wordnest.ui-sound.v1");
          return val ? JSON.parse(val).enabled : null;
        })
      )
      .toBe(false);

    // Turn on sound
    await turnOnBtn.click();
    await expect(turnOnBtn).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const val = window.localStorage.getItem("wordnest.ui-sound.v1");
          return val ? JSON.parse(val).enabled : null;
        })
      )
      .toBe(true);

    // Test preview buttons do not crash UI
    await page.getByRole("button", { name: "Chạm nhẹ" }).click();
    await page.getByRole("button", { name: "Lật giấy" }).click();
    await page.getByRole("button", { name: "Thành công" }).click();

    // Verify touch target min-height >= 44px on primary toggle
    const toggleBox = await turnOnBtn.boundingBox();
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    // Verify no horizontal overflow on 430px iPhone 15 Pro Max
    const fitsWidth = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fitsWidth).toBe(true);
  });

  test("Desktop (1440x900): TodayPostcard renders tactile CTA and respects reduced-motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Verify TodayPostcard exists
    const postcard = page.locator(".wn-postcard");
    await expect(postcard).toBeVisible();

    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Move mouse over postcard
    const box = await postcard.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
    }

    // In reduced motion, transform should not apply tilt
    const transform = await postcard.evaluate((el) => window.getComputedStyle(el).transform);
    expect(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  });

  test("Sonner toast is mounted with WordNest styling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");

    // Trigger a toast via Turn off sound
    await page.getByRole("button", { name: "Tắt" }).click();

    // Sonner toaster container must be present in DOM
    const toaster = page.locator("[data-sonner-toaster]");
    await expect(toaster).toBeAttached();

    // Toast element should appear with message
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-sonner-toast]")).toContainText("Đã tắt âm thanh giao diện.");
  });
});
