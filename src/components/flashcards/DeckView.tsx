"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlashcardItem, FlashcardData } from "./FlashcardItem";
import { FlashcardStatus } from "@/lib/flashcards/status";
import {
  GraduationCap,
  ArrowLeft,
  Trash2,
  Layers,
  BookOpen,
  HelpCircle,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertCircle,
  Target,
  MoreHorizontal,
} from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";
import { AddCardsToDeckForm } from "./AddCardsToDeckForm";
import { useToast } from "@/components/ui/ToastProvider";
import { SerializedPracticeEvidenceSummary } from "@/services/vocabulary";

interface DeckViewProps {
  initialDeck: {
    id: string;
    name: string;
    description: string | null;
    folder: { name: string } | null;
    createdAt: Date;
    cards: FlashcardData[];
    stats: {
      totalCards: number;
      newCount: number;
      learningCount: number;
      knownCount: number;
    };
  };
  evidenceMap?: Record<string, SerializedPracticeEvidenceSummary>;
  needPracticeCardIds?: string[];
}

const PAGE_SIZE = 20;

export function DeckView({ initialDeck, evidenceMap, needPracticeCardIds = [] }: DeckViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [deck, setDeck] = useState(initialDeck);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterCefr, setFilterCefr] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);
  const [isAddingCards, setIsAddingCards] = useState(false);

  // Recalculate stats dynamically from local cards state
  const cards = deck.cards;
  const newCount = cards.filter((c) => c.status === FlashcardStatus.NEW).length;
  const learningCount = cards.filter((c) => c.status === FlashcardStatus.LEARNING).length;
  const knownCount = cards.filter((c) => c.status === FlashcardStatus.KNOWN).length;

  // List of cards that need practice based strictly on PracticeAttempt evidence
  const needPracticeCards = useMemo(() => {
    if (!evidenceMap) return [];
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    // Candidate eligibility and deterministic order are calculated once by the
    // server-side evidence service. The browser only renders that result.
    return needPracticeCardIds.flatMap((cardId) => {
      const card = cardsById.get(cardId);
      const summary = evidenceMap[cardId];
      return card && summary ? [{ card, summary }] : [];
    });
  }, [cards, evidenceMap, needPracticeCardIds]);

  // Filter cards by status, CEFR, and search query
  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let baseCards = cards;
    if (filterStatus === "NEED_PRACTICE") {
      baseCards = needPracticeCards.map((item) => item.card);
    }

    return baseCards.filter((card) => {
      // Status filter
      if (filterStatus !== "ALL" && filterStatus !== "NEED_PRACTICE" && card.status !== filterStatus) {
        return false;
      }
      // CEFR filter
      if (filterCefr !== "ALL" && card.cefr !== filterCefr) {
        return false;
      }
      // Search filter
      if (query) {
        const matchesTerm = card.term.toLowerCase().includes(query);
        const matchesMeaning = card.meaningVi.toLowerCase().includes(query);
        const matchesDef = card.definitionEn?.toLowerCase().includes(query) ?? false;
        if (!matchesTerm && !matchesMeaning && !matchesDef) {
          return false;
        }
      }
      return true;
    });
  }, [cards, needPracticeCards, filterStatus, filterCefr, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedCards = useMemo(() => {
    const start = (validCurrentPage - 1) * PAGE_SIZE;
    return filteredCards.slice(start, start + PAGE_SIZE);
  }, [filteredCards, validCurrentPage]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCardUpdate = async (cardId: string, updated: Partial<FlashcardData>) => {
    setDeck((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...updated } : c)),
    }));

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Không thể lưu thay đổi thẻ.";
        throw new Error(message);
      }
      if (typeof data === "object" && data !== null && "card" in data && data.card) {
        setDeck((prev) => ({
          ...prev,
          cards: prev.cards.map((card) =>
            card.id === cardId ? { ...card, ...(data.card as Partial<FlashcardData>) } : card
          ),
        }));
      }
    } catch (err) {
      console.error("Failed to update card:", err);
      router.refresh();
      throw err;
    }
  };

  const handleCardDelete = async (cardId: string) => {
    setDeck((prev) => ({
      ...prev,
      cards: prev.cards.filter((c) => c.id !== cardId),
    }));

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete card");
    } catch (err) {
      console.error("Failed to delete card:", err);
      router.refresh();
      throw err;
    }
  };

  const handleDeleteDeck = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ bộ thẻ "${deck.name}"?`)) {
      return;
    }

    setIsDeletingDeck(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete deck");
      toast.success("Đã xóa bộ thẻ", { description: `Bộ “${deck.name}” đã được xóa.` });
      router.push("/");
    } catch (err) {
      console.error("Failed to delete deck:", err);
      toast.error("Không thể xóa bộ thẻ", { description: "Vui lòng thử lại." });
      setIsDeletingDeck(false);
    }
  };

  const refreshDeckAfterAddingCards = () => {
    setIsAddingCards(false);
    router.refresh();
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về trang chủ</span>
        </Link>

      </div>

      <div className="surface-card space-y-5 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A64B2B] bg-[#F5EEDD] px-2.5 py-1 rounded-full">
              <Layers className="w-3.5 h-3.5" />
              <span>Bộ từ vựng</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              {deck.name}
            </h1>
            {deck.description && (
              <p className="text-xs sm:text-sm text-[#6B6258] font-medium">
                {deck.description}
              </p>
            )}
          </div>

          {/* Core actions stay together; optional reinforcement is secondary. */}
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            <Link
              href={`/decks/${deck.id}/study`}
              prefetch={true}
            className="brick-button-primary flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-black gap-1.5 whitespace-nowrap"
            >
              <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Ôn tập</span>
            </Link>
            <Link
              href={`/decks/${deck.id}/quiz`}
              prefetch={true}
            className="brick-button-secondary flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-black gap-1.5 whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#B45309] shrink-0" />
              <span>Luyện</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsAddingCards((current) => !current)}
              className="brick-button-secondary flex-1 whitespace-nowrap px-3 py-2.5 text-xs font-black sm:flex-initial sm:text-sm"
              aria-expanded={isAddingCards}
              aria-controls="add-cards-form"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-[#E06B43] sm:h-4 sm:w-4" />
              <span>Thêm từ</span>
            </button>
          </div>
        </div>

        <details className="rounded-xl border border-[#221C16]/14 bg-[#FAF6EE]">
          <summary role="button" className="flex cursor-pointer items-center gap-2 px-3 py-3 text-sm font-bold text-[#4A4036]">
            <MoreHorizontal className="h-4 w-4" /> Thêm tuỳ chọn
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-[#221C16]/12 px-3 py-3">
            <a href={`/api/decks/${deck.id}/export`} download className="brick-button-secondary gap-1.5 px-3 py-2 text-xs font-bold" title="Xuất bộ thẻ sang CSV (UTF-8 BOM)">
              <Download className="h-4 w-4 text-[#315F9E]" /> Xuất CSV
            </a>
            <Link
              href={`/decks/${deck.id}/story`}
              prefetch={true}
              className="brick-button-secondary px-3 py-2 text-xs font-bold"
            >
              <BookOpen className="h-4 w-4 text-[#A64B2B]" /> Truyện đã lưu
            </Link>
            <Link
              href={`/decks/${deck.id}/practice`}
              prefetch={true}
              className="brick-button-secondary px-3 py-2 text-xs font-bold"
            >
              <GraduationCap className="h-4 w-4" /> Luyện tự do
            </Link>
            <button onClick={handleDeleteDeck} disabled={isDeletingDeck} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {isDeletingDeck ? "Đang xóa..." : "Xóa bộ thẻ"}
            </button>
          </div>
        </details>

        {isAddingCards && (
          <div id="add-cards-form">
            <AddCardsToDeckForm
              deckId={deck.id}
              deckName={deck.name}
              collectionName={deck.folder?.name}
              onClose={() => setIsAddingCards(false)}
              onCardsCreated={refreshDeckAfterAddingCards}
            />
          </div>
        )}

        {needPracticeCards.length > 0 && (
          <div
            data-testid="need-practice-section"
            className="rounded-xl border border-[#D8B87B] bg-[#FFF7E7] p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />
                <h3 className="text-sm sm:text-base font-black text-[#92400E]">
                  Cần luyện thêm ({needPracticeCards.length} từ)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  data-testid="btn-start-focused-practice"
                  href={`/decks/${deck.id}/quiz?mode=focused_practice`}
                  className="brick-button-primary px-3 py-2 text-xs font-black gap-1.5 whitespace-nowrap inline-flex items-center"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Luyện tập trung ({needPracticeCards.length} từ)</span>
                </Link>
              </div>
            </div>

            <button onClick={() => { setFilterStatus("NEED_PRACTICE"); setCurrentPage(1); }} className="text-left text-xs font-semibold leading-5 text-[#6B6258] hover:text-[#221C16] hover:underline">
              {needPracticeCards[0].summary.explanationVi} Xem danh sách từ cần luyện.
            </button>
          </div>
        )}

        {/* Search & Filters Section */}
        <div className="space-y-3 border-t border-[#221C16]/12 pt-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258]" />
            <input
              type="text"
              placeholder="Tìm kiếm từ tiếng Anh, tiếng Việt..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="field-control py-2 pl-10 pr-4 text-xs font-semibold sm:text-sm"
            />
          </div>

          {/* Filter Bar: Status & CEFR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => {
                  setFilterStatus("ALL");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                  filterStatus === "ALL"
                    ? "bg-[#221C16] text-white"
                    : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
                }`}
              >
                Tất cả ({cards.length})
              </button>

              <button
                onClick={() => {
                  setFilterStatus(FlashcardStatus.NEW);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                  filterStatus === FlashcardStatus.NEW
                    ? "bg-[#0284C7] text-white"
                    : "bg-[#E0F2FE] text-[#0369A1]"
                }`}
              >
                Mới ({newCount})
              </button>

              <button
                onClick={() => {
                  setFilterStatus(FlashcardStatus.LEARNING);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                  filterStatus === FlashcardStatus.LEARNING
                    ? "bg-[#D97706] text-white"
                    : "bg-[#FEF3C7] text-[#B45309]"
                }`}
              >
                Đang học ({learningCount})
              </button>

              <button
                onClick={() => {
                  setFilterStatus(FlashcardStatus.KNOWN);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                  filterStatus === FlashcardStatus.KNOWN
                    ? "bg-[#16A34A] text-white"
                    : "bg-[#DCFCE7] text-[#15803D]"
                }`}
              >
                Đang Review ({knownCount})
              </button>

              {needPracticeCards.length > 0 && (
                <button
                  data-testid="filter-need-practice"
                  onClick={() => {
                    setFilterStatus("NEED_PRACTICE");
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                    filterStatus === "NEED_PRACTICE"
                      ? "bg-[#D97706] text-white"
                      : "bg-[#FEF3C7] text-[#92400E] border-[#D97706]"
                  }`}
                >
                  Cần luyện thêm ({needPracticeCards.length})
                </button>
              )}
            </div>

            {/* CEFR Filter */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {["ALL", "A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => {
                    setFilterCefr(lvl);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-0.5 text-[11px] font-black rounded-md border border-[#221C16] transition-all whitespace-nowrap shrink-0 ${
                    filterCefr === lvl
                      ? "bg-[#E06B43] text-white"
                      : "bg-[#FAF6EE] text-[#6B6258] hover:bg-gray-100"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cards Count & Pagination Top Info */}
      <div className="flex items-center justify-between text-xs font-bold text-[#6B6258] px-1">
        <span>
          Hiển thị {filteredCards.length === 0 ? 0 : (validCurrentPage - 1) * PAGE_SIZE + 1} -{" "}
          {Math.min(validCurrentPage * PAGE_SIZE, filteredCards.length)} trong{" "}
          <strong className="text-[#221C16]">{filteredCards.length}</strong> thẻ phù hợp
        </span>

        {totalPages > 1 && (
          <span className="font-mono">
            Trang {validCurrentPage} / {totalPages}
          </span>
        )}
      </div>

      {/* Paginated Cards Grid */}
      {paginatedCards.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {paginatedCards.map((card) => (
              <FlashcardItem
                key={card.id}
                card={card}
                evidence={evidenceMap?.[card.id]}
                onDelete={handleCardDelete}
                onUpdate={handleCardUpdate}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => handlePageChange(validCurrentPage - 1)}
                disabled={validCurrentPage === 1}
                className="brick-button-secondary text-xs px-3 py-2 gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Trang trước</span>
              </button>

              <div className="flex items-center gap-1 font-mono text-xs">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => handlePageChange(pg)}
                    className={`w-8 h-8 rounded-lg border-2 border-[#221C16] font-bold transition-all ${
                      validCurrentPage === pg
                        ? "bg-[#221C16] text-white shadow-[2px_2px_0px_#E06B43]"
                        : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
                    }`}
                  >
                    {pg}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handlePageChange(validCurrentPage + 1)}
                disabled={validCurrentPage === totalPages}
                className="brick-button-secondary text-xs px-3 py-2 gap-1 disabled:opacity-40"
              >
                <span>Trang sau</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-3">
          <WordNestMascot mood="thinking" size={80} />
          <p className="text-sm font-bold text-[#6B6258]">
            Không tìm thấy thẻ nào phù hợp với điều kiện tìm kiếm và bộ lọc.
          </p>
          <button
            onClick={() => {
              setFilterStatus("ALL");
              setFilterCefr("ALL");
              setSearchQuery("");
              setCurrentPage(1);
            }}
            className="brick-button-secondary text-xs px-3 py-1.5"
          >
            Đặt lại bộ lọc ({cards.length} thẻ)
          </button>
        </div>
      )}
    </div>
  );
}
