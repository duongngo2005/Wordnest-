import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";

let deckId: string;
let cardIds: string[];

test.beforeEach(async () => {
  const deck = await db.deck.create({ data: { name: `Quiz evidence UI ${crypto.randomUUID()}` } });
  deckId = deck.id;
  await db.flashcard.createMany({
    data: [
      { deckId, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
      { deckId, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
    ],
  });
  cardIds = (await db.flashcard.findMany({ where: { deckId }, select: { id: true } })).map((card) => card.id);
});

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
});

const FSRS_SELECT = {
  id: true,
  due: true,
  state: true,
  status: true,
  stability: true,
  difficulty: true,
  elapsedDays: true,
  scheduledDays: true,
  learningSteps: true,
  reps: true,
  lapses: true,
  lastReviewAt: true,
  schedulerVersion: true,
} as const;

test("Quiz records per-question evidence without changing a card scheduler", async ({ page }) => {
  const schedulerBefore = await db.flashcard.findMany({
    where: { id: { in: cardIds } },
    orderBy: { id: "asc" },
    select: FSRS_SELECT,
  });

  await page.goto(`/decks/${deckId}/quiz`);
  await expect(page.getByText("Câu 1 / 2")).toBeVisible();

  for (let questionIndex = 0; questionIndex < 2; questionIndex += 1) {
    await page.getByRole("button", { name: /^Đáp án A:/ }).click();
    await page
      .getByRole("button", {
        name: questionIndex === 1 ? "Xem kết quả bài Quiz" : "Câu tiếp theo",
      })
      .click();
  }

  await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();
  await expect(page.getByText("Câu đã ghi nhận")).toBeVisible();

  const practiceAttempts = await db.practiceAttempt.findMany({
    where: { flashcardId: { in: cardIds } },
  });
  expect(practiceAttempts).toHaveLength(2);
  expect(practiceAttempts.every((attempt) => attempt.mode === "quiz" && attempt.responseMs !== null)).toBe(true);
  expect(await db.quizAttempt.count({ where: { deckId } })).toBe(1);
  expect(await db.reviewLog.count({ where: { cardId: { in: cardIds } } })).toBe(0);

  const schedulerAfter = await db.flashcard.findMany({
    where: { id: { in: cardIds } },
    orderBy: { id: "asc" },
    select: FSRS_SELECT,
  });
  expect(schedulerAfter).toEqual(schedulerBefore);
});

