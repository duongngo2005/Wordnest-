"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Keyboard, Loader2, RotateCcw } from "lucide-react";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import type { QuizQuestion, QuizSubmissionResult } from "@/services/vocabulary/quiz-service";
import type {
  GlobalTypingQuestionCount,
  GlobalTypingQueueMode,
} from "@/services/vocabulary/global-typing-service";

type ActiveSession = {
  sessionId: string;
  questions: QuizQuestion[];
  source: TypingPracticeSource;
  newSessionUrl: string;
};

type LastMistakes = {
  sessionId: string;
  wrongCount: number;
};

const LAST_MISTAKES_STORAGE_KEY = "wordnest.global-typing.last-mistakes.v1";
const countOptions: GlobalTypingQuestionCount[] = [10, 20, 50];

export type TypingPracticeSource = "global" | "due";

function sessionUrl(mode: GlobalTypingQueueMode, count: GlobalTypingQuestionCount, retrySessionId?: string): string {
  const params = new URLSearchParams({ mode, count: String(count) });
  if (mode === "retry" && retrySessionId) params.set("retrySessionId", retrySessionId);
  return `/api/practice/global-typing?${params.toString()}`;
}

function emptyMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "no_due_cards":
      return "Hiện không còn thẻ nào đến hạn để luyện gõ.";
    case "no_weak_cards":
      return "Chưa có từ nào đủ bằng chứng sai gần đây để luyện tập trung. Hãy chọn Trộn toàn bộ để tiếp tục luyện.";
    case "no_retry_cards":
      return "Phiên gần nhất không còn từ sai để ôn lại.";
    case "no_safe_cues":
      return "Các từ hiện có chưa có gợi ý Việt → Anh đủ rõ để chấm công bằng.";
    default:
      return "Thư viện chưa có từ vựng canonical để luyện gõ.";
  }
}

