import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("keeps core learning screens reachable across narrow and wide viewports", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Responsive core ${testInfo.testId.slice(-8)}`,
      cards: {
        create: {
          term: "supercalifragilisticexpialidocioussupercalifragilisticexpialidocious",
          normalizedTerm: "supercalifragilisticexpialidocioussupercalifragilisticexpialidocious",
          meaningVi: "một nghĩa tiếng Việt dài để kiểm tra việc xuống dòng và thao tác trên màn hình nhỏ",
        },
      },
    },
  });
  deckId = deck.id;

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 860 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Thư viện" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(`/decks/${deck.id}`);
    await expect(page.getByRole("link", { name: "Ôn tập" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm thẻ" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(`/decks/${deck.id}/study`);
    await expect(page.getByRole("button", { name: "Hiện đáp án" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);
    await expect(page.getByLabel("Nhập từ hoặc cụm từ tiếng Anh tương ứng:")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