test("Typed Recall (Phase 2A): Scenarios A & B - correct recall and misspelling handling", async ({ page }) => {
  const typedDeck = await db.deck.create({ data: { name: `Typed E2E ${crypto.randomUUID()}` } });
  try {
    const card1 = await db.flashcard.create({
      data: { deckId: typedDeck.id, term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" },
    });
    const card2 = await db.flashcard.create({
      data: { deckId: typedDeck.id, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
    });

    const schedulerBefore = await db.flashcard.findMany({
      where: { deckId: typedDeck.id },
      orderBy: { id: "asc" },
    });

    // Navigate to typed recall quiz
    await page.goto(`/decks/${typedDeck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 2")).toBeVisible();
    await expect(page.getByText("Gõ từ vựng tiếng Anh (Recall)")).toBeVisible();

    // Verify NO answer choices (A, B, C, D) are rendered
    await expect(page.getByRole("button", { name: /^Đáp án A:/ })).toHaveCount(0);

    const input = page.locator("#typed-recall-input");
    await expect(input).toBeVisible();

    // Check Question 1 prompt and answer accordingly
    const isQ1Allocate = await page.getByRole("heading", { name: "phân bổ" }).isVisible().catch(() => false);
    const q1Answer = isQ1Allocate ? "allocate" : "resilient";
    const q2WrongAnswer = isQ1Allocate ? "resilint" : "alocate"; // misspelled

    // Scenario A: Correct recall
    await input.fill(q1Answer);
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    // Verify feedback
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();

    // Advance to next question
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();
    await expect(page.getByText("Câu 2 / 2")).toBeVisible();

    // Scenario B: Wrong spelling
    await input.fill(q2WrongAnswer);
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    // Verify feedback shows incorrect and shows expected answer
    await expect(page.getByText("Chưa chính xác.")).toBeVisible();
    await expect(page.getByText("Đáp án đúng:")).toBeVisible();

    // Submit quiz
    await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();

    // Results page verification
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();

    // Verify database evidence
    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: typedDeck.id } },
      orderBy: { createdAt: "asc" },
    });
    expect(practiceAttempts).toHaveLength(2);
    expect(practiceAttempts.every((a) => a.mode === "quiz" && a.questionType === "typed_vi_en")).toBe(true);

    const correctAttempts = practiceAttempts.filter((a) => a.correct);
    const incorrectAttempts = practiceAttempts.filter((a) => !a.correct);
    expect(correctAttempts).toHaveLength(1);
    expect(incorrectAttempts).toHaveLength(1);

    // Verify FSRS scheduler completely untouched
    const schedulerAfter = await db.flashcard.findMany({
      where: { deckId: typedDeck.id },
      orderBy: { id: "asc" },
    });
    expect(schedulerAfter).toEqual(schedulerBefore);
    expect(await db.reviewLog.count({ where: { cardId: { in: [card1.id, card2.id] } } })).toBe(0);
  } finally {
    await db.deck.delete({ where: { id: typedDeck.id } });
  }
});

test("Typed Recall (Phase 2A): Scenarios C & D - normalization and multi-word phrase support", async ({ page }) => {
  const normDeck = await db.deck.create({ data: { name: `Norm E2E ${crypto.randomUUID()}` } });
  try {
    await db.flashcard.create({
      data: { deckId: normDeck.id, term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" },
    });
    await db.flashcard.create({
      data: { deckId: normDeck.id, term: "figure out", normalizedTerm: "figure out", meaningVi: "hiểu ra" },
    });

    await page.goto(`/decks/${normDeck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 2")).toBeVisible();

    const input = page.locator("#typed-recall-input");

    // Question 1: Check prompt
    const isQ1Allocate = await page.getByRole("heading", { name: "phân bổ" }).isVisible().catch(() => false);

    // Scenario C: Uppercase and outer whitespace
    // Scenario D: Phrase with spacing
    const answer1 = isQ1Allocate ? "   ALLOCATE.   " : "   Figure   Out.   ";
    const answer2 = isQ1Allocate ? "   figure   out   " : "   ALLOCATE   ";

    await input.fill(answer1);
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();

    await page.getByRole("button", { name: "Câu tiếp theo" }).click();
    await expect(page.getByText("Câu 2 / 2")).toBeVisible();

    await input.fill(answer2);
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();

    await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();
    await expect(page.getByText("Tuyệt đỉnh! Bạn đúng 100%!")).toBeVisible();

    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: normDeck.id } },
    });
    expect(practiceAttempts).toHaveLength(2);
    expect(practiceAttempts.every((a) => a.correct)).toBe(true);
  } finally {
    await db.deck.delete({ where: { id: normDeck.id } });
  }
});

