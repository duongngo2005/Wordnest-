import { expect, test } from "@playwright/test";

test.describe("settings page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("lets learners save a pronunciation speed on mobile", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible();
    const voiceSelector = page.getByLabel("Chọn giọng");
    await expect(voiceSelector).toBeVisible();
    await expect(voiceSelector).toContainText("WordNest · Mỹ");
    await expect(voiceSelector).toContainText("WordNest · Anh");
    await expect(voiceSelector).toContainText("WordNest · Úc");
    await expect(voiceSelector).toContainText("WordNest · Ấn");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiến độ" })).toBeVisible();

    const fasterRate = page.getByRole("radio", { name: "Nhanh 1.15×" });
    await fasterRate.click();

    await expect(fasterRate).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.speech-preferences.v1")))
      .toContain('"rate":1.15');
  });
});
