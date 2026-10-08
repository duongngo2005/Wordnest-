import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { Flashcard, FlashcardStatus } from "@prisma/client";
import {
  quizService,
  selectBreadthQuizCards,
  selectRegularQuizModality,
} from "./quiz-service";
import {
  type PracticeAxisSummary,
  type PracticeEvidenceSummary,
} from "./practice-evidence-service";

describe("Phase 2A: Regular Quiz Breadth Sampling & Modality Readiness", () => {
  function noEvidenceAxis(axis: "recognition" | "production"): PracticeAxisSummary {
    return {
      axis,
      state: "NO_EVIDENCE",
      lifetimeFirstPassAttempts: 0,
      lifetimeFirstPassCorrect: 0,
      lifetimeFirstPassIncorrect: 0,
      lifetimeRetryAttempts: 0,
      lifetimeRetryCorrect: 0,
      lifetimeRetryIncorrect: 0,
      recentFirstPassAttempts: [],
      recentAttemptsCount: 0,
      recentCorrectCount: 0,
      recentIncorrectCount: 0,
      latestFirstPassCorrect: null,
      lastFirstPassAt: null,
      latestFirstPassMatchingRetryCorrect: null,
      explanationVi: "Chưa có dữ liệu luyện tập",
    };
  }

  describe("Unit: selectBreadthQuizCards", () => {
    function makeDummyCard(id: string, term: string): Flashcard {
      return {
        id,
        deckId: "deck-dummy",
        term,
        normalizedTerm: term.toLowerCase(),
        meaningVi: `nghĩa của ${term}`,
        definitionEn: null,
        ipa: null,
        partOfSpeech: "noun",
        exampleEn: `This is an example sentence for ${term}.`,
        exampleVi: null,
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
        imagePageUrl: null,
        imageAuthor: null,
        imageLicense: null,
        cefr: "B1",
        status: FlashcardStatus.NEW,
        due: new Date(),
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReviewAt: null,
        learningSteps: 0,
        schedulerVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    function makeSummary(cardId: string, overrides: Partial<PracticeEvidenceSummary> = {}): PracticeEvidenceSummary {
      return {
        flashcardId: cardId,
        firstPassAttempts: 0,
        firstPassCorrect: 0,
        firstPassIncorrect: 0,
        retryAttempts: 0,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: null,
        lastPracticedAt: null,
        lastFirstPassAt: null,
        latestFirstPassMatchingRetryCorrect: null,
        breakdownByQuestionType: {
          typedRecall: { attempts: 0, correct: 0, incorrect: 0 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
        recentFirstPassAttempts: [],
        recentModalityEvidence: {
          typedRecall: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
        },
        classification: "NO_EVIDENCE",
        explanationVi: "Chưa có dữ liệu",
        recognitionAxis: noEvidenceAxis("recognition"),
        productionAxis: noEvidenceAxis("production"),
        ...overrides,
      };
    }

    it("CASE A: Deck 20 cards, none ever practiced -> selects 10 distinct cards, and subsequent run with evidence takes remaining 10", () => {
      const cards: Flashcard[] = Array.from({ length: 20 }, (_, i) =>
        makeDummyCard(`c-${i + 1}`, `term-${i + 1}`)
      );
      const summaries = new Map<string, PracticeEvidenceSummary>();

      // Session 1: All 20 are unpracticed
      const session1Cards = selectBreadthQuizCards(cards, summaries, 10);
      expect(session1Cards).toHaveLength(10);
      const s1Ids = new Set(session1Cards.map((c) => c.id));
      expect(s1Ids.size).toBe(10);

      // Simulate session 1 cards now having practice evidence
      const session1Time = new Date("2026-06-01T10:00:00Z");
      for (const card of session1Cards) {
        summaries.set(
          card.id,
          makeSummary(card.id, {
            firstPassAttempts: 1,
            firstPassCorrect: 1,
            lastFirstPassAt: session1Time,
            lastPracticedAt: session1Time,
          })
        );
      }

      // Session 2: Must prioritize the remaining 10 unpracticed cards
      const session2Cards = selectBreadthQuizCards(cards, summaries, 10);
      expect(session2Cards).toHaveLength(10);
      const s2Ids = new Set(session2Cards.map((c) => c.id));
      expect(s2Ids.size).toBe(10);

      // Verify Session 1 and Session 2 have completely disjoint sets of cards (100% coverage achieved across the 2 sessions!)
      for (const id of s2Ids) {
        expect(s1Ids.has(id)).toBe(false);
      }
    });

    it("CASE B: Deck with 5 never practiced and 15 practiced -> 5 never practiced must be chosen first", () => {
      const cards: Flashcard[] = Array.from({ length: 20 }, (_, i) =>
        makeDummyCard(`c-${i + 1}`, `term-${i + 1}`)
      );
      const summaries = new Map<string, PracticeEvidenceSummary>();

      // Cards c-6 through c-20 were practiced at various dates
      for (let i = 5; i < 20; i++) {
        const practicedDate = new Date(Date.now() - (20 - i) * 86400000); // oldest to newest
        summaries.set(
          cards[i].id,
          makeSummary(cards[i].id, {
            firstPassAttempts: 1,
            firstPassCorrect: 1,
            lastFirstPassAt: practicedDate,
            lastPracticedAt: practicedDate,
          })
        );
      }
      // Cards c-1 to c-5 have NO practice evidence

      const selected = selectBreadthQuizCards(cards, summaries, 10);
      expect(selected).toHaveLength(10);
      const selectedIds = new Set(selected.map((c) => c.id));

      // All 5 unpracticed cards (c-1 through c-5) MUST be included
      for (let i = 0; i < 5; i++) {
        expect(selectedIds.has(cards[i].id)).toBe(true);
      }

      // The remaining 5 cards must be the oldest practiced ones (c-6, c-7, c-8, c-9, c-10)
      for (let i = 5; i < 10; i++) {
        expect(selectedIds.has(cards[i].id)).toBe(true);
      }
    });

    it("CASE C: All cards previously practiced -> oldest lastFirstPassAt chosen first", () => {
      const cards = [
        makeDummyCard("c-newest", "newest"),
        makeDummyCard("c-middle", "middle"),
        makeDummyCard("c-oldest", "oldest"),
      ];
      const summaries = new Map<string, PracticeEvidenceSummary>([
        [
          "c-newest",
          makeSummary("c-newest", {
            firstPassAttempts: 1,
            lastFirstPassAt: new Date("2026-06-03T10:00:00Z"),
          }),
        ],
        [
          "c-middle",
          makeSummary("c-middle", {
            firstPassAttempts: 1,
            lastFirstPassAt: new Date("2026-06-02T10:00:00Z"),
          }),
        ],
        [
          "c-oldest",
          makeSummary("c-oldest", {
            firstPassAttempts: 1,
            lastFirstPassAt: new Date("2026-06-01T10:00:00Z"),
          }),
        ],
      ]);

      const selected = selectBreadthQuizCards(cards, summaries, 2);
      expect(selected).toHaveLength(2);
      expect(selected[0].id).toBe("c-oldest");
      expect(selected[1].id).toBe("c-middle");
    });

    it("CASE D: Recent retry does NOT make a card 'recently practiced' for breadth ordering", () => {
      const cards = [
        makeDummyCard("c-old-fp-new-retry", "cardA"),
        makeDummyCard("c-recent-fp", "cardB"),
      ];
      const summaries = new Map<string, PracticeEvidenceSummary>([
        [
          "c-old-fp-new-retry",
          makeSummary("c-old-fp-new-retry", {
            firstPassAttempts: 1,
            retryAttempts: 1,
            // Old first pass, but new retry
            lastFirstPassAt: new Date("2026-01-01T10:00:00Z"),
            lastPracticedAt: new Date("2026-06-01T10:00:00Z"), // retry date
          }),
        ],
        [
          "c-recent-fp",
          makeSummary("c-recent-fp", {
            firstPassAttempts: 1,
            lastFirstPassAt: new Date("2026-05-01T10:00:00Z"),
            lastPracticedAt: new Date("2026-05-01T10:00:00Z"),
          }),
        ],
      ]);

      // Breadth selection must sort strictly by lastFirstPassAt (oldest first).
      // c-old-fp-new-retry's first pass was 2026-01-01, which is older than 2026-05-01.
      const selected = selectBreadthQuizCards(cards, summaries, 1);
      expect(selected[0].id).toBe("c-old-fp-new-retry");
    });
  });

  describe("Unit: selectRegularQuizModality", () => {
    const cardWithExample: Flashcard = {
      id: "card-1",
      deckId: "deck-1",
      term: "allocate",
      normalizedTerm: "allocate",
      meaningVi: "phân bổ",
      definitionEn: null,
      ipa: null,
      partOfSpeech: "verb",
      exampleEn: "We need to allocate resources wisely.",
      exampleVi: null,
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      imagePageUrl: null,
      imageAuthor: null,
      imageLicense: null,
      cefr: "B2",
      status: FlashcardStatus.NEW,
      due: new Date(),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReviewAt: null,
      learningSteps: 0,
      schedulerVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const cardWithoutExample: Flashcard = {
      ...cardWithExample,
      id: "card-2",
      exampleEn: null,
    };

    const allAllowed = [
      "multiple_choice_en_vi",
      "multiple_choice_vi_en",
      "fill_in_blank",
      "typed_vi_en",
    ] as const;

    function dummySummary(overrides: Partial<PracticeEvidenceSummary>): PracticeEvidenceSummary {
      return {
        flashcardId: "card-1",
        firstPassAttempts: 0,
        firstPassCorrect: 0,
        firstPassIncorrect: 0,
        retryAttempts: 0,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: null,
        lastPracticedAt: null,
        lastFirstPassAt: null,
        latestFirstPassMatchingRetryCorrect: null,
        breakdownByQuestionType: {
          typedRecall: { attempts: 0, correct: 0, incorrect: 0 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
        recentFirstPassAttempts: [],
        recentModalityEvidence: {
          typedRecall: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
        },
        classification: "NO_EVIDENCE",
        explanationVi: "",
        recognitionAxis: noEvidenceAxis("recognition"),
        productionAxis: noEvidenceAxis("production"),
        ...overrides,
      };
    }

    it("LEVEL 0: completely new card (0 first-pass attempts) -> strictly Recognition (never typed)", () => {
      const modality = selectRegularQuizModality(cardWithExample, undefined, [...allAllowed]);
      expect(["multiple_choice_en_vi", "multiple_choice_vi_en"]).toContain(modality);
      expect(modality).not.toBe("typed_vi_en");
    });

    it("LEVEL 1: limited evidence (1 first-pass correct) -> Recognition / Contextual Recognition (not typed)", () => {
      const summary = dummySummary({
        firstPassAttempts: 1,
        firstPassCorrect: 1,
      });
      const modality = selectRegularQuizModality(cardWithExample, summary, [...allAllowed]);
      expect(["fill_in_blank", "multiple_choice_en_vi", "multiple_choice_vi_en"]).toContain(modality);
      expect(modality).not.toBe("typed_vi_en");
    });

    it("LEVEL 2: ready for production (2+ first-pass correct in recognition) -> assigns typed_vi_en", () => {
      const summary = dummySummary({
        firstPassAttempts: 2,
        firstPassCorrect: 2,
      });
      const modality = selectRegularQuizModality(cardWithExample, summary, [...allAllowed]);
      expect(modality).toBe("typed_vi_en");
    });

    it("LEVEL 2: ready for production (has prior first-pass typed attempt) -> assigns typed_vi_en", () => {
      const summary = dummySummary({
        firstPassAttempts: 1,
        firstPassCorrect: 1,
        breakdownByQuestionType: {
          typedRecall: { attempts: 1, correct: 1, incorrect: 0 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
      });
      const modality = selectRegularQuizModality(cardWithExample, summary, [...allAllowed]);
      expect(modality).toBe("typed_vi_en");
    });

    it("LEVEL 3: previous first-pass typed failure -> assigns typed_vi_en to re-test production", () => {
      const summary = dummySummary({
        firstPassAttempts: 1,
        firstPassIncorrect: 1,
        breakdownByQuestionType: {
          typedRecall: { attempts: 1, correct: 0, incorrect: 1 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
      });
      const modality = selectRegularQuizModality(cardWithExample, summary, [...allAllowed]);
      expect(modality).toBe("typed_vi_en");
    });

    it("FALLBACK: card without exampleEn never gets fill_in_blank", () => {
      const summary = dummySummary({
        firstPassAttempts: 1,
        firstPassCorrect: 1,
      });
      const modality = selectRegularQuizModality(cardWithoutExample, summary, [...allAllowed]);
      expect(["multiple_choice_en_vi", "multiple_choice_vi_en"]).toContain(modality);
      expect(modality).not.toBe("fill_in_blank");
    });

    it("FALLBACK: card without meaningVi never gets typed_vi_en even if ready", () => {
      const cardNoMeaning: Flashcard = {
        ...cardWithExample,
        meaningVi: "",
      };
      const summary = dummySummary({
        firstPassAttempts: 3,
        firstPassCorrect: 3,
      });
      const modality = selectRegularQuizModality(cardNoMeaning, summary, [...allAllowed]);
      expect(modality).not.toBe("typed_vi_en");
    });
  });

  describe("Integration: generateQuestions Session Guardrails", () => {
    let deckId: string;
    let cards: Flashcard[] = [];

    beforeEach(async () => {
      const deck = await db.deck.create({
        data: { name: `TestBreadthDeck-${crypto.randomUUID()}` },
      });
      deckId = deck.id;

      // Create 10 cards
      cards = [];
      for (let i = 1; i <= 10; i++) {
        const c = await db.flashcard.create({
          data: {
            deckId,
            term: `term${i}`,
            normalizedTerm: `term${i}`,
            meaningVi: `nghĩa ${i}`,
            exampleEn: `Example sentence for term${i} in context.`,
          },
        });
        cards.push(c);
      }
    });

    afterEach(async () => {
      if (deckId) {
        await db.deck.delete({ where: { id: deckId } }).catch(() => {});
      }
    });

    it("Session Guardrail: 10 brand-new cards -> 0 typed questions", () => {
      const summaries = new Map<string, PracticeEvidenceSummary>();
      const questions = quizService.generateQuestions(cards, 10, undefined, summaries);

      expect(questions).toHaveLength(10);
      const typedQuestions = questions.filter((q) => q.type === "typed_vi_en");
      expect(typedQuestions).toHaveLength(0);
    });

    it("Session Guardrail: 10 mature cards (all ready for production) -> capped at at most 50% typed questions", () => {
      const summaries = new Map<string, PracticeEvidenceSummary>();
      for (const card of cards) {
        summaries.set(
          card.id,
          {
            flashcardId: card.id,
            firstPassAttempts: 3,
            firstPassCorrect: 3,
            firstPassIncorrect: 0,
            retryAttempts: 0,
            retryCorrect: 0,
            retryIncorrect: 0,
            latestFirstPassCorrect: true,
            lastPracticedAt: new Date(),
            lastFirstPassAt: new Date(),
            latestFirstPassMatchingRetryCorrect: null,
            breakdownByQuestionType: {
              typedRecall: { attempts: 0, correct: 0, incorrect: 0 },
              storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
              multipleChoice: { attempts: 3, correct: 3, incorrect: 0 },
              other: { attempts: 0, correct: 0, incorrect: 0 },
            },
            recentFirstPassAttempts: [],
            recentModalityEvidence: {
              typedRecall: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
              storyCloze: { attempts: 0, correct: 0, incorrect: 0, latestFirstPassCorrect: null, latestFirstPassAt: null },
              multipleChoice: { attempts: 3, correct: 3, incorrect: 0, latestFirstPassCorrect: true, latestFirstPassAt: new Date() },
            },
            classification: "RECENTLY_SUCCESSFUL",
            explanationVi: "Thành công",
            recognitionAxis: {
              ...noEvidenceAxis("recognition"),
              state: "STRONG",
              lifetimeFirstPassAttempts: 3,
              lifetimeFirstPassCorrect: 3,
            },
            productionAxis: noEvidenceAxis("production"),
          }
        );
      }

      const questions = quizService.generateQuestions(cards, 10, undefined, summaries);
      expect(questions).toHaveLength(10);
      const typedQuestions = questions.filter((q) => q.type === "typed_vi_en");

      // Capped at exactly 5 (50% of 10)
      expect(typedQuestions.length).toBeLessThanOrEqual(5);
      expect(typedQuestions.length).toBeGreaterThanOrEqual(2);
    });

    it("End-to-End getDeckQuiz: Integrates breadth sampling and adaptive readiness", async () => {
      // Add first-pass practice attempts for cards 1 and 2
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cards[0].id,
            sessionId: "ses-test-1",
            questionType: "multiple_choice_en_vi",
            mode: "quiz",
            attemptNumber: 1,
            answer: "nghĩa 1",
            expectedAnswer: "nghĩa 1",
            correct: true,
          },
          {
            flashcardId: cards[0].id,
            sessionId: "ses-test-2",
            questionType: "multiple_choice_vi_en",
            mode: "quiz",
            attemptNumber: 1,
            answer: "term1",
            expectedAnswer: "term1",
            correct: true,
          },
        ],
      });

      const quizData = await quizService.getDeckQuiz(deckId, 10);
      expect(quizData.questions).toHaveLength(10);
      expect(quizData.sessionId).toBeDefined();

      // Card 1 has 2 correct first-pass attempts -> ready for typed_vi_en
      const card1Question = quizData.questions.find((q) => q.cardId === cards[0].id);
      expect(card1Question?.type).toBe("typed_vi_en");
    });
  });
});