test("Typed Recall (Phase 2A): Scenario E - mode switching and existing MC regression", async ({ page }) => {
  const switchDeck = await db.deck.create({ data: { name: `Switch E2E ${crypto.randomUUID()}` } });
  try {
    await db.flashcard.createMany({
      data: [
        { deckId: switchDeck.id, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
        { deckId: switchDeck.id, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
      ],
    });

    await page.goto(`/decks/${switchDeck.id}/quiz`);
    await expect(page.getByText("Câu 1 / 2")).toBeVisible();

    // Default mode is Multiple Choice: buttons A, B, C, D are present
    await expect(page.getByRole("button", { name: /^Đáp án A:/ })).toBeVisible();

    // Switch to Typed Recall
    await page.getByRole("button", { name: "Gõ đáp án (Recall)" }).click();
    await expect(page.locator("#typed-recall-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Đáp án A:/ })).toHaveCount(0);

    // Switch back to Multiple Choice
    await page.getByRole("button", { name: "Trắc nghiệm" }).click();
    await expect(page.getByRole("button", { name: /^Đáp án A:/ })).toBeVisible();

    // Complete the multiple choice quiz normally
    for (let q = 0; q < 2; q++) {
      await page.getByRole("button", { name: /^Đáp án A:/ }).click();
      await page.getByRole("button", { name: q === 1 ? "Xem kết quả bài Quiz" : "Câu tiếp theo" }).click();
    }

    await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();
  } finally {
    await db.deck.delete({ where: { id: switchDeck.id } });
  }
});

test.skip("Story Contextual Cloze (Phase 2B): parked active workflow; historical attempts remain covered in service tests", async ({ page }) => {
  const storyDeck = await db.deck.create({ data: { name: `Story Cloze E2E ${crypto.randomUUID()}` } });
  try {
    const card1 = await db.flashcard.create({
      data: { deckId: storyDeck.id, term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" },
    });
    const card2 = await db.flashcard.create({
      data: { deckId: storyDeck.id, term: "figure out", normalizedTerm: "figure out", meaningVi: "hiểu ra" },
    });

    const story = await db.story.create({
      data: {
        deckId: storyDeck.id,
        title: "Growth and Innovation",
        content: "The manager allocated more money to training. Later, she finally figured out the answer.",
        cefr: "B2",
        length: "Short",
        topic: "Work",
        targetWords: {
          schemaVersion: 3,
          requestedTerms: ["allocate", "figure out"],
          usage: [
            { term: "allocate", usedAs: "allocated" },
            { term: "figure out", usedAs: "figured out" },
          ],
        },
      },
    });

    const schedulerBefore = await db.flashcard.findMany({
      where: { deckId: storyDeck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });

    // 1. Visit Story page and start Cloze from the "Luyện từ trong bài" button
    await page.goto(`/decks/${storyDeck.id}/story`);
    await expect(page.getByRole("heading", { name: "Growth and Innovation" })).toBeVisible();
    await page.getByRole("link", { name: "Luyện từ trong bài (Story Cloze)" }).click();

    // 2. Question 1 prompt verification
    await expect(page.getByText("Câu 1 / 2")).toBeVisible();
    await expect(page.getByText("Điền từ vào câu chuyện (Story Cloze)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The manager ______ more money to training." })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Đáp án A:/ })).toHaveCount(0);

    // Hardening (Phase 2B.1): Lemma and meaning must NOT be leaked before answer is submitted
    await expect(page.getByText("allocate", { exact: true })).not.toBeVisible();
    await expect(page.getByText("phân bổ", { exact: true })).not.toBeVisible();

    const input = page.locator("#typed-recall-input");
    await expect(input).toBeVisible();

    // Scenario B: User types base form 'allocate' instead of contextual 'allocated' -> MUST BE INCORRECT
    await input.fill("allocate");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await expect(page.getByText("Chưa chính xác.")).toBeVisible();
    await expect(page.getByText("Đáp án đúng:")).toBeVisible();
    await expect(page.getByText("allocated", { exact: true })).toBeVisible();
    await expect(page.getByText("Từ gốc: allocate (phân bổ)")).toBeVisible();

    // Advance to question 2
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();
    await expect(page.getByText("Câu 2 / 2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Later, she finally ______ the answer." })).toBeVisible();

    // Hardening (Phase 2B.1): Lemma and meaning must NOT be leaked before answer is submitted
    await expect(page.getByText("figure out", { exact: true })).not.toBeVisible();
    await expect(page.getByText("hiểu ra", { exact: true })).not.toBeVisible();

    // Scenario D: Phrasal verb + Scenario C: uppercase & outer whitespace normalization
    await input.fill("   FIGURED   OUT.   ");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();
    await expect(page.getByText("figure out → figured out")).toBeVisible();
    await expect(page.getByText(": hiểu ra")).toBeVisible();

    // Submit quiz
    await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();

    // Verify database evidence in PracticeAttempt
    const attempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: storyDeck.id } },
      orderBy: { createdAt: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts.every((a) => a.mode === "quiz" && a.questionType === "story_cloze")).toBe(true);

    const attempt1 = attempts.find((a) => a.flashcardId === card1.id)!;
    expect(attempt1).toMatchObject({
      flashcardId: card1.id, // Canonical card ID
      correct: false,
      answer: "allocate",
      expectedAnswer: "allocated",
      prompt: "The manager ______ more money to training.",
      attemptNumber: 1,
    });
    expect(attempt1.questionId).toBeTruthy();

    const attempt2 = attempts.find((a) => a.flashcardId === card2.id)!;
    expect(attempt2).toMatchObject({
      flashcardId: card2.id, // Canonical card ID
      correct: true,
      answer: "FIGURED   OUT.",
      expectedAnswer: "figured out",
      prompt: "Later, she finally ______ the answer.",
      attemptNumber: 1,
    });
    expect(attempt2.questionId).toBeTruthy();

    // Scenario E: Verify all 12 FSRS scheduler fields completely untouched
    const schedulerAfter = await db.flashcard.findMany({
      where: { deckId: storyDeck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    expect(schedulerAfter).toEqual(schedulerBefore);
    expect(await db.reviewLog.count({ where: { cardId: { in: [card1.id, card2.id] } } })).toBe(0);

    // Verify Story content was not mutated
    const storyAfter = await db.story.findUniqueOrThrow({ where: { id: story.id } });
    expect(storyAfter.content).toBe(story.content);
    expect(storyAfter.title).toBe(story.title);
  } finally {
    await db.deck.delete({ where: { id: storyDeck.id } });
  }
});

test("Phase 2C - Scenario A: 10 questions (7 correct, 3 wrong), retry 3 correct, score 7/10 preserved, 13 PracticeAttempts, FSRS untouched", async ({ page }) => {
  const deck = await db.deck.create({ data: { name: `Retry 10Q E2E ${crypto.randomUUID()}` } });
  try {
    const wordList = [
      { term: "apple", meaningVi: "quả táo" },
      { term: "banana", meaningVi: "quả chuối" },
      { term: "cat", meaningVi: "con mèo" },
      { term: "dog", meaningVi: "con chó" },
      { term: "elephant", meaningVi: "con voi" },
      { term: "fish", meaningVi: "con cá" },
      { term: "giraffe", meaningVi: "hươu cao cổ" },
      { term: "horse", meaningVi: "con ngựa" },
      { term: "island", meaningVi: "hòn đảo" },
      { term: "jungle", meaningVi: "rừng nhiệt đới" },
    ];

    const cards = await Promise.all(
      wordList.map((w) =>
        db.flashcard.create({
          data: {
            deckId: deck.id,
            term: w.term,
            normalizedTerm: w.term,
            meaningVi: w.meaningVi,
          },
        })
      )
    );

    const termByMeaning = new Map(wordList.map((w) => [w.meaningVi, w.term]));

    const schedulerBefore = await db.flashcard.findMany({
      where: { deckId: deck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });

    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 10")).toBeVisible();

    const input = page.locator("#typed-recall-input");

    // Answer 10 questions: first 7 correct, last 3 wrong
    for (let i = 1; i <= 10; i++) {
      await expect(page.getByText(`Câu ${i} / 10`)).toBeVisible();
      const promptHeading = (await page.locator("h1").innerText()).trim();
      const correctWord = termByMeaning.get(promptHeading) ?? "apple";

      if (i <= 7) {
        await input.fill(correctWord);
        await page.getByRole("button", { name: "Kiểm tra" }).click();
        await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();
      } else {
        await input.fill("intentionally wrong");
        await page.getByRole("button", { name: "Kiểm tra" }).click();
        await expect(page.getByText("Chưa chính xác.")).toBeVisible();
      }

      if (i < 10) {
        await page.getByRole("button", { name: "Câu tiếp theo" }).click();
      }
    }

    // On Question 10, verify retry offer
    const retryBtn = page.getByRole("button", { name: "Luyện lại 3 câu sai" });
    const finishBtn = page.getByRole("button", { name: "Xem kết quả bài Quiz" });
    await expect(retryBtn).toBeVisible();
    await expect(finishBtn).toBeVisible();

    // Click retry button
    await retryBtn.click();

    // Retry mode: 3 questions to fix
    for (let r = 1; r <= 3; r++) {
      await expect(page.getByText(`Luyện lại câu sai: Câu ${r} / 3`)).toBeVisible();
      const promptHeading = (await page.locator("h1").innerText()).trim();
      const correctWord = termByMeaning.get(promptHeading) ?? "horse";

      await input.fill(correctWord);
      await page.getByRole("button", { name: "Kiểm tra" }).click();
      await expect(page.getByText("Chính xác! Giỏi lắm!")).toBeVisible();

      if (r < 3) {
        await page.getByRole("button", { name: "Câu tiếp theo" }).click();
      }
    }

    // Submit final results
    await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();

    // Results page assertions
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("7 / 10")).toBeVisible();
    await expect(page.getByText(/Lần đầu:\s*7\/10\.\s*Bạn đã sửa đúng\s*3\/3\s*câu khi luyện lại\./)).toBeVisible();
    await expect(page.getByText("Luyện tập không thay đổi lịch ôn.")).toBeVisible();
    await expect(page.getByText("Đã sửa đúng khi luyện lại ✓")).toHaveCount(3);

    // Database assertions: QuizAttempt score strictly first-pass
    const quizAttempt = await db.quizAttempt.findFirstOrThrow({ where: { deckId: deck.id } });
    expect(quizAttempt.score).toBe(7);
    expect(quizAttempt.total).toBe(10);
    expect(quizAttempt.accuracy).toBe(70);

    // PracticeAttempt records: 10 attempt 1 + 3 attempt 2 = 13 total
    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: deck.id } },
      orderBy: { createdAt: "asc" },
    });
    expect(practiceAttempts).toHaveLength(13);

    const firstPassAttempts = practiceAttempts.filter((a) => a.attemptNumber === 1);
    const retryAttempts = practiceAttempts.filter((a) => a.attemptNumber === 2);
    expect(firstPassAttempts).toHaveLength(10);
    expect(retryAttempts).toHaveLength(3);

    expect(firstPassAttempts.filter((a) => a.correct)).toHaveLength(7);
    expect(firstPassAttempts.filter((a) => !a.correct)).toHaveLength(3);
    expect(retryAttempts.filter((a) => a.correct)).toHaveLength(3);

    // All 13 attempts must preserve questionId and prompt context
    for (const pa of practiceAttempts) {
      expect(pa.questionId).toBeTruthy();
      expect(pa.prompt).toBeTruthy();
    }

    // All 12 FSRS fields untouched
    const schedulerAfter = await db.flashcard.findMany({
      where: { deckId: deck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    expect(schedulerAfter).toEqual(schedulerBefore);
    expect(await db.reviewLog.count({ where: { cardId: { in: cards.map((c) => c.id) } } })).toBe(0);
  } finally {
    await db.deck.delete({ where: { id: deck.id } });
  }
});

test("Phase 2C - Scenario B: Mistakes exist, user skips retry -> Only attempt 1 recorded", async ({ page }) => {
  const deck = await db.deck.create({ data: { name: `Skip Retry E2E ${crypto.randomUUID()}` } });
  try {
    const cards = await Promise.all([
      db.flashcard.create({ data: { deckId: deck.id, term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } }),
      db.flashcard.create({ data: { deckId: deck.id, term: "banana", normalizedTerm: "banana", meaningVi: "quả chuối" } }),
      db.flashcard.create({ data: { deckId: deck.id, term: "cat", normalizedTerm: "cat", meaningVi: "con mèo" } }),
    ]);

    const schedulerBefore = await db.flashcard.findMany({
      where: { deckId: deck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });

    const termByMeaning = new Map([
      ["quả táo", "apple"],
      ["quả chuối", "banana"],
      ["con mèo", "cat"],
    ]);

    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 3")).toBeVisible();

    const input = page.locator("#typed-recall-input");

    // Q1: correct
    const prompt1 = (await page.locator("h1").innerText()).trim();
    await input.fill(termByMeaning.get(prompt1) ?? "apple");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();

    // Q2: wrong
    await expect(page.getByText("Câu 2 / 3")).toBeVisible();
    await input.fill("wrong");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();

    // Q3: wrong
    await expect(page.getByText("Câu 3 / 3")).toBeVisible();
    await input.fill("wrong");
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    // User chooses to skip retry and directly view results
    const finishBtn = page.getByRole("button", { name: "Xem kết quả bài Quiz" });
    await expect(page.getByRole("button", { name: "Luyện lại 2 câu sai" })).toBeVisible();
    await finishBtn.click();

    // Results page
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("1 / 3")).toBeVisible();
    await expect(page.getByText(/Bạn đã sửa đúng/)).toHaveCount(0);

    // Database: exactly 3 PracticeAttempt records, all attemptNumber 1
    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: deck.id } },
    });
    expect(practiceAttempts).toHaveLength(3);
    expect(practiceAttempts.every((a) => a.attemptNumber === 1)).toBe(true);

    const quizAttempt = await db.quizAttempt.findFirstOrThrow({ where: { deckId: deck.id } });
    expect(quizAttempt.score).toBe(1);
    expect(quizAttempt.total).toBe(3);

    // All 12 FSRS fields untouched
    const schedulerAfter = await db.flashcard.findMany({
      where: { deckId: deck.id },
      orderBy: { id: "asc" },
      select: FSRS_SELECT,
    });
    expect(schedulerAfter).toEqual(schedulerBefore);
    expect(await db.reviewLog.count({ where: { cardId: { in: cards.map((c) => c.id) } } })).toBe(0);
  } finally {
    await db.deck.delete({ where: { id: deck.id } });
  }
});

