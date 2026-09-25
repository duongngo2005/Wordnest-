import React from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { WordNestMascot } from "@/components/ui/Mascot";

export interface TodayPostcardProps {
  dueCount: number;
  reviewedTodayCount: number;
  studyDeckId?: string;
  date?: Date;
}

export interface PostcardState {
  type: "due" | "in_progress" | "completed" | "clean_slate";
  quote: string;
  mascotMood: "reading" | "thinking" | "celebrating" | "happy";
}

const QUOTES_DUE = [
  "Your words are waiting.",
  "A little progress each day adds up.",
  "Small steps still move you forward.",
  "Start where you are, use what you have.",
];

const QUOTES_IN_PROGRESS = [
  "Keep the momentum going.",
  "One more review, one step closer.",
  "Steady practice makes lasting memory.",
  "You're in the flow today.",
];

const QUOTES_COMPLETED = [
  "Nice work. You’re done for today.",
  "All caught up. Rest well today!",
  "Today's words are safely nested.",
  "Mission complete. See you tomorrow!",
];

const QUOTES_CLEAN_SLATE = [
  "Start small, start today.",
  "A fresh page awaits you.",
  "Every expert was once a beginner.",
  "Ready when you are.",
];

export function getPostcardState(
  dueCount: number,
  reviewedTodayCount: number,
  date: Date = new Date()
): PostcardState {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );

  if (dueCount > 0 && reviewedTodayCount === 0) {
    return {
      type: "due",
      quote: QUOTES_DUE[dayOfYear % QUOTES_DUE.length],
      mascotMood: "reading",
    };
  }

  if (dueCount > 0 && reviewedTodayCount > 0) {
    return {
      type: "in_progress",
      quote: QUOTES_IN_PROGRESS[dayOfYear % QUOTES_IN_PROGRESS.length],
      mascotMood: "thinking",
    };
  }

  if (dueCount === 0 && reviewedTodayCount > 0) {
    return {
      type: "completed",
      quote: QUOTES_COMPLETED[dayOfYear % QUOTES_COMPLETED.length],
      mascotMood: "celebrating",
    };
  }

  return {
    type: "clean_slate",
    quote: QUOTES_CLEAN_SLATE[dayOfYear % QUOTES_CLEAN_SLATE.length],
    mascotMood: "happy",
  };
}

