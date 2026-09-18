"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { QuizQuestion, QuizSubmissionResult } from "@/services/vocabulary/quiz-service";
import { QuizResults, AnswerRecord } from "./QuizResults";
import { PronounceButton } from "../flashcards/PronounceButton";
import { WordNestMascot } from "../ui/Mascot";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Volume2,
} from "lucide-react";

interface QuizRunnerProps {
  deck: {
    id: string;
    name: string;
  };
  initialQuestions: QuizQuestion[];
}

export function QuizRunner({ deck, initialQuestions }: QuizRunnerProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<QuizSubmissionResult | null>(null);

  const currentQuestion = questions[currentIndex];
  const total = questions.length;
  const currentScore = records.filter((r) => r.isCorrect).length;

  const handleSelectOption = useCallback(
    (option: string) => {
      if (isAnswerChecked || !currentQuestion) return;

      setSelectedOption(option);
      setIsAnswerChecked(true);

      const correct =
        option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
      setIsCorrect(correct);

      const newRecord: AnswerRecord = {
        question: currentQuestion,
        userAnswer: option,
        isCorrect: correct,
      };

      setRecords((prev) => [...prev, newRecord]);
    },
    [currentQuestion, isAnswerChecked]
  );

  const handleNextQuestion = useCallback(async () => {
    if (!isAnswerChecked) return;

    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setIsCorrect(null);
    } else {
      // Finished all questions, submit results
      setIsSubmitting(true);
      const finalRecords = records;
      const finalScore = finalRecords.filter((r) => r.isCorrect).length;

      const cardResults = finalRecords.map((r) => ({
        cardId: r.question.cardId,
        correct: r.isCorrect,
      }));

      try {
        const res = await fetch(`/api/decks/${deck.id}/quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: finalScore,
            total,
            cardResults,
            updateCardStatus: true,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setSubmissionResult(data.data);
          }
        }
      } catch (err) {
        console.error("Failed to submit quiz results:", err);
      } finally {
        setIsSubmitting(false);
        setIsFinished(true);
      }
    }
  }, [currentIndex, total, isAnswerChecked, records, deck.id]);

  // Keyboard shortcut listener for options (1, 2, 3, 4) and Next (Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFinished || isSubmitting) return;

      // When answered, Enter triggers next question
      if (isAnswerChecked && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        handleNextQuestion();
        return;
      }

      // If not answered yet, 1-4 or A-D selects option
      if (!isAnswerChecked && currentQuestion) {
        const options = currentQuestion.options;
        if (e.key === "1" && options[0]) handleSelectOption(options[0]);
        if (e.key === "2" && options[1]) handleSelectOption(options[1]);
        if (e.key === "3" && options[2]) handleSelectOption(options[2]);
        if (e.key === "4" && options[3]) handleSelectOption(options[3]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerChecked, isFinished, isSubmitting, currentQuestion, handleNextQuestion, handleSelectOption]);

  const handleRestart = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}/quiz`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data.questions) {
          setQuestions(data.data.questions);
        }
      }
    } catch (e) {
      console.error("Failed to refresh quiz questions:", e);
    } finally {
      setCurrentIndex(0);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setIsCorrect(null);
      setRecords([]);
      setIsFinished(false);
      setSubmissionResult(null);
      setIsSubmitting(false);
    }
  };

  if (isFinished) {
    const finalScore = records.filter((r) => r.isCorrect).length;
    const finalAccuracy = total > 0 ? Number(((finalScore / total) * 100).toFixed(1)) : 0;

    return (
      <QuizResults
        deck={deck}
        score={finalScore}
        total={total}
        accuracy={finalAccuracy}
        records={records}
        submissionResult={submissionResult}
        onRestart={handleRestart}
      />
    );
  }

  if (!currentQuestion) {
    return (
      <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-4 max-w-lg mx-auto">
        <WordNestMascot mood="thinking" size={80} />
        <h2 className="text-xl font-black text-[#221C16]">
          Chưa có câu hỏi nào
        </h2>
        <p className="text-sm font-semibold text-[#6B6258]">
          Bộ từ vựng cần có ít nhất một từ để tạo câu hỏi trắc nghiệm.
        </p>
        <Link href={`/decks/${deck.id}`} className="brick-button-primary inline-flex text-xs px-4 py-2">
          Quay lại bộ thẻ
        </Link>
      </div>
    );
  }

  const exp = currentQuestion.explanation;
  const progressPercent = Math.round(((currentIndex + 1) / total) * 100);

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case "multiple_choice_en_vi":
        return "Chọn nghĩa tiếng Việt đúng";
      case "multiple_choice_vi_en":
        return "Chọn từ tiếng Anh phù hợp";
      case "fill_in_blank":
        return "Điền từ thích hợp vào câu";
      default:
        return "Trắc nghiệm từ vựng";
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto">
      {/* Navigation & Progress Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href={`/decks/${deck.id}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Thoát Quiz</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#FAF6EE] border-2 border-[#221C16] text-[#221C16]">
              Điểm: <strong className="text-[#15803D]">{currentScore}</strong> / {currentIndex + (isAnswerChecked ? 1 : 0)}
            </span>

            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#FAF6EE] border-2 border-[#221C16] text-[#221C16]">
              Câu {currentIndex + 1} / {total}
            </span>
          </div>
        </div>

        {/* Retro Toy-brick Progress Bar */}
        <div className="h-3.5 w-full bg-[#FAF6EE] rounded-full border-2 border-[#221C16] overflow-hidden p-0.5 shadow-[2px_2px_0px_#221C16]">
          <div
            className="h-full bg-[#E06B43] rounded-full transition-all duration-300 ease-out border-r border-[#221C16]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] space-y-6">
        {/* Question Type Tag */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#221C16]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{getQuestionTypeLabel(currentQuestion.type)}</span>
          </div>

          {currentQuestion.type !== "multiple_choice_vi_en" && (
            <PronounceButton text={exp.term} size="sm" label="Phát âm" />
          )}
        </div>

        {/* Question Prompt */}
        <div className="space-y-2 text-center py-2">
          <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight leading-snug">
            {currentQuestion.prompt}
          </h1>

          {currentQuestion.promptDetail && (
            <p className="text-sm font-semibold text-[#6B6258]">
              {currentQuestion.promptDetail}
            </p>
          )}
        </div>

        {/* 4 Toy-brick Option Buttons */}
        <div className="grid grid-cols-1 gap-3 pt-2">
          {currentQuestion.options.map((option, idx) => {
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            const isSelected = selectedOption === option;
            const isAnswerOptionCorrect =
              option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();

            // Styling logic depending on checked state
            let buttonStyle =
              "bg-[#FFFDF9] text-[#221C16] border-[#221C16] hover:bg-[#FAF6EE] shadow-[3px_3px_0px_#221C16]";

            if (isAnswerChecked) {
              if (isAnswerOptionCorrect) {
                // Correct answer lights up green
                buttonStyle =
                  "bg-[#DCFCE7] text-[#15803D] border-[#15803D] font-black shadow-[3px_3px_0px_#15803D]";
              } else if (isSelected) {
                // User picked wrong option -> lights up red
                buttonStyle =
                  "bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C] font-black line-through shadow-[3px_3px_0px_#B91C1C]";
              } else {
                // Unchosen neutral options
                buttonStyle =
                  "bg-[#F9FAFB] text-[#9CA3AF] border-gray-300 opacity-60";
              }
            }

            return (
              <button
                key={`${currentQuestion.id}_opt_${idx}`}
                disabled={isAnswerChecked}
                onClick={() => handleSelectOption(option)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 text-sm sm:text-base font-bold active:translate-y-0.5 active:shadow-[1px_1px_0px_#221C16] ${buttonStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 shrink-0 rounded-lg border-2 border-current flex items-center justify-center text-xs font-black ${
                      isSelected
                        ? "bg-current text-white"
                        : "bg-white/80"
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="leading-snug">{option}</span>
                </div>

                {isAnswerChecked && (
                  <div className="shrink-0">
                    {isAnswerOptionCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-[#15803D]" />
                    ) : isSelected ? (
                      <XCircle className="w-5 h-5 text-[#B91C1C]" />
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Explanation & Next Step Banner (Appears after answer is chosen) */}
        {isAnswerChecked && (
          <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div
              className={`p-4 rounded-xl border-2 space-y-2 ${
                isCorrect
                  ? "bg-[#F0FDF4] border-[#16A34A] text-[#166534]"
                  : "bg-[#FEF2F2] border-[#DC2626] text-[#991B1B]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />
                      <span className="text-sm font-black">Chính xác! Giỏi lắm!</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
                      <span className="text-sm font-black">
                        Chưa đúng. Đáp án: <strong className="underline">{currentQuestion.correctAnswer}</strong>
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-[#6B6258]">
                  <Volume2 className="w-3.5 h-3.5 text-[#E06B43]" />
                  <PronounceButton text={exp.term} size="sm" />
                </div>
              </div>

              {/* Full card explanation preview */}
              <div className="bg-white/80 p-3 rounded-lg border border-current/20 text-xs text-[#221C16] space-y-1">
                <p>
                  <strong className="text-[#E06B43]">{exp.term}</strong>
                  {exp.ipa && <span className="font-mono text-[#6B6258] ml-1.5">{exp.ipa}</span>}
                  {exp.partOfSpeech && <span className="text-[#6B6258] ml-1">({exp.partOfSpeech})</span>}
                  : {exp.meaningVi}
                </p>
                <p className="italic text-[#4A4036]">&ldquo;{exp.exampleEn}&rdquo;</p>
                <p className="text-[#6B6258]">{exp.exampleVi}</p>
              </div>
            </div>

            {/* Next Question CTA button */}
            <div className="flex justify-end">
              <button
                onClick={handleNextQuestion}
                disabled={isSubmitting}
                className="brick-button-primary px-6 py-3 text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] w-full sm:w-auto"
              >
                <span>
                  {currentIndex + 1 === total ? "Xem kết quả bài Quiz" : "Câu tiếp theo"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