test("Phase 2C - Scenario C: Perfect score (all correct) -> No retry button offered", async ({ page }) => {
  const deck = await db.deck.create({ data: { name: `Perfect E2E ${crypto.randomUUID()}` } });
  try {
    await Promise.all([
      db.flashcard.create({ data: { deckId: deck.id, term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } }),
      db.flashcard.create({ data: { deckId: deck.id, term: "banana", normalizedTerm: "banana", meaningVi: "quả chuối" } }),
    ]);

    const termByMeaning = new Map([
      ["quả táo", "apple"],
      ["quả chuối", "banana"],
    ]);

    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 2")).toBeVisible();

    const input = page.locator("#typed-recall-input");

    // Q1: correct
    const prompt1 = (await page.locator("h1").innerText()).trim();
    await input.fill(termByMeaning.get(prompt1) ?? "apple");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();

    // Q2: correct
    await expect(page.getByText("Câu 2 / 2")).toBeVisible();
    const prompt2 = (await page.locator("h1").innerText()).trim();
    await input.fill(termByMeaning.get(prompt2) ?? "banana");
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    // Since 0 mistakes, "Luyện lại" button MUST NOT be offered
    await expect(page.getByRole("button", { name: /Luyện lại/ })).toHaveCount(0);
    const finishBtn = page.getByRole("button", { name: "Xem kết quả bài Quiz" });
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("Tuyệt đỉnh! Bạn đúng 100%!")).toBeVisible();
    await expect(page.getByText(/Bạn đã sửa đúng/)).toHaveCount(0);
  } finally {
    await db.deck.delete({ where: { id: deck.id } });
  }
});

