import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";
import { FlashcardStatus } from "@prisma/client";

test.describe("Phase 1C: Post-Implementation UX Acceptance & Semantic QA", () => {
  const createdDeckIds: string[] = [];

  test.afterEach(async () => {
    for (const deckId of createdDeckIds) {
      await db.practiceAttempt.deleteMany({ where: { flashcard: { deckId } } }).catch(() => {});
      await db.reviewLog.deleteMany({ where: { card: { deckId } } }).catch(() => {});
      await db.flashcard.deleteMany({ where: { deckId } }).catch(() => {});
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
    createdDeckIds.length = 0;
  });

  test("CASE A: Empty Deck (0 cards) - Hides learning anchors, shows prominent empty Hero CTA", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Empty Deck Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    await page.goto(`/decks/${deck.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(deck.name);

    // Hero shows empty deck state
    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Bắt đầu", { exact: true })).toBeVisible();
    await expect(hero.getByText("Bộ từ chưa có thẻ nào")).toBeVisible();
    await expect(hero.getByRole("button", { name: "Thêm từ đầu tiên" })).toBeVisible();

    // In an empty deck, 3 learning anchors MUST NOT be rendered
    const learningAnchors = page.locator('section[aria-label="Phương pháp học tập chính"]');
    await expect(learningAnchors).toHaveCount(0);

    // Clicking "+ Thêm từ đầu tiên" opens the Add Cards form
    await hero.getByRole("button", { name: "Thêm từ đầu tiên" }).click();
    await expect(page.locator('section[aria-label="Thêm thẻ"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thêm thẻ mới" })).toBeVisible();
  });

  test("CASE B: New Deck with session cap (>20 cards) - Semantic honesty for 20-card session cap", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `New Deck Cap Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // Create 25 new cards (state = 0)
    const cardData = Array.from({ length: 25 }, (_, i) => ({
      deckId: deck.id,
      term: `word_${i + 1}`,
      normalizedTerm: `word_${i + 1}`,
      meaningVi: `nghĩa ${i + 1}`,
      status: FlashcardStatus.NEW,
      state: 0,
    }));
    await db.flashcard.createMany({ data: cardData });

    await page.goto(`/decks/${deck.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(deck.name);

    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Học từ mới")).toBeVisible();

    // Semantic honesty: Tells user there are 25 total, but session will take 20
    await expect(hero.getByText("Còn 25 từ mới chưa học")).toBeVisible();
    await expect(hero.getByText("Mỗi phiên học sẽ nạp 20 từ để não bộ ghi nhớ tối ưu")).toBeVisible();
    const primaryCta = hero.getByRole("link", { name: "Học 20 từ mới tiếp theo" });
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", `/decks/${deck.id}/study`);

    // 3 Learning Anchors are present
    const anchors = page.locator('section[aria-label="Phương pháp học tập chính"]');
    await expect(anchors).toBeVisible();
    await expect(anchors.getByRole("link", { name: /Ôn tập/ })).toBeVisible();
    await expect(anchors.getByRole("link", { name: /Thử thách/ })).toBeVisible();
    await expect(anchors.getByRole("button", { name: /Đọc & Ngữ cảnh/ })).toBeVisible();
  });

  test("CASE C: Due Deck - FSRS Due cards trigger Review recommendation", async ({ page }) => {
    const deck = await db.deck.create({
      data: { name: `Due Deck Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // 3 cards due for review
    const now = Date.now();
    await db.flashcard.createMany({
      data: [
        {
          deckId: deck.id,
          term: "due_card_1",
          normalizedTerm: "due_card_1",
          meaningVi: "thẻ đến hạn 1",
          status: FlashcardStatus.LEARNING,
          state: 1,
          due: new Date(now - 3600000),
        },
        {
          deckId: deck.id,
          term: "due_card_2",
          normalizedTerm: "due_card_2",
          meaningVi: "thẻ đến hạn 2",
          status: FlashcardStatus.LEARNING,
          state: 1,
          due: new Date(now - 7200000),
        },
        {
          deckId: deck.id,
          term: "due_card_3",
          normalizedTerm: "due_card_3",
          meaningVi: "thẻ đến hạn 3",
          status: FlashcardStatus.KNOWN,
          state: 2,
          due: new Date(now - 10000),
        },
      ],
    });

    await page.goto(`/decks/${deck.id}`);

    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Đến hạn ôn tập", { exact: true })).toBeVisible();
    await expect(hero.getByText("3 thẻ đến hạn ôn tập")).toBeVisible();
    const primaryCta = hero.getByRole("link", { name: "Ôn tập ngay (3 thẻ)" });
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", `/decks/${deck.id}/study`);

    // Anchor 1 shows badge "3 đến hạn"
    await expect(page.getByText("3 đến hạn")).toBeVisible();
  });

  test("CASE D: Weak Deck (0 due, weak > 0) - Triggers Focused Practice recommendation & simplified panel", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Weak Deck Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // Create cards with future due date (0 due)
    const cardA = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "fragile",
        normalizedTerm: "fragile",
        meaningVi: "dễ vỡ",
        status: FlashcardStatus.KNOWN,
        state: 2,
        due: new Date(Date.now() + 86400000), // tomorrow
      },
    });
    const cardB = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "robust",
        normalizedTerm: "robust",
        meaningVi: "mạnh mẽ",
        status: FlashcardStatus.KNOWN,
        state: 2,
        due: new Date(Date.now() + 86400000),
      },
    });

    // Create recent practice errors for cardA (NEEDS_PRACTICE)
    await db.practiceAttempt.createMany({
      data: [
        {
          flashcardId: cardA.id,
          sessionId: "ses-1",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "fragil",
          expectedAnswer: "fragile",
          correct: false,
          responseMs: 2500,
        },
        {
          flashcardId: cardA.id,
          sessionId: "ses-2",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "fra",
          expectedAnswer: "fragile",
          correct: false,
          responseMs: 3000,
        },
      ],
    });

    await page.goto(`/decks/${deck.id}`);

    // Hero: Focused Practice
    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Cần củng cố", { exact: true })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Củng cố 1 từ" })).toBeVisible();

    // Simplified "Cần củng cố" panel
    const weakPanel = page.locator('[data-testid="need-practice-section"]');
    await expect(weakPanel).toBeVisible();
    await expect(weakPanel.getByRole("heading", { name: "Cần củng cố" })).toBeVisible();
    await expect(weakPanel.getByTestId("btn-start-focused-practice")).toContainText("Củng cố · Luyện tập trung (1 từ)");
    await expect(weakPanel.getByRole("link", { name: "Sổ tay câu sai →" })).toBeVisible();
    await expect(weakPanel.getByTestId("filter-need-practice")).toBeVisible();
  });

  test("CASE E: Due + Weak - Strict Priority Invariant (REVIEW WINS over weak cards)", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Due Plus Weak Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // Card 1: Due
    const card1 = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "due_word",
        normalizedTerm: "due_word",
        meaningVi: "từ đến hạn",
        status: FlashcardStatus.LEARNING,
        state: 1,
        due: new Date(Date.now() - 3600000),
      },
    });

    // Card 2: Future due, but practice errors
    const card2 = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "weak_word",
        normalizedTerm: "weak_word",
        meaningVi: "từ yếu",
        status: FlashcardStatus.KNOWN,
        state: 2,
        due: new Date(Date.now() + 86400000),
      },
    });

    await db.practiceAttempt.createMany({
      data: [
        {
          flashcardId: card2.id,
          sessionId: "ses-1",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "wea",
          expectedAnswer: "weak_word",
          correct: false,
          responseMs: 2000,
        },
        {
          flashcardId: card2.id,
          sessionId: "ses-2",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "wekk",
          expectedAnswer: "weak_word",
          correct: false,
          responseMs: 2100,
        },
      ],
    });

    await page.goto(`/decks/${deck.id}`);

    // FSRS Due MUST win the Primary CTA!
    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Đến hạn ôn tập", { exact: true })).toBeVisible();
    const primaryCta = hero.getByRole("link", { name: "Ôn tập ngay (1 thẻ)" });
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", `/decks/${deck.id}/study`);

    // Secondary link offers quick access to the weak word
    const secondaryLink = hero.getByRole("link", { name: "Xem 1 từ cần củng cố" });
    await expect(secondaryLink).toBeVisible();
  });

  test("CASE F: All Clear (0 due, 0 weak, 0 new) - Triggers Contextual Reading", async ({ page }) => {
    const deck = await db.deck.create({
      data: { name: `All Clear Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // Cards are all known and due in future
    await db.flashcard.createMany({
      data: [
        {
          deckId: deck.id,
          term: "mastered_1",
          normalizedTerm: "mastered_1",
          meaningVi: "đã thuần thục 1",
          status: FlashcardStatus.KNOWN,
          state: 2,
          due: new Date(Date.now() + 864000000),
        },
        {
          deckId: deck.id,
          term: "mastered_2",
          normalizedTerm: "mastered_2",
          meaningVi: "đã thuần thục 2",
          status: FlashcardStatus.KNOWN,
          state: 2,
          due: new Date(Date.now() + 864000000),
        },
      ],
    });

    await page.goto(`/decks/${deck.id}`);

    const hero = page.locator('section[aria-label="Gợi ý bước tiếp theo"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByText("Đã hoàn thành", { exact: true })).toBeVisible();
    await expect(hero.getByText("Bạn đã bắt kịp toàn bộ tiến độ!")).toBeVisible();

    const readCta = hero.getByRole("button", { name: "Đọc trong ngữ cảnh" });
    await expect(readCta).toBeVisible();

    // Clicking CTA opens ReadingHubModal
    await readCta.click();
    const modal = page.locator('div[role="dialog"][aria-labelledby="reading-hub-title"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Truyện song ngữ")).toBeVisible();
    await expect(modal.getByRole("heading", { name: "Bài học AI" })).toBeVisible();

    // Escape closes modal
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("CASE G: Large Deck (100 cards) & Pagination check", async ({ page }) => {
    const deck = await db.deck.create({
      data: { name: `Large Deck Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    const cards = Array.from({ length: 100 }, (_, i) => ({
      deckId: deck.id,
      term: `card_${String(i + 1).padStart(3, "0")}`,
      normalizedTerm: `card_${String(i + 1).padStart(3, "0")}`,
      meaningVi: `nghĩa ${i + 1}`,
      status: FlashcardStatus.KNOWN,
      state: 2,
      due: new Date(Date.now() + 864000000),
    }));
    await db.flashcard.createMany({ data: cards });

    await page.goto(`/decks/${deck.id}`);
    await expect(page.getByText("100 thẻ").first()).toBeVisible();

    // Pagination shows "1 / 5"
    const pagination = page.locator('nav[aria-label="Trang thẻ"]');
    await expect(pagination).toBeVisible();
    await expect(pagination.getByText("1 / 5")).toBeVisible();

    // Next button navigates to page 2
    await pagination.getByRole("button", { name: "Sau" }).click();
    await expect(pagination.getByText("2 / 5")).toBeVisible();
  });

  test("Navigation & Overflow Menu: Lướt thẻ tự do (Cram) and utilities work smoothly", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Navigation Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "persevere",
        normalizedTerm: "persevere",
        meaningVi: "kiên trì",
        status: FlashcardStatus.NEW,
        state: 0,
      },
    });

    await page.goto(`/decks/${deck.id}`);

    // Open overflow menu
    const menuSummary = page.locator('summary[aria-label="Thêm tùy chọn"]');
    await expect(menuSummary).toBeVisible();
    await menuSummary.click();

    // Lướt thẻ tự do is present with subtext
    const cramLink = page.getByRole("link", { name: /Lướt thẻ tự do/ });
    await expect(cramLink).toBeVisible();
    await expect(page.getByText("Luyện nhanh, không ảnh hưởng lịch ôn")).toBeVisible();

    // Redundant Story/Lesson links are absent from menu
    const menuContainer = page.locator(".wn-menu-details div.absolute");
    await expect(menuContainer.locator('a[href*="/story"]')).toHaveCount(0);
    await expect(menuContainer.locator('a[href*="/lesson"]')).toHaveCount(0);

    // Navigate to Lướt thẻ tự do
    await cramLink.click();
    await page.waitForURL(`**/decks/${deck.id}/practice`);
    await expect(page.getByRole("heading", { name: /Luyện thẻ|Lướt thẻ/ })).toBeVisible();
  });

  test("Mobile UX (375px) & Tablet (768px): No horizontal overflow and proper layout", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Responsive Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "resilience",
        normalizedTerm: "resilience",
        meaningVi: "khả năng phục hồi",
        status: FlashcardStatus.NEW,
        state: 0,
      },
    });

    // Test Mobile 375px
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/decks/${deck.id}`);

    // Verify no horizontal overflow
    const hasHorizontalOverflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflowMobile).toBe(false);

    // Verify "+ Thêm từ" utility button in header is accessible
    const addWordBtn = page.getByRole("button", { name: "Thêm từ" });
    await expect(addWordBtn).toBeVisible();

    // Test ReadingHubModal inside 375px
    await page.getByRole("button", { name: /Đọc & Ngữ cảnh/ }).click();
    const modal = page.locator('div[role="dialog"][aria-labelledby="reading-hub-title"]');
    await expect(modal).toBeVisible();

    // Modal must not overflow viewport width
    const modalBoundingBox = await modal.boundingBox();
    expect(modalBoundingBox).not.toBeNull();
    if (modalBoundingBox) {
      expect(modalBoundingBox.width).toBeLessThanOrEqual(375);
    }
    await page.keyboard.press("Escape");

    // Test Tablet 768px
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/decks/${deck.id}`);
    const hasHorizontalOverflowTablet = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflowTablet).toBe(false);
  });

  test("Targeted Mistake Bank Regression: Selecting single insufficient data card launches targeted quiz for that card", async ({
    page,
  }) => {
    const deck = await db.deck.create({
      data: { name: `Targeted Mistake Acceptance ${crypto.randomUUID()}` },
    });
    createdDeckIds.push(deck.id);

    // Card 1: Insufficient data (1 attempt, incorrect)
    const card1 = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "serendipity",
        normalizedTerm: "serendipity",
        meaningVi: "sự tình cờ may mắn",
        status: FlashcardStatus.NEW,
        state: 0,
      },
    });

    // Card 2: Needs practice (multiple errors)
    const card2 = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "ephemeral",
        normalizedTerm: "ephemeral",
        meaningVi: "phù du",
        status: FlashcardStatus.NEW,
        state: 0,
      },
    });

    await db.practiceAttempt.createMany({
      data: [
        {
          flashcardId: card1.id,
          sessionId: "ses-1",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "seren",
          expectedAnswer: "serendipity",
          correct: false,
          responseMs: 2000,
        },
        {
          flashcardId: card2.id,
          sessionId: "ses-2",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "ephem",
          expectedAnswer: "ephemeral",
          correct: false,
          responseMs: 1500,
        },
        {
          flashcardId: card2.id,
          sessionId: "ses-3",
          questionType: "typed_vi_en",
          mode: "quiz",
          attemptNumber: 1,
          answer: "eph",
          expectedAnswer: "ephemeral",
          correct: false,
          responseMs: 1600,
        },
      ],
    });

    // Open Mistake Bank
    await page.goto(`/decks/${deck.id}/mistakes`);
    await expect(page.getByRole("heading", { name: "Sổ tay câu sai" })).toBeVisible();

    // Click "Luyện từ này" specifically for card1 ("serendipity")
    const card1Link = page.locator(`a[href*="cardIds=${card1.id}"]`);
    await expect(card1Link).toBeVisible();
    await card1Link.click();

    // Expect quiz URL has cardIds parameter
    await page.waitForURL(`**/decks/${deck.id}/quiz?mode=focused_practice&cardIds=${card1.id}`);

    // Verify Quiz prompt targets card 1 ("serendipity") and NOT card 2 ("ephemeral")
    await expect(page.locator("h1")).toContainText("sự tình cờ may mắn");
  });
});
