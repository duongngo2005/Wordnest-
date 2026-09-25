import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

async function seedStory(testId: string) {
  const deck = await db.deck.create({
    data: {
      name: `Reader interaction ${testId.slice(-8)}`,
      cards: {
        create: [
          { term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ", ipa: "/ˈæl.ə.keɪt/", partOfSpeech: "verb" },
          { term: "strategy", normalizedTerm: "strategy", meaningVi: "chiến lược", ipa: "/ˈstræt̬.ə.dʒi/", partOfSpeech: "noun" },
        ],
      },
    },
  });
  deckId = deck.id;
  await db.story.create({
    data: {
      deckId: deck.id,
      title: "A Careful Plan",
      content: "Mai allocated the morning to a careful strategy.\n\nThe strategy helped her allocate the remaining time calmly.",
      cefr: "B1",
      length: "short",
      topic: "Daily Life",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["allocate", "strategy"],
        usage: [
          { term: "allocate", usedAs: "allocated" },
          { term: "strategy", usedAs: "strategy" },
        ],
        contextualTranslations: [
          { term: "allocate", usedAs: "allocated", meaningVi: "đã phân bổ" },
          { term: "strategy", usedAs: "strategy", meaningVi: "chiến lược" },
        ],
        selectionTranslations: [],
      },
    },
  });
  return deck;
}

test("opens a compact desktop vocabulary note, navigates the trail, and toggles reading mode", async ({ page }, testInfo) => {
  const deck = await seedStory(testInfo.testId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/decks/${deck.id}/story`);

  const allocatedTarget = page.getByRole("button", { name: /Xem nghĩa của allocated/i });
  await allocatedTarget.focus();
  await page.keyboard.press("Enter");
  const note = page.getByLabel("Nghĩa từ trong truyện");
  await expect(note).toContainText("allocated");
  await expect(note).toContainText("Dạng của: allocate");
  await expect(note).toContainText("đã phân bổ");
  await expect(note.getByRole("button", { name: "Phát âm" })).toBeVisible();
  await note.getByRole("button", { name: "Đóng bảng nghĩa" }).click();
  await expect(note).toBeHidden();
  await expect(allocatedTarget).toBeFocused();

  await page.getByRole("button", { name: /Từ trong bài/i }).click();
  const trail = page.getByRole("dialog", { name: "Từ trong bài" });
  await expect(trail).toContainText("allocated");
  await trail.getByRole("button", { name: /strategy/i }).click();
  await expect(note).toContainText("chiến lược");
  await expect(page.locator('[data-story-target-index="1"]').first()).toHaveAttribute("aria-pressed", "true");

  await note.getByRole("button", { name: "Đóng bảng nghĩa" }).click();
  await page.getByRole("button", { name: "Chế độ đọc" }).click();
  await expect(page.getByText("Chế độ đọc", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thoát chế độ đọc" })).toBeVisible();
  await page.getByRole("button", { name: "Thoát chế độ đọc" }).click();
  await expect(page.getByRole("button", { name: "Chế độ đọc" })).toBeVisible();
});

test.describe("mobile Story Reader", () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

test("uses a native mobile vocabulary sheet and leaves no click-intercepting overlay after close", async ({ page }, testInfo) => {
  const deck = await seedStory(testInfo.testId);
  await page.goto(`/decks/${deck.id}/story`);

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Xem nghĩa của allocated/i }).tap();
  const sheet = page.getByRole("dialog", { name: "Nghĩa từ trong truyện" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Dạng của: allocate");
  await expect(sheet.getByRole("button", { name: "Phát âm" })).toBeVisible();
  const dragArea = sheet.locator(".wn-vocab-sheet__drag-area");
  await dragArea.dispatchEvent("pointerdown", { pointerId: 1, clientY: 560 });
  await dragArea.dispatchEvent("pointermove", { pointerId: 1, clientY: 680 });
  await dragArea.dispatchEvent("pointerup", { pointerId: 1, clientY: 680 });
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);

  await page.getByRole("button", { name: /Xem nghĩa của allocated/i }).tap();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Đóng bảng nghĩa" }).tap();
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);

  await page.getByRole("button", { name: "Chế độ đọc" }).tap();
  await expect(page.getByRole("button", { name: "Thoát chế độ đọc" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
});
