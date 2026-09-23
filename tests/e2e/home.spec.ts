import { expect, test } from "@playwright/test";

test("home is a library with deck and collection creation, not a standalone card form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Thư viện" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bộ từ", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bộ sưu tập", exact: true })).toBeVisible();
  await expect(page.getByText("Hôm nay bạn muốn học gì?")).toHaveCount(0);
  await expect(page.getByText("Thêm từ mới", { exact: true })).toHaveCount(0);
});

test("global navigation exposes library and progress but not JSON import", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Thư viện" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tiến độ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nhập JSON" })).toHaveCount(0);
});
