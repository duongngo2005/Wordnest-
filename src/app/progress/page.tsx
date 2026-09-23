import React from "react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { WordNestMascot } from "@/components/ui/Mascot";
import { progressService } from "@/services/vocabulary";
import {
  Layers,
  GraduationCap,
  HelpCircle,
  Award,
  ArrowRight,
  PlusCircle,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
} from "lucide-react";

export const revalidate = 0;

export const metadata = {
  title: "Tiến độ học tập & Ôn tập | WordNest",
  description: "Theo dõi vốn từ vựng và lịch ôn tập ngắt quãng trên WordNest",
};

export default async function ProgressPage() {
  const summary = await progressService.getProgressSummary();
  const { stats, spacedRepetition, decks } = summary;

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Top Hero Banner */}
        <div className="brick-card p-4 sm:p-7 bg-[#FFFDF9] flex flex-row items-center justify-between gap-4">
          <div className="space-y-1.5 text-left flex-1">
            <h1 className="text-xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              Tiến độ ôn tập
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-[#6B6258] max-w-md">
              Theo dõi nhịp học và các từ đến lịch ôn để duy trì thói quen mỗi ngày.
            </p>
          </div>

          <div className="shrink-0">
            <WordNestMascot mood="reading" size={68} />
          </div>
        </div>

        {/* Spaced Repetition (FSRS) Core Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Due Today */}
          <div className="brick-card p-3.5 sm:p-5 bg-[#FEF2F2] border-[#DC2626] space-y-1 shadow-[3px_3px_0px_#DC2626]">
            <div className="flex items-center justify-between text-[#DC2626]">
              <span className="text-xs font-black uppercase tracking-wider">
                Cần ôn
              </span>
              <Clock className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#991B1B]">
              {spacedRepetition.dueTodayCount}
            </p>
            <p className="text-[11px] font-semibold text-[#B91C1C]">
              {spacedRepetition.overdueCount > 0 ? (
                <span className="flex items-center gap-1 text-red-700">
                  <AlertCircle className="w-3 h-3 inline shrink-0" /> {spacedRepetition.overdueCount} quá hạn
                </span>
              ) : (
                "hôm nay"
              )}
            </p>
          </div>

          {/* Reviewed Today */}
          <div className="brick-card p-3.5 sm:p-5 bg-[#F0FDF4] border-[#16A34A] space-y-1 shadow-[3px_3px_0px_#16A34A]">
            <div className="flex items-center justify-between text-[#15803D]">
              <span className="text-xs font-black uppercase tracking-wider">
                Đã ôn
              </span>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#15803D]">
              {spacedRepetition.reviewedTodayCount}
            </p>
            <p className="text-[11px] font-semibold text-[#166534]">
              lượt ôn hôm nay
            </p>
          </div>

          {/* Mature / Mastered Cards */}
          <div className="brick-card p-3.5 sm:p-5 bg-[#EFF6FF] border-[#2563EB] space-y-1 shadow-[3px_3px_0px_#2563EB]">
            <div className="flex items-center justify-between text-[#1D4ED8]">
              <span className="text-xs font-black uppercase tracking-wider">
                Review ≥21 ngày
              </span>
              <Award className="w-4 h-4 shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#1D4ED8]">
              {spacedRepetition.matureCardsCount}
            </p>
            <p className="text-[11px] font-semibold text-[#1E40AF]">
              khoảng cách &ge; 21 ngày
            </p>
          </div>

          {/* Review Accuracy */}
          <div className="brick-card p-3.5 sm:p-5 bg-[#FFFBEB] border-[#D97706] space-y-1 shadow-[3px_3px_0px_#D97706]">
            <div className="flex items-center justify-between text-[#B45309]">
              <span className="text-xs font-black uppercase tracking-wider">
                Good/Easy
              </span>
              <Flame className="w-4 h-4 text-[#EA580C] shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#B45309]">
              {spacedRepetition.reviewAccuracy}%
            </p>
            <p className="text-[11px] font-semibold text-[#92400E]">
              Good hoặc Easy
            </p>
          </div>
        </div>

        {/* 7-Day Upcoming Reviews Forecast */}
        <div className="brick-card p-5 sm:p-6 bg-[#FFFDF9] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#E06B43]" />
              <h3 className="text-sm font-black text-[#221C16] uppercase tracking-wider">
                Dự báo lịch ôn tập 7 ngày tới
              </h3>
            </div>
            <span className="text-xs font-bold text-[#6B6258]">
              Chu kỳ ôn tập
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-1">
            {spacedRepetition.forecast.map((day, idx) => (
              <div
                key={day.date}
                className={`p-2 sm:p-3 rounded-xl border-2 text-center flex flex-col items-center justify-between transition-all ${
                  idx === 0
                    ? "bg-[#FEF2F2] border-[#DC2626] shadow-[2px_2px_0px_#DC2626]"
                    : day.count > 0
                    ? "bg-[#FAF6EE] border-[#221C16] shadow-[2px_2px_0px_#221C16]"
                    : "bg-[#F9FAFB] border-black/15 opacity-70"
                }`}
              >
                <span className="text-[10px] sm:text-xs font-extrabold text-[#6B6258] truncate w-full">
                  {day.dayLabel}
                </span>
                <span
                  className={`text-base sm:text-xl font-black my-1 ${
                    idx === 0
                      ? "text-[#DC2626]"
                      : day.count > 0
                      ? "text-[#221C16]"
                      : "text-gray-400"
                  }`}
                >
                  {day.count}
                </span>
                <span className="text-[9px] font-bold text-[#6B6258]">từ</span>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Vocabulary Status Breakdown */}
        <div className="brick-card p-5 sm:p-6 bg-[#FFFDF9] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-black text-[#221C16] uppercase tracking-wider">
              Phân bổ trạng thái từ vựng ({stats.totalCards} từ)
            </h3>
            <span className="text-xs font-extrabold text-[#15803D] bg-[#DCFCE7] px-2.5 py-0.5 rounded border border-[#15803D]">
              {stats.masteryRate}% vào Review
            </span>
          </div>

          {/* Segmented Bar */}
          {stats.totalCards > 0 && (
            <div className="h-4 w-full bg-[#E5E7EB] rounded-full border-2 border-[#221C16] overflow-hidden flex shadow-[2px_2px_0px_#221C16]">
              {stats.knownCount > 0 && (
                <div
                  className="bg-[#16A34A] h-full transition-all"
                  style={{ width: `${(stats.knownCount / stats.totalCards) * 100}%` }}
                  title={`Đang Review: ${stats.knownCount}`}
                />
              )}
              {stats.learningCount > 0 && (
                <div
                  className="bg-[#D97706] h-full transition-all"
                  style={{ width: `${(stats.learningCount / stats.totalCards) * 100}%` }}
                  title={`Đang học: ${stats.learningCount}`}
                />
              )}
              {stats.newCount > 0 && (
                <div
                  className="bg-[#0284C7] h-full transition-all"
                  style={{ width: `${(stats.newCount / stats.totalCards) * 100}%` }}
                  title={`Mới: ${stats.newCount}`}
                />
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between text-xs font-bold text-[#6B6258] pt-1 gap-2">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-3 rounded-sm bg-[#16A34A] border border-[#221C16]" />
              <span>Đang Review ({stats.knownCount})</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-3 rounded-sm bg-[#D97706] border border-[#221C16]" />
              <span>Đang học ({stats.learningCount})</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-3 rounded-sm bg-[#0284C7] border border-[#221C16]" />
              <span>Mới ({stats.newCount})</span>
            </div>
          </div>
        </div>

        {/* Deck Breakdown Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-black text-[#221C16] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#E06B43]" />
              <span>Tiến độ từng bộ thẻ ({decks.length})</span>
            </h2>

            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#E06B43] hover:underline"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Tạo thêm bộ thẻ</span>
            </Link>
          </div>

          {decks.length === 0 ? (
            <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-4">
              <WordNestMascot mood="thinking" size={80} />
              <h3 className="text-lg font-black text-[#221C16]">
                Chưa có bộ từ vựng nào
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-[#6B6258] max-w-sm mx-auto">
                Bắt đầu ngay bằng cách dán danh sách từ vựng vào WordNest để tạo bộ thẻ thông minh đầu tiên!
              </p>
              <Link href="/" className="brick-button-primary inline-flex text-xs sm:text-sm px-5 py-2.5">
                Tạo bộ thẻ ngay
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  className="brick-card p-5 sm:p-6 bg-[#FFFDF9] space-y-4 hover:border-[#E06B43] transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/decks/${deck.id}`}
                          className="text-base sm:text-lg font-black text-[#221C16] hover:text-[#E06B43] transition-colors flex items-center gap-2 group"
                        >
                          <span>{deck.name}</span>
                          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {deck.dueTodayCount > 0 && (
                          <span className="text-[10px] font-black bg-[#FEE2E2] text-[#DC2626] border border-[#DC2626] px-2 py-0.5 rounded-full">
                            {deck.dueTodayCount} từ cần ôn
                          </span>
                        )}
                      </div>
                      {deck.description && (
                        <p className="text-xs text-[#6B6258] line-clamp-1 font-medium">
                          {deck.description}
                        </p>
                      )}
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Link
                        href={`/decks/${deck.id}/quiz`}
                        className="brick-button-secondary text-xs px-3 py-1.5 gap-1.5 bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-[#B45309]" />
                        <span>Luyện</span>
                      </Link>

                      <Link
                        href={`/decks/${deck.id}/study`}
                        className="brick-button-primary text-xs px-3 py-1.5 gap-1.5"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Ôn tập</span>
                      </Link>

                      <Link
                        href={`/decks/${deck.id}`}
                        className="brick-button-secondary text-xs px-3 py-1.5"
                      >
                        Chi tiết
                      </Link>
                    </div>
                  </div>

                  {/* Deck stats row & Mini Progress Bar */}
                  <div className="space-y-2 pt-2 border-t border-black/10">
                    <div className="flex flex-wrap items-center justify-between text-xs font-bold text-[#6B6258] gap-2">
                      <div className="flex items-center gap-3">
                        <span>Tổng: <strong className="text-[#221C16]">{deck.totalCards}</strong> từ</span>
                        <span>•</span>
                        <span>Thuộc: <strong className="text-[#15803D]">{deck.knownCount}</strong></span>
                        <span>•</span>
                        <span>Đang học: <strong className="text-[#D97706]">{deck.learningCount}</strong></span>
                        <span>•</span>
                        <span>Mới: <strong className="text-[#0284C7]">{deck.newCount}</strong></span>
                      </div>

                      <div className="flex items-center gap-3">
                        {deck.quizAttemptsCount > 0 ? (
                          <span>
                            Quiz:{" "}
                            <strong className="text-[#E06B43]">
                              {deck.lastQuizAccuracy}%
                            </strong>{" "}
                            ({deck.quizAttemptsCount} lượt)
                          </span>
                        ) : (
                          <span className="italic text-[#9CA3AF]">Chưa làm quiz</span>
                        )}
                        <span className="text-[#15803D] font-black">
                          {deck.masteryRate}%
                        </span>
                      </div>
                    </div>

                    {/* Mini visual bar */}
                    {deck.totalCards > 0 && (
                      <div className="h-2 w-full bg-[#E5E7EB] rounded-full overflow-hidden flex border border-black/20">
                        {deck.knownCount > 0 && (
                          <div
                            className="bg-[#16A34A] h-full"
                            style={{ width: `${(deck.knownCount / deck.totalCards) * 100}%` }}
                          />
                        )}
                        {deck.learningCount > 0 && (
                          <div
                            className="bg-[#D97706] h-full"
                            style={{ width: `${(deck.learningCount / deck.totalCards) * 100}%` }}
                          />
                        )}
                        {deck.newCount > 0 && (
                          <div
                            className="bg-[#0284C7] h-full"
                            style={{ width: `${(deck.newCount / deck.totalCards) * 100}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
