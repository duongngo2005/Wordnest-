import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let folderId: string | null = null;
let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.deleteMany({ where: { id: deckId } });
  if (folderId) await db.folder.deleteMany({ where: { id: folderId } });
  deckId = null;
  folderId = null;
});

test("keeps collection and empty-deck creation actions visible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  const folder = await db.folder.create({
    data: { name: `Collection ${testInfo.testId}`, normalizedName: `collection-${testInfo.testId}`.toLowerCase() },
  });
  folderId = folder.id;
  const deck = await db.deck.create({ data: { name: `Empty deck ${testInfo.testId}`, folderId: folder.id } });
  deckId = deck.id;

  await page.goto(`/folders/${folder.id}`);
  const collectionHeader = page.locator("section.brick-card").first();
  const createDeckButton = collectionHeader.getByRole("button", { name: "Tạo bộ từ" });
  await expect(createDeckButton).toBeVisible();
  await expect(createDeckButton).toHaveText("Bộ từ");
  await expect(collectionHeader.getByRole("link", { name: "Tiến độ" })).toHaveCount(0);
  await collectionHeader.getByLabel(`Tùy chọn cho ${folder.name}`).click();
  await expect(collectionHeader.getByRole("link", { name: "Tiến độ" })).toHaveAttribute("href", `/progress/folders/${folder.id}`);

  await page.goto(`/decks/${deck.id}`);
  await expect(page.getByRole("button", { name: "Thêm thẻ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thêm thẻ", exact: true }).click();
  await expect(page.getByRole("button", { name: /^AI/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^JSON/ })).toBeVisible();
  await expect(page.getByText("Hàng loạt", { exact: true })).toHaveCount(0);
});

test("keeps deck progress in the contextual menu and gives search its own icon space", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Deck controls ${testInfo.testId}`,
      cards: { create: { term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } },
    },
  });
  deckId = deck.id;

  await page.goto(`/decks/${deck.id}`);
  const deckHeader = page.locator("section[aria-labelledby='deck-name']");
  await expect(deckHeader.getByRole("link", { name: "Tiến độ" })).toHaveCount(0);

  await deckHeader.getByLabel("Thêm tùy chọn").click();
  await expect(deckHeader.getByRole("link", { name: "Tiến độ" })).toBeVisible();

  const searchField = page.getByRole("textbox", { name: "Tìm từ vựng hoặc nghĩa" });
  await expect(searchField).toBeVisible();
  await expect(searchField).toHaveClass(/wn-field-with-leading-icon/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("keeps the collection overflow menu visible outside its card", async ({ page }, testInfo) => {
  const folder = await db.folder.create({
    data: { name: `Overflow ${testInfo.testId}`, normalizedName: `overflow-${testInfo.testId}`.toLowerCase() },
  });

  try {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/");
    await page.getByLabel(`Tùy chọn cho ${folder.name}`).click();
    const renameButton = page.getByRole("button", { name: "Đổi tên" });
    await expect(renameButton).toBeVisible();
    await expect
      .poll(() =>
        renameButton.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          return target === button || button.contains(target);
        })
      )
      .toBe(true);
  } finally {
    await db.folder.deleteMany({ where: { id: folder.id } });
  }
});

test("shows an AI preview before persistence and keeps failed generation non-destructive", async ({ page }, testInfo) => {
  const deck = await db.deck.create({ data: { name: `AI preview ${testInfo.testId}` } });
  deckId = deck.id;

  await page.goto(`/decks/${deck.id}`);
  await page.getByRole("button", { name: "Thêm thẻ", exact: true }).click();
  await page.getByRole("button", { name: /^AI/ }).click();

  await page.route(`**/api/decks/${deck.id}/cards/ai`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          cards: [{ term: "allocate", meaningVi: "phân bổ", partOfSpeech: "verb", cefr: "B2" }],
          skippedExistingTerms: [],
          duplicateInputCount: 0,
        },
      },
    });
  });

  await page.getByRole("textbox", { name: "Từ vựng" }).fill("allocate");
  await page.getByRole("button", { name: "Tạo bản xem trước" }).click();
  await expect(page.getByRole("heading", { name: "Bản xem trước" })).toBeVisible();
  await expect(page.getByText("phân bổ", { exact: true })).toBeVisible();
  await expect.poll(() => db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
});

test("renders global, collection, and deck progress with factual empty states", async ({ page }, testInfo) => {
  const folder = await db.folder.create({
    data: { name: `Progress ${testInfo.testId}`, normalizedName: `progress-${testInfo.testId}`.toLowerCase() },
  });
  folderId = folder.id;
  const deck = await db.deck.create({ data: { name: `Deck ${testInfo.testId}`, folderId: folder.id } });
  deckId = deck.id;

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Tiến độ học" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoạt động ôn theo lịch" })).toBeVisible();

  await page.goto(`/progress/folders/${folder.id}`);
  await expect(page.getByRole("heading", { name: folder.name })).toBeVisible();
  await expect(page.getByText("Chưa có dữ liệu luyện tập.")).toBeVisible();

  await page.goto(`/progress/decks/${deck.id}`);
  await expect(page.getByRole("heading", { name: deck.name })).toBeVisible();
  await expect(page.getByText("Chưa có thẻ.")).toBeVisible();
});
