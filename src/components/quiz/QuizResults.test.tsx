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
});
