import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLessonPrompt } from "@/lib/lesson/lesson-prompt";
import { LessonService } from "./lesson-service";
import type { AIService } from "@/services/ai";
import { db } from "@/lib/db";
import { FlashcardStatus, type Deck, type Flashcard, type Lesson } from "@prisma/client";

describe("Lesson Generation & Service Unit Tests", () => {
  describe("buildLessonPrompt", () => {
    it("builds a prompt with educational context, target words and CEFR", () => {
      const prompt = buildLessonPrompt({
        targetWords: [
          { term: "collaborate", meaningVi: "hợp tác", partOfSpeech: "verb" },
          { term: "efficient", meaningVi: "hiệu quả", partOfSpeech: "adjective" },
        ],
        cefr: "B2",
        topic: "Workplace Productivity",
      });

      expect(prompt).toContain("Workplace Productivity");
      expect(prompt).toContain('"collaborate" (verb): hợp tác');
      expect(prompt).toContain('"efficient" (adjective): hiệu quả');
      expect(prompt).toContain("CEFR Level B2");
      expect(prompt).toContain("~120 to 200 words");
      expect(prompt).toContain("Contextual Clues");
    });
  });

  describe("LessonService", () => {
    const mockDeck = {
      id: "deck-lesson-test",
      name: "Business English",
      cards: [
        {
          id: "card-1",
          deckId: "deck-lesson-test",
          term: "negotiate",
          normalizedTerm: "negotiate",
          meaningVi: "đàm phán",
          definitionEn: "try to reach an agreement",
          partOfSpeech: "verb",
          ipa: "/nɪˈɡəʊʃieɪt/",
          exampleEn: "We negotiated a good deal.",
          exampleVi: "Chúng tôi đã đàm phán một thỏa thuận tốt.",
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
          id: "card-2",
          deckId: "deck-lesson-test",
          term: "compromise",
          normalizedTerm: "compromise",
          meaningVi: "thỏa hiệp",
          definitionEn: "an agreement or a settlement",
          partOfSpeech: "noun",
          ipa: "/ˈkɒmprəmaɪz/",
          exampleEn: "Both sides reached a compromise.",
          exampleVi: "Cả hai bên đã đạt được thỏa hiệp.",
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
      ],
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("throws if no target words are provided", async () => {
      const service = new LessonService({} as AIService);
      await expect(
        service.createLesson({
          deckId: "deck-1",
          targetWords: [],
        })
      ).rejects.toThrow("Vui lòng chọn ít nhất một từ vựng");
    });

    it("throws if deck is not found", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue(null);
      const service = new LessonService({} as AIService);
      await expect(
        service.createLesson({
          deckId: "missing-deck",
          targetWords: ["card-1"],
        })
      ).rejects.toThrow("Không tìm thấy bộ thẻ.");
    });

    it("generates a lesson passage and persists with coverage and translations", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue(mockDeck as unknown as (Deck & { cards: Flashcard[] }));

      const mockAi: Partial<AIService> = {
        callStructured: vi.fn().mockResolvedValue({
          title: "The Art of Business Agreement",
          content:
            "During high-stakes discussions, international teams often need to negotiate mutually beneficial terms. When differences arise, finding a reasonable compromise ensures that the project moves forward without unnecessary delay.",
        }),
      };

      const mockCreatedLesson = {
        id: "lesson-123",
        deckId: "deck-lesson-test",
        title: "The Art of Business Agreement",
        content:
          "During high-stakes discussions, international teams often need to negotiate mutually beneficial terms. When differences arise, finding a reasonable compromise ensures that the project moves forward without unnecessary delay.",
        cefr: "B2",
        targetWords: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createSpy = vi
        .spyOn(db.lesson, "create")
        .mockResolvedValue(mockCreatedLesson as unknown as Lesson);

      const stages: string[] = [];
      const service = new LessonService(mockAi as AIService);

      const result = await service.createLesson({
        deckId: "deck-lesson-test",
        targetWords: ["card-1", "card-2"],
        cefr: "B2",
        topic: "Business Negotiations",
        onStageChange: async (stage) => {
          stages.push(stage);
        },
      });

      expect(result.id).toBe("lesson-123");
      expect(stages).toContain("generating_lesson");
      expect(stages).toContain("validating_vocabulary");
      expect(stages).toContain("generating_translations");
      expect(stages).toContain("saving");
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deckId: "deck-lesson-test",
            title: "The Art of Business Agreement",
            cefr: "B2",
          }),
        })
      );
    });

    it("triggers targeted repair when some target words are omitted", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue(mockDeck as unknown as (Deck & { cards: Flashcard[] }));

      const callStructuredMock = vi
        .fn()
        // First generation misses "compromise"
        .mockResolvedValueOnce({
          title: "Talking Business",
          content: "Teams usually negotiate terms before signing contracts.",
        })
        // Second generation (repair) includes both
        .mockResolvedValueOnce({
          title: "Talking Business Repaired",
          content:
            "Teams usually negotiate terms before signing contracts. Finding a compromise is critical.",
        });

      const mockAi: Partial<AIService> = {
        callStructured: callStructuredMock,
      };

      vi.spyOn(db.lesson, "create").mockResolvedValue({
        id: "lesson-repaired",
        deckId: "deck-lesson-test",
        title: "Talking Business Repaired",
        content:
          "Teams usually negotiate terms before signing contracts. Finding a compromise is critical.",
        cefr: "B2",
        targetWords: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Lesson);

      const stages: string[] = [];
      const service = new LessonService(mockAi as AIService);

      await service.createLesson({
        deckId: "deck-lesson-test",
        targetWords: ["card-1", "card-2"],
        cefr: "B2",
        onStageChange: async (stage) => {
          stages.push(stage);
        },
      });

      expect(stages).toContain("repairing_lesson");
      expect(callStructuredMock).toHaveBeenCalledTimes(2);
    });

    it("throws an error if no target words could be integrated after generation and repair", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue(mockDeck as unknown as (Deck & { cards: Flashcard[] }));

      const mockAi: Partial<AIService> = {
        callStructured: vi.fn().mockResolvedValue({
          title: "Irrelevant Topic",
          content: "The weather was completely fine and everyone walked in the quiet park.",
        }),
      };

      const service = new LessonService(mockAi as AIService);

      await expect(
        service.createLesson({
          deckId: "deck-lesson-test",
          targetWords: ["card-1", "card-2"],
          cefr: "B2",
        })
      ).rejects.toThrow("Không thể tích hợp từ vựng mục tiêu vào bài học");
    });
  });
});
