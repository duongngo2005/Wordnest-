"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { WordNestMascot } from "@/components/ui/Mascot";
import { playUISound } from "@/lib/ui-sound";
import {
  getTodayLearningPlanHref,
  type TodayLearningPlan,
  type TodaySecondaryDeckContext,
} from "@/lib/today-learning-plan";

export interface TodayPostcardProps {
  plan: TodayLearningPlan;
  reviewedTodayCount: number;
  secondaryDecks: TodaySecondaryDeckContext[];
  secondaryDecksRemainingCount: number;
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

function getRecommendationCopy(plan: TodayLearningPlan): {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string | null;
} {
  switch (plan.kind) {
    case "DUE":
      return {
        eyebrow: "Nên học tiếp",
        title: `Ôn ${plan.dueCount} thẻ đến hạn`,
        description:
          plan.dueDeckCount > 1
            ? `Các thẻ này đang đến hạn ôn trong ${plan.dueDeckCount} bộ từ.`
            : "Các thẻ này đang đến hạn ôn theo lịch ghi nhớ của bạn.",
        actionLabel: `Ôn ${plan.dueCount} thẻ đến hạn`,
      };
    case "WEAK":
      return {
        eyebrow: plan.deck.deckName,
        title: `Củng cố ${plan.deck.weakCount} từ cần luyện`,
        description: "Dựa trên kết quả luyện tập gần đây, hãy củng cố chúng trước khi học từ mới.",
        actionLabel: "Bắt đầu củng cố",
      };
    case "NEW":
      return {
        eyebrow: plan.deck.deckName,
        title: "Học từ mới",
        description: `Có ${plan.deck.newCount} từ mới đang chờ trong bộ từ này. Phiên học sẽ tự giới hạn số thẻ phù hợp.`,
        actionLabel: "Học từ mới",
      };
    case "CONTEXT":
      return {
        eyebrow: plan.deck.deckName,
        title: "Đọc & học trong ngữ cảnh",
        description: "Hiện không có thẻ cần ôn hay từ cần củng cố. Bạn có thể tiếp tục học trong ngữ cảnh.",
        actionLabel: "Học trong ngữ cảnh",
      };
    case "EMPTY":
      return {
        eyebrow: plan.deck.deckName,
        title: "Thêm từ để bắt đầu",
        description: "Bộ từ này chưa có thẻ nào để học.",
        actionLabel: "Mở bộ từ để thêm từ",
      };
    case "NO_DECKS":
      return {
        eyebrow: "Bắt đầu",
        title: "Tạo bộ sưu tập đầu tiên",
        description: "Tạo bộ sưu tập rồi thêm bộ từ để WordNest có thể gợi ý việc học tiếp theo.",
        actionLabel: null,
      };
  }
}

function getSecondaryDeckLabel(item: TodaySecondaryDeckContext): string {
  const { deck, status } = item;
  switch (status) {
    case "DUE":
      return `${deck.dueCount} thẻ đến hạn`;
    case "WEAK":
      return `${deck.weakCount} từ cần luyện`;
    case "NEW":
      return `${deck.newCount} từ mới`;
    case "CONTEXT":
      return "Sẵn sàng học trong ngữ cảnh";
    case "EMPTY":
      return "Chưa có từ";
  }
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
  plan,
  reviewedTodayCount,
  secondaryDecks,
  secondaryDecksRemainingCount,
  date = new Date(),
}: TodayPostcardProps) {
  const dueCount = plan.kind === "DUE" ? plan.dueCount : 0;
  const totalCardsToday = dueCount + reviewedTodayCount;
  const hasTodayProgress = totalCardsToday > 0;
  const progressPercent = hasTodayProgress
    ? Math.min(100, Math.round((reviewedTodayCount / totalCardsToday) * 100))
    : 0;

  const { type, quote, mascotMood } = getPostcardState(dueCount, reviewedTodayCount, date);
  const recommendation = getRecommendationCopy(plan);
  const actionHref = getTodayLearningPlanHref(plan);
  const postcardRef = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = postcardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Extremely gentle tilt: max ±1.2 degrees (no glare, calm paper feeling)
    const rotateY = Number((((x - centerX) / centerX) * 1.2).toFixed(2));
    const rotateX = Number((-((y - centerY) / centerY) * 1.2).toFixed(2));

    setTilt({ rotateX, rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  return (
    <section
      ref={postcardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="wn-postcard wn-postcard-tilt"
      aria-labelledby="today-heading"
      style={{
        transform:
          tilt.rotateX || tilt.rotateY
            ? `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`
            : undefined,
        transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
      }}
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
                  className="wn-postcard__title-icon text-[var(--accent)]"
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

          <div className="wn-postcard__recommendation">
            <p className="wn-postcard__recommendation-eyebrow">{recommendation.eyebrow}</p>
            <p className="wn-postcard__recommendation-title">{recommendation.title}</p>
            <p className="wn-postcard__recommendation-description">{recommendation.description}</p>
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

          {secondaryDecks.length > 0 ? (
            <div className="wn-postcard__secondary" aria-label="Tóm tắt các bộ từ khác">
              <ul className="wn-postcard__secondary-list">
                {secondaryDecks.map(({ deck, status }) => (
                  <li key={deck.deckId} className="wn-postcard__secondary-item">
                    <span className="wn-postcard__secondary-name" title={deck.deckName}>
                      {deck.deckName}
                    </span>
                    <span className="wn-postcard__secondary-status">
                      {getSecondaryDeckLabel({ deck, status })}
                    </span>
                  </li>
                ))}
              </ul>
              {secondaryDecksRemainingCount > 0 ? (
                <p className="wn-postcard__secondary-more">+ {secondaryDecksRemainingCount} bộ từ khác</p>
              ) : null}
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
              {actionHref && recommendation.actionLabel ? (
                <Link
                  href={actionHref}
                  onClick={() => playUISound("softTap")}
                  className="brick-button-primary wn-postcard__cta"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                  <span>{recommendation.actionLabel}</span>
                </Link>
              ) : (
                <div className="wn-postcard__completed-pill" role="status">
                  <CheckCircle2 className="h-4 w-4 text-[#15803D]" aria-hidden="true" strokeWidth={2.5} />
                  <span>Chọn tạo bộ sưu tập bên dưới để bắt đầu</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
