import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuizResults, AnswerRecord } from "./QuizResults";

vi.mock("@/lib/ui-sound", () => ({
  playUISound: vi.fn(),
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("QuizResults component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRecords: AnswerRecord[] = [
    {
      question: {
        id: "q-1",
        cardId: "c-1",
        type: "multiple_choice_vi_en",
        prompt: "Nghĩa: quả táo",
        correctAnswer: "apple",
        options: ["apple", "banana", "orange", "grape"],
        explanation: {
          term: "apple",
          meaningVi: "quả táo",
          definitionEn: null,
          exampleEn: null,
          exampleVi: null,
        },
      },
      userAnswer: "apple",
      isCorrect: true,
      expectedAnswer: "apple",
    },
    {
      question: {
        id: "q-2",
        cardId: "c-2",
        type: "multiple_choice_en_vi",
        prompt: "Từ: banana",
        correctAnswer: "quả chuối",
        options: ["quả chuối", "quả táo", "quả cam", "quả nho"],
        explanation: {
          term: "banana",
          meaningVi: "quả chuối",
          definitionEn: null,
          exampleEn: null,
          exampleVi: null,
        },
      },
      userAnswer: "quả táo",
      isCorrect: false,
      expectedAnswer: "quả chuối",
    },
  ];

  it("renders WordNest Practice Slip with honest first-pass results", () => {
    const html = renderToStaticMarkup(
      <QuizResults
        deck={{ id: "deck-1", name: "Trái cây căn bản" }}
        score={1}
        total={2}
        accuracy={50}
        records={mockRecords}
        submissionResult={{
          attemptId: "att-1",
          deckId: "deck-1",
          score: 1,
          total: 2,
          accuracy: 50,
          cardsUpdatedCount: 2,
        }}
        onRestart={vi.fn()}
      />
    );

    // Slip title and deck
    expect(html).toContain("Kết quả bài Quiz");
    expect(html).toContain("Trái cây căn bản");
    expect(html).toContain("WORDNEST PRACTICE SLIP");

    // Clear First-Pass label
    expect(html).toContain("Kết quả lần đầu");
    expect(html).toContain("1");
    expect(html).toContain("50%");
    expect(html).toContain("Câu đã ghi nhận");

    // Practice doctrine
    expect(html).toContain("Luyện tập không thay đổi lịch ôn.");
  });

  it("renders retry reinforcement banner when retry data is present", () => {
    const retryRecords: AnswerRecord[] = [
      {
        question: mockRecords[1].question,
        userAnswer: "quả chuối",
        isCorrect: true,
        expectedAnswer: "quả chuối",
      },
    ];

    const html = renderToStaticMarkup(
      <QuizResults
        deck={{ id: "deck-1", name: "Trái cây căn bản" }}
        score={1}
        total={2}
        accuracy={50}
        records={mockRecords}
        retryRecords={retryRecords}
        submissionResult={{
          attemptId: "att-1",
          deckId: "deck-1",
          score: 1,
          total: 2,
          accuracy: 50,
          cardsUpdatedCount: 2,
          firstPassScore: 1,
          firstPassTotal: 2,
          retryScore: 1,
          retryTotal: 1,
        }}
        onRestart={vi.fn()}
      />
    );

    // Assert retry evidence text exactly
    expect(html).toContain("Lần đầu: <strong>1/2</strong>");
    expect(html).toContain("Bạn đã sửa đúng <strong>1/1</strong> câu khi luyện lại.");
    expect(html).toContain("Đã sửa đúng khi luyện lại ✓");
    expect(html).toContain("Luyện lại");
    expect(html).toContain("1 <span class=\"text-sm font-bold text-[#92400E]\">/ 1</span>");
  });

  it("keeps contextual first-pass vocabulary mistakes targetable and returns to the exact Story", () => {
    const contextualRecords: AnswerRecord[] = [
      {
        question: {
          id: "q-comprehension",
          cardId: "",
          type: "story_comprehension",
          prompt: "Nội dung bài đọc nói về điều gì?",
          correctAnswer: "Đáp án đúng",
          options: ["Đáp án đúng", "Đáp án sai"],
          explanation: {
            term: "Bài đọc",
            meaningVi: "Bài đọc",
            definitionEn: null,
            exampleEn: null,
            exampleVi: null,
          },
        },
        userAnswer: "Đáp án sai",
        isCorrect: false,
      },
      {
        question: {
          id: "q-vocab",
          cardId: "card-a",
          type: "story_contextual_vocab",
          prompt: "Từ trong ngữ cảnh",
          correctAnswer: "Đáp án đúng",
          options: ["Đáp án đúng", "Đáp án sai"],
          explanation: {
            term: "target",
            meaningVi: "mục tiêu",
            definitionEn: null,
            exampleEn: null,
            exampleVi: null,
          },
        },
        userAnswer: "Đáp án sai",
        isCorrect: false,
      },
      {
        question: {
          id: "q-cloze",
          cardId: "card-b",
          type: "story_cloze",
          prompt: "Điền từ còn thiếu",
        },
        userAnswer: "wrong",
        isCorrect: false,
      },
    ];

    const html = renderToStaticMarkup(
      <QuizResults
        deck={{ id: "deck-1", name: "Trái cây căn bản" }}
        score={0}
        total={3}
        accuracy={0}
        records={contextualRecords}
        retryRecords={[
          {
            ...contextualRecords[1],
            userAnswer: "Đáp án đúng",
            isCorrect: true,
          },
        ]}
        submissionResult={null}
        contextualSource={{
          type: "story",
          id: "story-1",
          returnHref: "/decks/deck-1/story?storyId=story-1",
          returnLabel: "Quay lại truyện",
        }}
        onRestart={vi.fn()}
      />
    );

    expect(html).toContain("Luyện lại các từ vừa sai");
    expect(html).toContain(
      'href="/decks/deck-1/quiz?mode=focused_practice&amp;cardIds=card-a,card-b"'
    );
    expect(html).toContain("Quay lại truyện");
    expect(html).toContain('href="/decks/deck-1/story?storyId=story-1"');
  });

  it("returns to an exact Lesson without showing a targeted action for comprehension-only mistakes", () => {
    const html = renderToStaticMarkup(
      <QuizResults
        deck={{ id: "deck-1", name: "Trái cây căn bản" }}
        score={0}
        total={1}
        accuracy={0}
        records={[
          {
            question: {
              id: "q-comprehension",
              cardId: "",
              type: "story_comprehension",
              prompt: "Nội dung bài đọc nói về điều gì?",
              correctAnswer: "Đáp án đúng",
              options: ["Đáp án đúng", "Đáp án sai"],
              explanation: {
                term: "Bài đọc",
                meaningVi: "Bài đọc",
                definitionEn: null,
                exampleEn: null,
                exampleVi: null,
              },
            },
            userAnswer: "Đáp án sai",
            isCorrect: false,
          },
        ]}
        submissionResult={null}
        contextualSource={{
          type: "lesson",
          id: "lesson-1",
          returnHref: "/decks/deck-1/lesson?lessonId=lesson-1",
          returnLabel: "Quay lại bài học",
        }}
        onRestart={vi.fn()}
      />
    );

    expect(html).toContain("Quay lại bài học");
    expect(html).toContain('href="/decks/deck-1/lesson?lessonId=lesson-1"');
    expect(html).not.toContain("Luyện lại các từ vừa sai");
  });

  it("does not render contextual source actions for regular Quiz results", () => {
    const html = renderToStaticMarkup(
      <QuizResults
        deck={{ id: "deck-1", name: "Trái cây căn bản" }}
        score={1}
        total={2}
        accuracy={50}
        records={mockRecords}
        submissionResult={null}
        onRestart={vi.fn()}
      />
    );

    expect(html).not.toContain("Quay lại truyện");
    expect(html).not.toContain("Quay lại bài học");
    expect(html).not.toContain("Luyện lại các từ vừa sai");
  });
});
