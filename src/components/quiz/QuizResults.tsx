"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { WordNestMascot } from "../ui/Mascot";
import { PronounceButton } from "../flashcards/PronounceButton";
import { QuizQuestion, QuizQuestionExplanation, QuizSubmissionResult } from "@/services/vocabulary/quiz-service";
import { playUISound } from "@/lib/ui-sound";
import {
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  BarChart2,
  Sparkles,
  BookOpen,
  CheckCheck,
} from "lucide-react";

export interface AnswerRecord {
  question: QuizQuestion;
  userAnswer: string;
  isCorrect: boolean;
  expectedAnswer?: string;
  explanation?: QuizQuestionExplanation;
  responseMs?: number;
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
  retryRecords?: AnswerRecord[];
  submissionResult: QuizSubmissionResult | null;
  onRestart: () => void;
}

export function QuizResults({
  deck,
  score,
  total,
  accuracy,
  records,
  retryRecords = [],
  submissionResult,
  onRestart,
}: QuizResultsProps) {
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect">("all");

  useEffect(() => {
    playUISound("completion");
  }, []);

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
    if (accuracy === 100) return "Bạn đã hoàn thành lượt luyện này.";
    if (accuracy >= 50) return "Kết quả lần đầu đã được ghi nhận.";
    return "Kết quả này giúp bạn chọn điều cần luyện tiếp.";
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl mx-auto">
        {/* Top Banner with Score and Mascot — WordNest Practice Slip */}
        <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] text-center space-y-5 relative overflow-hidden">
        {/* Subtle decorative retro paper stamp in the corner */}
        <div className="absolute top-3 right-3 hidden sm:flex items-center gap-1 px-2.5 py-1 rounded border border-dashed border-[#B91C1C]/40 text-[#B91C1C] text-[10px] font-black uppercase tracking-widest rotate-2 select-none opacity-80">
          <CheckCheck className="w-3 h-3 text-[#B91C1C]" />
          <span>WordNest Slip</span>
        </div>

        <div className="flex justify-center">
          <WordNestMascot mood={getMascotMood()} size={110} />
        </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-black text-[#E06B43] bg-[#FEF3C7] px-3.5 py-1 rounded-full border border-[#221C16]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>WORDNEST PRACTICE SLIP</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              Kết quả bài Quiz
            </h1>
            <p className="text-sm text-[#6B6258] font-semibold">
              {getHeadlineMessage()} Bộ từ vựng: <span className="text-[#221C16] font-bold">{deck.name}</span>
            </p>
          </div>

        {/* First-pass result stays primary; retry is a distinct reinforcement metric. */}
        <div className={`grid grid-cols-2 gap-3 pt-2 ${submissionResult?.retryTotal ? "sm:grid-cols-3" : ""}`}>
          <div className="bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#221C16]">
            <p className="text-[11px] font-extrabold uppercase text-[#6B6258] tracking-wider">
              Kết quả lần đầu
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

          {submissionResult?.retryTotal ? (
            <div className="col-span-2 sm:col-span-1 bg-[#FEF3C7] border-2 border-[#D97706] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#D97706]">
              <p className="text-[11px] font-extrabold uppercase text-[#92400E] tracking-wider">
                Luyện lại
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#92400E] mt-0.5">
                {submissionResult.retryScore} <span className="text-sm font-bold text-[#92400E]">/ {submissionResult.retryTotal}</span>
              </p>
            </div>
          ) : (
          <div className="col-span-2 bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl p-3 sm:p-4 text-center shadow-[2px_2px_0px_#221C16]">
            <p className="text-[11px] font-extrabold uppercase text-[#6B6258] tracking-wider">
              Câu đã ghi nhận
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#221C16] mt-0.5">
              {submissionResult ? total : 0}
            </p>
          </div>
          )}
        </div>

        {/* Practice evidence notification banner (doctrine) */}
        <div className="bg-[#F0FDF4] border-2 border-[#16A34A] rounded-xl p-3 text-xs sm:text-sm font-bold text-[#166534] flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>
            Quiz đã ghi nhận {correctCount} câu <strong className="underline decoration-wavy">đúng</strong> và{" "}
            {incorrectCount} câu <strong className="underline decoration-wavy">sai</strong>. Luyện tập không thay đổi lịch ôn.
          </span>
        </div>

        {/* Retry Reinforcement Notification Banner (Secondary Practice) */}
        {submissionResult?.retryTotal && submissionResult.retryTotal > 0 ? (
          <div className="bg-[#FEF3C7] border-2 border-[#D97706] rounded-xl p-3 text-xs sm:text-sm font-bold text-[#92400E] flex items-center justify-center gap-2 shadow-[2px_2px_0px_#D97706]">
            <RotateCcw className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>
              Lần đầu: <strong>{submissionResult.firstPassScore ?? score}/{submissionResult.firstPassTotal ?? total}</strong>.
              {" "}Bạn đã sửa đúng <strong>{submissionResult.retryScore}/{submissionResult.retryTotal}</strong> câu khi luyện lại.
            </span>
          </div>
        ) : null}

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
              type="button"
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={`min-h-[44px] px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filter === "all"
                  ? "bg-[#221C16] text-white"
                  : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
              }`}
            >
              Tất cả ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("correct")}
              aria-pressed={filter === "correct"}
              className={`min-h-[44px] px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filter === "correct"
                  ? "bg-[#16A34A] text-white"
                  : "bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0]"
              }`}
            >
              Đúng ({correctCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("incorrect")}
              aria-pressed={filter === "incorrect"}
              className={`min-h-[44px] px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
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
            const exp = record.explanation ?? (question.type !== "typed_vi_en" ? question.explanation : undefined);
            const expectedAnswer = record.expectedAnswer ?? (question.type !== "typed_vi_en" ? question.correctAnswer : "");
            const retryAttempt = retryRecords.find((rr) => rr.question.id === question.id);

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

                      {retryAttempt && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded border ${
                            retryAttempt.isCorrect
                              ? "bg-[#DCFCE7] text-[#15803D] border-[#15803D]"
                              : "bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C]"
                          }`}
                        >
                          {retryAttempt.isCorrect ? "Đã sửa đúng khi luyện lại ✓" : "Chưa đúng khi luyện lại ✗"}
                        </span>
                      )}

                      <span className="text-xs font-bold text-[#6B6258]">
                        Câu {index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-base sm:text-lg font-black text-[#221C16]">
                        {question.prompt}
                      </p>
                      {exp && <PronounceButton text={exp.term} size="sm" />}
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
                        {expectedAnswer}
                      </span>
                    </div>
                  )}
                </div>

                {/* Explanation sentence & meaning */}
                {exp && (
                  <div className="mt-3 bg-white/70 p-3 rounded-lg border border-black/10 text-xs space-y-1">
                    <p className="font-semibold text-[#221C16]">
                      <strong className="text-[#E06B43]">{exp.term}</strong>: {exp.meaningVi}
                    </p>
                    {exp.exampleEn && <p className="italic text-[#4A4036]">&ldquo;{exp.exampleEn}&rdquo;</p>}
                    {exp.exampleVi && <p className="text-[#6B6258]">{exp.exampleVi}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
