"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Download,
  GraduationCap,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { AddCardsToDeckForm } from "./AddCardsToDeckForm";
import { FlashcardItem, FlashcardData } from "./FlashcardItem";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { SerializedPracticeEvidenceSummary } from "@/services/vocabulary";
import { useToast } from "@/components/ui/ToastProvider";

interface DeckViewProps {
  initialDeck: {
    id: string;
    name: string;
    description: string | null;
    folder: { name: string } | null;
    cards: FlashcardData[];
    stats: { totalCards: number; newCount: number; learningCount: number; knownCount: number };
  };
  evidenceMap?: Record<string, SerializedPracticeEvidenceSummary>;
  needPracticeCardIds?: string[];
}

const pageSize = 20;

export function DeckView({ initialDeck, evidenceMap, needPracticeCardIds = [] }: DeckViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [deck, setDeck] = useState(initialDeck);
  const [isAddingCards, setIsAddingCards] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const needPracticeCards = useMemo(() => {
    const byId = new Map(deck.cards.map((card) => [card.id, card]));
    return needPracticeCardIds.flatMap((id) => {
      const card = byId.get(id);
      const summary = evidenceMap?.[id];
      return card && summary ? [{ card, summary }] : [];
    });
  }, [deck.cards, evidenceMap, needPracticeCardIds]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const base = status === "NEED_PRACTICE" ? needPracticeCards.map(({ card }) => card) : deck.cards;
    return base.filter((card) => {
      if (status !== "ALL" && status !== "NEED_PRACTICE" && card.status !== status) return false;
      return (
        !query ||
        card.term.toLocaleLowerCase().includes(query) ||
        card.meaningVi.toLocaleLowerCase().includes(query)
      );
    });
  }, [deck.cards, needPracticeCards, search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const cards = filteredCards.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateCard = async (cardId: string, updated: Partial<FlashcardData>) => {
    const previous = deck.cards;
    setDeck((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === cardId ? { ...card, ...updated } : card)),
    }));
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Không thể lưu thẻ."
        );
      if (typeof data === "object" && data !== null && "card" in data && data.card) {
        setDeck((current) => ({
          ...current,
          cards: current.cards.map((card) =>
            card.id === cardId ? { ...card, ...(data.card as Partial<FlashcardData>) } : card
          ),
        }));
      }
    } catch (error) {
      setDeck((current) => ({ ...current, cards: previous }));
      throw error;
    }
  };

  const deleteCard = async (cardId: string) => {
    const previous = deck.cards;
    setDeck((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
    }));
    try {
      const response = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Không thể xóa thẻ.");
      toast.success("Đã xóa thẻ");
    } catch (error) {
      setDeck((current) => ({ ...current, cards: previous }));
      throw error;
    }
  };

  const deleteDeck = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      router.push("/");
    } catch {
      setIsDeleting(false);
      toast.error("Không thể xóa bộ từ", { description: "Thử lại." });
    }
  };

  return (
    <div className="wn-stack">
      {/* Top back navigation */}
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        <span>Thư viện</span>
      </Link>

      {/* Deck Header Card */}
      <section className="wn-primary-surface overflow-hidden bg-[#FFFDF9]" aria-labelledby="deck-name">
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#C9BFB1] bg-[#F4EFE6] px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
              <Layers className="h-4 w-4 text-[#D97706]" strokeWidth={2.5} />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-[#6B6258]">
              {deck.folder ? deck.folder.name : "Bộ từ vựng"}
            </span>
          </div>

          <details className="relative">
            <summary
              aria-label="Thêm tùy chọn"
              className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
            >
              <MoreHorizontal className="h-4 w-4 text-[#6B6258]" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 grid w-52 gap-1 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
              <a
                href={`/api/decks/${deck.id}/export`}
                download
                className="wn-button wn-button-quiet justify-start text-xs font-bold"
              >
                <Download className="h-4 w-4" />
                <span>Xuất dữ liệu</span>
              </a>
              <Link
                href={`/decks/${deck.id}/story`}
                className="wn-button wn-button-quiet justify-start text-xs font-bold"
              >
                <BookOpen className="h-4 w-4" />
                <span>Story</span>
              </Link>
              <Link
                href={`/decks/${deck.id}/practice`}
                className="wn-button wn-button-quiet justify-start text-xs font-bold"
              >
                <GraduationCap className="h-4 w-4" />
                <span>Luyện tự do</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="wn-button wn-button-quiet wn-button-danger justify-start text-xs font-bold"
              >
                <Trash2 className="h-4 w-4" />
                <span>Xóa bộ từ</span>
              </button>
            </div>
          </details>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div>
            <h1
              id="deck-name"
              className="break-words text-2xl sm:text-3xl font-black tracking-tight text-[#221C16]"
            >
              {deck.name}
            </h1>
            <Link
              href={`/progress/decks/${deck.id}`}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-black text-[#6B6258] underline decoration-dashed underline-offset-4 hover:text-[#E06B43] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Tiến độ
            </Link>
            {deck.description ? (
              <p className="mt-1 text-xs sm:text-sm font-semibold text-[#6B6258]">
                {deck.description}
              </p>
            ) : null}
          </div>

          {/* Core Action Trio: Visible, tactile, hierarchically distinct */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3">
            <Link
              href={`/decks/${deck.id}/study`}
              prefetch
              className="brick-button-primary col-span-2 px-4 py-3 text-sm font-black sm:col-span-1"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.5} />
              <span>Ôn tập</span>
            </Link>

            <Link
              href={`/decks/${deck.id}/quiz`}
              prefetch
              className="brick-button-secondary px-4 py-2.5 text-sm font-black border-[#221C16]"
            >
              <GraduationCap className="h-4 w-4 text-[#0284C7]" strokeWidth={2.5} />
              <span>Luyện tập</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsAddingCards((current) => !current)}
              aria-expanded={isAddingCards}
              className="brick-button-secondary px-4 py-2.5 text-sm font-black border-[#221C16]"
            >
              <Plus className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
              <span>Thêm thẻ</span>
            </button>
          </div>
        </div>
      </section>

      {/* Add Cards Surface */}
      {isAddingCards ? (
        <AddCardsToDeckForm
          deckId={deck.id}
          deckName={deck.name}
          collectionName={deck.folder?.name}
          onClose={() => setIsAddingCards(false)}
          onCardsCreated={() => {
            setIsAddingCards(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* Contextual Weak Evidence Section: Cần luyện thêm */}
      {needPracticeCards.length > 0 ? (
        <section
          data-testid="need-practice-section"
          className="brick-card overflow-hidden bg-[#FEF3C7] p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1px_1px_0px_#221C16]">
                  <Target className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={2.5} />
                </span>
                <h2 className="text-base font-black text-[#221C16]">Cần luyện thêm</h2>
              </div>
              <p className="mt-1 text-xs font-bold text-[#6B6258]">
                {needPracticeCards[0].summary.explanationVi}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="filter-need-practice"
                type="button"
                onClick={() => {
                  setStatus("NEED_PRACTICE");
                  setPage(1);
                }}
                className="brick-button-secondary px-3 py-1.5 text-xs font-black"
              >
                Xem thẻ
              </button>
              <Link
                data-testid="btn-start-focused-practice"
                href={`/decks/${deck.id}/quiz?mode=focused_practice`}
                className="brick-button-primary px-3.5 py-1.5 text-xs font-black"
              >
                <Target className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span>Luyện tập trung ({needPracticeCards.length} từ)</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Cards List Section */}
      <section className="wn-section" aria-labelledby="cards-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-full bg-[#E06B43]" />
            <h2 id="cards-heading" className="text-lg font-black text-[#221C16]">
              Thẻ từ vựng
            </h2>
          </div>
          <span className="rounded-full border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-0.5 text-xs font-black text-[#6B6258] shadow-[1.5px_1.5px_0px_#221C16]">
            {deck.cards.length} thẻ
          </span>
        </div>

        {/* Filter & Search Bar */}
        {deck.cards.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6258]" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm từ vựng hoặc nghĩa..."
                className="wn-field pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="wn-field sm:w-48"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value={FlashcardStatus.NEW}>Mới</option>
              <option value={FlashcardStatus.LEARNING}>Đang học</option>
              <option value={FlashcardStatus.KNOWN}>Đã nhớ</option>
              {needPracticeCards.length ? (
                <option value="NEED_PRACTICE">Cần luyện thêm ({needPracticeCards.length})</option>
              ) : null}
            </select>
          </div>
        ) : null}

        {/* Empty Deck State */}
        {deck.cards.length === 0 ? (
          <div className="wn-paper-surface p-6 text-center sm:p-8">
            <h3 className="text-lg font-black text-[#221C16]">Chưa có thẻ</h3>
          </div>
        ) : null}

        {/* Filter no results */}
        {deck.cards.length > 0 && cards.length === 0 ? (
          <div className="brick-card p-6 text-center bg-[#FFFDF9] space-y-3">
            <p className="text-sm font-bold text-[#6B6258]">Không tìm thấy thẻ phù hợp</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
              }}
              className="brick-button-secondary px-3 py-1.5 text-xs font-black"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : null}

        {/* Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <FlashcardItem
              key={card.id}
              card={card}
              evidence={evidenceMap?.[card.id]}
              onDelete={deleteCard}
              onUpdate={updateCard}
            />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <nav
            aria-label="Trang thẻ"
            className="flex items-center justify-between border-t-2 border-dashed border-[#DCD3C5] pt-4"
          >
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="brick-button-secondary px-3.5 py-1.5 text-xs font-black"
            >
              Trước
            </button>
            <span className="rounded-full border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1 text-xs font-black text-[#221C16] shadow-[1px_1px_0px_#221C16]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="brick-button-secondary px-3.5 py-1.5 text-xs font-black"
            >
              Sau
            </button>
          </nav>
        ) : null}
      </section>

      {/* Delete Confirmation Alert Dialog */}
      {isConfirmingDelete ? (
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-deck-title"
          className="brick-card wn-form-group bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#B91C1C] border-[#B91C1C]"
        >
          <h2 id="delete-deck-title" className="text-lg font-black text-[#B91C1C]">
            Xóa bộ từ &ldquo;{deck.name}&rdquo;?
          </h2>
          <p className="text-xs sm:text-sm font-bold text-[#6B6258]">
            Toàn bộ thẻ và tiến trình học trong bộ từ này sẽ bị xóa hoàn toàn.
          </p>
          <div className="wn-form-actions">
            <button
              type="button"
              disabled={isDeleting}
              onClick={deleteDeck}
              className="wn-button-danger brick-button-secondary px-4 py-2 text-xs sm:text-sm font-black"
            >
              {isDeleting ? "Đang xóa..." : "Xóa bộ từ"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="brick-button-secondary px-4 py-2 text-xs sm:text-sm font-bold"
            >
              Hủy
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
