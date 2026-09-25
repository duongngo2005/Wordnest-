import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressDashboard } from "./ProgressDashboard";
import type { ProgressAnalytics } from "@/services/vocabulary/progress-service";

const mockAnalytics: ProgressAnalytics = {
  scope: { kind: "global", name: "Tất cả bộ từ" },
  today: {
    due: 6,
    overdue: 2,
    reviewedCards: 4,
    reviewEvents: 5,
    totalCards: 25,
    weakCards: 1,
  },
  activity: [
    { date: "2026-09-24", label: "T.5, 24", count: 3 },
    { date: "2026-09-25", label: "T.6, 25", count: 5 },
  ],
  upcomingDue: [
    { date: "2026-09-25", label: "Hôm nay", count: 6 },
    { date: "2026-09-26", label: "T.7, 26", count: 0 },
    { date: "2026-09-27", label: "CN, 27", count: 2 },
  ],
  states: [
    { key: "new", label: "Mới", count: 10 },
    { key: "learning", label: "Đang học", count: 5 },
    { key: "review", label: "Đang ôn", count: 8 },
    { key: "relearning", label: "Học lại", count: 2 },
  ],
  practice: {
    firstPass: { label: "Kết quả lần đầu", total: 10, correct: 8, accuracy: 80.0 },
    byType: [
      { label: "Gõ từ", total: 6, correct: 5, accuracy: 83.3 },
      { label: "Trắc nghiệm", total: 4, correct: 3, accuracy: 75.0 },
    ],
    retry: { label: "Luyện lại", total: 2, correct: 2, accuracy: 100.0 },
    sessions: 3,
    assessedCards: 8,
    hasSufficientEvidence: true,
  },
  reviewRatings: [
    { rating: 1, label: "Lại", count: 1 },
    { rating: 2, label: "Khó", count: 1 },
    { rating: 3, label: "Tốt", count: 4 },
    { rating: 4, label: "Dễ", count: 2 },
  ],
  weakCards: [
    {
      id: "card-1",
      deckId: "deck-1",
      deckName: "Core Vocabulary",
      term: "ephemeral",
      meaningVi: "phù du",
      reason: "Sai 2/2 lần đầu",
      priority: 10,
    },
  ],
  decks: [
    {
      id: "deck-1",
      name: "Core Vocabulary",
      folderId: null,
      folderName: null,
      totalCards: 25,
      dueToday: 6,
      weakCards: 1,
      reviewedRecently: 5,
      firstPass: { label: "Kết quả lần đầu", total: 10, correct: 8, accuracy: 80.0 },
    },
  ],
  folders: [],
};

describe("ProgressDashboard component", () => {
  it("renders report header and total card count", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Tiến độ học");
    expect(html).toContain("BÁO CÁO HỌC TẬP");
    expect(html).toContain("25");
  });

  it("renders Today learning ticket with due, reviewed, and overdue cards", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("thẻ cần ôn");
    expect(html).toContain("6");
    expect(html).toContain("Ôn 6 thẻ");
    expect(html).toContain("4");
    expect(html).toContain("5 lượt FSRS");
    expect(html).toContain("2 thẻ đã quá hạn");
  });

  it("renders Attention panel with weak cards and practice button", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Cần chú ý");
    expect(html).toContain("ephemeral");
    expect(html).toContain("phù du");
    expect(html).toContain("Luyện tập trung");
  });

  it("renders Practice panel distinguishing first-pass from retries", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Kết quả luyện tập");
    expect(html).toContain("Lần đầu (Đánh giá thật)");
    expect(html).toContain("80% · 8/10");
    expect(html).toContain("Luyện lại (Củng cố)");
    expect(html).toContain("100% · 2/2");
    expect(html).toContain("Gõ từ");
    expect(html).toContain("Trắc nghiệm");
  });

  it("renders bar charts with data-count attributes and zero-height preservation", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain('data-count="0"');
    expect(html).toContain('height:0');
    expect(html).toContain('data-count="6"');
    expect(html).toContain("7 ngày tới");
    expect(html).toContain("Hoạt động ôn theo lịch");
  });

  it("renders SRS lifecycle states and ratings distribution", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Vòng đời SRS");
    expect(html).toContain("Mới");
    expect(html).toContain("Đang học");
    expect(html).toContain("Đang ôn");
    expect(html).toContain("Học lại");
    expect(html).toContain("Đánh giá khi ôn");
    expect(html).toContain("Tốt");
  });
});
