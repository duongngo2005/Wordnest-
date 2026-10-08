import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { quizService } from "./quiz-service";
import { LessonService } from "./lesson-service";
import { practiceEvidenceService } from "./practice-evidence-service";
import type { AIService } from "@/services/ai";
import { FlashcardStatus } from "@prisma/client";

describe("Lesson Practice Evidence Adaptive Loop Integration", () => {
  let deckId: string;
  let cardNegotiateId: string;
  let cardCompromiseId: string;
  let lessonId: string;

  beforeEach(async () => {
    // 1. Create a test deck
    const deck = await db.deck.create({
      data: { name: `Lesson Adaptive Deck ${crypto.randomUUID()}` },
    });
    deckId = deck.id;

    // 2. Create 2 test flashcards
    const [card1, card2] = await Promise.all([
      db.flashcard.create({
        data: {
          deckId,
          term: "negotiate",
          normalizedTerm: "negotiate",
          meaningVi: "đàm phán, thương lượng",
          partOfSpeech: "verb",
          cefr: "B2",
          status: FlashcardStatus.NEW,
        },
      }),
      db.flashcard.create({
        data: {
          deckId,
          term: "compromise",
          normalizedTerm: "compromise",
          meaningVi: "thỏa hiệp",
          partOfSpeech: "noun",
          cefr: "B2",
          status: FlashcardStatus.NEW,
        },
      }),
    ]);
    cardNegotiateId = card1.id;
    cardCompromiseId = card2.id;

    // 3. Create Lesson using LessonService
    const mockAi: Partial<AIService> = {
      callStructured: vi.fn().mockResolvedValue({
        title: "Reaching a Business Agreement",
        content:
          "Effective leaders always negotiate terms with patience and respect. When conflicting goals occur, finding a sensible compromise enables both organizations to flourish together.",
      }),
    };

    const lessonService = new LessonService(mockAi as AIService);
    const createdLesson = await lessonService.createLesson({
      deckId,
      targetWords: [cardNegotiateId, cardCompromiseId],
      cefr: "B2",
      topic: "Workplace Communications",
    });

    lessonId = createdLesson.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  it("completes full lesson adaptive loop: creation -> exercises -> submission -> practice evidence -> mistake bank -> smart practice", async () => {
    // 1. Mock AI for Exercise Generation
    const mockExerciseAi: Partial<AIService> = {
      callStructured: vi.fn().mockResolvedValue({
        comprehension: [
          {
            prompt: "What enables both organizations to flourish together according to the passage?",
            options: [
              "Finding a sensible compromise",
              "Cutting down costs aggressively",
              "Replacing the management team",
              "Signing without reading terms",
            ],
            correctAnswer: "Finding a sensible compromise",
            explanation: "The passage states finding a sensible compromise enables both organizations to flourish.",
          },
        ],
        contextualVocabulary: [
          {
            term: "compromise",
            sentence: "When conflicting goals occur, finding a sensible compromise enables both organizations to flourish together.",
            prompt: "In this sentence, 'compromise' most nearly means:",
            options: [
              "A middle ground or mutual concession",
              "A total surrender of one's goals",
              "A legal punishment",
              "A financial penalty",
            ],
            correctAnswer: "A middle ground or mutual concession",
            explanation: "Compromise here refers to reaching an agreement through concessions.",
          },
        ],
      }),
    };

    const { StoryExerciseService } = await import("./story-exercise-service");
    const exerciseService = new StoryExerciseService(mockExerciseAi as AIService);

    // 2. Generate lesson practice quiz session
    const sessionData = await exerciseService.createLessonPracticeSession(lessonId, deckId);
    expect(sessionData.sessionId).toBeDefined();
    expect(sessionData.questions.length).toBeGreaterThanOrEqual(3);

    const compQ = sessionData.questions.find((q) => q.type === "story_comprehension");
    const vocabQ = sessionData.questions.find((q) => q.type === "story_contextual_vocab");
    const clozeQ = sessionData.questions.find((q) => q.type === "story_cloze");

    expect(compQ).toBeDefined();
    expect(vocabQ).toBeDefined();
    expect(clozeQ).toBeDefined();

    // Verify mode is lesson_practice
    expect(compQ?.mode).toBe("lesson_practice");
    expect(vocabQ?.mode).toBe("lesson_practice");

    // 3. User submits answers
    // - Comprehension answered correctly
    // - Contextual vocab answered INCORRECTLY
    // - Cloze answered INCORRECTLY
    const answers = sessionData.questions.map((q) => {
      if (q.type === "story_comprehension") {
        return {
          questionId: q.id,
          attemptNumber: 1,
          answer: "Finding a sensible compromise", // correct
          responseMs: 2200,
        };
      }
      if (q.type === "story_contextual_vocab") {
        return {
          questionId: q.id,
          attemptNumber: 1,
          answer: "A total surrender of one's goals", // incorrect
          responseMs: 3100,
        };
      }
      return {
        questionId: q.id,
        attemptNumber: 1,
        answer: "wrong_spelling", // incorrect cloze
        responseMs: 4200,
      };
    });

    const submissionResult = await quizService.submitQuizResult(deckId, {
      sessionId: sessionData.sessionId,
      answers,
    });

    // 4. Verify QuizAttempt summary
    expect(submissionResult.total).toBe(sessionData.questions.length);
    expect(submissionResult.score).toBe(1); // 1 correct, others wrong

    // 5. Verify PracticeAttempt table (Evidence Truthfulness)
    // Comprehension question must NOT exist in PracticeAttempt!
    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { sessionId: sessionData.sessionId },
    });

    const nonComprehensionCount = sessionData.questions.filter(
      (q) => q.type !== "story_comprehension"
    ).length;
    expect(practiceAttempts).toHaveLength(nonComprehensionCount);

    const vocabAttempt = practiceAttempts.find((a) => a.questionType === "story_contextual_vocab");
    const clozeAttempt = practiceAttempts.find((a) => a.questionType === "story_cloze");

    expect(vocabAttempt).toBeDefined();
    expect(vocabAttempt?.flashcardId).toBe(cardCompromiseId);
    expect(vocabAttempt?.correct).toBe(false);

    expect(clozeAttempt).toBeDefined();
    expect(clozeAttempt?.flashcardId).toBe(cardNegotiateId);
    expect(clozeAttempt?.correct).toBe(false);

    // 6. Verify Mistake Bank contains the failed cards
    const mistakes = await practiceEvidenceService.getDeckMistakes(deckId);
    expect(mistakes.total).toBe(3);

    const vocabMistakes = await practiceEvidenceService.getDeckMistakes(deckId, {
      filter: "STORY_CONTEXTUAL_VOCAB",
    });
    expect(vocabMistakes.total).toBe(1);
    expect(vocabMistakes.mistakes[0].flashcardId).toBe(cardCompromiseId);

    // 7. Verify Smart Practice prioritizes confirmed weak words
    // Under multi-axis practice evidence, confirmed weakness requires >= 2 attempts on a specific axis.
    // Simulate a follow-up first-pass attempt confirming weakness on recognition axis:
    await db.practiceAttempt.create({
      data: {
        flashcardId: cardCompromiseId,
        sessionId: "sess_followup",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "story_contextual_vocab",
        correct: false,
        answer: "wrong",
        expectedAnswer: "compromise",
      },
    });

    const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    expect(evidence.needPracticeCards.length).toBeGreaterThanOrEqual(1);

    const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const candidateIds = candidates.map((c) => c.card.id);
    expect(candidateIds).toContain(cardCompromiseId);
  });
});