test("Phase 2C - Scenario D: Retry has mistakes -> Score remains first-pass, retry stats accurate, no 2nd retry", async ({ page }) => {
  const deck = await db.deck.create({ data: { name: `Partial Retry E2E ${crypto.randomUUID()}` } });
  try {
    await Promise.all([
      db.flashcard.create({ data: { deckId: deck.id, term: "apple", normalizedTerm: "apple", meaningVi: "quả táo" } }),
      db.flashcard.create({ data: { deckId: deck.id, term: "banana", normalizedTerm: "banana", meaningVi: "quả chuối" } }),
      db.flashcard.create({ data: { deckId: deck.id, term: "cat", normalizedTerm: "cat", meaningVi: "con mèo" } }),
    ]);

    const termByMeaning = new Map([
      ["quả táo", "apple"],
      ["quả chuối", "banana"],
      ["con mèo", "cat"],
    ]);

    await page.goto(`/decks/${deck.id}/quiz?mode=typed`);
    await expect(page.getByText("Câu 1 / 3")).toBeVisible();

    const input = page.locator("#typed-recall-input");

    // All 3 wrong on first pass (0/3)
    for (let i = 1; i <= 3; i++) {
      await expect(page.getByText(`Câu ${i} / 3`)).toBeVisible();
      await input.fill("wrong");
      await page.getByRole("button", { name: "Kiểm tra" }).click();
      if (i < 3) {
        await page.getByRole("button", { name: "Câu tiếp theo" }).click();
      }
    }

    // Click retry
    await page.getByRole("button", { name: "Luyện lại 3 câu sai" }).click();

    // Retry R1: correct
    await expect(page.getByText("Luyện lại câu sai: Câu 1 / 3")).toBeVisible();
    const promptR1 = (await page.locator("h1").innerText()).trim();
    await input.fill(termByMeaning.get(promptR1) ?? "apple");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();

    // Retry R2: correct
    await expect(page.getByText("Luyện lại câu sai: Câu 2 / 3")).toBeVisible();
    const promptR2 = (await page.locator("h1").innerText()).trim();
    await input.fill(termByMeaning.get(promptR2) ?? "banana");
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    await page.getByRole("button", { name: "Câu tiếp theo" }).click();

    // Retry R3: still wrong
    await expect(page.getByText("Luyện lại câu sai: Câu 3 / 3")).toBeVisible();
    await input.fill("still wrong");
    await page.getByRole("button", { name: "Kiểm tra" }).click();

    await page.getByRole("button", { name: "Xem kết quả bài Quiz" }).click();

    // Results page
    await expect(page.getByText("Kết quả bài Quiz")).toBeVisible();
    await expect(page.getByText("0 / 3")).toBeVisible(); // First pass aggregate preserved!
    await expect(page.getByText(/Lần đầu:\s*0\/3\.\s*Bạn đã sửa đúng\s*2\/3\s*câu khi luyện lại\./)).toBeVisible();
    await expect(page.getByText("Đã sửa đúng khi luyện lại ✓")).toHaveCount(2);
    await expect(page.getByText("Chưa đúng khi luyện lại ✗")).toHaveCount(1);

    // Verify database
    const quizAttempt = await db.quizAttempt.findFirstOrThrow({ where: { deckId: deck.id } });
    expect(quizAttempt.score).toBe(0);
    expect(quizAttempt.total).toBe(3);

    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { flashcard: { deckId: deck.id } },
    });
    expect(practiceAttempts).toHaveLength(6);
    expect(practiceAttempts.filter((a) => a.attemptNumber === 1 && !a.correct)).toHaveLength(3);
    expect(practiceAttempts.filter((a) => a.attemptNumber === 2 && a.correct)).toHaveLength(2);
    expect(practiceAttempts.filter((a) => a.attemptNumber === 2 && !a.correct)).toHaveLength(1);
  } finally {
    await db.deck.delete({ where: { id: deck.id } });
  }
});

