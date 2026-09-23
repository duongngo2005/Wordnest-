import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  CircleDot,
  Layers,
  RotateCcw,
} from "lucide-react";
import type { FolderDeckSummary, FolderDetail } from "@/services/vocabulary/folder-service";
import { FolderIcon, getFolderColorClasses } from "./folder-presentation";

function LearningStatus({ deck }: { deck: FolderDeckSummary }) {
  if (deck.learningStatus === "COMPLETED") {
    return <span className="inline-flex items-center gap-1 text-[#15803D]"><CheckCircle2 className="w-4 h-4" /> Đã vào Review</span>;
  }
  if (deck.learningStatus === "IN_PROGRESS") {
    return <span className="inline-flex items-center gap-1 text-[#B45309]"><CircleDot className="w-4 h-4" /> Đang học · {deck.knownCount}/{deck.totalCards}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[#6B6258]"><Circle className="w-4 h-4" /> Chưa bắt đầu</span>;
}

export function FolderDetailView({ folder }: { folder: FolderDetail }) {
  const colors = getFolderColorClasses(folder.color);
  const nextDeck = folder.decks.find((deck) => deck.learningStatus !== "COMPLETED");
  const continueHref = nextDeck ? `/decks/${nextDeck.id}/study` : `/folders/${folder.id}/review`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <Link href="/" className="inline-flex items-center gap-1.5 rounded-md p-1 text-xs font-bold text-[#6B6258] hover:text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
        <ArrowLeft className="w-4 h-4" /> Về thư viện học
      </Link>

      <section className={`brick-card space-y-5 bg-[#FFFDF9] p-5 sm:p-7 ${colors.border}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] ${colors.badge}`}>
              <FolderIcon icon={folder.icon} className={`h-6 w-6 ${colors.icon}`} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#221C16] sm:text-3xl">{folder.name}</h1>
              {folder.description && <p className="mt-1 max-w-2xl text-sm font-medium text-[#6B6258]">{folder.description}</p>}
            </div>
          </div>
          <span className={`self-start rounded-lg border border-[#221C16] px-2.5 py-1 text-xs font-black ${colors.badge}`}>{folder.progress.masteryRate}% vào Review</span>
        </div>

        <div className="h-4 overflow-hidden rounded-full border-2 border-[#221C16] bg-[#FAF6EE] p-0.5 shadow-[2px_2px_0px_#221C16]">
          <div className="h-full rounded-full bg-[#E06B43] transition-[width]" style={{ width: `${folder.progress.masteryRate}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3"><p className="text-lg font-black text-[#221C16]">{folder.progress.knownCount}/{folder.progress.totalCards}</p><p className="text-[11px] font-bold text-[#6B6258]">Thẻ đang Review</p></div>
          <div className="rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3"><p className="text-lg font-black text-[#221C16]">{folder.progress.completedDecks}/{folder.progress.deckCount}</p><p className="text-[11px] font-bold text-[#6B6258]">Bộ đã vào Review</p></div>
          <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] p-3"><p className="text-lg font-black text-[#92400E]">{folder.progress.dueTodayCount}</p><p className="text-[11px] font-bold text-[#92400E]">Cần ôn hôm nay</p></div>
          <div className="rounded-xl border-2 border-[#0284C7] bg-[#E0F2FE] p-3"><p className="text-lg font-black text-[#0369A1]">{folder.progress.learningCount}</p><p className="text-[11px] font-bold text-[#0369A1]">Đang học</p></div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={continueHref} className="brick-button-primary flex-1 px-4 py-3 text-sm font-black gap-2"><BookOpen className="w-4 h-4" /> {nextDeck ? `Tiếp tục: ${nextDeck.name}` : "Ôn lại collection"}</Link>
          <Link href={`/folders/${folder.id}/review`} className="brick-button-secondary flex-1 px-4 py-3 text-sm font-black gap-2"><RotateCcw className="w-4 h-4 text-[#E06B43]" /> Ôn {folder.progress.dueTodayCount} thẻ đến hạn</Link>
        </div>
      </section>

      <section className="brick-card bg-[#FFFDF9] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black text-[#221C16]"><Layers className="w-5 h-5 text-[#E06B43]" /> Lộ trình học ({folder.progress.deckCount} bộ thẻ)</h2>
        <div className="mt-4 divide-y divide-[#221C16]/15">
          {folder.decks.length === 0 ? (
            <p className="py-5 text-sm font-bold text-[#6B6258]">Collection này chưa có bộ thẻ.</p>
          ) : folder.decks.map((deck) => (
            <Link key={deck.id} href={`/decks/${deck.id}`} className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-[#FAF6EE]">
              <span className="min-w-0"><span className="block truncate text-sm font-black text-[#221C16]">{deck.name}</span><span className="mt-1 block text-xs font-bold"><LearningStatus deck={deck} /></span></span>
              <span className="shrink-0 text-right text-xs font-bold text-[#6B6258]">{deck.dueTodayCount > 0 ? `${deck.dueTodayCount} cần ôn` : `${deck.masteryRate}%`}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
