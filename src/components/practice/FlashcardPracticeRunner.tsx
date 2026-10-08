"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { WordNestMascot } from "@/components/ui/Mascot";
import { playUISound } from "@/lib/ui-sound";
import { PracticeFlashcard } from "./PracticeFlashcard";
import {
  createFlashcardPracticeSession,
  type FlashcardPracticeMode,
  type PracticeCardSessionItem,
  type PracticeFlashcardData,
} from "./flashcard-practice-session";

type PracticePhase = "setup" | "first-pass" | "first-summary" | "retry" | "complete";

interface PracticePassResult {
  total: number;
  remembered: number;
  forgotten: number;
}

interface FlashcardPracticeRunnerProps {
  deckId: string;
  deckName: string;
  initialCards: PracticeFlashcardData[];
}

const modeOptions: Array<{ value: FlashcardPracticeMode; label: string; description: string }> = [
  { value: "vi_en", label: "VI → EN", description: "Nhìn nghĩa Việt, nhớ từ tiếng Anh." },
  { value: "mix", label: "Mix", description: "Đan xen hai hướng trong một lượt." },
];

function getModeLabel(mode: FlashcardPracticeMode | null): string {
  return modeOptions.find((option) => option.value === mode)?.label ?? "Luyện thẻ";
}

function isShortcutExcludedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, button, a[href], [contenteditable='true']"));
}

