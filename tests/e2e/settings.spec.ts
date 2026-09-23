import { expect, test } from "@playwright/test";

test.describe("settings page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("lets learners save a pronunciation speed on mobile", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible();
    await expect(page.getByLabel("Chọn giọng")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm tùy chọn" })).toBeVisible();

    const fasterRate = page.getByRole("radio", { name: "Nhanh 1.15×" });
    await fasterRate.click();

    await expect(fasterRate).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.speech-preferences.v1")))
      .toContain('"rate":1.15');
  });
});
