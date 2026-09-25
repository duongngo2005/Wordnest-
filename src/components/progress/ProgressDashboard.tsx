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
  if (maximum <= 0 || value <= 0) return "0%";
  return `${Math.round((value / maximum) * 100)}%`;
}

function accuracy(performance: ProgressPerformance): string {
  return performance.accuracy === null
    ? "Chưa có dữ liệu"
    : `${performance.accuracy}% · ${performance.correct}/${performance.total}`;
}

const srsStateColors: Record<string, string> = {
  Mới: "#64748B",
  "Đang học": "#D97706",
  "Đang ôn": "#15803D",
  "Học lại": "#E06B43",
};

const ratingColors: Record<string, string> = {
  Lại: "#B91C1C",
  Khó: "#D97706",
  Tốt: "#15803D",
  Dễ: "#2563EB",
};

function ChartDataDetails({ data }: { data: ProgressDateCount[] }) {
  return (
    <details className="mt-3 text-xs font-bold text-[#6B6258]">
      <summary className="cursor-pointer underline decoration-dashed underline-offset-4 hover:text-[#221C16]">
        Dữ liệu biểu đồ
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[#DCD3C5] bg-[#FAF6EE] p-2.5">
        {data.map((item) => (
          <li key={item.date} className="flex justify-between border-b border-dashed border-[#DCD3C5]/60 py-0.5 last:border-b-0">
            <span>{item.label}:</span>
            <span className="font-mono font-black text-[#221C16]">{item.count}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function BarChart({
  title,
  subtitle,
  data,
  color = "#E06B43",
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  data: ProgressDateCount[];
  color?: string;
  emptyLabel: string;
}) {
  const maximum = Math.max(...data.map((item) => item.count), 0);
  const hasData = maximum > 0;
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const description = data.map((item) => `${item.label}: ${item.count}`).join(", ");

  return (
    <figure
      className="wn-insight-panel wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
      aria-labelledby={`${title}-title`}
    >
      <figcaption className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${title}-title`} className="text-base font-black text-[#221C16]">
            {title}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">
            {hasData ? `${total} thẻ · ${subtitle}` : subtitle}
          </p>
        </div>
        <BarChart3 className="h-5 w-5 shrink-0 text-[#E06B43]" aria-hidden="true" strokeWidth={2.5} />
      </figcaption>

      {hasData ? (
        <div
          role="img"
          aria-label={`${title}. ${description}`}
          className="mt-5 flex h-36 items-end gap-1.5 border-b-2 border-[#221C16] px-1 pb-1"
        >
          {data.map((item, index) => {
            const showLabel =
              data.length <= 7 || index === 0 || index === data.length - 1 || index % 3 === 0;
            const compactLabel =
              data.length > 7 ? item.date.slice(-2) : item.date.slice(5).replace("-", "/");
            const isZero = item.count === 0;
            return (
              <div
                key={item.date}
                className="flex min-w-0 flex-1 flex-col justify-end gap-1 text-center transition-colors hover:bg-[#FAF6EE] rounded-t-sm"
              >
                {item.count > 0 ? (
                  <span className="font-mono text-[10px] font-black text-[#221C16]">{item.count}</span>
                ) : null}
                <div
                  className={`wn-chart-bar mx-auto w-full max-w-5 ${
                    isZero ? "" : "rounded-t-sm border-t-2 border-x-2 border-[#221C16] shadow-[1px_0px_0px_#221C16]"
                  }`}
                  data-count={item.count}
                  style={{
                    height: isZero ? "0" : percentage(item.count, maximum),
                    minHeight: isZero ? 0 : undefined,
                    backgroundColor: color,
                  }}
                />
                <span className="h-3 text-[9px] font-bold text-[#6B6258] font-mono">
                  {showLabel ? compactLabel : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#6B6258]">{emptyLabel}</p>
      )}

      <ChartDataDetails data={data} />
    </figure>
  );
}

function HorizontalBars({
  title,
  subtitle,
  items,
  emptyLabel,
  color = "#0D9488",
  getItemColor,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; count: number }>;
  emptyLabel: string;
  color?: string;
  getItemColor?: (label: string) => string;
}) {
  const maximum = Math.max(...items.map((item) => item.count), 0);
  const hasData = maximum > 0;
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section
      className="wn-insight-panel wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
      aria-labelledby={`${title}-heading`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${title}-heading`} className="text-base font-black text-[#221C16]">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">{subtitle}</p> : null}
        </div>
        {total > 0 && (
          <span className="rounded-md border border-[#DCD3C5] bg-[#FAF6EE] px-2 py-0.5 text-[11px] font-mono font-bold text-[#6B6258]">
            {total} tổng
          </span>
        )}
      </div>

      {hasData ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const barColor = getItemColor ? getItemColor(item.label) : color;
            const pct = percentage(item.count, maximum);
            const ratio = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <li
                key={item.label}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2.5 text-xs font-bold text-[#6B6258]"
              >
                <span className="truncate font-extrabold text-[#221C16]">{item.label}</span>
                <span
                  className="h-3.5 overflow-hidden rounded-md border border-[#221C16]/20 bg-[#FAF6EE] p-0.5 shadow-inner"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-sm transition-all duration-300"
                    style={{ width: pct, backgroundColor: barColor }}
                  />
                </span>
                <span className="flex items-center gap-1 font-mono font-black text-[#221C16]">
                  <span>{item.count}</span>
                  {total > 0 && <span className="text-[10px] font-semibold text-[#8C8275]">({ratio}%)</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#6B6258]">{emptyLabel}</p>
      )}
    </section>
  );
}

function PracticePanel({
  analytics,
  practiceHref,
}: {
  analytics: ProgressAnalytics;
  practiceHref: string | null;
}) {
  const hasPracticeResults = analytics.practice.firstPass.total > 0;
  const hasRetries = analytics.practice.retry.total > 0;

  return (
    <section
      className="wn-insight-panel wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
      aria-labelledby="practice-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="practice-heading" className="text-base font-black text-[#221C16]">
            Kết quả luyện tập
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">
            Chỉ tính câu trả lời đầu tiên; luyện lại là củng cố sau phản hồi.
          </p>
        </div>
        <GraduationCap className="h-5 w-5 shrink-0 text-[#0284C7]" aria-hidden="true" strokeWidth={2.5} />
      </div>

      {hasPracticeResults ? (
        <>
          <div className={`mt-4 grid gap-4 ${hasRetries ? "sm:grid-cols-2" : "max-w-sm"}`}>
            <div className="rounded-xl border-2 border-[#164E8C] bg-[#E8F2FF] p-3 shadow-[2px_2px_0px_#164E8C]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#4A617C]">
                Lần đầu (Đánh giá thật)
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-[#164E8C]">
                {accuracy(analytics.practice.firstPass)}
              </p>
            </div>
            {hasRetries ? (
              <div className="rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3 shadow-[2px_2px_0px_#221C16]">
                <p className="text-xs font-bold uppercase tracking-wider text-[#6B6258]">
                  Luyện lại (Củng cố)
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-[#221C16]">
                  {accuracy(analytics.practice.retry)}
                </p>
              </div>
            ) : null}
          </div>
          {analytics.practice.byType.length > 0 ? (
            <div className="mt-5 border-t border-dashed border-[#C9BFB1] pt-4">
              <p className="text-xs font-black uppercase tracking-wider text-[#6B6258]">Dạng câu hỏi</p>
              <ul className="mt-3 space-y-2.5">
                {analytics.practice.byType.map((item) => (
                  <li
                    key={item.label}
                    className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2.5 text-xs font-bold"
                  >
                    <span className="font-extrabold text-[#221C16]">{item.label}</span>
                    <span
                      className="h-3 overflow-hidden rounded-md border border-[#221C16]/20 bg-[#FAF6EE] p-0.5 shadow-inner"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-sm bg-[#0284C7]"
                        style={{ width: item.accuracy !== null ? `${item.accuracy}%` : "0%" }}
                      />
                    </span>
                    <span className="font-mono font-black text-[#221C16]">{accuracy(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#6B6258]">Chưa có dữ liệu luyện tập.</p>
          {practiceHref ? (
            <Link href={practiceHref} className="brick-button-secondary text-xs font-black">
              Làm bài Quiz
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AttentionPanel({
  analytics,
  practiceHref,
}: {
  analytics: ProgressAnalytics;
  practiceHref: string | null;
}) {
  const hasEvidence = analytics.practice.hasSufficientEvidence;
  const focusedPracticeHref = analytics.weakCards[0]
    ? `/decks/${analytics.weakCards[0].deckId}/quiz?mode=focused_practice`
    : null;

  return (
    <section
      className="wn-paper-surface min-w-0 overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
      aria-labelledby="weak-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="weak-heading" className="text-lg font-black text-[#221C16]">
              Cần chú ý
            </h2>
            {analytics.weakCards.length > 0 ? (
              <span className="wn-marker-amber text-xs font-black text-[#9A3412]">
                {analytics.weakCards.length} từ
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">
            {hasEvidence
              ? "Dựa trên kết quả trả lời đầu tiên gần đây"
              : "Cần ít nhất 2 lượt trả lời đầu tiên trên một từ để đánh giá"}
          </p>
        </div>
        <Target className="h-5 w-5 shrink-0 text-[#B45309]" aria-hidden="true" strokeWidth={2.5} />
      </div>

      {!hasEvidence ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#6B6258]">Chưa đủ dữ liệu để xác định từ cần luyện.</p>
          {practiceHref ? (
            <Link href={practiceHref} className="brick-button-primary text-xs font-black">
              Làm bài Quiz
            </Link>
          ) : null}
        </div>
      ) : analytics.weakCards.length > 0 ? (
        <>
          {focusedPracticeHref ? (
            <Link
              href={focusedPracticeHref}
              className="brick-button-primary mt-4 inline-flex items-center text-xs font-black"
            >
              Luyện tập trung
            </Link>
          ) : null}
          <ul className="mt-4 divide-y divide-dashed divide-[#DCD3C5]">
            {analytics.weakCards.map((card) => (
              <li key={card.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/decks/${card.deckId}/quiz?mode=focused_practice`}
                  className="block min-w-0 overflow-hidden rounded-lg p-1.5 transition-colors hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                  aria-label={`Luyện tập trung ${card.term} trong ${card.deckName}`}
                >
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words text-base font-black text-[#221C16]">
                      {card.term}
                    </span>
                    <span
                      title={card.deckName}
                      className="min-w-0 max-w-[50%] shrink truncate rounded-md border border-[#DCD3C5] bg-[#FAF6EE] px-2 py-0.5 text-xs font-bold text-[#6B6258]"
                    >
                      {card.deckName}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold text-[#6B6258]">
                    {card.meaningVi}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#B45309]">{card.reason}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm font-bold text-[#6B6258]">Chưa có từ cần ưu tiên luyện thêm.</p>
      )}
    </section>
  );
}

function ScopeBackLink({ analytics }: { analytics: ProgressAnalytics }) {
  if (analytics.scope.kind === "global") return null;
  return (
    <Link href="/progress" className="brick-button-secondary w-fit px-3 py-1.5 text-xs font-black">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
      <span>Tiến độ</span>
    </Link>
  );
}

function reviewHref(analytics: ProgressAnalytics): string | null {
  if (analytics.today.due === 0) return null;
  if (analytics.scope.kind === "deck" && analytics.scope.id) return `/decks/${analytics.scope.id}/study`;
  if (analytics.scope.kind === "folder" && analytics.scope.id) return `/folders/${analytics.scope.id}/review`;
  return "/review";
}

function practiceHref(analytics: ProgressAnalytics): string | null {
  const deckId =
    analytics.scope.kind === "deck"
      ? analytics.scope.id
      : analytics.decks.find((deck) => deck.totalCards > 0)?.id;
  return deckId ? `/decks/${deckId}/quiz` : null;
}

export function ProgressDashboard({ analytics }: ProgressDashboardProps) {
  const isGlobal = analytics.scope.kind === "global";
  const reviewQueueHref = reviewHref(analytics);
  const quizHref = practiceHref(analytics);
  const rated = analytics.reviewRatings.filter((rating) => rating.count > 0);
  const hasPracticeEvidence = analytics.practice.hasSufficientEvidence;

  return (
    <div className="wn-stack">
      <ScopeBackLink analytics={analytics} />

      {/* Study Report Header */}
      <section
        className="wn-paper-surface grid gap-4 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6 shadow-[4px_4px_0px_#221C16]"
        aria-labelledby="progress-title"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#6B6258]">
            <Sparkles className="h-4 w-4 text-[#E06B43]" aria-hidden="true" strokeWidth={2.5} />
            <span>Tiến độ học</span>
            <span className="wn-stamp text-[#8C7355]">BÁO CÁO HỌC TẬP</span>
          </div>
          <h1
            id="progress-title"
            className="mt-2 break-words text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl"
          >
            {isGlobal ? "Tiến độ học" : analytics.scope.name}
          </h1>
          {analytics.scope.parentName ? (
            <p className="mt-1 text-sm font-bold text-[#6B6258]">{analytics.scope.parentName}</p>
          ) : null}
        </div>
        <div className="flex items-end gap-3">
          <div className="rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3 text-right shadow-[2px_2px_0px_#221C16]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6258]">Tổng thẻ</p>
            <p className="font-mono text-2xl font-black text-[#221C16]">{analytics.today.totalCards}</p>
          </div>
        </div>
      </section>

      {/* Today Learning Ticket */}
      <section
        className="grid overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[4px_4px_0px_#221C16] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto]"
        aria-label="Hôm nay"
      >
        <div className="flex flex-col justify-between bg-[#E06B43] p-5 text-[#FFFDF9] sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
              <Clock3 className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
              <span>Hôm nay</span>
            </div>
            <p className="mt-4 font-mono text-5xl font-black leading-none">{analytics.today.due}</p>
            <p className="mt-1.5 text-sm font-extrabold text-[#FFFDF9]/90">thẻ cần ôn</p>
          </div>
          {reviewQueueHref ? (
            <Link
              href={reviewQueueHref}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-5 text-sm font-black text-[#221C16] shadow-[2.5px_2.5px_0px_#221C16] transition-transform active:translate-y-0.5 active:shadow-none hover:bg-[#FAF6EE]"
            >
              Ôn {analytics.today.due} thẻ
            </Link>
          ) : (
            <p className="mt-5 text-sm font-bold text-[#FFFDF9]/90">Không có thẻ đến hạn.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 bg-[#FFFDF9] p-5 sm:border-l-2 sm:border-dashed sm:border-[#221C16]/20 sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#6B6258]">Đã ôn</p>
            <p className="mt-2 font-mono text-3xl font-black text-[#15803D]">
              {analytics.today.reviewedCards}
            </p>
            <p className="mt-1 text-xs font-bold text-[#6B6258]">thẻ hôm nay</p>
            <p className="mt-1 text-xs font-semibold text-[#8C8275]">
              {analytics.today.reviewEvents} lượt FSRS
            </p>
          </div>

          <div data-testid="today-needs-practice">
            <p className="text-xs font-black uppercase tracking-wide text-[#6B6258]">Cần luyện thêm</p>
            {hasPracticeEvidence ? (
              <>
                <p className="mt-2 font-mono text-3xl font-black text-[#B45309]">
                  {analytics.today.weakCards}
                </p>
                <p className="mt-1 text-xs font-bold text-[#6B6258]">thẻ cần chú ý</p>
              </>
            ) : (
              <p className="mt-2 text-base font-black leading-5 text-[#B45309]">Chưa đủ dữ liệu</p>
            )}
          </div>

          {analytics.today.overdue > 0 ? (
            <p className="col-span-2 w-fit rounded-md border border-[#B91C1C]/30 bg-[#FEE2E2] px-2.5 py-1 text-xs font-bold text-[#B91C1C]">
              {analytics.today.overdue} thẻ đã quá hạn
            </p>
          ) : null}
        </div>

        <div
          className="hidden items-center justify-center border-l-2 border-dashed border-[#221C16]/20 bg-[#FAF6EE] p-6 sm:flex"
          aria-hidden="true"
        >
          <CalendarCheck className="h-16 w-16 text-[#0D9488]/40" strokeWidth={1.5} />
        </div>
      </section>

      {/* Attention & Upcoming Due */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AttentionPanel analytics={analytics} practiceHref={quizHref} />
        <BarChart
          title="7 ngày tới"
          subtitle="Thẻ đến hạn từ bây giờ"
          data={analytics.upcomingDue}
          color="#0D9488"
          emptyLabel="Không có thẻ sắp đến hạn trong 7 ngày tới."
        />
      </section>

      {/* Practice Results */}
      <PracticePanel analytics={analytics} practiceHref={quizHref} />

      {/* Activity & Card States */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <BarChart
          title="Hoạt động ôn theo lịch"
          subtitle="Lượt đánh giá FSRS trong 14 ngày"
          data={analytics.activity}
          emptyLabel="Chưa có lượt ôn theo lịch trong 14 ngày qua."
        />
        <HorizontalBars
          title="Vòng đời SRS"
          subtitle="Trạng thái hiện tại của thẻ"
          items={analytics.states.map((state: ProgressStateCount) => ({
            label: state.label,
            count: state.count,
          }))}
          emptyLabel="Chưa có thẻ."
          getItemColor={(label) => srsStateColors[label] || "#0D9488"}
        />
      </section>

      {/* Rating Breakdown if available */}
      {rated.length > 0 ? (
        <HorizontalBars
          title="Đánh giá khi ôn"
          subtitle="Tất cả lượt đánh giá FSRS đã ghi nhận"
          items={rated.map((item: ProgressRatingCount) => ({
            label: item.label,
            count: item.count,
          }))}
          emptyLabel="Chưa có lượt ôn."
          getItemColor={(label) => ratingColors[label] || "#D97706"}
        />
      ) : null}

      {/* Scope Navigation & Drilldown */}
      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          className="wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
          aria-labelledby="deck-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="deck-heading" className="text-lg font-black text-[#221C16]">
                Bộ từ
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Mở phần cần học trước</p>
            </div>
            <BookOpen className="h-5 w-5 shrink-0 text-[#0284C7]" aria-hidden="true" strokeWidth={2.5} />
          </div>

          {analytics.decks.length > 0 ? (
            <ul className="mt-4 grid min-w-0 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
              {analytics.decks.slice(0, 6).map((deck) => {
                const href =
                  deck.dueToday > 0 ? `/decks/${deck.id}/study` : `/progress/decks/${deck.id}`;
                const label =
                  deck.dueToday > 0
                    ? `Ôn ${deck.dueToday} thẻ trong ${deck.name}`
                    : `Xem tiến độ ${deck.name}`;
                return (
                  <li key={deck.id} className="min-w-0">
                    <Link
                      href={href}
                      aria-label={label}
                      className="group grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3 shadow-[1.5px_1.5px_0px_#221C16] transition-all hover:-translate-y-0.5 hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-[#221C16] group-hover:text-[#E06B43]">
                          {deck.name}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-[#6B6258]">
                          {deck.dueToday > 0 ? (
                            <span className="font-black text-[#C85630]">
                              {deck.dueToday} cần ôn
                            </span>
                          ) : (
                            `${deck.totalCards} thẻ`
                          )}
                          {deck.weakCards > 0 ? ` · ${deck.weakCards} cần luyện` : ""}
                        </p>
                      </div>
                      <ChevronRight
                        className="h-5 w-5 text-[#6B6258] transition-transform group-hover:translate-x-0.5 group-hover:text-[#E06B43]"
                        aria-hidden="true"
                        strokeWidth={2.5}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-bold text-[#6B6258]">Chưa có bộ từ.</p>
          )}
        </section>

        {isGlobal && analytics.folders.length > 0 ? (
          <section
            className="wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
            aria-labelledby="folder-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="folder-heading" className="min-w-0 text-lg font-black text-[#221C16]">
                Bộ sưu tập
              </h2>
              <Layers className="h-5 w-5 shrink-0 text-[#0D9488]" aria-hidden="true" strokeWidth={2.5} />
            </div>

            <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
              {analytics.folders.map((folder) => {
                const href =
                  folder.dueToday > 0
                    ? `/folders/${folder.id}/review`
                    : `/progress/folders/${folder.id}`;
                const label =
                  folder.dueToday > 0
                    ? `Ôn ${folder.dueToday} thẻ trong ${folder.name}`
                    : `Xem tiến độ ${folder.name}`;
                return (
                  <li key={folder.id} className="min-w-0">
                    <Link
                      href={href}
                      aria-label={label}
                      className="block min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#DDF5F1] p-4 shadow-[2.5px_2.5px_0px_#221C16] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                    >
                      <p className="truncate text-lg font-black text-[#221C16]">{folder.name}</p>
                      <p className="mt-2 text-xs font-bold text-[#3F6B63]">
                        {folder.deckCount} bộ từ · {folder.totalCards} thẻ
                      </p>
                      <p className="mt-1 text-xs font-black text-[#221C16]">
                        {folder.dueToday > 0 ? (
                          <span className="text-[#C85630]">{folder.dueToday} cần ôn</span>
                        ) : (
                          <span className="text-[#15803D]">Đã ôn xong</span>
                        )}
                        {folder.weakCards > 0 ? ` · ${folder.weakCards} cần luyện` : ""}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section
            className="wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-5 shadow-[3px_3px_0px_#221C16]"
            aria-labelledby="scope-summary-heading"
          >
            <h2 id="scope-summary-heading" className="text-lg font-black text-[#221C16]">
              Phạm vi hiện tại
            </h2>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[#6B6258]">
              Xem các tín hiệu học ở cấp bộ từ để quyết định lượt ôn tiếp theo. Chỉ dữ liệu thực từ FSRS và
              bài kiểm tra mới được tổng hợp.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}