function VintagePostmark({ date }: { date: Date }) {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();

  return (
    <div className="wn-postcard__postmark" aria-hidden="true">
      <svg
        width="114"
        height="46"
        viewBox="0 0 114 46"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="wn-postcard__postmark-svg"
      >
        {/* Double circular postmark cancellation stamp */}
        <circle cx="23" cy="23" r="20" stroke="currentColor" strokeWidth="1.25" strokeDasharray="3 1.5" />
        <circle cx="23" cy="23" r="16.5" stroke="currentColor" strokeWidth="0.75" />
        <text
          x="23"
          y="15"
          textAnchor="middle"
          fontSize="5.5"
          fontWeight="800"
          fill="currentColor"
          letterSpacing="0.08em"
          fontFamily="ui-monospace, monospace"
        >
          WORDNEST
        </text>
        <text
          x="23"
          y="24"
          textAnchor="middle"
          fontSize="7"
          fontWeight="900"
          fill="currentColor"
          fontFamily="ui-monospace, monospace"
        >
          {day}·{month}
        </text>
        <text
          x="23"
          y="31"
          textAnchor="middle"
          fontSize="5"
          fontWeight="700"
          fill="currentColor"
          fontFamily="ui-monospace, monospace"
        >
          {year}
        </text>

        {/* 3 wavy postal cancellation lines */}
        <path
          d="M48 14 Q 54 10, 60 14 T 72 14 T 84 14 T 96 14 T 108 14"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M48 23 Q 54 19, 60 23 T 72 23 T 84 23 T 96 23 T 108 23"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M48 32 Q 54 28, 60 32 T 72 32 T 84 32 T 96 32 T 108 32"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function TodayPostcard({
  dueCount,
  reviewedTodayCount,
  studyDeckId,
  date = new Date(),
}: TodayPostcardProps) {
  const totalCardsToday = dueCount + reviewedTodayCount;
  const hasTodayProgress = totalCardsToday > 0;
  const progressPercent = hasTodayProgress
    ? Math.min(100, Math.round((reviewedTodayCount / totalCardsToday) * 100))
    : 0;

  const { type, quote, mascotMood } = getPostcardState(dueCount, reviewedTodayCount, date);

  return (
    <section
      className="wn-postcard"
      aria-labelledby="today-heading"
    >
      <div className="wn-postcard__layout">
        {/* Left Column: Postcard Message, Stats & Progress */}
        <div className="wn-postcard__left">
          {/* Header Row: Title & Postmark for mobile / Title on desktop */}
          <div className="wn-postcard__header-row">
            <div className="wn-postcard__title-group">
              {type === "completed" ? (
                <CheckCircle2
                  className="wn-postcard__title-icon text-[#15803D]"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
              ) : (
                <Sparkles
                  className="wn-postcard__title-icon text-[#E06B43]"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
              )}
              <h2 id="today-heading" className="wn-postcard__title">
                Hôm nay
              </h2>
            </div>

            {/* Mobile-only postmark location (in desktop, postmark is in right column) */}
            <div className="wn-postcard__postmark-mobile">
              <VintagePostmark date={date} />
            </div>
          </div>

          {/* Motivational English Quote with gentle notebook sketch underline */}
          <div className="wn-postcard__quote-wrap">
            <blockquote className="wn-postcard__quote">
              “<span className="wn-sketch-underline">{quote}</span>”
            </blockquote>
          </div>

          {/* Learning Stats */}
          <dl className="wn-postcard__stats" aria-label="Tóm tắt học hôm nay">
            <div
              className="wn-postcard__stat wn-postcard__stat--due"
              data-testid="today-due-stat"
            >
              <dt className="wn-postcard__stat-label">cần ôn</dt>
              <dd className="wn-postcard__stat-num">{dueCount}</dd>
            </div>

            <div
              className="wn-postcard__stat wn-postcard__stat--reviewed"
              data-testid="today-reviewed-stat"
            >
              <dt className="wn-postcard__stat-label">đã ôn</dt>
              <dd className="wn-postcard__stat-num">{reviewedTodayCount}</dd>
            </div>
          </dl>

          {/* Today Progress */}
          {hasTodayProgress ? (
            <div className="wn-postcard__progress" data-testid="today-progress">
              <div className="wn-postcard__progress-meta">
                <span className="wn-postcard__progress-label">Tiến độ hôm nay</span>
                <span className="wn-postcard__progress-value">
                  <span className="wn-marker-highlight">{reviewedTodayCount}/{totalCardsToday}</span>
                </span>
              </div>
              <progress
                className="wn-postcard__progress-bar"
                value={reviewedTodayCount}
                max={totalCardsToday}
                aria-label="Tiến độ hôm nay"
              >
                {progressPercent}%
              </progress>
            </div>
          ) : null}
        </div>

        {/* Right Column: Postmark (Desktop) + Mascot & CTA */}
        <div className="wn-postcard__right">
          {/* Desktop-only postmark position */}
          <div className="wn-postcard__postmark-desktop">
            <VintagePostmark date={date} />
          </div>

          {/* Mascot & CTA Action Area */}
          <div className="wn-postcard__action-area">
            <div className="wn-postcard__mascot-wrapper relative">
              <span className="absolute -top-1.5 -right-1.5 select-none font-mono text-xs font-bold text-[#D97706]/70" aria-hidden="true">✦</span>
              <WordNestMascot
                mood={mascotMood}
                size={84}
                ariaHidden={true}
                className="wn-postcard__mascot-graphic"
              />
            </div>

            <div className="wn-postcard__cta-wrap">
              {dueCount > 0 && studyDeckId ? (
                <Link
                  href={`/decks/${studyDeckId}/study`}
                  className="brick-button-primary wn-postcard__cta"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                  <span>Ôn tập</span>
                </Link>
              ) : type === "completed" ? (
                <div className="wn-postcard__completed-pill" role="status">
                  <CheckCircle2 className="h-4 w-4 text-[#15803D]" aria-hidden="true" strokeWidth={2.5} />
                  <span>Đã xong hôm nay</span>
                </div>
              ) : studyDeckId ? (
                <Link
                  href={`/decks/${studyDeckId}/study`}
                  className="brick-button-secondary wn-postcard__cta"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                  <span>Ôn tập</span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
