import { describe, it, expect, vi } from "vitest";
import {
  aiStoryComprehensionQuestionSchema,
  aiStoryContextualVocabQuestionSchema,
  aiStoryExerciseSetSchema,
} from "@/lib/validation/story-exercise";
import { createStoryVocabularyMetadata } from "@/lib/story/story-vocabulary";
import { StoryExerciseService } from "./story-exercise-service";
import type { AIService } from "@/services/ai";
import { type Flashcard, type Story, FlashcardStatus } from "@prisma/client";

describe("Story Exercise Validation & Generation", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid comprehension question", () => {
      const valid = {
        prompt: "Why did Maya decide to allocate more time to reading?",
        options: [
          "She wanted to prepare for her exam",
          "She had nothing else to do",
          "Her teacher forced her",
          "She lost her phone",
        ],
        correctAnswer: "She wanted to prepare for her exam",
        explanation: "The story states Maya planned her study schedule for the upcoming test.",
      };
      const parsed = aiStoryComprehensionQuestionSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it("rejects comprehension question with fewer than 4 options", () => {
      const invalid = {
        prompt: "Why did Maya decide to allocate more time to reading?",
        options: ["Option A", "Option B"],
        correctAnswer: "Option A",
        explanation: "Explanation",
      };
      const parsed = aiStoryComprehensionQuestionSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it("validates valid contextual vocabulary question", () => {
      const valid = {
        term: "resilience",
        sentence: "Her resilience allowed her to overcome every setback.",
        prompt: "In this sentence, 'resilience' most nearly means:",
        options: [
          "The ability to recover quickly from difficulties",
          "Physical strength and muscular speed",
          "A state of constant happiness",
          "The tendency to avoid risks",
        ],
        correctAnswer: "The ability to recover quickly from difficulties",
        explanation: "Resilience here refers to bouncing back from setbacks.",
      };
      const parsed = aiStoryContextualVocabQuestionSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it("validates full AIStoryExerciseSet schema", () => {
      const validSet = {
        comprehension: [
          {
            prompt: "What happened first?",
            options: ["A", "B", "C", "D"],
            correctAnswer: "A",
            explanation: "First event in paragraph 1",
          },
        ],
        contextualVocabulary: [
          {
            term: "resilience",
            sentence: "Her resilience helped her.",
            prompt: "What does resilience mean?",
            options: ["Recovery", "Speed", "Fear", "Luck"],
            correctAnswer: "Recovery",
            explanation: "Refers to recovery",
          },
        ],
      };
      const parsed = aiStoryExerciseSetSchema.safeParse(validSet);
      expect(parsed.success).toBe(true);
    });
  });

  describe("StoryExerciseService.generateStoryExerciseQuestions", () => {
    const mockStory: Story = {
      id: "story-test-1",
      deckId: "deck-test-1",
      title: "Maya's Journey",
      content:
        "Maya had remarkable resilience. Whenever challenges arose, she would dedicate hours to solving them. Her teacher praised her dedication.",
      cefr: "B2",
      length: "short",
      topic: "Personal Growth",
      targetWords: JSON.stringify(
        createStoryVocabularyMetadata(
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
        )
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockCards: Flashcard[] = [
      {
        id: "card-resilience",
        deckId: "deck-test-1",
        term: "resilience",
        normalizedTerm: "resilience",
        meaningVi: "sự kiên trì, kiên cường",
        definitionEn: "the capacity to recover quickly from difficulties",
        partOfSpeech: "noun",
        ipa: "/rɪˈzɪliəns/",
        exampleEn: "She showed great resilience.",
        exampleVi: "Cô ấy thể hiện sự kiên cường.",
        cefr: "B2",
        status: FlashcardStatus.NEW,
        schedulerVersion: 0,
        imageAuthor: null,
        imagePageUrl: null,
        imageLicense: null,
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "card-dedicate",
        deckId: "deck-test-1",
        term: "dedicate",
        normalizedTerm: "dedicate",
        meaningVi: "cống hiến, dành thời gian",
        definitionEn: "devote time or effort to a particular task",
        partOfSpeech: "verb",
        ipa: "/ˈdedɪkeɪt/",
        exampleEn: "He dedicated his life to science.",
        exampleVi: "Anh ấy cống hiến đời mình cho khoa học.",
        cefr: "B2",
        status: FlashcardStatus.NEW,
        schedulerVersion: 0,
        imageAuthor: null,
        imagePageUrl: null,
        imageLicense: null,
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it("blends reading comprehension, contextual vocab, and deterministic cloze", async () => {
      const mockAi: Partial<AIService> = {
        callStructured: vi.fn().mockResolvedValue({
          comprehension: [
            {
              prompt: "What quality did Maya possess?",
              options: [
                "Remarkable resilience",
                "Extreme impatience",
                "Constant carelessness",
                "Fear of challenges",
              ],
              correctAnswer: "Remarkable resilience",
              explanation: "Paragraph 1 mentions Maya had remarkable resilience.",
            },
          ],
          contextualVocabulary: [
            {
              term: "resilience",
              sentence: "Maya had remarkable resilience.",
              prompt: "In this sentence, 'resilience' most nearly means:",
              options: [
                "Ability to bounce back",
                "Stubborn refusal to change",
                "Physical weakness",
                "Sudden anger",
              ],
              correctAnswer: "Ability to bounce back",
              explanation: "Refers to perseverance in challenges.",
            },
          ],
        }),
      };

      const service = new StoryExerciseService(mockAi as AIService);
      const questions = await service.generateStoryExerciseQuestions(mockStory, mockCards);

      expect(questions.length).toBeGreaterThanOrEqual(3);

      // Verify reading comprehension question
      const compQ = questions.find((q) => q.type === "story_comprehension");
      expect(compQ).toBeDefined();
      expect(compQ?.cardId).toBe(""); // Comprehension has no cardId
      expect(compQ?.options).toHaveLength(4);
      expect(compQ?.correctAnswer).toBe("Remarkable resilience");

      // Verify contextual vocab question
      const vocabQ = questions.find((q) => q.type === "story_contextual_vocab");
      expect(vocabQ).toBeDefined();
      expect(vocabQ?.cardId).toBe("card-resilience"); // Canonical flashcard linked!
      expect(vocabQ?.options).toHaveLength(4);
      expect(vocabQ?.correctAnswer).toBe("Ability to bounce back");

      // Verify deterministic story cloze question
      const clozeQ = questions.find((q) => q.type === "story_cloze");
      expect(clozeQ).toBeDefined();
      expect(clozeQ?.cardId).toBe("card-resilience");
    });

    it("gracefully falls back to deterministic cloze if AI fails or times out", async () => {
      const mockFailingAi: Partial<AIService> = {
        callStructured: vi.fn().mockRejectedValue(new Error("Local Ollama timed out")),
      };

      const service = new StoryExerciseService(mockFailingAi as AIService);
      const questions = await service.generateStoryExerciseQuestions(mockStory, mockCards);

      // Should not throw, but fallback to cloze questions
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every((q) => q.type === "story_cloze")).toBe(true);
    });

    it("filters out invalid multiple choice questions with duplicate options or mismatched answers", async () => {
      const mockAiWithBadData: Partial<AIService> = {
        callStructured: vi.fn().mockResolvedValue({
          comprehension: [
            {
              prompt: "Bad question with duplicate options",
              options: ["Option A", "Option A", "Option B", "Option C"],
              correctAnswer: "Option A",
              explanation: "Duplicate options should be rejected",
            },
            {
              prompt: "Bad question where correct answer is not in options",
              options: ["Option 1", "Option 2", "Option 3", "Option 4"],
              correctAnswer: "Option 5",
              explanation: "Mismatched answer should be rejected",
            },
          ],
          contextualVocabulary: [],
        }),
      };

      const service = new StoryExerciseService(mockAiWithBadData as AIService);
      const questions = await service.generateStoryExerciseQuestions(mockStory, mockCards);

      // Both bad comprehension questions must be rejected by post-validation
      expect(questions.filter((q) => q.type === "story_comprehension")).toHaveLength(0);
      // Fallback cloze questions still remain
      expect(questions.filter((q) => q.type === "story_cloze").length).toBeGreaterThan(0);
    });
  });
});
