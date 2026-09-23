import { describe, it, expect } from "vitest";
import {
  QuizService,
  maskSentenceWithTerm,
  normalizeTypedAnswer,
  isTypedAnswerMatch,
  TYPED_ANSWER_NORMALIZATION_VERSION,
} from "./quiz-service";
import { Flashcard, FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";

describe("maskSentenceWithTerm", () => {
  it("replaces exact target word with blank", () => {
    const sentence = "She showed great resilience in the face of adversity.";
    const result = maskSentenceWithTerm(sentence, "resilience");
    expect(result.found).toBe(true);
    expect(result.maskedSentence).toBe(
      "She showed great ______ in the face of adversity."
    );
  });

  it("replaces target word case-insensitively", () => {
    const sentence = "Serendipity brought them together unexpectedly.";
    const result = maskSentenceWithTerm(sentence, "serendipity");
    expect(result.found).toBe(true);
    expect(result.maskedSentence).toBe(
      "______ brought them together unexpectedly."
    );
  });

  it("handles term not found in sentence gracefully", () => {
    const sentence = "A completely unrelated sentence.";
    const result = maskSentenceWithTerm(sentence, "meticulous");
    expect(result.found).toBe(false);
    expect(result.maskedSentence).toBe("A completely unrelated sentence.");
  });

  it("handles empty or null inputs", () => {
    expect(maskSentenceWithTerm("", "test").found).toBe(false);
    expect(maskSentenceWithTerm("test", "").found).toBe(false);
  });
});

describe("QuizService.generateQuestions", () => {
  const service = new QuizService();

  const defaultFsrsFields = {
    imageAuthor: null,
    imagePageUrl: null,
    imageLicense: null,
    due: new Date(),
    lastReviewAt: null,
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    state: 0,
    schedulerVersion: 0,
  };

  const mockCards: Flashcard[] = [
    {
      id: "card-1",
      deckId: "deck-1",
      term: "resilient",
      normalizedTerm: "resilient",
      meaningVi: "kiên cường, mau hồi phục",
      definitionEn: "able to withstand or recover quickly from difficult conditions",
      ipa: "/rɪˈzɪl.jənt/",
      partOfSpeech: "adjective",
      cefr: "B2",
      exampleEn: "She is a resilient girl who bounces back from challenges.",
      exampleVi: "Cô ấy là một cô gái kiên cường.",
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      status: FlashcardStatus.NEW,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...defaultFsrsFields,
    },
    {
      id: "card-2",
      deckId: "deck-1",
      term: "ephemeral",
      normalizedTerm: "ephemeral",
      meaningVi: "phù du, ngắn ngủi",
      definitionEn: "lasting for a very short time",
      ipa: "/ɪˈfem.ər.əl/",
      partOfSpeech: "adjective",
      cefr: "C1",
      exampleEn: "Fame can be ephemeral in modern culture.",
      exampleVi: "Sự nổi tiếng có thể ngắn ngủi.",
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      status: FlashcardStatus.LEARNING,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...defaultFsrsFields,
    },
  ];

  it("returns empty array for empty cards list", () => {
    const questions = service.generateQuestions([]);
    expect(questions).toEqual([]);
  });

  it("generates correct number of questions bounded by count", () => {
    const questions = service.generateQuestions(mockCards, 1);
    expect(questions.length).toBe(1);
  });

  it("does not generate fill-in-the-blank questions for cards without examples", () => {
    const manualCard = {
      ...mockCards[0],
      definitionEn: null,
      exampleEn: null,
      exampleVi: null,
    } as unknown as Flashcard;

    const questions = service.generateQuestions([manualCard], 1, ["fill_in_blank"]);

    expect(questions).toHaveLength(1);
    expect(questions[0]?.type).not.toBe("fill_in_blank");
  });

  it("always provides 4 distinct options containing the correct answer even with few cards", () => {
    // Only 1 card in the deck
    const singleCardDeck = [mockCards[0]];
    const questions = service.generateQuestions(singleCardDeck, 1);

    expect(questions.length).toBe(1);
    const q = questions[0];
    expect(q.options.length).toBe(4);
    // Ensure all options are distinct
    const uniqueOptions = new Set(q.options);
    expect(uniqueOptions.size).toBe(4);
    // Ensure correct answer is one of the options
    expect(q.options).toContain(q.correctAnswer);
  });

  it("generates fill_in_blank question with masked sentence when allowed", () => {
    const questions = service.generateQuestions(
      mockCards,
      2,
      ["fill_in_blank"]
    );

    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.type).toBe("fill_in_blank");
      expect(q.options.length).toBe(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(q.prompt).toContain("______");
    }
  });

  it("generates multiple_choice_en_vi questions with Vietnamese meanings as options", () => {
    const questions = service.generateQuestions(
      mockCards,
      2,
      ["multiple_choice_en_vi"]
    );

    for (const q of questions) {
      expect(q.type).toBe("multiple_choice_en_vi");
      expect(q.options.length).toBe(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(q.correctAnswer).toBe(q.explanation.meaningVi);
    }
  });

  it("generates multiple_choice_vi_en questions with English terms as options", () => {
    const questions = service.generateQuestions(
      mockCards,
      2,
      ["multiple_choice_vi_en"]
    );

    for (const q of questions) {
      expect(q.type).toBe("multiple_choice_vi_en");
      expect(q.options.length).toBe(4);
      expect(q.options).toContain(q.correctAnswer);
      expect(q.correctAnswer).toBe(q.explanation.term);
    }
  });
});

describe("QuizService server-side sessions", () => {
  const service = new QuizService();

  it("creates one server-derived PracticeAttempt per answer without mutating FSRS", async () => {
    const deck = await db.deck.create({ data: { name: "Quiz session regression" } });
    try {
      await db.flashcard.createMany({
        data: [
          {
            deckId: deck.id,
            term: "resilient",
            normalizedTerm: "resilient",
            meaningVi: "kiên cường",
            definitionEn: "able to recover",
            exampleEn: "She is resilient.",
            exampleVi: "Cô ấy kiên cường.",
          },
          {
            deckId: deck.id,
            term: "ephemeral",
            normalizedTerm: "ephemeral",
            meaningVi: "phù du",
            definitionEn: "lasting briefly",
            exampleEn: "Fame is ephemeral.",
            exampleVi: "Danh tiếng phù du.",
          },
        ],
      });

      const quiz = await service.getDeckQuiz(deck.id, 2);
      const schedulerBefore = await db.flashcard.findMany({
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          due: true,
          state: true,
          stability: true,
          difficulty: true,
          reps: true,
          lapses: true,
          learningSteps: true,
          schedulerVersion: true,
          lastReviewAt: true,
        },
      });
      await expect(
        service.submitQuizResult(deck.id, {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: quiz.questions[0].id, answer: quiz.questions[0].correctAnswer },
            { questionId: quiz.questions[0].id, answer: quiz.questions[0].correctAnswer },
          ],
        })
      ).rejects.toThrow("không khớp");

      const result = await service.submitQuizResult(deck.id, {
        sessionId: quiz.sessionId,
        answers: quiz.questions.map((question, index) => ({
          questionId: question.id,
          answer:
            index === 0
              ? question.correctAnswer
              : question.options.find((option) => option !== question.correctAnswer) ?? "sai",
          responseMs: index === 0 ? 321 : undefined,
        })),
      });

      expect(result).toMatchObject({ score: 1, total: 2, accuracy: 50, cardsUpdatedCount: 0 });
      expect(await db.quizAttempt.count({ where: { deckId: deck.id } })).toBe(1);

      const practiceAttempts = await db.practiceAttempt.findMany({
        where: { sessionId: quiz.sessionId },
      });
      expect(practiceAttempts).toHaveLength(2);
      for (const [index, question] of quiz.questions.entries()) {
        const practiceAttempt = practiceAttempts.find((attempt) => attempt.flashcardId === question.cardId);
        const submittedAnswer =
          index === 0
            ? question.correctAnswer
            : question.options.find((option) => option !== question.correctAnswer) ?? "sai";

        expect(practiceAttempt).toMatchObject({
          flashcardId: question.cardId,
          sessionId: quiz.sessionId,
          mode: "quiz",
          questionType: question.type,
          correct: index === 0,
          answer: submittedAnswer,
          expectedAnswer: question.correctAnswer,
          responseMs: index === 0 ? 321 : null,
        });
      }

      const cards = await db.flashcard.findMany({
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          due: true,
          state: true,
          stability: true,
          difficulty: true,
          reps: true,
          lapses: true,
          learningSteps: true,
          schedulerVersion: true,
          lastReviewAt: true,
        },
      });
      expect(cards).toHaveLength(2);
      expect(cards).toEqual(schedulerBefore);
      for (const card of cards) {
        expect(card).toMatchObject({
          status: FlashcardStatus.NEW,
          state: 0,
          reps: 0,
          lapses: 0,
          stability: 0,
          difficulty: 0,
          learningSteps: 0,
          schedulerVersion: 0,
          lastReviewAt: null,
        });
      }
      expect(await db.reviewLog.count({ where: { cardId: { in: cards.map((card) => card.id) } } })).toBe(0);

      await expect(
        service.submitQuizResult(deck.id, {
          sessionId: quiz.sessionId,
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            answer: question.correctAnswer,
          })),
        })
      ).rejects.toThrow("Phiên quiz không hợp lệ");
      expect(await db.practiceAttempt.count({ where: { sessionId: quiz.sessionId } })).toBe(2);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("derives correctness and answer snapshots from the stored session, not client claims", async () => {
    const deck = await db.deck.create({ data: { name: "Quiz evidence integrity" } });
    try {
      await db.flashcard.createMany({
        data: [
          {
            deckId: deck.id,
            term: "resilient",
            normalizedTerm: "resilient",
            meaningVi: "kiên cường",
          },
          {
            deckId: deck.id,
            term: "ephemeral",
            normalizedTerm: "ephemeral",
            meaningVi: "phù du",
          },
        ],
      });

      const quiz = await service.getDeckQuiz(deck.id, 2);
      await service.submitQuizResult(
        deck.id,
        {
          sessionId: quiz.sessionId,
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            answer: question.options.find((option) => option !== question.correctAnswer) ?? "sai",
            correct: true,
            expectedAnswer: "client-forged-answer",
            flashcardId: "client-forged-card",
          })) as unknown as { questionId: string; answer: string }[],
        }
      );

      const practiceAttempts = await db.practiceAttempt.findMany({
        where: { sessionId: quiz.sessionId },
      });
      expect(practiceAttempts).toHaveLength(2);
      for (const question of quiz.questions) {
        const practiceAttempt = practiceAttempts.find((attempt) => attempt.flashcardId === question.cardId);
        expect(practiceAttempt).toMatchObject({
          flashcardId: question.cardId,
          expectedAnswer: question.correctAnswer,
          correct: false,
        });
      }
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("allows only one concurrent submission to persist quiz evidence", async () => {
    const deck = await db.deck.create({ data: { name: "Quiz duplicate submission" } });
    try {
      await db.flashcard.createMany({
        data: [
          { deckId: deck.id, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
          { deckId: deck.id, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
        ],
      });
      const quiz = await service.getDeckQuiz(deck.id, 2);
      const submission = {
        sessionId: quiz.sessionId,
        answers: quiz.questions.map((question) => ({
          questionId: question.id,
          answer: question.correctAnswer,
        })),
      };

      const outcomes = await Promise.allSettled([
        service.submitQuizResult(deck.id, submission),
        service.submitQuizResult(deck.id, submission),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(await db.quizAttempt.count({ where: { deckId: deck.id } })).toBe(1);
      expect(await db.practiceAttempt.count({ where: { sessionId: quiz.sessionId } })).toBe(2);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("rejects an invalid response time before persisting quiz evidence", async () => {
    const deck = await db.deck.create({ data: { name: "Quiz response time validation" } });
    try {
      await db.flashcard.createMany({
        data: [
          { deckId: deck.id, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
          { deckId: deck.id, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
        ],
      });
      const quiz = await service.getDeckQuiz(deck.id, 2);

      await expect(
        service.submitQuizResult(deck.id, {
          sessionId: quiz.sessionId,
          answers: quiz.questions.map((question, index) => ({
            questionId: question.id,
            answer: question.correctAnswer,
            responseMs: index === 0 ? -1 : undefined,
          })),
        })
      ).rejects.toThrow("Thời gian trả lời quiz không hợp lệ");

      expect(await db.quizAttempt.count({ where: { deckId: deck.id } })).toBe(0);
      expect(await db.practiceAttempt.count({ where: { sessionId: quiz.sessionId } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("keeps legacy QuizAttempt history readable when it has no PracticeAttempt records", async () => {
    const deck = await db.deck.create({ data: { name: "Legacy quiz history" } });
    try {
      const legacyAttempt = await db.quizAttempt.create({
        data: { deckId: deck.id, score: 7, total: 10, accuracy: 70 },
      });

      expect(await db.practiceAttempt.count({ where: { flashcard: { deckId: deck.id } } })).toBe(0);
      await expect(service.getDeckQuizHistory(deck.id)).resolves.toEqual([
        expect.objectContaining({ id: legacyAttempt.id, score: 7, total: 10, accuracy: 70 }),
      ]);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });
});

describe("Phase 2A: Answer Normalization v1", () => {
  it("preserves TYPED_ANSWER_NORMALIZATION_VERSION = 1 as code constant", () => {
    expect(TYPED_ANSWER_NORMALIZATION_VERSION).toBe(1);
  });

  it("normalizes identical words: 'allocate' == 'allocate'", () => {
    expect(normalizeTypedAnswer("  Allocate.  ")).toBe("allocate");
    expect(isTypedAnswerMatch("allocate", "allocate")).toBe(true);
  });

  it("normalizes decomposed Unicode (NFD) to composed (NFC) for visual equivalence", () => {
    // Decomposed e + \u0301 (combining acute) vs precomposed é (\u00E9)
    const decomposed = "cafe\u0301";
    const precomposed = "caf\u00E9";
    expect(normalizeTypedAnswer(decomposed)).toBe("café");
    expect(normalizeTypedAnswer(precomposed)).toBe("café");
    expect(isTypedAnswerMatch(decomposed, precomposed)).toBe(true);

    const decomposedResume = "re\u0301sume\u0301";
    const precomposedResume = "r\u00E9sum\u00E9";
    expect(isTypedAnswerMatch(decomposedResume, precomposedResume)).toBe(true);
  });

  it("accepts title case: 'Allocate' == 'allocate'", () => {
    expect(isTypedAnswerMatch("Allocate", "allocate")).toBe(true);
  });

  it("accepts uppercase and outer whitespace: '  ALLOCATE  ' == 'allocate'", () => {
    expect(isTypedAnswerMatch("  ALLOCATE  ", "allocate")).toBe(true);
  });

  it("collapses internal multiple whitespace sequences", () => {
    expect(isTypedAnswerMatch("figure   out", "figure out")).toBe(true);
  });

  it("handles curly vs straight apostrophes", () => {
    expect(isTypedAnswerMatch("don’t", "don't")).toBe(true);
    expect(isTypedAnswerMatch("it’s", "it's")).toBe(true);
    expect(isTypedAnswerMatch("father`s", "father's")).toBe(true);
  });

  it("strips insignificant edge punctuation while preserving internal hyphens", () => {
    expect(isTypedAnswerMatch("allocate.", "allocate")).toBe(true);
    expect(isTypedAnswerMatch("!allocate", "allocate")).toBe(true);
    expect(isTypedAnswerMatch("\"allocate\"", "allocate")).toBe(true);
    expect(isTypedAnswerMatch("(allocate)", "allocate")).toBe(true);
    expect(isTypedAnswerMatch("state-of-the-art.", "state-of-the-art")).toBe(true);
  });

  it("strictly marks misspelled words as incorrect: 'alocate' != 'allocate'", () => {
    expect(isTypedAnswerMatch("alocate", "allocate")).toBe(false);
  });

  it("strictly rejects unaccepted synonyms: 'buy' != 'purchase'", () => {
    expect(isTypedAnswerMatch("buy", "purchase")).toBe(false);
  });

  it("supports multi-word phrases and phrasal verbs: 'figure out'", () => {
    expect(isTypedAnswerMatch("  Figure   Out.  ", "figure out")).toBe(true);
    expect(isTypedAnswerMatch("take responsibility", "take responsibility")).toBe(true);
  });

  it("returns false for empty or whitespace-only answers", () => {
    expect(isTypedAnswerMatch("", "allocate")).toBe(false);
    expect(isTypedAnswerMatch("   ", "allocate")).toBe(false);
  });
});

describe("Phase 2A: Question Generation (typed_vi_en)", () => {
  const service = new QuizService();

  const mockCard: Flashcard = {
    id: "card-typed-1",
    deckId: "deck-typed",
    term: "allocate",
    normalizedTerm: "allocate",
    meaningVi: "phân bổ, phân chia ngân sách",
    definitionEn: "distribute resources or duties for a particular purpose",
    ipa: "/ˈæləkeɪt/",
    partOfSpeech: "verb",
    cefr: "B2",
    exampleEn: "The government allocated funds for the project.",
    exampleVi: "Chính phủ phân bổ ngân quỹ cho dự án.",
    imageUrl: null,
    imageSource: null,
    imageSearchQuery: null,
    imageAuthor: null,
    imagePageUrl: null,
    imageLicense: null,
    status: FlashcardStatus.NEW,
    due: new Date(),
    lastReviewAt: null,
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    state: 0,
    schedulerVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("generates typed_vi_en question with meaningVi prompt and canonical term as expected answer", () => {
    const questions = service.generateQuestions([mockCard], 1, ["typed_vi_en"]);
    expect(questions).toHaveLength(1);
    const q = questions[0];
    expect(q.type).toBe("typed_vi_en");
    expect(q.cardId).toBe(mockCard.id);
    expect(q.prompt).toBe(mockCard.meaningVi);
    expect(q.promptDetail).toContain("verb");
    expect(q.promptDetail).toContain("CEFR B2");
    expect(q.correctAnswer).toBe("allocate");
    expect(q.options).toEqual([]);
    expect(q.explanation.term).toBe("allocate");
  });

  it("never sends correctAnswer, options, or explanation in client payload for typed_vi_en", async () => {
    const deck = await db.deck.create({ data: { name: "Typed client payload check" } });
    try {
      await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
          definitionEn: "distribute resources",
          exampleEn: "They allocate funds.",
          exampleVi: "Họ phân bổ quỹ.",
        },
      });

      const quiz = await service.getDeckQuiz(deck.id, 1, ["typed_vi_en"]);
      expect(quiz.questions).toHaveLength(1);
      const clientQ = quiz.questions[0];

      expect(clientQ.type).toBe("typed_vi_en");
      expect(clientQ.prompt).toBe("phân bổ");
      expect(clientQ.id).toBeDefined();
      expect(clientQ.cardId).toBeDefined();

      // Ensure NO answer leaks to browser before submit
      const rawPayload = clientQ as unknown as Record<string, unknown>;
      expect(rawPayload.correctAnswer).toBeUndefined();
      expect(rawPayload.expectedAnswer).toBeUndefined();
      expect(rawPayload.acceptedAnswers).toBeUndefined();
      expect(rawPayload.options).toBeUndefined();
      expect(rawPayload.explanation).toBeUndefined();
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });
});

describe("Phase 2A: checkQuestionAnswer and PracticeAttempt Persistence", () => {
  const service = new QuizService();

  it("evaluates typed answers without claiming session or mutating FSRS scheduler", async () => {
    const deck = await db.deck.create({ data: { name: "Typed check test" } });
    try {
      const card = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
          definitionEn: "distribute resources",
          exampleEn: "We allocate time.",
          exampleVi: "Chúng tôi phân bổ thời gian.",
        },
      });

      const schedulerBefore = await db.flashcard.findUniqueOrThrow({
        where: { id: card.id },
        select: {
          due: true,
          status: true,
          state: true,
          stability: true,
          difficulty: true,
          reps: true,
          lapses: true,
          learningSteps: true,
          schedulerVersion: true,
          lastReviewAt: true,
        },
      });

      const quiz = await service.getDeckQuiz(deck.id, 1, ["typed_vi_en"]);
      const questionId = quiz.questions[0].id;

      // 1. Check wrong spelling
      const checkWrong = await service.checkQuestionAnswer(deck.id, {
        sessionId: quiz.sessionId,
        questionId,
        answer: "alocate",
      });
      expect(checkWrong.correct).toBe(false);
      expect(checkWrong.expectedAnswer).toBe("allocate");
      expect(checkWrong.explanation.meaningVi).toBe("phân bổ");

      // 2. Check normalized answer
      const checkCorrect = await service.checkQuestionAnswer(deck.id, {
        sessionId: quiz.sessionId,
        questionId,
        answer: "  ALLOCATE. ",
      });
      expect(checkCorrect.correct).toBe(true);
      expect(checkCorrect.expectedAnswer).toBe("allocate");

      // Session still exists and was not claimed
      const sessionStillExists = await db.quizSession.findUnique({
        where: { id: quiz.sessionId },
      });
      expect(sessionStillExists).not.toBeNull();

      // Scheduler fields remain completely untouched
      const schedulerAfter = await db.flashcard.findUniqueOrThrow({
        where: { id: card.id },
        select: {
          due: true,
          status: true,
          state: true,
          stability: true,
          difficulty: true,
          reps: true,
          lapses: true,
          learningSteps: true,
          schedulerVersion: true,
          lastReviewAt: true,
        },
      });
      expect(schedulerAfter).toEqual(schedulerBefore);
      expect(await db.reviewLog.count({ where: { cardId: card.id } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("persists PracticeAttempt for typed recall submissions and isolates FSRS", async () => {
    const deck = await db.deck.create({ data: { name: "Typed submit test" } });
    try {
      const card1 = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
        },
      });
      const card2 = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "figure out",
          normalizedTerm: "figure out",
          meaningVi: "hiểu ra, tìm ra",
        },
      });

      const schedulerBefore = await db.flashcard.findMany({
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
      });

      const quiz = await service.getDeckQuiz(deck.id, 2, ["typed_vi_en"]);

      // Submit: first question correct (with normalization & responseMs), second wrong spelling
      const q1 = quiz.questions.find((q) => q.cardId === card1.id)!;
      const q2 = quiz.questions.find((q) => q.cardId === card2.id)!;

      const submissionResult = await service.submitQuizResult(deck.id, {
        sessionId: quiz.sessionId,
        answers: [
          { questionId: q1.id, answer: "  ALLOCATE  ", responseMs: 1450 },
          { questionId: q2.id, answer: "figre out", responseMs: 2200 },
        ],
      });

      expect(submissionResult).toMatchObject({
        score: 1,
        total: 2,
        accuracy: 50,
        cardsUpdatedCount: 0,
      });

      // Verify PracticeAttempt evidence records
      const attempts = await db.practiceAttempt.findMany({
        where: { sessionId: quiz.sessionId },
        orderBy: { createdAt: "asc" },
      });
      expect(attempts).toHaveLength(2);

      const attempt1 = attempts.find((a) => a.flashcardId === card1.id)!;
      expect(attempt1).toMatchObject({
        flashcardId: card1.id,
        sessionId: quiz.sessionId,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "ALLOCATE",
        expectedAnswer: "allocate",
        responseMs: 1450,
      });

      const attempt2 = attempts.find((a) => a.flashcardId === card2.id)!;
      expect(attempt2).toMatchObject({
        flashcardId: card2.id,
        sessionId: quiz.sessionId,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "figre out",
        expectedAnswer: "figure out",
        responseMs: 2200,
      });

      // Verify FSRS scheduler isolation: all fields completely untouched
      const schedulerAfter = await db.flashcard.findMany({
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
      });
      expect(schedulerAfter).toEqual(schedulerBefore);
      expect(await db.reviewLog.count({ where: { cardId: { in: [card1.id, card2.id] } } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });
});

describe("Phase 2B: Story Cloze Generation & Contextual Recall", () => {
  const service = new QuizService();

  const mockCards: Flashcard[] = [
    {
      id: "card-allocate-1",
      deckId: "deck-story",
      term: "allocate",
      normalizedTerm: "allocate",
      meaningVi: "phân bổ",
      definitionEn: "distribute resources",
      ipa: "/ˈæləkeɪt/",
      partOfSpeech: "verb",
      cefr: "B2",
      exampleEn: "They allocate funds.",
      exampleVi: "Họ phân bổ quỹ.",
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      imageAuthor: null,
      imagePageUrl: null,
      imageLicense: null,
      status: FlashcardStatus.NEW,
      due: new Date(),
      lastReviewAt: null,
      reps: 0,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      state: 0,
      schedulerVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "card-figure-2",
      deckId: "deck-story",
      term: "figure out",
      normalizedTerm: "figure out",
      meaningVi: "hiểu ra, giải quyết",
      definitionEn: "solve or understand",
      ipa: "/ˈfɪɡjər aʊt/",
      partOfSpeech: "verb",
      cefr: "B1",
      exampleEn: "She figured out the puzzle.",
      exampleVi: "Cô ấy hiểu ra câu đố.",
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      imageAuthor: null,
      imagePageUrl: null,
      imageLicense: null,
      status: FlashcardStatus.NEW,
      due: new Date(),
      lastReviewAt: null,
      reps: 0,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      state: 0,
      schedulerVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("generates story cloze questions where prompt is masked sentence and expectedAnswer is exact usedAs", () => {
    const story = {
      id: "story-1",
      title: "Team Success",
      content: "Everyone worked hard. The manager allocated more money to training. They celebrated.",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["allocate"],
        usage: [{ term: "allocate", usedAs: "allocated" }],
      },
    };

    const questions = service.generateStoryClozeQuestions(story, mockCards);
    expect(questions).toHaveLength(1);

    const q = questions[0];
    expect(q.type).toBe("story_cloze");
    expect(q.cardId).toBe("card-allocate-1"); // Canonical card ID!
    expect(q.term).toBe("allocate");
    expect(q.usedAs).toBe("allocated");
    expect(q.correctAnswer).toBe("allocated"); // Exact surface form!
    expect(q.prompt).toBe("The manager ______ more money to training.");
    expect(q.promptDetail).toBeUndefined(); // Phase 2B.1 Hardening: never cue lemma in promptDetail
    expect(q.options).toEqual([]);
    expect(q.explanation.exampleEn).toBe("The manager allocated more money to training.");
  });

  it("does not blank canonical term if it differs from usedAs", () => {
    const story = {
      id: "story-2",
      title: "Budget Review",
      content: "First we must allocate time. Later the manager allocated more money to training.",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["allocate"],
        usage: [{ term: "allocate", usedAs: "allocated" }],
      },
    };

    const questions = service.generateStoryClozeQuestions(story, mockCards);
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe("Later the manager ______ more money to training.");
    expect(questions[0].correctAnswer).toBe("allocated");
  });

  it("supports multi-word phrases and phrasal verbs in story cloze", () => {
    const story = {
      id: "story-3",
      title: "Mystery Solved",
      content: "She finally figured out the answer after hours of study.",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["figure out"],
        usage: [{ term: "figure out", usedAs: "figured out" }],
      },
    };

    const questions = service.generateStoryClozeQuestions(story, mockCards);
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe("She finally ______ the answer after hours of study.");
    expect(questions[0].correctAnswer).toBe("figured out");
  });

  it("prevents substring false positives: 'allocate' does not match 'reallocated'", () => {
    const story = {
      id: "story-4",
      title: "Reallocation",
      content: "The company reallocated resources carefully.",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["allocate"],
        usage: [{ term: "allocate", usedAs: "allocate" }],
      },
    };

    const questions = service.generateStoryClozeQuestions(story, mockCards);
    // 'allocate' is NOT in 'reallocated' on whole-word boundary
    expect(questions).toHaveLength(0);
  });

  it("gracefully skips target words missing from the story content", () => {
    const story = {
      id: "story-5",
      title: "Short Tale",
      content: "A simple story without the word.",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["allocate"],
        usage: [{ term: "allocate", usedAs: "allocated" }],
      },
    };

    const questions = service.generateStoryClozeQuestions(story, mockCards);
    expect(questions).toHaveLength(0);
  });

  it("never sends correctAnswer, expectedAnswer, or explanation in client payload for story_cloze", async () => {
    const deck = await db.deck.create({ data: { name: "Story cloze client payload" } });
    try {
      const card = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
        },
      });

      const story = await db.story.create({
        data: {
          deckId: deck.id,
          title: "Payload Story",
          content: "The director allocated sufficient budget.",
          cefr: "B2",
          length: "Short",
          topic: "Work",
          targetWords: {
            schemaVersion: 3,
            requestedTerms: ["allocate"],
            usage: [{ term: "allocate", usedAs: "allocated" }],
          },
        },
      });

      const quiz = await service.getDeckQuiz(deck.id, 1, ["story_cloze"], story.id);
      expect(quiz.questions).toHaveLength(1);
      const clientQ = quiz.questions[0];

      expect(clientQ.type).toBe("story_cloze");
      expect(clientQ.cardId).toBe(card.id);
      expect(clientQ.prompt).toBe("The director ______ sufficient budget.");

      const rawPayload = clientQ as unknown as Record<string, unknown>;
      expect(rawPayload.correctAnswer).toBeUndefined();
      expect(rawPayload.expectedAnswer).toBeUndefined();
      expect(rawPayload.acceptedAnswers).toBeUndefined();
      expect(rawPayload.options).toBeUndefined();
      expect(rawPayload.explanation).toBeUndefined();
      expect(rawPayload.usedAs).toBeUndefined();
      expect(rawPayload.promptDetail).toBeUndefined(); // Zero lemma cue in promptDetail
      expect(rawPayload.term).toBeUndefined(); // Zero lemma cue in term
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("persists PracticeAttempt with exact usedAs and canonical cardId for Story Cloze", async () => {
    const deck = await db.deck.create({ data: { name: "Story cloze submit test" } });
    try {
      const card1 = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "allocate",
          normalizedTerm: "allocate",
          meaningVi: "phân bổ",
        },
      });
      const card2 = await db.flashcard.create({
        data: {
          deckId: deck.id,
          term: "figure out",
          normalizedTerm: "figure out",
          meaningVi: "hiểu ra",
        },
      });

      const story = await db.story.create({
        data: {
          deckId: deck.id,
          title: "Full Practice Story",
          content:
            "The manager allocated more money to training. Later, she figured out the entire solution.",
          cefr: "B2",
          length: "Short",
          topic: "Office",
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
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
      });

      const quiz = await service.getDeckQuiz(deck.id, 2, ["story_cloze"], story.id);
      expect(quiz.questions).toHaveLength(2);

      const q1 = quiz.questions.find((q) => q.cardId === card1.id)!;
      const q2 = quiz.questions.find((q) => q.cardId === card2.id)!;

      // Check question 1 checkQuestionAnswer endpoint logic
      const checkQ1 = await service.checkQuestionAnswer(deck.id, {
        sessionId: quiz.sessionId,
        questionId: q1.id,
        answer: "  ALLOCATED.  ",
      });
      expect(checkQ1.correct).toBe(true);
      expect(checkQ1.expectedAnswer).toBe("allocated");

      // Check wrong base form recall (allocate vs allocated)
      const checkBaseForm = await service.checkQuestionAnswer(deck.id, {
        sessionId: quiz.sessionId,
        questionId: q1.id,
        answer: "allocate",
      });
      expect(checkBaseForm.correct).toBe(false);
      expect(checkBaseForm.expectedAnswer).toBe("allocated");

      // Final submit
      const submission = await service.submitQuizResult(deck.id, {
        sessionId: quiz.sessionId,
        answers: [
          { questionId: q1.id, answer: "allocated", responseMs: 1500 },
          { questionId: q2.id, answer: "figure out", responseMs: 2500 }, // wrong form: typed base form
        ],
      });

      expect(submission.score).toBe(1);
      expect(submission.total).toBe(2);
      expect(submission.accuracy).toBe(50);

      // Verify PracticeAttempt evidence
      const attempts = await db.practiceAttempt.findMany({
        where: { sessionId: quiz.sessionId },
        orderBy: { createdAt: "asc" },
      });
      expect(attempts).toHaveLength(2);

      const a1 = attempts.find((a) => a.flashcardId === card1.id)!;
      expect(a1).toMatchObject({
        flashcardId: card1.id, // Canonical card ID
        questionType: "story_cloze",
        correct: true,
        answer: "allocated",
        expectedAnswer: "allocated", // Exact usedAs
        responseMs: 1500,
      });

      const a2 = attempts.find((a) => a.flashcardId === card2.id)!;
      expect(a2).toMatchObject({
        flashcardId: card2.id, // Canonical card ID
        questionType: "story_cloze",
        correct: false,
        answer: "figure out",
        expectedAnswer: "figured out", // Exact usedAs
        responseMs: 2500,
      });

      // Verify FSRS scheduler isolation
      const schedulerAfter = await db.flashcard.findMany({
        where: { deckId: deck.id },
        orderBy: { id: "asc" },
      });
      expect(schedulerAfter).toEqual(schedulerBefore);
      expect(await db.reviewLog.count({ where: { cardId: { in: [card1.id, card2.id] } } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  describe("Phase 2C: Retry Mistakes & Evidence Preservation", () => {
    it("preserves first-pass score in QuizAttempt while recording separate retry PracticeAttempts", async () => {
      const deck = await db.deck.create({ data: { name: "Retry Mistakes Test" } });
      try {
        const card1 = await db.flashcard.create({
          data: { deckId: deck.id, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
        });
        const card2 = await db.flashcard.create({
          data: { deckId: deck.id, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
        });

        const schedulerBefore = await db.flashcard.findMany({
          where: { deckId: deck.id },
          orderBy: { id: "asc" },
        });

        const quiz = await service.getDeckQuiz(deck.id, 2, ["typed_vi_en"]);
        const q1 = quiz.questions.find((q) => q.cardId === card1.id)!;
        const q2 = quiz.questions.find((q) => q.cardId === card2.id)!;

        // First pass: q1 correct ("resilient"), q2 wrong ("ephemerall")
        // Retry pass: q2 correct ("ephemeral")
        const submission = {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: q1.id, attemptNumber: 1, answer: "resilient", responseMs: 1200 },
            { questionId: q2.id, attemptNumber: 1, answer: "ephemerall", responseMs: 2500 },
            { questionId: q2.id, attemptNumber: 2, answer: "ephemeral", responseMs: 1800 },
          ],
        };

        const result = await service.submitQuizResult(deck.id, submission);

        // Crucial Pedagogical Invariant: QuizAttempt MUST reflect FIRST PASS ONLY (1/2 = 50%)
        expect(result.score).toBe(1);
        expect(result.total).toBe(2);
        expect(result.accuracy).toBe(50);
        expect(result.firstPassScore).toBe(1);
        expect(result.firstPassTotal).toBe(2);
        expect(result.retryScore).toBe(1);
        expect(result.retryTotal).toBe(1);

        // Verify QuizAttempt record in DB
        const quizAttempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: result.attemptId } });
        expect(quizAttempt.score).toBe(1);
        expect(quizAttempt.total).toBe(2);
        expect(quizAttempt.accuracy).toBe(50);

        // Verify PracticeAttempt evidence: 3 rows total (2 first pass + 1 retry)
        const practiceAttempts = await db.practiceAttempt.findMany({
          where: { sessionId: quiz.sessionId },
          orderBy: [{ flashcardId: "asc" }, { attemptNumber: "asc" }],
        });
        expect(practiceAttempts).toHaveLength(3);

        // Q1: only 1 attempt, correct
        const q1Attempts = practiceAttempts.filter((a) => a.flashcardId === card1.id);
        expect(q1Attempts).toHaveLength(1);
        expect(q1Attempts[0]).toMatchObject({
          flashcardId: card1.id,
          questionId: q1.id,
          attemptNumber: 1,
          correct: true,
          answer: "resilient",
          expectedAnswer: "resilient",
          responseMs: 1200,
        });

        // Q2: 2 attempts, attempt 1 wrong, attempt 2 correct
        const q2Attempts = practiceAttempts.filter((a) => a.flashcardId === card2.id);
        expect(q2Attempts).toHaveLength(2);
        expect(q2Attempts[0]).toMatchObject({
          flashcardId: card2.id,
          questionId: q2.id,
          attemptNumber: 1,
          correct: false,
          answer: "ephemerall",
          expectedAnswer: "ephemeral",
          responseMs: 2500,
        });
        expect(q2Attempts[1]).toMatchObject({
          flashcardId: card2.id,
          questionId: q2.id,
          attemptNumber: 2,
          correct: true,
          answer: "ephemeral",
          expectedAnswer: "ephemeral",
          responseMs: 1800,
        });

        // Verify FSRS scheduler isolation including status & learningSteps
        const schedulerAfter = await db.flashcard.findMany({
          where: { deckId: deck.id },
          orderBy: { id: "asc" },
        });
        for (let i = 0; i < schedulerBefore.length; i++) {
          const before = schedulerBefore[i];
          const after = schedulerAfter[i];
          expect(after.due.toISOString()).toBe(before.due.toISOString());
          expect(after.state).toBe(before.state);
          expect(after.status).toBe(before.status);
          expect(after.stability).toBe(before.stability);
          expect(after.difficulty).toBe(before.difficulty);
          expect(after.elapsedDays).toBe(before.elapsedDays);
          expect(after.scheduledDays).toBe(before.scheduledDays);
          expect(after.learningSteps).toBe(before.learningSteps);
          expect(after.reps).toBe(before.reps);
          expect(after.lapses).toBe(before.lapses);
          expect(after.lastReviewAt).toEqual(before.lastReviewAt);
          expect(after.schedulerVersion).toBe(before.schedulerVersion);
        }
        expect(await db.reviewLog.count({ where: { cardId: { in: [card1.id, card2.id] } } })).toBe(0);
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });

    it("rejects retrying a question that was answered correctly on the first pass", async () => {
      const deck = await db.deck.create({ data: { name: "Illegal Retry Test" } });
      try {
        await db.flashcard.create({
          data: { deckId: deck.id, term: "clarity", normalizedTerm: "clarity", meaningVi: "rõ ràng" },
        });
        const quiz = await service.getDeckQuiz(deck.id, 1, ["typed_vi_en"]);
        const q = quiz.questions[0];

        // Attempt to retry a question that was already answered correctly
        const submission = {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: q.id, attemptNumber: 1, answer: "clarity" },
            { questionId: q.id, attemptNumber: 2, answer: "clarity" },
          ],
        };

        await expect(service.submitQuizResult(deck.id, submission)).rejects.toThrow(
          "Không thể làm lại câu hỏi đã trả lời đúng trong lượt đầu."
        );
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });

    it("rejects duplicate retry attempts for the same question", async () => {
      const deck = await db.deck.create({ data: { name: "Duplicate Retry Test" } });
      try {
        await db.flashcard.create({
          data: { deckId: deck.id, term: "clarity", normalizedTerm: "clarity", meaningVi: "rõ ràng" },
        });
        const quiz = await service.getDeckQuiz(deck.id, 1, ["typed_vi_en"]);
        const q = quiz.questions[0];

        const submission = {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: q.id, attemptNumber: 1, answer: "wrong" },
            { questionId: q.id, attemptNumber: 2, answer: "clarity" },
            { questionId: q.id, attemptNumber: 2, answer: "clarity" }, // duplicate attempt 2!
          ],
        };

        await expect(service.submitQuizResult(deck.id, submission)).rejects.toThrow(
          "Có câu hỏi làm lại bị trùng lặp."
        );
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });

    it("preserves Story Cloze context prompt snapshot on both initial and retry PracticeAttempts", async () => {
      const deck = await db.deck.create({ data: { name: "Story Cloze Retry Test" } });
      try {
        const card = await db.flashcard.create({
          data: { deckId: deck.id, term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" },
        });
        const story = await db.story.create({
          data: {
            deckId: deck.id,
            title: "Resource Allocation",
            content: "The company allocated substantial resources.",
            cefr: "B2",
            length: "Short",
            topic: "Business",
            targetWords: {
              schemaVersion: 3,
              requestedTerms: ["allocate"],
              usage: [{ term: "allocate", usedAs: "allocated" }],
            },
          },
        });

        const quiz = await service.getDeckQuiz(deck.id, 1, ["story_cloze"], story.id);
        const q = quiz.questions[0];

        // First pass: base form "allocate" -> incorrect
        // Retry pass: inflected form "allocated" -> correct
        const submission = {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: q.id, attemptNumber: 1, answer: "allocate", responseMs: 1600 },
            { questionId: q.id, attemptNumber: 2, answer: "allocated", responseMs: 900 },
          ],
        };

        const result = await service.submitQuizResult(deck.id, submission);
        expect(result.firstPassScore).toBe(0);
        expect(result.firstPassTotal).toBe(1);
        expect(result.retryScore).toBe(1);
        expect(result.retryTotal).toBe(1);

        const attempts = await db.practiceAttempt.findMany({
          where: { sessionId: quiz.sessionId },
          orderBy: { attemptNumber: "asc" },
        });
        expect(attempts).toHaveLength(2);

        expect(attempts[0]).toMatchObject({
          flashcardId: card.id,
          questionId: q.id,
          prompt: "The company ______ substantial resources.",
          attemptNumber: 1,
          questionType: "story_cloze",
          correct: false,
          answer: "allocate",
          expectedAnswer: "allocated",
          responseMs: 1600,
        });

        expect(attempts[1]).toMatchObject({
          flashcardId: card.id,
          questionId: q.id,
          prompt: "The company ______ substantial resources.",
          attemptNumber: 2,
          questionType: "story_cloze",
          correct: true,
          answer: "allocated",
          expectedAnswer: "allocated",
          responseMs: 900,
        });
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });

    it("handles getFocusedPracticeQuiz gracefully when 0 cards need practice", async () => {
      const deck = await db.deck.create({ data: { name: "Empty Focused Practice Test" } });
      try {
        await db.flashcard.create({
          data: { deckId: deck.id, term: "peaceful", normalizedTerm: "peaceful", meaningVi: "bình yên" },
        });

        const result = await service.getFocusedPracticeQuiz(deck.id, 10);
        expect(result.questions).toHaveLength(0);
        expect(result.totalEligible).toBe(0);
        expect(result.sessionId).toBe("");
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });

    it("generates focused practice session, persists mode: focused_practice, and leaves FSRS & ReviewLog 100% untouched", async () => {
      const deck = await db.deck.create({ data: { name: "Focused Practice Invariant Test" } });
      try {
        // Create 2 cards:
        // Card A: typed recall failure -> NEEDS_PRACTICE
        const cardA = await db.flashcard.create({
          data: {
            deckId: deck.id,
            term: "resilient",
            normalizedTerm: "resilient",
            meaningVi: "kiên cường",
          },
        });
        // Card B: 0 attempts -> NO_EVIDENCE (should be excluded)
        const cardB = await db.flashcard.create({
          data: {
            deckId: deck.id,
            term: "ephemeral",
            normalizedTerm: "ephemeral",
            meaningVi: "phù du",
          },
        });

        // Seed 2 failed first-pass attempts for Card A
        await db.practiceAttempt.createMany({
          data: [
            {
              flashcardId: cardA.id,
              sessionId: "ses-seed-1",
              attemptNumber: 1,
              mode: "quiz",
              questionType: "typed_vi_en",
              correct: false,
              answer: "resil",
              expectedAnswer: "resilient",
              responseMs: 1500,
              createdAt: new Date("2026-01-01T10:00:00Z"),
            },
            {
              flashcardId: cardA.id,
              sessionId: "ses-seed-2",
              attemptNumber: 1,
              mode: "quiz",
              questionType: "typed_vi_en",
              correct: false,
              answer: "resil",
              expectedAnswer: "resilient",
              responseMs: 1200,
              createdAt: new Date("2026-01-01T10:01:00Z"),
            },
          ],
        });

        // 12 FSRS fields snapshot BEFORE
        const cardABefore = await db.flashcard.findUniqueOrThrow({ where: { id: cardA.id } });
        const cardBBefore = await db.flashcard.findUniqueOrThrow({ where: { id: cardB.id } });
        const reviewLogsBefore = await db.reviewLog.count({ where: { cardId: { in: [cardA.id, cardB.id] } } });
        expect(reviewLogsBefore).toBe(0);

        // Call getFocusedPracticeQuiz
        const quiz = await service.getFocusedPracticeQuiz(deck.id, 10);
        expect(quiz.totalEligible).toBe(1);
        expect(quiz.questions).toHaveLength(1);

        const q = quiz.questions[0];
        expect(q.cardId).toBe(cardA.id);
        expect(q.type).toBe("typed_vi_en");
        expect(q.selectionReason).toBeTruthy();
        // Client sanitization: no correctAnswer leaked!
        expect((q as unknown as Record<string, unknown>).correctAnswer).toBeUndefined();

        // Submit quiz result with 1st pass incorrect + 2nd pass retry correct
        const submission = {
          sessionId: quiz.sessionId,
          answers: [
            { questionId: q.id, attemptNumber: 1, answer: "res", responseMs: 1800 },
            { questionId: q.id, attemptNumber: 2, answer: "resilient", responseMs: 1100 },
          ],
        };

        const result = await service.submitQuizResult(deck.id, submission);
        expect(result.firstPassScore).toBe(0);
        expect(result.retryScore).toBe(1);

        // Verify PracticeAttempts persisted with mode: "focused_practice"
        const attempts = await db.practiceAttempt.findMany({
          where: { sessionId: quiz.sessionId },
          orderBy: { attemptNumber: "asc" },
        });
        expect(attempts).toHaveLength(2);
        expect(attempts[0].mode).toBe("focused_practice");
        expect(attempts[0].attemptNumber).toBe(1);
        expect(attempts[0].correct).toBe(false);

        expect(attempts[1].mode).toBe("focused_practice");
        expect(attempts[1].attemptNumber).toBe(2);
        expect(attempts[1].correct).toBe(true);

        // Verify FSRS scheduler invariant: all 12 fields must remain 100% UNCHANGED
        const cardAAfter = await db.flashcard.findUniqueOrThrow({ where: { id: cardA.id } });
        const cardBAfter = await db.flashcard.findUniqueOrThrow({ where: { id: cardB.id } });

        const fsrsFields = [
          "due",
          "state",
          "status",
          "stability",
          "difficulty",
          "elapsedDays",
          "scheduledDays",
          "learningSteps",
          "reps",
          "lapses",
          "schedulerVersion",
          "lastReviewAt",
        ] as const;

        for (const field of fsrsFields) {
          expect(cardAAfter[field]).toEqual(cardABefore[field]);
          expect(cardBAfter[field]).toEqual(cardBBefore[field]);
        }

        // Verify ReviewLog invariant: zero writes
        const reviewLogsAfter = await db.reviewLog.count({ where: { cardId: { in: [cardA.id, cardB.id] } } });
        expect(reviewLogsAfter).toBe(0);
      } finally {
        await db.deck.delete({ where: { id: deck.id } });
      }
    });
  });
});

