"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { QuizQuestion, QuizQuestionExplanation, QuizSubmissionResult } from "@/services/vocabulary/quiz-service";
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
  Keyboard,
  ListCheck,
  BookOpen,
  RotateCcw,
  Target,
} from "lucide-react";

interface QuizRunnerProps {
  deck: {
    id: string;
    name: string;
  };
  initialQuestions: QuizQuestion[];
  initialSessionId: string;
  initialMode?: "multiple_choice" | "typed" | "story_cloze" | "focused_practice";
  storyId?: string;
}

export function QuizRunner({
  deck,
  initialQuestions,
  initialSessionId,
  initialMode = "multiple_choice",
  storyId,
}: QuizRunnerProps) {
  const [currentMode, setCurrentMode] = useState<
    "multiple_choice" | "typed" | "story_cloze" | "focused_practice"
  >(initialMode);
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [isCheckingTyped, setIsCheckingTyped] = useState(false);
  const [checkedTypedData, setCheckedTypedData] = useState<{
    correct: boolean;
    expectedAnswer: string;
    explanation: QuizQuestionExplanation;
  } | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [retryRecords, setRetryRecords] = useState<AnswerRecord[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryQuestions, setRetryQuestions] = useState<QuizQuestion[]>([]);
  const [currentRetryIndex, setCurrentRetryIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<QuizSubmissionResult | null>(null);

  const questionShownAtRef = useRef<number | null>(null);
  const typedInputRef = useRef<HTMLInputElement | null>(null);

  const activeQuestions = isRetrying ? retryQuestions : questions;
  const activeIndex = isRetrying ? currentRetryIndex : currentIndex;
  const currentQuestion = activeQuestions[activeIndex];
  const isTypedQuestion =
    currentQuestion?.type === "typed_vi_en" || currentQuestion?.type === "story_cloze";
  const total = activeQuestions.length;

  useEffect(() => {
    questionShownAtRef.current = Date.now();
    if (isTypedQuestion) {
      setTimeout(() => {
        typedInputRef.current?.focus();
      }, 50);
    }
  }, [activeIndex, sessionId, isTypedQuestion, isRetrying]);

  const handleSelectOption = useCallback(
    (option: string) => {
      if (isAnswerChecked || !currentQuestion || isTypedQuestion) return;

      setSelectedOption(option);
      setIsAnswerChecked(true);

      const correct =
        option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
      setIsCorrect(correct);

      const newRecord: AnswerRecord = {
        question: currentQuestion,
        userAnswer: option,
        isCorrect: correct,
        expectedAnswer: currentQuestion.correctAnswer,
        explanation: currentQuestion.explanation,
        responseMs: Math.max(0, Date.now() - (questionShownAtRef.current ?? Date.now())),
      };

      if (isRetrying) {
        setRetryRecords((prev) => [...prev, newRecord]);
      } else {
        setRecords((prev) => [...prev, newRecord]);
      }
    },
    [currentQuestion, isAnswerChecked, isTypedQuestion, isRetrying]
  );

  const handleSubmitTypedAnswer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (
      isAnswerChecked ||
      isCheckingTyped ||
      !currentQuestion ||
      !isTypedQuestion ||
      typedAnswer.trim().length === 0
    ) {
      return;
    }

    setIsCheckingTyped(true);
    setSubmissionError(null);

    const responseMs = Math.max(0, Date.now() - (questionShownAtRef.current ?? Date.now()));

    try {
      const res = await fetch(`/api/decks/${deck.id}/quiz/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          answer: typedAnswer,
          responseMs,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể kiểm tra câu trả lời.");
      }

      const checkResult = data.data as {
        correct: boolean;
        expectedAnswer: string;
        explanation: QuizQuestionExplanation;
      };

      setCheckedTypedData(checkResult);
      setIsCorrect(checkResult.correct);
      setIsAnswerChecked(true);

      const newRecord: AnswerRecord = {
        question: currentQuestion,
        userAnswer: typedAnswer,
        isCorrect: checkResult.correct,
        expectedAnswer: checkResult.expectedAnswer,
        explanation: checkResult.explanation,
        responseMs,
      };

      if (isRetrying) {
        setRetryRecords((prev) => [...prev, newRecord]);
      } else {
        setRecords((prev) => [...prev, newRecord]);
      }
    } catch (err) {
      console.error("Failed to check typed answer:", err);
      setSubmissionError(err instanceof Error ? err.message : "Không thể kiểm tra câu trả lời.");
    } finally {
      setIsCheckingTyped(false);
    }
  };

  const submitFinalResults = useCallback(
    async (firstPass: AnswerRecord[], retries: AnswerRecord[]) => {
      setIsSubmitting(true);
      setSubmissionError(null);

      const answers = [
        ...firstPass.map((r) => ({
          questionId: r.question.id,
          attemptNumber: 1,
          answer: r.userAnswer,
          responseMs: r.responseMs,
        })),
        ...retries.map((r) => ({
          questionId: r.question.id,
          attemptNumber: 2,
          answer: r.userAnswer,
          responseMs: r.responseMs,
        })),
      ];

      try {
        const res = await fetch(`/api/decks/${deck.id}/quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            answers,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Không thể lưu kết quả quiz. Vui lòng thử lại.");
        }
        setSubmissionResult(data.data);
        setIsFinished(true);
      } catch (err) {
        console.error("Failed to submit quiz results:", err);
        setSubmissionError(
          err instanceof Error ? err.message : "Không thể lưu kết quả quiz. Vui lòng thử lại."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [deck.id, sessionId]
  );

  const handleNextQuestion = useCallback(async () => {
    if (!isAnswerChecked) return;

    if (isRetrying) {
      if (currentRetryIndex + 1 < retryQuestions.length) {
        setCurrentRetryIndex((prev) => prev + 1);
        setSelectedOption(null);
        setTypedAnswer("");
        setCheckedTypedData(null);
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setSubmissionError(null);
      } else {
        await submitFinalResults(records, retryRecords);
      }
    } else {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((prev) => prev + 1);
        setSelectedOption(null);
        setTypedAnswer("");
        setCheckedTypedData(null);
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setSubmissionError(null);
      } else {
        await submitFinalResults(records, []);
      }
    }
  }, [
    isAnswerChecked,
    isRetrying,
    currentRetryIndex,
    retryQuestions.length,
    currentIndex,
    questions.length,
    records,
    retryRecords,
    submitFinalResults,
  ]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFinished || isSubmitting || isCheckingTyped) return;

      // When answered, Enter triggers next question
      if (isAnswerChecked && (e.key === "Enter" || (e.key === " " && !isTypedQuestion))) {
        e.preventDefault();
        handleNextQuestion();
        return;
      }

      // If typed question and not checked, native form Enter handles submit
      if (isTypedQuestion) {
        return;
      }

      // If choice question and not checked yet, 1-4 or A-D selects option
      if (!isAnswerChecked && currentQuestion && "options" in currentQuestion && Array.isArray(currentQuestion.options)) {
        const options = currentQuestion.options;
        if (e.key === "1" && options[0]) handleSelectOption(options[0]);
        if (e.key === "2" && options[1]) handleSelectOption(options[1]);
        if (e.key === "3" && options[2]) handleSelectOption(options[2]);
        if (e.key === "4" && options[3]) handleSelectOption(options[3]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerChecked, isFinished, isSubmitting, isCheckingTyped, isTypedQuestion, currentQuestion, handleNextQuestion, handleSelectOption]);

  const handleSwitchMode = async (
    newMode: "multiple_choice" | "typed" | "story_cloze" | "focused_practice"
  ) => {
    if (newMode === currentMode && questions.length > 0) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const url =
        newMode === "focused_practice"
          ? `/api/decks/${deck.id}/quiz?mode=focused_practice`
          : newMode === "story_cloze" && storyId
          ? `/api/decks/${deck.id}/quiz?mode=story_cloze&storyId=${storyId}`
          : `/api/decks/${deck.id}/quiz?mode=${newMode}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Không thể tải bài tập cho chế độ này.");
      }
      const data = await res.json();
      if (data.success && data.data.questions) {
        if (data.data.questions.length === 0 && newMode === "focused_practice") {
          throw new Error("Hiện chưa có đủ bằng chứng về từ cần luyện thêm trong bộ từ này.");
        }
        setQuestions(data.data.questions);
        setSessionId(data.data.sessionId);
        setCurrentMode(newMode);
        setCurrentIndex(0);
        setSelectedOption(null);
        setTypedAnswer("");
        setCheckedTypedData(null);
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setRecords([]);
        setRetryRecords([]);
        setIsRetrying(false);
        setRetryQuestions([]);
        setCurrentRetryIndex(0);
        setIsFinished(false);
        setSubmissionResult(null);
      }
    } catch (e) {
      console.error("Failed to switch quiz mode:", e);
      setSubmissionError(e instanceof Error ? e.message : "Không thể chuyển chế độ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = async () => {
    setIsSubmitting(true);
    try {
      const url =
        currentMode === "focused_practice"
          ? `/api/decks/${deck.id}/quiz?mode=focused_practice`
          : currentMode === "story_cloze" && storyId
          ? `/api/decks/${deck.id}/quiz?mode=story_cloze&storyId=${storyId}`
          : `/api/decks/${deck.id}/quiz?mode=${currentMode}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data.questions) {
          setQuestions(data.data.questions);
          setSessionId(data.data.sessionId);
        }
      }
    } catch (e) {
      console.error("Failed to refresh quiz questions:", e);
    } finally {
      setCurrentIndex(0);
      setSelectedOption(null);
      setTypedAnswer("");
      setCheckedTypedData(null);
      setIsAnswerChecked(false);
      setIsCorrect(null);
      setRecords([]);
      setRetryRecords([]);
      setIsRetrying(false);
      setRetryQuestions([]);
      setCurrentRetryIndex(0);
      setIsFinished(false);
      setSubmissionResult(null);
      setSubmissionError(null);
      setIsSubmitting(false);
    }
  };

  if (isFinished) {
    const finalScore = submissionResult?.firstPassScore ?? records.filter((r) => r.isCorrect).length;
    const finalTotal = submissionResult?.firstPassTotal ?? questions.length;
    const finalAccuracy =
      submissionResult?.accuracy ?? (finalTotal > 0 ? Number(((finalScore / finalTotal) * 100).toFixed(1)) : 0);

    return (
      <QuizResults
        deck={deck}
        score={finalScore}
        total={finalTotal}
        accuracy={finalAccuracy}
        records={records}
        retryRecords={retryRecords}
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
          Bộ từ vựng cần có ít nhất một từ để tạo câu hỏi luyện tập.
        </p>
        <Link href={`/decks/${deck.id}`} className="brick-button-primary inline-flex text-xs px-4 py-2">
          Quay lại bộ thẻ
        </Link>
      </div>
    );
  }

  const exp =
    checkedTypedData?.explanation ??
    (!isTypedQuestion ? currentQuestion.explanation : undefined);
  const expectedAnswer =
    checkedTypedData?.expectedAnswer ??
    (!isTypedQuestion ? currentQuestion.correctAnswer : "");
  const progressPercent = Math.round(((activeIndex + 1) / total) * 100);

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case "story_cloze":
        return "Điền từ vào câu chuyện (Story Cloze)";
      case "typed_vi_en":
        return "Gõ từ vựng tiếng Anh (Recall)";
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link
            href={`/decks/${deck.id}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Thoát Quiz</span>
          </Link>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-[#221C16]/18 bg-[#FAF6EE] p-0.5">
            <button
              type="button"
              onClick={() => handleSwitchMode("multiple_choice")}
              disabled={isSubmitting || isCheckingTyped || isRetrying}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-md transition-all ${
                currentMode === "multiple_choice"
                  ? "bg-[#221C16] text-white shadow-sm"
                  : "text-[#6B6258] hover:text-[#221C16]"
              }`}
            >
              <ListCheck className="w-3.5 h-3.5" />
              <span>Trắc nghiệm</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode("typed")}
              disabled={isSubmitting || isCheckingTyped || isRetrying}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-md transition-all ${
                currentMode === "typed"
                  ? "bg-[#E06B43] text-white shadow-sm"
                  : "text-[#6B6258] hover:text-[#221C16]"
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Gõ đáp án (Recall)</span>
            </button>
            {(storyId || currentMode === "story_cloze") && (
              <button
                type="button"
                onClick={() => handleSwitchMode("story_cloze")}
                disabled={isSubmitting || isCheckingTyped || isRetrying}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-md transition-all ${
                  currentMode === "story_cloze"
                    ? "bg-[#2563EB] text-white shadow-sm"
                    : "text-[#6B6258] hover:text-[#221C16]"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Story Cloze</span>
              </button>
            )}
            {currentMode === "focused_practice" && (
            <button
              type="button"
              onClick={() => handleSwitchMode("focused_practice")}
              disabled={isSubmitting || isCheckingTyped || isRetrying}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-md transition-all ${
                currentMode === "focused_practice"
                  ? "bg-[#D97706] text-white shadow-sm"
                  : "text-[#6B6258] hover:text-[#221C16]"
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Luyện tập trung</span>
            </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#6B6258]">
              {isRetrying
                ? `Luyện lại câu sai: Câu ${activeIndex + 1} / ${total}`
                : `Câu ${activeIndex + 1} / ${total}`}
            </span>
          </div>
        </div>

        {/* Retro Toy-brick Progress Bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E5E0D5] p-0.5">
          <div
            className="h-full rounded-full bg-[#E06B43] transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      <div className="surface-card space-y-6 p-6 sm:p-8">
        {/* Question Type Tag & Selection Reason */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#221C16]">
              {isRetrying ? <RotateCcw className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
              <span>
                {isRetrying
                  ? `Luyện lại: ${getQuestionTypeLabel(currentQuestion.type)}`
                  : getQuestionTypeLabel(currentQuestion.type)}
              </span>
            </div>

            {currentQuestion.selectionReason && (
              <span
                data-testid="selection-reason-tag"
                className="text-[11px] font-bold text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#D97706]/40"
              >
                Mục tiêu: {currentQuestion.selectionReason}
              </span>
            )}
          </div>

          {/* Do NOT leak audio pronunciation before answering if question is recalling English! */}
          {currentQuestion.type === "multiple_choice_en_vi" && exp && (
            <PronounceButton text={exp.term} size="sm" label="Phát âm" />
          )}
        </div>

        {/* Question Prompt */}
        <div className="space-y-2 text-center py-2">
          <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight leading-snug">
            {currentQuestion.prompt}
          </h1>

          {currentQuestion.type !== "story_cloze" && currentQuestion.promptDetail && (
            <p className="text-sm font-semibold text-[#6B6258]">
              {currentQuestion.promptDetail}
            </p>
          )}
        </div>

        {/* Question Body: Typed vs Multiple Choice */}
        {isTypedQuestion ? (
          <form onSubmit={handleSubmitTypedAnswer} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label
                htmlFor="typed-recall-input"
                className="block text-xs font-extrabold uppercase text-[#6B6258] tracking-wider text-center"
              >
                {currentQuestion.type === "story_cloze"
                  ? "Điền từ thích hợp vào chỗ trống trong câu trên:"
                  : "Nhập từ hoặc cụm từ tiếng Anh tương ứng:"}
              </label>
              <input
                id="typed-recall-input"
                ref={typedInputRef}
                type="text"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                disabled={isAnswerChecked || isCheckingTyped}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                placeholder={
                  currentQuestion.type === "story_cloze"
                    ? "Nhập dạng từ thích hợp trong ngữ cảnh..."
                    : "Ví dụ: allocate..."
                }
                className="w-full text-center px-4 py-3.5 rounded-xl border-2 border-[#221C16] text-lg sm:text-xl font-bold text-[#221C16] bg-white placeholder-[#9CA3AF] shadow-[3px_3px_0px_#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43] disabled:bg-[#FAF6EE] disabled:opacity-90"
              />
            </div>

            {!isAnswerChecked && (
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isCheckingTyped || typedAnswer.trim().length === 0}
                  className="brick-button-primary w-full sm:w-auto px-6 py-3 text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{isCheckingTyped ? "Đang kiểm tra..." : "Kiểm tra"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </form>
        ) : (
          /* 4 Toy-brick Option Buttons for Multiple Choice */
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
                  buttonStyle =
                    "bg-[#DCFCE7] text-[#15803D] border-[#15803D] font-black shadow-[3px_3px_0px_#15803D]";
                } else if (isSelected) {
                  buttonStyle =
                    "bg-[#FEE2E2] text-[#B91C1C] border-[#B91C1C] font-black line-through shadow-[3px_3px_0px_#B91C1C]";
                } else {
                  buttonStyle =
                    "bg-[#F9FAFB] text-[#9CA3AF] border-gray-300 opacity-60";
                }
              }

              return (
                <button
                  key={`${currentQuestion.id}_opt_${idx}`}
                  disabled={isAnswerChecked}
                  onClick={() => handleSelectOption(option)}
                  aria-label={`Đáp án ${letter}: ${option}`}
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
        )}

        {/* Explanation & Next Step Banner (Appears after answer is checked) */}
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
                      <div className="space-y-0.5">
                        <span className="text-sm font-black block">Chính xác! Giỏi lắm!</span>
                        {currentQuestion.type === "story_cloze" && exp?.term && (
                          <span className="text-xs font-bold text-[#15803D] block">
                            {exp.term} → {expectedAnswer}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
                      <div className="space-y-0.5">
                        <span className="text-sm font-black block">Chưa chính xác.</span>
                        {isTypedQuestion && (
                          <span className="text-xs font-semibold text-[#7F1D1D] block">
                            Your answer: <strong className="line-through">{typedAnswer.trim()}</strong>
                          </span>
                        )}
                        <span className="text-xs font-bold text-[#7F1D1D] block">
                          Đáp án đúng: <strong className="underline decoration-2">{expectedAnswer}</strong>
                        </span>
                        {exp && exp.term && (
                          <span className="text-xs font-semibold text-[#6B6258] block">
                            Từ gốc: <strong className="text-[#221C16]">{exp.term}</strong>
                            {exp.meaningVi && <span> ({exp.meaningVi})</span>}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {exp && (
                  <div className="flex items-center gap-1 text-xs font-bold text-[#6B6258]">
                    <Volume2 className="w-3.5 h-3.5 text-[#E06B43]" />
                    <PronounceButton text={exp.term} size="sm" />
                  </div>
                )}
              </div>

              {/* Full card explanation preview */}
              {exp && (
                <div className="bg-white/80 p-3 rounded-lg border border-current/20 text-xs text-[#221C16] space-y-1">
                  <p>
                    <strong className="text-[#E06B43]">{exp.term}</strong>
                    {exp.ipa && <span className="font-mono text-[#6B6258] ml-1.5">{exp.ipa}</span>}
                    {exp.partOfSpeech && <span className="text-[#6B6258] ml-1">({exp.partOfSpeech})</span>}
                    : {exp.meaningVi}
                  </p>
                  {exp.exampleEn && <p className="italic text-[#4A4036]">&ldquo;{exp.exampleEn}&rdquo;</p>}
                  {exp.exampleVi && <p className="text-[#6B6258]">{exp.exampleVi}</p>}
                </div>
              )}
            </div>

            {/* Next Question CTA button */}
            <div className="flex justify-end">
              <div className="w-full sm:w-auto space-y-2">
                {submissionError && (
                  <p role="alert" className="text-xs font-bold text-[#B91C1C] text-right">
                    {submissionError}
                  </p>
                )}
                {!isRetrying && currentIndex + 1 === questions.length && records.some((r) => !r.isCorrect) ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <button
                      onClick={() => {
                        const wrongList = records.filter((r) => !r.isCorrect).map((r) => r.question);
                        setRetryQuestions(wrongList);
                        setCurrentRetryIndex(0);
                        setIsRetrying(true);
                        setIsAnswerChecked(false);
                        setSelectedOption(null);
                        setTypedAnswer("");
                        setCheckedTypedData(null);
                        setIsCorrect(null);
                        setSubmissionError(null);
                      }}
                      disabled={isSubmitting}
                      className="brick-button-primary px-5 py-3 text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] w-full sm:w-auto"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Luyện lại {records.filter((r) => !r.isCorrect).length} câu sai</span>
                    </button>

                    <button
                      onClick={() => submitFinalResults(records, [])}
                      disabled={isSubmitting}
                      className="brick-button-secondary px-5 py-3 text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] w-full sm:w-auto"
                    >
                      <span>{isSubmitting ? "Đang lưu..." : "Xem kết quả bài Quiz"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    disabled={isSubmitting}
                    className="brick-button-primary px-6 py-3 text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] w-full"
                  >
                    <span>
                      {isRetrying
                        ? (currentRetryIndex + 1 === retryQuestions.length ? "Xem kết quả bài Quiz" : "Câu tiếp theo")
                        : (currentIndex + 1 === questions.length ? "Xem kết quả bài Quiz" : "Câu tiếp theo")}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
