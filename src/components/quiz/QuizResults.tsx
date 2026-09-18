"use client";

import React, { useState } from "react";
import Link from "next/link";
import { WordNestMascot } from "../ui/Mascot";
import { PronounceButton } from "../flashcards/PronounceButton";
import { QuizQuestion, QuizSubmissionResult } from "@/services/vocabulary/quiz-service";
import {
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  BarChart2,
  Sparkles,
  BookOpen,
} from "lucide-react";

export interface AnswerRecord {
  question: QuizQuestion;
  userAnswer: string;
  isCorrect: boolean;
}

interface QuizResultsProps {
  deck: {
    id: string;
    name: string;
  };
  score: number;
  total: number;
  accuracy: number;
  records: AnswerRecord[];
  submissionResult: QuizSubmissionResult | null;
  onRestart: () => void;
}

export function QuizResults({
  deck,
  score,
  total,
  accuracy,
  records,
  submissionResult,
  onRestart,
}: QuizResultsProps) {
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect">("all");

  const correctCount = records.filter((r) => r.isCorrect).length;
  const incorrectCount = total - correctCount;

  const filteredRecords = records.filter((r) => {
    if (filter === "correct") return r.isCorrect;
    if (filter === "incorrect") return !r.isCorrect;
    return true;
  });

  const getMascotMood = (): "celebrating" | "happy" | "thinking" => {
    if (accuracy >= 80) return "celebrating";
    if (accuracy >= 50) return "happy";
    return "thinking";
  };

  const getHeadlineMessage = () => {
    if (accuracy === 100) return "Tuyệt đỉnh! Bạn đúng 100%!";
    if (accuracy >= 80) return "Xuất sắc! Bạn nắm từ vựng rất vững!";
    if (accuracy >= 50) return "Làm tốt lắm! Ôn lại chút là thành thạo ngay!";
    return "Cố gắng lên! Mỗi lần làm là một lần nhớ sâu hơn!";
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl mx-auto">
      {/* Top Banner with Score and Mascot */}
      <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] text-center space-y-5">
        <div className="flex justify-center">
          <WordNestMascot mood={getMascotMood()} size={110} />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] px-3 py-1 rounded-full border border-[#221C16]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kết quả bài Quiz</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
            {getHeadlineMessage()}
          </h1>
          <p className="text-sm text-[#6B6258] font-semibold">
            Bộ từ vựng: <span className="text-[#221C16] font-bold">{deck.name}</span>
          </p>
        </div>

        {/* Score & Accuracy Brick Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#221C16]">
            <p className="text-[11px] font-extrabold uppercase text-[#6B6258] tracking-wider">
              Số câu đúng
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#15803D] mt-0.5">
              {score} <span className="text-sm font-bold text-[#6B6258]">/ {total}</span>
            </p>
          </div>

          <div className="bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#221C16]">
            <p className="text-[11px] font-extrabold uppercase text-[#6B6258] tracking-wider">
              Độ chính xác
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#E06B43] mt-0.5">
              {accuracy}%
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#221C16]">
            <p className="text-[11px] font-extrabold uppercase text-[#6B6258] tracking-wider">
              Thẻ đã cập nhật
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#221C16] mt-0.5">
              {submissionResult?.cardsUpdatedCount ?? total}
            </p>
          </div>
        </div>

        {/* Status update notification banner */}
        <div className="bg-[#F0FDF4] border-2 border-[#16A34A] rounded-xl p-3 text-xs sm:text-sm font-bold text-[#166534] flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>
            Hệ thống đã tự động cập nhật trạng thái: {correctCount} từ ghi nhận{" "}
            <strong className="underline decoration-wavy">Đã thuộc</strong>, {incorrectCount} từ
            cần ôn ở <strong className="underline decoration-wavy">Đang học</strong>.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onRestart}
            className="brick-button-primary px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Làm lại bài Quiz</span>
          </button>

          <Link
            href={`/decks/${deck.id}`}
            className="brick-button-secondary px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về bộ thẻ</span>
          </Link>

          <Link
            href="/progress"
            className="brick-button-secondary px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] bg-[#FEF3C7] text-[#92400E]"
          >
            <BarChart2 className="w-4 h-4" />
            <span>Xem tiến độ học</span>
          </Link>
        </div>
      </div>

      {/* Question Review Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-black text-[#221C16] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#E06B43]" />
            <span>Xem lại chi tiết từng câu ({records.length})</span>
          </h2>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filter === "all"
                  ? "bg-[#221C16] text-white"
                  : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
              }`}
            >
              Tất cả ({records.length})
            </button>
            <button
              onClick={() => setFilter("correct")}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filter === "correct"
                  ? "bg-[#16A34A] text-white"
                  : "bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0]"
              }`}
            >
              Đúng ({correctCount})
            </button>
            <button
              onClick={() => setFilter("incorrect")}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filter === "incorrect"
                  ? "bg-[#DC2626] text-white"
                  : "bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA]"
              }`}
            >
              Sai ({incorrectCount})
            </button>
          </div>
        </div>

        {/* List of answers */}
        <div className="space-y-3">
          {filteredRecords.map((record, index) => {
            const { question, userAnswer, isCorrect } = record;
            const exp = question.explanation;

            return (
              <div
                key={question.id || index}
                className={`brick-card p-4 sm:p-5 transition-all ${
                  isCorrect
                    ? "bg-[#F0FDF4] border-[#16A34A]"
                    : "bg-[#FEF2F2] border-[#DC2626]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded border ${
                          isCorrect
                            ? "bg-[#DCFCE7] text-[#15803D] border-[#15803D]"
                            : "bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]"
                        }`}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Chính xác</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            <span>Chưa chính xác</span>
                          </>
                        )}
                      </span>

                      <span className="text-xs font-bold text-[#6B6258]">
                        Câu {index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-base sm:text-lg font-black text-[#221C16]">
                        {question.prompt}
                      </p>
                      <PronounceButton text={exp.term} size="sm" />
                    </div>
                    {question.promptDetail && (
                      <p className="text-xs font-medium text-[#6B6258]">
                        {question.promptDetail}
                      </p>
                    )}
                  </div>
                </div>

                {/* User answer vs Correct answer */}
                <div className="mt-3 pt-3 border-t border-black/10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-black/10">
                    <span className="font-extrabold text-[#6B6258] block text-[11px]">
                      Câu trả lời của bạn:
                    </span>
                    <span
                      className={`font-black ${
                        isCorrect ? "text-[#15803D]" : "text-[#B91C1C]"
                      }`}
                    >
                      {userAnswer || "(Chưa chọn đáp án)"}
                    </span>
                  </div>

                  {!isCorrect && (
                    <div className="bg-white/80 p-2.5 rounded-lg border border-black/10">
                      <span className="font-extrabold text-[#6B6258] block text-[11px]">
                        Đáp án đúng:
                      </span>
                      <span className="font-black text-[#15803D]">
                        {question.correctAnswer}
                      </span>
                    </div>
                  )}
                </div>

                {/* Explanation sentence & meaning */}
                <div className="mt-3 bg-white/70 p-3 rounded-lg border border-black/10 text-xs space-y-1">
                  <p className="font-semibold text-[#221C16]">
                    <strong className="text-[#E06B43]">{exp.term}</strong>: {exp.meaningVi}
                  </p>
                  <p className="italic text-[#4A4036]">&ldquo;{exp.exampleEn}&rdquo;</p>
                  <p className="text-[#6B6258]">{exp.exampleVi}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
