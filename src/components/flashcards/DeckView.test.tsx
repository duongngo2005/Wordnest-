import { beforeEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeckView } from "./DeckView";
import { FlashcardStatus } from "@/lib/flashcards/status";
import type {
  SerializedPracticeAxisSummary,
  SerializedPracticeEvidenceSummary,
} from "@/services/vocabulary/practice-evidence-service";

let renderedLessonGeneratorProps: Record<string, unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock modal components to avoid heavyweight subtrees in snapshot tests
vi.mock("@/components/lesson/LessonGeneratorModal", () => ({
  LessonGeneratorModal: (props: Record<string, unknown>) => {
    renderedLessonGeneratorProps = props;
    return null;
  },
}));

vi.mock("./AddCardsToDeckForm", () => ({
  AddCardsToDeckForm: () => null,
}));

describe("DeckView - Phase 1B UX Consolidation", () => {
  beforeEach(() => {
    renderedLessonGeneratorProps = null;
  });
  function noEvidenceAxis(axis: "recognition" | "production"): SerializedPracticeAxisSummary {
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

  const baseDeck = {
    id: "deck-xyz",
    name: "IELTS Advanced",
    description: "Vocabulary for 7.5+",
    folder: { name: "Academic English" },
    cards: [
      {
        id: "card-1",
        deckId: "deck-xyz",
        term: "ubiquitous",
        normalizedTerm: "ubiquitous",
        meaningVi: "phổ biến khắp nơi",
        definitionEn: "present everywhere",
        ipa: "/juːˈbɪkwɪtəs/",
        partOfSpeech: "adjective",
        cefr: "C1",
        exampleEn: "Smartphones have become ubiquitous.",
        exampleVi: "Điện thoại thông minh đã trở nên phổ biến.",
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
        status: FlashcardStatus.LEARNING,
        due: new Date(Date.now() - 10000), // Due
        state: 1, // Learning
      },
      {
        id: "card-2",
        deckId: "deck-xyz",
        term: "pragmatic",
        normalizedTerm: "pragmatic",
        meaningVi: "thực dụng",
        definitionEn: "dealing with things sensibly",
        ipa: "/præɡˈmætɪk/",
        partOfSpeech: "adjective",
        cefr: "C1",
        exampleEn: "A pragmatic approach.",
        exampleVi: "Một cách tiếp cận thực dụng.",
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
        status: FlashcardStatus.NEW,
        state: 0, // New
      },
    ],
    stats: {
      totalCards: 2,
      newCount: 1,
      learningCount: 1,
      knownCount: 0,
    },
  };

  it("renders Hero Recommendation banner with high priority when due cards exist", () => {
    const html = renderToStaticMarkup(
      <DeckView initialDeck={baseDeck} initialDueCardsCount={1} initialNewCardsCount={1} />
    );

    // Hero banner
    expect(html).toContain("Bạn nên làm gì tiếp?");
    expect(html).toContain("Đến hạn ôn tập");
    expect(html).toContain("1 thẻ đến hạn ôn tập");
    expect(html).toContain('href="/decks/deck-xyz/study"');
  });

  it("renders the exactly 3 Primary Learning Anchors", () => {
    const html = renderToStaticMarkup(
      <DeckView initialDeck={baseDeck} initialDueCardsCount={1} initialNewCardsCount={1} />
    );

    // Anchor 1: Ôn tập (FSRS route /decks/[id]/study)
    expect(html).toContain("Ôn tập");
    expect(html).toContain('href="/decks/deck-xyz/study"');
    expect(html).toContain("1 đến hạn");

    // Anchor 2: Thử thách (Quiz route /decks/[id]/quiz)
    expect(html).toContain("Thử thách");
    expect(html).toContain('href="/decks/deck-xyz/quiz"');

    // Anchor 3: Đọc & Ngữ cảnh
    expect(html).toContain("Đọc &amp; Ngữ cảnh");
    expect(html).toContain("Truyện &amp; Bài học");
  });

  it("relocates Thêm từ to utility header position", () => {
    const html = renderToStaticMarkup(
      <DeckView initialDeck={baseDeck} initialDueCardsCount={1} initialNewCardsCount={1} />
    );

    expect(html).toContain("Thêm từ");
  });

  it("passes weak cards as an available Lesson option without making them the hidden initial selection", () => {
    renderToStaticMarkup(
      <DeckView
        initialDeck={baseDeck}
        needPracticeCardIds={["card-1", "card-2"]}
        initialDueCardsCount={0}
        initialNewCardsCount={0}
      />
    );

    expect(renderedLessonGeneratorProps).toMatchObject({
      weakWordIds: ["card-1", "card-2"],
    });
    expect(renderedLessonGeneratorProps).not.toHaveProperty("initialSelectedIds");
  });

  it("does not render the 3 learning anchors when deck is empty", () => {
    const emptyDeck = {
      ...baseDeck,
      cards: [],
      stats: { totalCards: 0, newCount: 0, learningCount: 0, knownCount: 0 },
    };

    const html = renderToStaticMarkup(
      <DeckView initialDeck={emptyDeck} initialDueCardsCount={0} initialNewCardsCount={0} />
    );

    // Hero shows empty state CTA
    expect(html).toContain("Bộ từ chưa có thẻ nào");
    expect(html).toContain("Thêm từ đầu tiên");

    // 3 Learning anchors must NOT be rendered on empty deck
    expect(html).not.toContain("Phương pháp học tập chính");
  });

  it("relocates Cram to More menu as 'Lướt thẻ tự do' and removes redundant Story/Lesson from menu", () => {
    const html = renderToStaticMarkup(
      <DeckView initialDeck={baseDeck} initialDueCardsCount={1} initialNewCardsCount={1} />
    );

    // More menu contains Lướt thẻ tự do with subtitle
    expect(html).toContain('href="/decks/deck-xyz/practice"');
    expect(html).toContain("Lướt thẻ tự do");
    expect(html).toContain("Luyện nhanh, không ảnh hưởng lịch ôn");

    // More menu contains Sổ tay câu sai & Tiến độ
    expect(html).toContain('href="/decks/deck-xyz/mistakes"');
    expect(html).toContain('href="/progress/decks/deck-xyz"');

    // More menu does NOT contain redundant standalone Story / Bài học AI menu links
    // (they are now in the Đọc & Ngữ cảnh Learning Anchor)
    expect(html).not.toContain('href="/decks/deck-xyz/lesson"');
  });

  it("renders simplified 'Cần củng cố' panel when needPracticeCards exist", () => {
    const emptyModality = {
      attempts: 0,
      correct: 0,
      incorrect: 0,
      latestFirstPassCorrect: null,
      latestFirstPassAt: null,
    };

    const evidenceMap: Record<string, SerializedPracticeEvidenceSummary> = {
      "card-1": {
        flashcardId: "card-1",
        firstPassAttempts: 3,
        firstPassCorrect: 1,
        firstPassIncorrect: 2,
        retryAttempts: 0,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: false,
        lastPracticedAt: new Date().toISOString(),
        lastFirstPassAt: new Date().toISOString(),
        latestFirstPassMatchingRetryCorrect: null,
        recentFirstPassAttempts: [],
        breakdownByQuestionType: {
          multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
          typedRecall: { attempts: 3, correct: 1, incorrect: 2 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
        recentModalityEvidence: {
          typedRecall: emptyModality,
          storyCloze: emptyModality,
          multipleChoice: emptyModality,
        },
        classification: "NEEDS_PRACTICE" as const,
        explanationVi: "Hay nhầm lẫn trong bài gõ từ",
        recognitionAxis: noEvidenceAxis("recognition"),
        productionAxis: noEvidenceAxis("production"),
      },
    };

    const html = renderToStaticMarkup(
      <DeckView
        initialDeck={baseDeck}
        needPracticeCardIds={["card-1"]}
        evidenceMap={evidenceMap}
        initialDueCardsCount={0}
        initialNewCardsCount={1}
      />
    );

    // Heading and badge
    expect(html).toContain("Cần củng cố");
    expect(html).toContain("1 từ cần luyện thêm");
    expect(html).toContain("Hay nhầm lẫn trong bài gõ từ");

    // Primary CTA and secondary link
    expect(html).toContain('data-testid="btn-start-focused-practice"');
    expect(html).toContain('href="/decks/deck-xyz/quiz?mode=focused_practice"');
    expect(html).toContain("Củng cố · Luyện tập trung (1 từ)");
    expect(html).toContain("Sổ tay câu sai →");
  });

  it("enforces strict Route Contract: Cram (/practice) vs Quiz (/quiz) vs Focused Practice (/quiz?mode=focused_practice)", () => {
    const emptyModality = {
      attempts: 0,
      correct: 0,
      incorrect: 0,
      latestFirstPassCorrect: null,
      latestFirstPassAt: null,
    };
    const evidenceMap: Record<string, SerializedPracticeEvidenceSummary> = {
      "card-1": {
        flashcardId: "card-1",
        firstPassAttempts: 2,
        firstPassCorrect: 0,
        firstPassIncorrect: 2,
        retryAttempts: 0,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: false,
        lastPracticedAt: new Date().toISOString(),
        lastFirstPassAt: new Date().toISOString(),
        latestFirstPassMatchingRetryCorrect: null,
        recentFirstPassAttempts: [],
        breakdownByQuestionType: {
          multipleChoice: { attempts: 2, correct: 0, incorrect: 2 },
          typedRecall: { attempts: 0, correct: 0, incorrect: 0 },
          storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
          other: { attempts: 0, correct: 0, incorrect: 0 },
        },
        recentModalityEvidence: {
          typedRecall: emptyModality,
          storyCloze: emptyModality,
          multipleChoice: emptyModality,
        },
        classification: "NEEDS_PRACTICE" as const,
        explanationVi: "Cần củng cố",
        recognitionAxis: noEvidenceAxis("recognition"),
        productionAxis: noEvidenceAxis("production"),
      },
    };

    const html = renderToStaticMarkup(
      <DeckView
        initialDeck={baseDeck}
        needPracticeCardIds={["card-1"]}
        evidenceMap={evidenceMap}
        initialDueCardsCount={0}
        initialNewCardsCount={1}
      />
    );

    // 1. Cram: /decks/[id]/practice
    expect(html).toContain('href="/decks/deck-xyz/practice"');
    expect(html).toContain("Lướt thẻ tự do");

    // 2. Regular Quiz Anchor: /decks/[id]/quiz
    expect(html).toContain('href="/decks/deck-xyz/quiz"');
    expect(html).toContain("Thử thách");

    // 3. Focused Practice: /decks/[id]/quiz?mode=focused_practice
    expect(html).toContain('href="/decks/deck-xyz/quiz?mode=focused_practice"');
    expect(html).toContain("Củng cố · Luyện tập trung");

    // 4. Strict isolation: /practice NEVER receives ?mode=focused_practice
    expect(html).not.toContain("/decks/deck-xyz/practice?mode=focused_practice");
  });
});