export function GlobalTypingPractice({ source = "global" }: { source?: TypingPracticeSource }) {
  const [mode, setMode] = useState<GlobalTypingQueueMode>("all");
  const [count, setCount] = useState<GlobalTypingQuestionCount>(10);
  const [lastMistakes, setLastMistakes] = useState<LastMistakes | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyState, setEmptyState] = useState<string | null>(null);

  useEffect(() => {
    if (source === "due") return;
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(LAST_MISTAKES_STORAGE_KEY);
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "sessionId" in parsed &&
          "wrongCount" in parsed &&
          typeof parsed.sessionId === "string" &&
          typeof parsed.wrongCount === "number" &&
          parsed.wrongCount > 0
        ) {
          setLastMistakes({ sessionId: parsed.sessionId, wrongCount: parsed.wrongCount });
        }
      } catch {
        window.localStorage.removeItem(LAST_MISTAKES_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [source]);

  const createSession = useCallback(async (requestUrl: string, sessionSource: TypingPracticeSource) => {
    setIsLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const response = await fetch(requestUrl);
      const payload: unknown = await response.json().catch(() => null);
      const result =
        typeof payload === "object" && payload !== null && "data" in payload
          ? payload.data
          : null;
      const reason =
        typeof result === "object" && result !== null && "emptyReason" in result && typeof result.emptyReason === "string"
          ? result.emptyReason
          : null;
      if (reason) {
        setEmptyState(emptyMessage(reason));
        return;
      }
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("sessionId" in result) ||
        !("questions" in result) ||
        !Array.isArray(result.questions) ||
        result.questions.length === 0 ||
        typeof result.sessionId !== "string"
      ) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : emptyMessage(reason);
        throw new Error(message);
      }
      setActiveSession({
        sessionId: result.sessionId,
        questions: result.questions as QuizQuestion[],
        source: sessionSource,
        newSessionUrl: requestUrl,
      });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Không thể tạo lượt luyện gõ. Hãy thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startSession = useCallback((
    selectedMode: GlobalTypingQueueMode,
    selectedCount: GlobalTypingQuestionCount,
    retrySessionId?: string
  ) => {
    return createSession(sessionUrl(selectedMode, selectedCount, retrySessionId), "global");
  }, [createSession]);

  const startDueSession = useCallback(() => {
    return createSession("/api/practice/due-typing", "due");
  }, [createSession]);

  const handleCompleted = useCallback((_: QuizSubmissionResult, completedSessionId: string, records: Array<{ isCorrect: boolean }>) => {
    const wrongCount = records.filter((record) => !record.isCorrect).length;
    if (wrongCount === 0) {
      window.localStorage.removeItem(LAST_MISTAKES_STORAGE_KEY);
      setLastMistakes(null);
      return;
    }
    const next = { sessionId: completedSessionId, wrongCount };
    window.localStorage.setItem(LAST_MISTAKES_STORAGE_KEY, JSON.stringify(next));
    setLastMistakes(next);
  }, []);

  if (activeSession) {
    return (
      <QuizRunner
        key={activeSession.sessionId}
        deck={
          activeSession.source === "due"
            ? { id: "due-typing", name: "Thẻ đang đến hạn" }
            : { id: "global-typing", name: "Toàn bộ thư viện" }
        }
        initialQuestions={activeSession.questions}
        initialSessionId={activeSession.sessionId}
        initialMode={activeSession.source === "due" ? "due_typing" : "global_typing"}
        lockedMode
        apiBasePath={activeSession.source === "due" ? "/api/practice/due-typing" : "/api/practice/global-typing"}
        newSessionUrl={activeSession.newSessionUrl}
        backHref={activeSession.source === "due" ? "/" : "/progress"}
        backLabel={activeSession.source === "due" ? "Về trang chủ" : "Về tiến độ"}
        sessionLabel={activeSession.source === "due" ? "Luyện gõ · Từ đến hạn" : "Luyện gõ · Việt → Anh"}
        resultTitle={activeSession.source === "due" ? "Hoàn thành phiên luyện gõ" : "Kết quả Luyện gõ"}
        resultScopeLabel="Nguồn từ"
        typedHintPolicy="hidden"
        letterHintPolicy="available"
        onCompleted={activeSession.source === "global" ? handleCompleted : undefined}
        onTypedHintRequested={activeSession.source === "global" ? async (sessionId, questionId) => {
          const response = await fetch("/api/practice/global-typing/hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, questionId }),
          });
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            const message =
              typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
                ? payload.error
                : "Không thể ghi nhận việc dùng gợi ý.";
            throw new Error(message);
          }
        } : undefined}
      />
    );
  }

  if (source === "due") {
    return (
      <section className="brick-card mx-auto max-w-xl space-y-6 bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:p-7" aria-labelledby="due-typing-title">
        <div className="space-y-2">
          <Link href="/" className="hidden w-fit items-center gap-1.5 text-xs font-black text-[var(--accent)] underline underline-offset-4 sm:inline-flex">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Về trang chủ
          </Link>
          <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#9A3412]">Active recall</p>
          <h1 id="due-typing-title" className="text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl">Luyện gõ · Từ đến hạn</h1>
          <p className="max-w-prose text-sm font-semibold leading-relaxed text-[#6B6258]">
            Chỉ dùng các thẻ đang đến hạn tại thời điểm bắt đầu phiên.
          </p>
        </div>

        <div aria-live="polite" aria-atomic="true" className="wn-sr-only">
          {isLoading ? "Đang tạo lượt luyện gõ từ đến hạn." : ""}
        </div>
        {emptyState ? <p role="status" className="rounded-xl border-2 border-[#DCD3C5] bg-[#FAF6EE] p-3 text-sm font-bold text-[#6B6258]">{emptyState}</p> : null}
        {error ? <div role="alert" className="rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-sm font-bold text-[#991B1B]">{error}</div> : null}

        <button
          type="button"
          disabled={isLoading}
          aria-busy={isLoading}
          onClick={() => void startDueSession()}
          className="brick-button-primary min-h-12 w-full px-4 py-3 text-base font-black disabled:cursor-wait disabled:opacity-70"
        >
          {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Keyboard aria-hidden="true" className="h-4 w-4" />}
          <span>{isLoading ? "Đang tạo lượt luyện" : "Bắt đầu luyện gõ từ đến hạn"}</span>
        </button>
      </section>
    );
  }

  return (
    <section className="brick-card mx-auto max-w-xl space-y-6 bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:p-7" aria-labelledby="global-typing-title">
      <div className="space-y-2">
        <Link href="/progress" className="hidden w-fit items-center gap-1.5 text-xs font-black text-[var(--accent)] underline underline-offset-4 sm:inline-flex">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Về tiến độ
        </Link>
        <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#9A3412]">Active recall</p>
        <h1 id="global-typing-title" className="text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl">Luyện gõ</h1>
        <p className="max-w-prose text-sm font-semibold leading-relaxed text-[#6B6258]">
          Nhìn nghĩa tiếng Việt và tự gõ từ tiếng Anh. Nguồn từ là toàn bộ hồ sơ canonical trong thư viện, gồm cả từ chưa được xếp vào Deck.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm font-black text-[#221C16]">Chọn lượt luyện</legend>
        <div className="grid gap-2">
          {[
            { value: "all", label: "Trộn toàn bộ từ", description: "Mặc định; vẫn ưu tiên vừa phải các từ yếu gần đây." },
            { value: "weak", label: "Tập trung từ hay sai", description: "Chỉ lấy các lỗi gõ gần đây có đủ bằng chứng." },
            { value: "retry", label: "Ôn lại từ sai phiên vừa học", description: lastMistakes ? `${lastMistakes.wrongCount} từ sai từ phiên gần nhất.` : "Chỉ mở sau khi có câu sai trong một phiên Luyện gõ." },
          ].map((option) => {
            const isRetryUnavailable = option.value === "retry" && !lastMistakes;
            const selected = mode === option.value;
            const inputId = `global-typing-mode-${option.value}`;
            return (
              <label key={option.value} htmlFor={inputId} className={`rounded-xl border-2 p-3 ${isRetryUnavailable ? "cursor-not-allowed border-[#DCD3C5] bg-[#FAF6EE] opacity-65" : "cursor-pointer border-[#221C16] bg-[#FFFDF9]"}`}>
                <span className="flex items-start gap-3">
                  <input
                    id={inputId}
                    type="radio"
                    name="global-typing-mode"
                    value={option.value}
                    checked={selected}
                    disabled={isRetryUnavailable || isLoading}
                    onChange={() => setMode(option.value as GlobalTypingQueueMode)}
                    className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-black text-[#221C16]">{option.label}</span>
                    <span className="mt-0.5 block text-xs font-semibold leading-relaxed text-[#6B6258]">{option.description}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-black text-[#221C16]">Số câu</legend>
        <div className="grid grid-cols-3 gap-2">
          {countOptions.map((option) => (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name="global-typing-count"
                value={option}
                checked={count === option}
                disabled={isLoading}
                onChange={() => setCount(option)}
                className="peer wn-sr-only"
              />
              <span className="flex min-h-11 items-center justify-center rounded-lg border-2 border-[#DCD3C5] bg-[#FAF6EE] text-sm font-black text-[#6B6258] shadow-[1.5px_1.5px_0px_#221C16] transition-colors peer-checked:border-[#221C16] peer-checked:bg-[var(--accent-soft)] peer-checked:text-[#9A3412] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">
                {option}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="polite" aria-atomic="true" className="wn-sr-only">
        {isLoading ? "Đang tạo lượt luyện gõ." : ""}
      </div>
      {error ? (
        <div role="alert" className="rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-sm font-bold text-[#991B1B]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={isLoading}
        aria-busy={isLoading}
        onClick={() => void startSession(mode, count, mode === "retry" ? lastMistakes?.sessionId : undefined)}
        className="brick-button-primary min-h-12 w-full px-4 py-3 text-base font-black disabled:cursor-wait disabled:opacity-70"
      >
        {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Keyboard aria-hidden="true" className="h-4 w-4" />}
        <span>{isLoading ? "Đang tạo lượt luyện" : "Bắt đầu luyện gõ"}</span>
      </button>

      <p className="flex items-start gap-2 border-t border-dashed border-[#C9BFB1] pt-4 text-xs font-semibold leading-relaxed text-[#6B6258]">
        <RotateCcw aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9A3412]" />
        Lần trả lời đầu tiên được ghi nhận riêng; luyện lại sau phản hồi chỉ là củng cố và không thay đổi lịch ôn FSRS.
      </p>
    </section>
  );
}