function PracticeModeSelector({
  selectedMode,
  onChange,
  onStart,
}: {
  selectedMode: FlashcardPracticeMode;
  onChange: (mode: FlashcardPracticeMode) => void;
  onStart: () => void;
}) {
  return (
    <section className="brick-card space-y-5 bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:p-7" aria-labelledby="practice-title">
      <div className="space-y-2">
        <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#9A3412]">Flashcard practice</p>
        <h1 id="practice-title" className="text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl">Luyện thẻ</h1>
        <p className="max-w-prose text-sm font-semibold leading-relaxed text-[#6B6258]">
          Tự nhớ đáp án rồi mới lật thẻ. Lựa chọn của bạn chỉ dùng trong lượt luyện này.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm font-black text-[#221C16]">Chọn hướng luyện</legend>
        <div className="grid grid-cols-2 gap-2">
          {modeOptions.map((option) => {
            const isSelected = selectedMode === option.value;
            const inputId = `flashcard-practice-mode-${option.value}`;

            return (
              <label key={option.value} htmlFor={inputId} className="cursor-pointer">
                <input
                  id={inputId}
                  type="radio"
                  name="flashcard-practice-mode"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onChange(option.value)}
                  className="peer wn-sr-only"
                />
                <span
                  className={`flex min-h-[44px] items-center justify-center rounded-lg border-2 px-2 py-2 text-center text-xs font-black shadow-[1.5px_1.5px_0px_#221C16] transition-[background-color,transform,box-shadow] duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] ${
                    isSelected
                      ? "border-[#221C16] bg-[var(--accent-soft)] text-[#9A3412]"
                      : "border-[#DCD3C5] bg-[#FAF6EE] text-[#6B6258]"
                  }`}
                >
                  {option.label}
                </span>
                <span className="wn-sr-only">{option.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button type="button" onClick={onStart} className="brick-button-primary min-h-[48px] w-full !bg-[#9A3412] px-4 py-3.5 text-base font-black hover:!bg-[#7C2D12]">
        Bắt đầu luyện
      </button>
    </section>
  );
}

function PracticeEmptyState({ deckId }: Pick<FlashcardPracticeRunnerProps, "deckId">) {
  return (
    <section className="brick-card mx-auto max-w-xl space-y-5 bg-[#FFFDF9] p-8 text-center shadow-[4px_4px_0px_#221C16]">
      <div className="flex justify-center"><WordNestMascot mood="thinking" size={96} /></div>
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-[#221C16]">Luyện thẻ</h1>
        <p className="text-sm font-semibold leading-relaxed text-[#6B6258]">Bộ từ này chưa có thẻ để luyện.</p>
      </div>
      <div className="hidden sm:block">
        <Link href={`/decks/${deckId}`} className="brick-button-primary min-h-[48px] !bg-[#9A3412] px-5 py-3 text-sm font-black hover:!bg-[#7C2D12]">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          Quay lại bộ từ
        </Link>
      </div>
    </section>
  );
}

function PracticePassCard({ label, result }: { label: string; result: PracticePassResult }) {
  return (
    <section className="rounded-xl border-2 border-[#221C16] bg-[#FEF8ED] p-4 shadow-[2px_2px_0px_#221C16]" aria-label={label}>
      <p className="font-mono text-[10px] font-black uppercase tracking-wider text-[#9A3412]">{label}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-bold text-[#6B6258]">Đã nhớ</dt>
          <dd className="mt-0.5 text-2xl font-black tracking-tight text-[#221C16]">{result.remembered} / {result.total}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#6B6258]">Chưa nhớ</dt>
          <dd className="mt-0.5 text-2xl font-black tracking-tight text-[#7C2D12]">{result.forgotten}</dd>
        </div>
      </dl>
    </section>
  );
}

function PracticeCompletion({
  deckId,
  firstPassResult,
  retryResult,
  forgottenCount,
  onRetry,
  onStartNewSession,
}: {
  deckId: string;
  firstPassResult: PracticePassResult;
  retryResult: PracticePassResult | null;
  forgottenCount: number;
  onRetry: () => void;
  onStartNewSession: () => void;
}) {
  const canRetry = forgottenCount > 0 && retryResult === null;

  return (
    <section className="brick-card mx-auto max-w-xl space-y-5 bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:p-7" aria-labelledby="practice-completion-title">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#221C16] bg-[var(--accent-soft)] shadow-[2px_2px_0px_#221C16]">
          <Sparkles aria-hidden="true" className="h-5 w-5 text-[#9A3412]" strokeWidth={2.5} />
        </span>
        <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#9A3412]">Luyện thẻ</p>
        <h1 id="practice-completion-title" className="text-2xl font-black tracking-tight text-[#221C16]">Hoàn thành lượt luyện</h1>
      </div>

      <div className="space-y-3">
        <PracticePassCard label="Lượt đầu" result={firstPassResult} />
        {retryResult ? <PracticePassCard label="Luyện lại" result={retryResult} /> : null}
      </div>

      <div className="grid gap-2.5">
        {canRetry ? (
          <button type="button" onClick={onRetry} className="brick-button-primary min-h-[48px] w-full !bg-[#9A3412] px-4 py-3 text-sm font-black hover:!bg-[#7C2D12]">
            <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            Luyện lại {forgottenCount} thẻ chưa nhớ
          </button>
        ) : null}
        <Link href={`/decks/${deckId}`} className="brick-button-secondary min-h-[48px] w-full px-4 py-3 text-sm font-black">
          Hoàn thành
        </Link>
        <button type="button" onClick={onStartNewSession} className="wn-button wn-button-quiet min-h-[44px] w-full px-4 py-2.5 text-sm font-black">
          Chọn lượt luyện mới
        </button>
      </div>
    </section>
  );
}

export function FlashcardPracticeRunner({ deckId, deckName, initialCards }: FlashcardPracticeRunnerProps) {
  const [selectedMode, setSelectedMode] = useState<FlashcardPracticeMode>("vi_en");
  const [sessionMode, setSessionMode] = useState<FlashcardPracticeMode | null>(null);
  const [sessionItems, setSessionItems] = useState<PracticeCardSessionItem[] | null>(null);
  const [phase, setPhase] = useState<PracticePhase>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [firstPassRemembered, setFirstPassRemembered] = useState(0);
  const [forgottenItems, setForgottenItems] = useState<PracticeCardSessionItem[]>([]);
  const [firstPassResult, setFirstPassResult] = useState<PracticePassResult | null>(null);
  const [retryRemembered, setRetryRemembered] = useState(0);
  const [retryResult, setRetryResult] = useState<PracticePassResult | null>(null);
  const ratingLocked = useRef(false);

  const isSessionActive = phase === "first-pass" || phase === "retry";
  const currentItems = phase === "retry" ? forgottenItems : sessionItems ?? [];
  const currentItem = currentItems[currentIndex];
  const currentTotal = currentItems.length;
  const sessionStatus = isSessionActive && currentItem
    ? `Thẻ ${currentIndex + 1} trên ${currentTotal}. ${isRevealed ? "Đáp án đã hiển thị." : "Đáp án đang ẩn."}`
    : phase === "first-summary"
      ? "Đã hoàn thành lượt đầu."
      : phase === "complete"
        ? "Đã hoàn thành lượt luyện."
        : "Chọn hướng luyện trước khi bắt đầu.";

  useEffect(() => {
    ratingLocked.current = false;
  }, [currentIndex, phase]);

  const startSession = useCallback(() => {
    const nextSession = createFlashcardPracticeSession(initialCards, selectedMode);
    setSessionItems(nextSession);
    setSessionMode(selectedMode);
    setCurrentIndex(0);
    setIsRevealed(false);
    setFirstPassRemembered(0);
    setForgottenItems([]);
    setFirstPassResult(null);
    setRetryRemembered(0);
    setRetryResult(null);
    setPhase("first-pass");
  }, [initialCards, selectedMode]);

  const showAnswer = useCallback(() => {
    if (!isSessionActive || isRevealed) return;
    playUISound("paperFlip");
    setIsRevealed(true);
  }, [isRevealed, isSessionActive]);

  const rateCurrentCard = useCallback((remembered: boolean) => {
    if (!isSessionActive || !isRevealed || !currentItem || ratingLocked.current) return;

    ratingLocked.current = true;
    playUISound("softTap");

    if (phase === "first-pass") {
      const nextRemembered = firstPassRemembered + (remembered ? 1 : 0);
      const nextForgottenItems = remembered ? forgottenItems : [...forgottenItems, currentItem];

      if (currentIndex + 1 === currentTotal) {
        setFirstPassRemembered(nextRemembered);
        setForgottenItems(nextForgottenItems);
        setFirstPassResult({
          total: currentTotal,
          remembered: nextRemembered,
          forgotten: nextForgottenItems.length,
        });
        setPhase("first-summary");
        return;
      }

      setFirstPassRemembered(nextRemembered);
      setForgottenItems(nextForgottenItems);
    } else {
      const nextRetryRemembered = retryRemembered + (remembered ? 1 : 0);

      if (currentIndex + 1 === currentTotal) {
        setRetryRemembered(nextRetryRemembered);
        setRetryResult({
          total: currentTotal,
          remembered: nextRetryRemembered,
          forgotten: currentTotal - nextRetryRemembered,
        });
        setPhase("complete");
        playUISound("completion");
        return;
      }

      setRetryRemembered(nextRetryRemembered);
    }

    setCurrentIndex((index) => index + 1);
    setIsRevealed(false);
  }, [currentIndex, currentItem, currentTotal, firstPassRemembered, forgottenItems, isRevealed, isSessionActive, phase, retryRemembered]);

  const startRetry = useCallback(() => {
    if (!firstPassResult || forgottenItems.length === 0) return;
    setCurrentIndex(0);
    setIsRevealed(false);
    setRetryRemembered(0);
    setPhase("retry");
  }, [firstPassResult, forgottenItems.length]);

  const startNewSession = useCallback(() => {
    setSessionItems(null);
    setSessionMode(null);
    setCurrentIndex(0);
    setIsRevealed(false);
    setFirstPassRemembered(0);
    setForgottenItems([]);
    setFirstPassResult(null);
    setRetryRemembered(0);
    setRetryResult(null);
    setPhase("setup");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSessionActive || event.repeat || isShortcutExcludedTarget(event.target)) return;

      if (event.code === "Space" && !isRevealed) {
        event.preventDefault();
        showAnswer();
        return;
      }

      if (!isRevealed) return;

      if (event.key === "1" || event.code === "Digit1") {
        event.preventDefault();
        rateCurrentCard(false);
      } else if (event.key === "2" || event.code === "Digit2") {
        event.preventDefault();
        rateCurrentCard(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRevealed, isSessionActive, rateCurrentCard, showAnswer]);

  if (initialCards.length === 0) {
    return <PracticeEmptyState deckId={deckId} />;
  }

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-xl py-2 sm:py-4">
        <p className="wn-sr-only" aria-live="polite" aria-atomic="true">{sessionStatus}</p>
        <PracticeModeSelector selectedMode={selectedMode} onChange={setSelectedMode} onStart={startSession} />
      </div>
    );
  }

  if ((phase === "first-summary" || phase === "complete") && firstPassResult) {
    return (
      <div className="mx-auto max-w-xl py-2 sm:py-4">
        <p className="wn-sr-only" aria-live="polite" aria-atomic="true">{sessionStatus}</p>
        <PracticeCompletion
          deckId={deckId}
          firstPassResult={firstPassResult}
          retryResult={retryResult}
          forgottenCount={forgottenItems.length}
          onRetry={startRetry}
          onStartNewSession={startNewSession}
        />
      </div>
    );
  }

  if (!currentItem) {
    return null;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 py-2 sm:py-4">
      <p className="wn-sr-only" aria-live="polite" aria-atomic="true">{sessionStatus}</p>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="hidden sm:block">
            <Link href={`/decks/${deckId}`} className="brick-button-secondary min-h-[44px] px-3 py-2 text-xs font-black">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
              Quay lại bộ từ
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="brick-badge bg-[#FAF6EE] font-mono text-[10px] font-black uppercase tracking-wider text-[#6B6258]">
              {getModeLabel(sessionMode)}
            </span>
            <span className="brick-badge bg-[#FFFDF9] font-mono text-xs font-black text-[#221C16]">
              {currentIndex + 1} / {currentTotal}
            </span>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Tiến độ luyện thẻ"
          aria-valuemin={1}
          aria-valuemax={currentTotal}
          aria-valuenow={currentIndex + 1}
          className="h-2.5 w-full overflow-hidden rounded-full border-2 border-[#221C16] bg-[#EDE6D8] p-0.5"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${((currentIndex + 1) / currentTotal) * 100}%` }}
          />
        </div>
        <p className="text-center text-xs font-semibold text-[#6B6258]">
          {deckName} · Hướng luyện đã được cố định cho lượt này.
        </p>
      </div>

      <div key={`${phase}-${currentItem.card.id}`} className="wn-card-enter">
        <PracticeFlashcard item={currentItem} isRevealed={isRevealed} onReveal={showAnswer} onRate={rateCurrentCard} />
      </div>
    </div>
  );
}
