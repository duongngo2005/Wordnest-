"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Lightbulb, CheckCircle2, BookOpen, AlertCircle, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AIExplanationResponse } from "@/lib/validation/explain";

export interface ExplainAnswerButtonProps {
  practiceAttemptId?: string;
  sessionId?: string;
  questionId?: string;
  flashcardId?: string;
  userAnswer?: string;
  expectedAnswer?: string;
  className?: string;
  size?: "sm" | "md";
}

export function ExplainAnswerButton({
  practiceAttemptId,
  sessionId,
  questionId,
  flashcardId,
  userAnswer,
  expectedAnswer,
  className = "",
  size = "sm",
}: ExplainAnswerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<AIExplanationResponse | null>(null);

  const handleFetchExplanation = async () => {
    if (explanation) {
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsOpen(true);

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceAttemptId,
          sessionId,
          questionId,
          flashcardId,
          userAnswer,
          expectedAnswer,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể lấy giải thích từ AI lúc này.");
      }

      setExplanation(data.data.explanation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {!isOpen ? (
        <Button
          variant="secondary"
          size={size}
          onClick={handleFetchExplanation}
          className="border-2 border-stone-800 bg-amber-100 hover:bg-amber-200 text-stone-900 font-bold shadow-[2px_2px_0px_#1c1917] hover:shadow-[3px_3px_0px_#1c1917] transition-all flex items-center gap-1.5"
        >
          <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
          <span>Vì sao tôi sai? (AI Giải thích)</span>
        </Button>
      ) : (
        <div className="rounded-xl border-2 border-stone-800 bg-amber-50 p-4 shadow-[3px_3px_0px_#1c1917] text-stone-900 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b-2 border-stone-800/20 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-300 border-2 border-stone-800 text-stone-900 font-black text-xs shadow-[1px_1px_0px_#1c1917]">
                AI
              </span>
              <h4 className="text-sm font-black text-stone-900 tracking-tight">
                Nesty phân tích lỗi sai
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-stone-500 hover:text-stone-900 p-1 rounded-md transition-colors"
              title="Thu gọn"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {isLoading && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-stone-600">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
              <p className="text-xs font-semibold">Nesty đang suy nghĩ và phân tích lỗi sai...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-3 bg-red-100 border-2 border-red-800 rounded-lg text-red-900 text-xs flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleFetchExplanation}
                className="self-start text-xs py-1 px-2.5 h-auto"
              >
                Thử lại
              </Button>
            </div>
          )}

          {explanation && !isLoading && (
            <div className="space-y-3 text-xs leading-relaxed">
              {explanation.misconception && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg">
                  <div className="font-bold text-rose-900 flex items-center gap-1.5 mb-1">
                    <span className="text-sm">🔍</span>
                    <span>Lý do dễ nhầm lẫn:</span>
                  </div>
                  <p className="text-stone-800 pl-5">{explanation.misconception}</p>
                </div>
              )}

              <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-lg">
                <div className="font-bold text-amber-950 flex items-center gap-1.5 mb-1">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Giải thích chi tiết:</span>
                </div>
                <p className="text-stone-800 pl-5">{explanation.explanation}</p>
              </div>

              {explanation.correctUsage && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Cách dùng đúng:</span>
                  </div>
                  <p className="text-stone-800 pl-5 font-medium">{explanation.correctUsage}</p>
                </div>
              )}

              {explanation.tip && (
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5 mb-1">
                    <span className="text-sm">🧠</span>
                    <span>Mẹo ghi nhớ:</span>
                  </div>
                  <p className="text-stone-800 pl-5 italic">{explanation.tip}</p>
                </div>
              )}

              {explanation.examples && explanation.examples.length > 0 && (
                <div className="p-2.5 bg-stone-100 border border-stone-300 rounded-lg">
                  <div className="font-bold text-stone-900 flex items-center gap-1.5 mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-stone-700 shrink-0" />
                    <span>Ví dụ mẫu:</span>
                  </div>
                  <ul className="list-disc pl-8 space-y-1 text-stone-800">
                    {explanation.examples.map((ex, i) => (
                      <li key={i} className="font-mono text-[11px]">{ex}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
