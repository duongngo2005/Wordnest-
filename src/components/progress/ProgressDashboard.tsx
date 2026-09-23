import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Clock3,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  ProgressAnalytics,
  ProgressDateCount,
  ProgressPerformance,
  ProgressRatingCount,
  ProgressStateCount,
} from "@/services/vocabulary/progress-service";

interface ProgressDashboardProps {
  analytics: ProgressAnalytics;
}

function percentage(value: number, maximum: number): string {
  if (maximum <= 0) return "0%";
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

function accuracy(performance: ProgressPerformance): string {
  return performance.accuracy === null ? "Chưa có dữ liệu" : `${performance.accuracy}% · ${performance.correct}/${performance.total}`;
}

function BarChart({
  title,
  data,
  color = "#E06B43",
  emptyLabel,
}: {
  title: string;
  data: ProgressDateCount[];
  color?: string;
  emptyLabel: string;
}) {
  const maximum = Math.max(...data.map((item) => item.count), 0);
  const description = data.map((item) => `${item.label}: ${item.count}`).join(", ");
  const hasData = maximum > 0;

  return (
    <figure className="wn-insight-panel min-w-0 p-4 sm:p-5" aria-labelledby={`${title}-title`}>
      <figcaption className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${title}-title`} className="text-base font-black text-[#221C16]">
            {title}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">
            {hasData ? `${data.reduce((sum, item) => sum + item.count, 0)} lượt` : emptyLabel}
          </p>
        </div>
        <BarChart3 className="h-5 w-5 shrink-0 text-[#E06B43]" aria-hidden="true" />
      </figcaption>
      <div
        role="img"
        aria-label={`${title}. ${hasData ? description : emptyLabel}`}
        className="mt-5 flex h-36 items-end gap-1.5 border-b-2 border-[#221C16] px-1 pb-1"
      >
        {data.map((item, index) => {
          const showLabel = data.length <= 7 || index === 0 || index === data.length - 1 || index % 3 === 0;
          const compactLabel = data.length > 7 ? item.date.slice(-2) : item.label;
          return (
          <div key={item.date} className="flex min-w-0 flex-1 flex-col justify-end gap-1 text-center">
            {item.count > 0 ? <span className="text-[10px] font-black text-[#6B6258]">{item.count}</span> : null}
            <div
              className="wn-chart-bar mx-auto w-full max-w-5"
              style={{ height: hasData ? percentage(item.count, maximum) : "3px", backgroundColor: color }}
            />
            <span className="h-3 text-[9px] font-bold text-[#6B6258]">{showLabel ? compactLabel : ""}</span>
          </div>
          );
        })}
      </div>
      <details className="mt-3 text-xs font-bold text-[#6B6258]">
        <summary className="cursor-pointer underline decoration-dashed underline-offset-4">Dữ liệu biểu đồ</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {data.map((item) => (
            <li key={item.date}>
              {item.label}: {item.count}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}

function HorizontalBars({
  title,
  items,
  emptyLabel,
  color = "#0D9488",
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  emptyLabel: string;
  color?: string;
}) {
  const maximum = Math.max(...items.map((item) => item.count), 0);
  const hasData = maximum > 0;

  return (
    <section className="wn-insight-panel p-4 sm:p-5" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="text-base font-black text-[#221C16]">
        {title}
      </h2>
      {hasData ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs font-bold text-[#6B6258]">
              <span className="truncate">{item.label}</span>
              <span className="h-3 overflow-hidden rounded-sm bg-[#F3EBDD]" aria-hidden="true">
                <span className="block h-full rounded-sm" style={{ width: percentage(item.count, maximum), backgroundColor: color }} />
              </span>
              <span className="font-black text-[#221C16]">{item.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#6B6258]">{emptyLabel}</p>
      )}
    </section>
  );
}

function PracticePanel({ analytics }: { analytics: ProgressAnalytics }) {
  const performanceItems = analytics.practice.byType.map((item) => ({
    label: item.label,
    count: item.total,
  }));

  return (
    <section className="wn-insight-panel p-4 sm:p-5" aria-labelledby="practice-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="practice-heading" className="text-base font-black text-[#221C16]">
            Luyện tập
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Kết quả ở lần trả lời đầu tiên</p>
        </div>
        <GraduationCap className="h-5 w-5 text-[#0284C7]" aria-hidden="true" />
      </div>

      {analytics.practice.firstPass.total > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl bg-[#E8F2FF] p-3">
            <p className="text-xs font-bold text-[#4A617C]">Lần đầu</p>
            <p className="mt-1 text-xl font-black text-[#164E8C]">{accuracy(analytics.practice.firstPass)}</p>
          </div>
          <div className="rounded-xl bg-[#F3EBDD] p-3">
            <p className="text-xs font-bold text-[#6B6258]">Luyện lại</p>
            <p className="mt-1 text-xl font-black text-[#221C16]">{accuracy(analytics.practice.retry)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#6B6258]">Chưa có dữ liệu luyện tập.</p>
      )}

      {performanceItems.length > 0 ? (
        <div className="mt-5 border-t border-dashed border-[#C9BFB1] pt-4">
          <p className="text-xs font-black text-[#6B6258]">Dạng câu hỏi</p>
          <ul className="mt-3 space-y-2">
            {analytics.practice.byType.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 text-xs font-bold">
                <span className="text-[#6B6258]">{item.label}</span>
                <span className="text-[#221C16]">{accuracy(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ScopeBackLink({ analytics }: { analytics: ProgressAnalytics }) {
  if (analytics.scope.kind === "global") return null;
  return (
    <Link href="/progress" className="wn-button wn-button-quiet w-fit px-1 text-xs font-black">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Tiến độ
    </Link>
  );
}

export function ProgressDashboard({ analytics }: ProgressDashboardProps) {
  const isGlobal = analytics.scope.kind === "global";
  const hasDue = analytics.today.due > 0;
  const rated = analytics.reviewRatings.filter((rating) => rating.count > 0);

  return (
    <div className="wn-stack">
      <ScopeBackLink analytics={analytics} />

      <section className="wn-paper-surface grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6" aria-labelledby="progress-title">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#6B6258]">
            <Sparkles className="h-4 w-4 text-[#E06B43]" aria-hidden="true" />
            Tiến độ
          </div>
          <h1 id="progress-title" className="mt-2 break-words text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl">
            {isGlobal ? "Tiến độ học" : analytics.scope.name}
          </h1>
          {analytics.scope.parentName ? <p className="mt-1 text-sm font-bold text-[#6B6258]">{analytics.scope.parentName}</p> : null}
        </div>
        <div className="flex items-end gap-3">
          <div className="rounded-2xl bg-[#FEF3C7] p-3 text-right">
            <p className="text-xs font-bold text-[#6B6258]">Tổng thẻ</p>
            <p className="text-2xl font-black text-[#221C16]">{analytics.today.totalCards}</p>
          </div>
        </div>
      </section>

      <section className="wn-primary-surface grid overflow-hidden bg-[#FFFDF9] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" aria-label="Hôm nay">
        <div className="bg-[#E06B43] p-5 text-[#FFFDF9] sm:p-6">
          <div className="flex items-center gap-2 text-sm font-black">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
            Hôm nay
          </div>
          <p className="mt-5 text-5xl font-black leading-none">{analytics.today.due}</p>
          <p className="mt-1 text-sm font-bold">thẻ cần ôn</p>
          {hasDue ? (
            <Link
              href={analytics.scope.kind === "deck" ? `/decks/${analytics.scope.id}/study` : "/"}
              className="mt-5 inline-flex min-h-11 items-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-4 text-sm font-black text-[#221C16] shadow-[2px_2px_0px_#221C16]"
            >
              {analytics.scope.kind === "deck" ? "Ôn tập" : "Xem bộ từ"}
            </Link>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#6B6258]">Đã ôn</p>
            <p className="mt-2 text-3xl font-black text-[#15803D]">{analytics.today.reviewed}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#6B6258]">Cần luyện thêm</p>
            <p className="mt-2 text-3xl font-black text-[#B45309]">{analytics.today.weakCards}</p>
          </div>
          {analytics.today.overdue > 0 ? (
            <p className="col-span-2 text-xs font-bold text-[#B91C1C]">{analytics.today.overdue} thẻ đã quá hạn</p>
          ) : null}
        </div>
        <div className="hidden items-end justify-end p-4 sm:flex" aria-hidden="true">
          <CalendarCheck className="h-16 w-16 text-[#DDF5F1]" strokeWidth={1.5} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <BarChart title="Hoạt động ôn tập" data={analytics.activity} emptyLabel="Chưa có lượt ôn trong 14 ngày qua." />
        <HorizontalBars
          title="Trạng thái thẻ"
          items={analytics.states.map((state: ProgressStateCount) => ({ label: state.label, count: state.count }))}
          emptyLabel="Chưa có thẻ."
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Lịch ôn 7 ngày" data={analytics.upcomingDue} color="#0D9488" emptyLabel="Chưa có lịch ôn sắp tới." />
        <PracticePanel analytics={analytics} />
      </section>

      {rated.length > 0 ? (
        <HorizontalBars
          title="Đánh giá khi ôn"
          items={rated.map((item: ProgressRatingCount) => ({ label: item.label, count: item.count }))}
          emptyLabel="Chưa có lượt ôn."
          color="#D97706"
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="wn-paper-surface p-4 sm:p-5" aria-labelledby="weak-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="weak-heading" className="text-lg font-black text-[#221C16]">Cần luyện thêm</h2>
              <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Dựa trên kết quả luyện gần đây</p>
            </div>
            <Target className="h-5 w-5 text-[#B45309]" aria-hidden="true" />
          </div>
          {analytics.weakCards.length > 0 ? (
            <ul className="mt-4 divide-y divide-dashed divide-[#DCD3C5]">
              {analytics.weakCards.map((card) => (
                <li key={card.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/decks/${card.deckId}`} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
                    <div className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words font-black text-[#221C16]">{card.term}</span>
                      <span title={card.deckName} className="max-w-[52%] shrink truncate text-xs font-bold text-[#6B6258]">{card.deckName}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold text-[#6B6258]">{card.meaningVi}</p>
                    <p className="mt-1 text-xs font-bold text-[#B45309]">{card.reason}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-bold text-[#6B6258]">Chưa có dữ liệu cần luyện thêm.</p>
          )}
        </section>

        <section className="wn-paper-surface p-4 sm:p-5" aria-labelledby="deck-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="deck-heading" className="text-lg font-black text-[#221C16]">Bộ từ</h2>
              <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Cần chú ý trước</p>
            </div>
            <BookOpen className="h-5 w-5 text-[#0284C7]" aria-hidden="true" />
          </div>
          {analytics.decks.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {analytics.decks.slice(0, 6).map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/progress/decks/${deck.id}`}
                    className="group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[#FAF6EE] p-3 transition-colors hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#221C16]">{deck.name}</p>
                      <p className="mt-0.5 text-xs font-bold text-[#6B6258]">
                        {deck.dueToday > 0 ? `${deck.dueToday} cần ôn` : `${deck.totalCards} thẻ`}
                        {deck.weakCards > 0 ? ` · ${deck.weakCards} cần luyện` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[#6B6258] group-hover:text-[#E06B43]" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-bold text-[#6B6258]">Chưa có bộ từ.</p>
          )}
        </section>
      </section>

      {isGlobal && analytics.folders.length > 0 ? (
        <section className="wn-paper-surface p-4 sm:p-5" aria-labelledby="folder-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="folder-heading" className="text-lg font-black text-[#221C16]">Bộ sưu tập</h2>
            <Layers className="h-5 w-5 text-[#0D9488]" aria-hidden="true" />
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.folders.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/progress/folders/${folder.id}`}
                  className="block rounded-2xl border-2 border-[#221C16] bg-[#DDF5F1] p-4 shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                >
                  <p className="truncate text-lg font-black text-[#221C16]">{folder.name}</p>
                  <p className="mt-2 text-xs font-bold text-[#3F6B63]">{folder.deckCount} bộ từ · {folder.totalCards} thẻ</p>
                  <p className="mt-1 text-xs font-black text-[#221C16]">{folder.dueToday} cần ôn · {folder.weakCards} cần luyện</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
