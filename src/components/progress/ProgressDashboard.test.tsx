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
    firstPass: { label: "Kết quả lần đầu", total: 10, correct: 8, accuracy: 80.0, hasSufficientEvidence: true },
    recognition: { label: "Nhận diện", total: 4, correct: 3, accuracy: 75, hasSufficientEvidence: true },
    production: { label: "Tự nhớ & viết", total: 6, correct: 5, accuracy: 83.3, hasSufficientEvidence: true },
    byType: [
      { label: "Gõ từ", total: 6, correct: 5, accuracy: 83.3, hasSufficientEvidence: true },
      { label: "Trắc nghiệm", total: 4, correct: 3, accuracy: 75.0, hasSufficientEvidence: true },
    ],
    retry: { label: "Luyện lại", total: 2, correct: 2, accuracy: 100.0, hasSufficientEvidence: true },
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
      firstPass: { label: "Kết quả lần đầu", total: 10, correct: 8, accuracy: 80.0, hasSufficientEvidence: true },
    },
  ],
  folders: [],
  reviewActivity: {
    timezone: "Asia/Ho_Chi_Minh",
    todayDateKey: "2026-09-26",
    metrics: {
      currentStreak: 5,
      longestStreak: 12,
      activeDaysInPeriod: 25,
      totalReviewsInPeriod: 140,
      isTodayActive: true,
      todayReviewCount: 5,
    },
    days: [
      {
        dateKey: "2026-09-26",
        displayDate: "T.7, 26/09/2026",
        count: 5,
        ratings: { again: 0, hard: 1, good: 3, easy: 1 },
        isToday: true,
        isFuture: false,
        intensity: 2,
      },
    ],
    weeks: [
      {
        weekIndex: 0,
        days: [
          {
            dateKey: "2026-09-26",
            displayDate: "T.7, 26/09/2026",
            count: 5,
            ratings: { again: 0, hard: 1, good: 3, easy: 1 },
            isToday: true,
            isFuture: false,
            intensity: 2,
          },
        ],
        monthLabel: "T9",
      },
    ],
    allActiveDates: ["2026-09-26"],
  },
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

  it("renders Review Activity Heatmap and streak summary metrics", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Hoạt động ôn tập");
    expect(html).toContain("LỊCH SỬ FSRS");
    expect(html).toContain("Chuỗi hiện tại");
    expect(html).toContain("5");
    expect(html).toContain("Chuỗi dài nhất");
    expect(html).toContain("12");
    expect(html).toContain("Ngày có ôn tập");
    expect(html).not.toContain("Ghi nhận từng lượt đánh giá thẻ hoàn thành theo múi giờ học");
    expect(html).toContain("Xem dữ liệu hoạt động theo bảng");
  });

  it("renders Attention panel with weak cards and practice button", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Cần chú ý");
    expect(html).toContain("ephemeral");
    expect(html).toContain("phù du");
    expect(html).toContain("Luyện tập trung");
  });

  it("renders recognition and production practice metrics ahead of secondary totals", () => {
    const html = renderToStaticMarkup(<ProgressDashboard analytics={mockAnalytics} />);
    expect(html).toContain("Khả năng thực hành");
    expect(html).toContain("Nhận diện");
    expect(html).toContain("Tự nhớ &amp; viết");
    expect(html).toContain("3 / 4 lượt first-pass đúng");
    expect(html).toContain("5 / 6 lượt first-pass đúng");
    expect(html).toContain("Độ chính xác chung của các bài thực hành");
    expect(html).toContain("Lần đầu");
    expect(html).toContain("80% · 8/10");
    expect(html).toContain("Luyện lại (Củng cố)");
    expect(html).toContain("100% · 2/2");
    expect(html).not.toContain("Dạng câu hỏi");
  });

  it("renders no-evidence and one-attempt states without presenting 0% or 100% as ability", () => {
    const noEvidence = {
      ...mockAnalytics,
      practice: {
        ...mockAnalytics.practice,
        firstPass: { label: "Kết quả lần đầu", total: 0, correct: 0, accuracy: null, hasSufficientEvidence: false },
        recognition: { label: "Nhận diện", total: 0, correct: 0, accuracy: null, hasSufficientEvidence: false },
        production: { label: "Tự nhớ & viết", total: 1, correct: 1, accuracy: 100, hasSufficientEvidence: false },
        retry: { label: "Luyện lại", total: 0, correct: 0, accuracy: null, hasSufficientEvidence: false },
        byType: [],
      },
    } satisfies ProgressAnalytics;
    const html = renderToStaticMarkup(<ProgressDashboard analytics={noEvidence} />);

    expect(html).toContain("Chưa có dữ liệu");
    expect(html).toContain("1/1");
    expect(html).toContain("Cần thêm dữ liệu");
    expect(html).not.toContain("100%</p>");
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
