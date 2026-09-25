"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
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

  useEffect(() => {
    if (!isConfirmingDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        setIsConfirmingDelete(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirmingDelete, isDeleting]);

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
      toast.success(`Đã xóa bộ từ “${deck.name}”`);
      router.push("/");
      router.refresh();
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
      <section className="wn-primary-surface relative overflow-visible border-l-[6px] border-l-[#E06B43] focus-within:z-30" aria-labelledby="deck-name">
        <div className="flex items-center justify-between rounded-t-[calc(var(--radius-lg)-2px)] border-b-2 border-dashed border-[#C9BFB1] bg-[#ECD9A8] px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
              <Layers className="h-4 w-4 text-[#D97706]" strokeWidth={2.5} />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-[#6B6258]">
              {deck.folder ? deck.folder.name : "Bộ từ vựng"}
            </span>
          </div>

          <details className="relative wn-menu-details">
            <summary
              aria-label="Thêm tùy chọn"
              className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
            >
              <MoreHorizontal className="h-4 w-4 text-[#6B6258]" />
            </summary>
            <div
              className="fixed inset-0 z-40 cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            />
            <div className="absolute right-0 top-full z-50 mt-1.5 grid w-52 gap-1 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
              <Link
                href={`/progress/decks/${deck.id}`}
                className="wn-button wn-button-quiet justify-start text-xs font-bold"
              >
                <Target className="h-4 w-4 text-[#0284C7]" />
                <span>Tiến độ</span>
              </Link>
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
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  setIsConfirmingDelete(true);
                }}
                className="wn-button wn-button-quiet wn-button-danger justify-start text-xs font-bold cursor-pointer"
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

      {/* Contextual Weak Evidence Section: Cần luyện thêm (Notebook Study Callout) */}
      {needPracticeCards.length > 0 ? (
        <section
          data-testid="need-practice-section"
          className="wn-notebook-callout p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1px_1px_0px_#221C16]">
                  <Target className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={2.5} />
                </span>
                <h2 className="text-base font-black text-[#221C16]">Cần luyện thêm</h2>
                <span className="wn-marker-amber text-xs font-black text-[#9A3412]">
                  {needPracticeCards.length} từ
                </span>
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
              <label htmlFor="deck-card-search" className="wn-sr-only">Tìm từ vựng hoặc nghĩa</label>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 left-2 flex w-8 items-center justify-center border-r border-[#C9BFB1] pr-2">
                <Search className="h-4 w-4 text-[#6B6258]" />
              </span>
              <input
                id="deck-card-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm từ vựng hoặc nghĩa..."
                className="wn-field wn-field-with-leading-icon"
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

      {/* Modal Dialog Xác nhận Xóa bộ từ */}
      {isConfirmingDelete ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#221C16]/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setIsConfirmingDelete(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-deck-dialog-title"
            aria-describedby="delete-deck-dialog-desc"
            className="toast-enter w-full max-w-md rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-5 sm:p-6 shadow-[6px_6px_0px_#221C16] space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FEE2E2] text-[#B91C1C] shadow-[2px_2px_0px_#221C16]">
                <Trash2 className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <span className="inline-block rounded-md border border-[#B91C1C]/30 bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#991B1B]">
                  Xác nhận xóa
                </span>
                <h3
                  id="delete-deck-dialog-title"
                  className="mt-1 text-lg font-black text-[#221C16] leading-snug break-words"
                >
                  Xóa bộ từ &ldquo;{deck.name}&rdquo;?
                </h3>
                <p
                  id="delete-deck-dialog-desc"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-[#6B6258] leading-relaxed"
                >
                  Toàn bộ thẻ flashcard và tiến trình học trong bộ từ này sẽ bị xóa hoàn toàn. Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-dashed border-[#221C16]/15">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsConfirmingDelete(false)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] text-xs sm:text-sm font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] hover:bg-[#F4EFE6] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={deleteDeck}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#B91C1C] bg-[#B91C1C] text-xs sm:text-sm font-black text-white shadow-[2px_2px_0px_#221C16] hover:bg-[#991B1B] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? "Đang xóa..." : "Xóa bộ từ"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
