import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("opens the story creator and translates target deck words without an AI request", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Historical story ${testInfo.testId.slice(-8)}`,
      cards: { create: { term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } },
    },
  });
  deckId = deck.id;

  await db.story.create({
    data: {
      deckId: deck.id,
      title: "An Apple on the Trail",
      content: "Maya packed an apple before a difficult hike.",
      cefr: "B1",
      length: "short",
      topic: "Travel",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["apple"],
        usage: [{ term: "apple", usedAs: "apple" }],
        contextualTranslations: [{ term: "apple", usedAs: "apple", meaningVi: "quả táo" }],
        selectionTranslations: [],
      },
    },
  });

  await page.goto(`/decks/${deck.id}/story`);

  await expect(page.getByRole("heading", { name: "An Apple on the Trail" })).toBeVisible();
  await expect(page.getByText("Maya packed an apple before a difficult hike.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo truyện" })).toBeVisible();

  await page.getByRole("button", { name: "Xem nghĩa của apple" }).click();
  await expect(page.getByLabel("Nghĩa từ trong truyện")).toContainText("quả táo");

  await page.getByRole("button", { name: "Tạo truyện", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Tạo truyện từ deck" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Tạo bằng WordNest AI/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Prompt → JSON/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /apple.*quả táo/i })).toBeVisible();
  await dialog.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: /apple.*quả táo/i })).toBeChecked();
  await dialog.getByRole("button", { name: "Bỏ chọn tất cả" }).click();
  await expect(dialog.getByRole("checkbox", { name: /apple.*quả táo/i })).not.toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Ngắn" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "CEFR B1" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Daily Life" })).toBeVisible();
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByText("Tự thay đổi theo số từ bạn chọn, không khóa số từ cố định.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Tạo truyện" })).toBeFocused();
});

test("builds a portable custom-topic prompt and saves a fenced external JSON story", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `External story ${testInfo.testId.slice(-8)}`,
      cards: { create: { term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" } },
    },
  });
  deckId = deck.id;

  const requestOptions = {
    deckId: deck.id,
    targetWords: ["allocate"],
    cefr: "C1",
    length: "long",
    topic: "A first day on an engineering team",
  };
  const promptResponse = await page.request.post("/api/stories/prompt", { data: requestOptions });
  expect(promptResponse.status()).toBe(200);
  const promptData = await promptResponse.json();
  expect(promptData.prompt).toContain('["allocate"]');
  expect(promptData.prompt).toContain("CEFR C1");
  expect(promptData.prompt).toContain("A first day on an engineering team");
  expect(promptData.prompt).toContain("Return ONLY one valid JSON object");

  const externalJson = {
    title: "A Careful Allocation",
    content: "Mai learned to allocate the team's time with care.",
    usage: [{ term: "allocate", usedAs: "allocate" }],
    contextualTranslations: [{ term: "allocate", usedAs: "allocate", meaningVi: "phân bổ" }],
  };
  const storyResponse = await page.request.post("/api/stories", {
    data: { ...requestOptions, rawStory: `\`\`\`json\n${JSON.stringify(externalJson)}\n\`\`\`` },
  });
  expect(storyResponse.status()).toBe(201);
  const storyData = await storyResponse.json();
  expect(storyData.story).toMatchObject({
    title: "A Careful Allocation",
    topic: "A first day on an engineering team",
    cefr: "C1",
    length: "long",
  });
  await expect.poll(() => db.story.count({ where: { deckId: deck.id } })).toBe(1);
});

test("reveals the one-tap prompt copy subform only after story options are complete", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  const deck = await db.deck.create({
    data: {
      name: `Prompt form ${testInfo.testId.slice(-8)}`,
      cards: { create: { term: "debug", normalizedTerm: "debug", meaningVi: "gỡ lỗi" } },
    },
  });
  deckId = deck.id;

  await page.goto(`/decks/${deck.id}/story`);
  await page.getByRole("button", { name: "Tạo truyện", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Prompt → JSON/ }).click();
  await expect(dialog.getByText("Chọn ít nhất một từ và chủ đề để mở prompt.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tạo prompt" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Tạo prompt" })).toBeVisible();
  await page.route("**/api/stories/prompt", async (route) => {
    await route.fulfill({ json: { prompt: '{"title":"A debugging day"}' } });
  });
  await dialog.getByRole("button", { name: "Tạo prompt" }).click();

  await expect(dialog.getByRole("button", { name: "Sao chép prompt" })).toBeVisible();
  await dialog.getByRole("button", { name: "Sao chép prompt" }).click();
  await expect(dialog.getByText("Đã sao chép prompt.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "JSON AI trả về" })).toBeVisible();
});

test("requires a named confirmation before permanently deleting the active story", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Delete story ${testInfo.testId.slice(-8)}`,
      cards: { create: { term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } },
    },
  });
  deckId = deck.id;
  const story = await db.story.create({
    data: {
      deckId: deck.id,
      title: "The Story to Remove",
      content: "Mai packed an apple for the journey.",
      cefr: "A2",
      length: "short",
      topic: "Travel",
      targetWords: ["apple"],
    },
  });

  await page.goto(`/decks/${deck.id}/story`);
  await page.getByLabel("Tùy chọn truyện").click();
  await page.getByRole("button", { name: "Xóa truyện" }).click();
  await expect(page.getByRole("heading", { name: "Xóa truyện này?" })).toBeVisible();
  await expect(page.locator("article").getByRole("heading", { name: "Xóa truyện này?" })).toBeVisible();
  await expect(page.getByText("The Story to Remove", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xóa “The Story to Remove”" }).click();

  await expect(page.getByRole("heading", { name: "Chưa có truyện nào" })).toBeVisible();
  await expect(page.getByText("Đã xóa “The Story to Remove”.")).toBeVisible();
  await expect.poll(() => db.story.findUnique({ where: { id: story.id } })).toBeNull();
});
