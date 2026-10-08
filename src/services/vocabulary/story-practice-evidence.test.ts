import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { quizService } from "./quiz-service";
import { StoryExerciseService } from "./story-exercise-service";
import { practiceEvidenceService } from "./practice-evidence-service";
import { createStoryVocabularyMetadata } from "@/lib/story/story-vocabulary";
import type { AIService } from "@/services/ai";

describe("Story Practice Evidence Integration Loop", () => {
  let deckId: string;
  let cardResilienceId: string;
  let cardDedicateId: string;
  let storyId: string;

  beforeEach(async () => {
    // 1. Create a test deck
    const deck = await db.deck.create({
      data: { name: `Story Practice Deck ${crypto.randomUUID()}` },
    });
    deckId = deck.id;

    // 2. Create 2 test flashcards
    const [card1, card2] = await Promise.all([
      db.flashcard.create({
        data: {
          deckId,
          term: "resilience",
          normalizedTerm: "resilience",
          meaningVi: "sự kiên cường",
          partOfSpeech: "noun",
          cefr: "B2",
        },
      }),
      db.flashcard.create({
        data: {
          deckId,
          term: "dedicate",
          normalizedTerm: "dedicate",
          meaningVi: "cống hiến, dành thời gian",
          partOfSpeech: "verb",
          cefr: "B2",
        },
      }),
    ]);
    cardResilienceId = card1.id;
    cardDedicateId = card2.id;

    // 3. Create a story for the deck
    const metadata = createStoryVocabularyMetadata(
      ["resilience", "dedicate"],
      [
        { term: "resilience", usedAs: "resilience" },
        { term: "dedicate", usedAs: "dedicate" },
      ],
      {
        contextualTranslations: [
          { term: "resilience", usedAs: "resilience", meaningVi: "sự kiên cường" },
          { term: "dedicate", usedAs: "dedicate", meaningVi: "cống hiến, dành thời gian" },
        ],
      }
    );

    const story = await db.story.create({
      data: {
        deckId,
        title: "The Art of Persistence",
        content:
          "Maya showed extraordinary resilience throughout the project. She would dedicate every evening to refining her work. In the end, her resilience inspired the entire team.",
        cefr: "B2",
        length: "short",
        topic: "Education",
        targetWords: JSON.stringify(metadata),
      },
    });
    storyId = story.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  it("completes full story exercise loop: generation -> submission -> practice evidence -> mistake bank -> smart practice", async () => {
    // 1. Mock AI for Story Exercise Generation
    const mockAi: Partial<AIService> = {
      callStructured: vi.fn().mockResolvedValue({
        comprehension: [
          {
            prompt: "What inspired the team according to the story?",
            options: [
              "Maya's resilience",
              "Her high test score",
              "A winning trophy",
              "Her teacher's speech",
            ],
            correctAnswer: "Maya's resilience",
            explanation: "The story states her resilience inspired the entire team.",
          },
        ],
        contextualVocabulary: [
          {
            term: "dedicate",
            sentence: "She would dedicate every evening to refining her work.",
            prompt: "In this sentence, 'dedicate' most nearly means:",
            options: [
              "Devote time and effort",
              "Waste carelessly",
              "Avoid completely",
              "Postpone until later",
            ],
            correctAnswer: "Devote time and effort",
            explanation: "Dedicate here means spending focused time on work.",
          },
        ],
      }),
    };

    const exerciseService = new StoryExerciseService(mockAi as AIService);

    // 2. Create story practice session
    const sessionData = await exerciseService.createStoryPracticeSession(storyId, deckId);
    expect(sessionData.sessionId).toBeDefined();
    expect(sessionData.questions.length).toBeGreaterThanOrEqual(3);

    const compQ = sessionData.questions.find((q) => q.type === "story_comprehension");
    const vocabQ = sessionData.questions.find((q) => q.type === "story_contextual_vocab");
    const clozeQ = sessionData.questions.find((q) => q.type === "story_cloze");

    expect(compQ).toBeDefined();
    expect(vocabQ).toBeDefined();
    expect(clozeQ).toBeDefined();

    // 3. User submits answers
    // - Comprehension answered correctly
    // - Contextual vocab answered INCORRECTLY
    // - Cloze answered INCORRECTLY
    const answers = sessionData.questions.map((q) => {
      if (q.type === "story_comprehension") {
        return {
          questionId: q.id,
          attemptNumber: 1,
          answer: "Maya's resilience", // correct
          responseMs: 2500,
        };
      }
      if (q.type === "story_contextual_vocab") {
        return {
          questionId: q.id,
          attemptNumber: 1,
          answer: "Waste carelessly", // incorrect
          responseMs: 3500,
        };
      }
      return {
        questionId: q.id,
        attemptNumber: 1,
        answer: "wrong_word", // incorrect cloze
        responseMs: 4000,
      };
    });

    const submissionResult = await quizService.submitQuizResult(deckId, {
      sessionId: sessionData.sessionId,
      answers,
    });

    // 4. Verify QuizAttempt summary
    expect(submissionResult.total).toBe(sessionData.questions.length);
    expect(submissionResult.score).toBe(1); // 1 correct, remaining incorrect
    expect(submissionResult.accuracy).toBe(
      Number(((1 / sessionData.questions.length) * 100).toFixed(1))
    );

    // 5. Verify PracticeAttempt table:
    // Only the questions linked to real flashcards (vocabQ & clozeQ) must exist in PracticeAttempt!
    // The comprehension question must NOT pollute PracticeAttempt.
    const practiceAttempts = await db.practiceAttempt.findMany({
      where: { sessionId: sessionData.sessionId },
    });

    const nonComprehensionCount = sessionData.questions.filter((q) => q.type !== "story_comprehension").length;
    expect(practiceAttempts).toHaveLength(nonComprehensionCount);

    const vocabAttempt = practiceAttempts.find((a) => a.questionType === "story_contextual_vocab");
    const clozeAttempt = practiceAttempts.find((a) => a.questionType === "story_cloze");

    expect(vocabAttempt).toBeDefined();
    expect(vocabAttempt?.flashcardId).toBe(cardDedicateId);
    expect(vocabAttempt?.correct).toBe(false);

    expect(clozeAttempt).toBeDefined();
    expect(clozeAttempt?.flashcardId).toBe(cardResilienceId);
    expect(clozeAttempt?.correct).toBe(false);

    // 6. Verify Mistake Bank reflects all mistakes with exact question types
    const allMistakes = await practiceEvidenceService.getDeckMistakes(deckId);
    expect(allMistakes.total).toBe(3);

    // Test Mistake Bank filter for STORY_CONTEXTUAL_VOCAB
    const vocabMistakes = await practiceEvidenceService.getDeckMistakes(deckId, {
      filter: "STORY_CONTEXTUAL_VOCAB",
    });
    expect(vocabMistakes.total).toBe(1);
    expect(vocabMistakes.mistakes[0].flashcardId).toBe(cardDedicateId);
    expect(vocabMistakes.mistakes[0].questionType).toBe("story_contextual_vocab");

    // Test Mistake Bank filter for STORY_CLOZE
    const clozeMistakes = await practiceEvidenceService.getDeckMistakes(deckId, {
      filter: "STORY_CLOZE",
    });
    expect(clozeMistakes.total).toBe(2);
    expect(clozeMistakes.mistakes.every((m) => m.questionType === "story_cloze")).toBe(true);

    // 7. Verify Smart Practice detects confirmed weak words
    // Under multi-axis practice evidence, confirmed weakness requires >= 2 attempts on a specific axis.
    // Simulate a follow-up first-pass attempt confirming weakness on production axis:
    await db.practiceAttempt.create({
      data: {
        flashcardId: cardDedicateId,
        sessionId: "sess_followup_story",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "story_cloze",
        correct: false,
        answer: "wrong",
        expectedAnswer: "dedicate",
      },
    });

    const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    expect(evidence.needPracticeCards.length).toBeGreaterThanOrEqual(1);

    const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });
});