test("Phase 2C - Scenario E: Double submission guard rejects subsequent submission with 409", async ({ request }) => {
  const deck = await db.deck.create({ data: { name: `Double Submit Guard ${crypto.randomUUID()}` } });
  try {
    await db.flashcard.create({
      data: { deckId: deck.id, term: "guard", normalizedTerm: "guard", meaningVi: "bảo vệ" },
    });

    // Start a quiz session via GET
    const startRes = await request.get(`/api/decks/${deck.id}/quiz?mode=typed`);
    expect(startRes.ok()).toBe(true);
    const startBody = await startRes.json();
    expect(startBody.success).toBe(true);
    const quizData = startBody.data;
    const sessionId = quizData.sessionId;
    const qId = quizData.questions[0].id;

    const payload = {
      sessionId,
      answers: [
        { questionId: qId, attemptNumber: 1, answer: "guard" },
      ],
    };

    // First submission: should succeed (200 OK)
    const sub1 = await request.post(`/api/decks/${deck.id}/quiz`, { data: payload });
    expect(sub1.ok()).toBe(true);
    const sub1Data = await sub1.json();
    expect(sub1Data.success).toBe(true);
    expect(sub1Data.data.score).toBe(1);

    // Second submission with exact same sessionId: MUST fail with 409 Conflict
    const sub2 = await request.post(`/api/decks/${deck.id}/quiz`, { data: payload });
    expect(sub2.status()).toBe(409);
    const sub2Data = await sub2.json();
    expect(sub2Data.success).toBe(false);
    expect(sub2Data.error).toContain("Phiên quiz");
  } finally {
    await db.deck.delete({ where: { id: deck.id } });
  }
});
