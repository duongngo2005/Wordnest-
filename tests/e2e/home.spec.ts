import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("prioritizes the daily learning choice and keeps one clear manual-add entry", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Hôm nay bạn muốn học gì?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Xem bộ từ" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Thêm từ", exact: true })).toHaveCount(0);
    await expect(page.getByText("Thêm từ mới", { exact: true })).toHaveCount(1);
    await page.locator("#add-vocabulary").getByRole("button", { name: "Thêm từ mới", exact: true }).click();
    await expect(page.getByLabel("Word *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu flashcard" })).toBeDisabled();
  });

  test("keeps JSON import in More and explains retired import workflows safely", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Thêm tùy chọn" }).click();
    await page.getByRole("link", { name: "Nhập JSON" }).click();
    await expect(page).toHaveURL(/\/import$/);
    await expect(page.getByRole("heading", { name: "Nhập JSON" })).toBeVisible();
    await expect(page.getByText("Nhập PDF, DOCX, TXT và CSV đã được ngừng hỗ trợ.")).toBeVisible();
  });
});
