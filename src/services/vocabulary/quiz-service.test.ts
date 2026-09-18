import { describe, it, expect } from "vitest";
import {
  QuizService,
  maskSentenceWithTerm,
} from "./quiz-service";
import { Flashcard, FlashcardStatus } from "@prisma/client";

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
