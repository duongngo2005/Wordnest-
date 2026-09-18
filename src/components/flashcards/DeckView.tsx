"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlashcardItem, FlashcardData } from "./FlashcardItem";
import { FlashcardStatus } from "@prisma/client";
import {
  GraduationCap,
  ArrowLeft,
  Trash2,
  Filter,
  Layers,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";

interface DeckViewProps {
  initialDeck: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    cards: FlashcardData[];
    stats: {
      totalCards: number;
      newCount: number;
      learningCount: number;
      knownCount: number;
    };
  };
}

export function DeckView({ initialDeck }: DeckViewProps) {
  const router = useRouter();
  const [deck, setDeck] = useState(initialDeck);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  // Recalculate stats dynamically from local cards state
  const cards = deck.cards;
  const newCount = cards.filter((c) => c.status === FlashcardStatus.NEW).length;
  const learningCount = cards.filter((c) => c.status === FlashcardStatus.LEARNING).length;
  const knownCount = cards.filter((c) => c.status === FlashcardStatus.KNOWN).length;

  const filteredCards = cards.filter((card) => {
    if (filterStatus === "ALL") return true;
    return card.status === filterStatus;
  });

  const handleStatusChange = async (cardId: string, newStatus: FlashcardStatus) => {
    // Optimistic UI update
    setDeck((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)),
    }));

    try {
      const res = await fetch(`/api/cards/${cardId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    } catch (err) {
      console.error("Failed to update status on server:", err);
      // Revert on failure
      router.refresh();
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
      if (!res.ok) throw new Error("Failed to save card changes");
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
      router.push("/");
    } catch (err) {
      console.error("Failed to delete deck:", err);
      alert("Không thể xóa bộ thẻ. Vui lòng thử lại.");
      setIsDeletingDeck(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về trang chủ</span>
        </Link>

        <button
          onClick={handleDeleteDeck}
          disabled={isDeletingDeck}
          className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 p-1 rounded-md"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isDeletingDeck ? "Đang xóa..." : "Xóa bộ thẻ"}</span>
        </button>
      </div>

      {/* Deck Header & Stats Banner */}
      <div className="brick-card p-5 sm:p-7 bg-[#FFFDF9] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full border border-[#221C16]">
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

          {/* Actions: Short Story and Study */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Link
              href={`/decks/${deck.id}/story`}
              className="brick-button-secondary px-4 sm:px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16]"
            >
              <BookOpen className="w-4 h-4 text-[#E06B43]" />
              <span>Short Story</span>
            </Link>

            <Link
              href={`/decks/${deck.id}/quiz`}
              className="brick-button-secondary px-4 sm:px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]"
            >
              <HelpCircle className="w-4 h-4 text-[#B45309]" />
              <span>Quiz (Trắc nghiệm)</span>
            </Link>

            <Link
              href={`/decks/${deck.id}/study`}
              className="brick-button-primary px-5 sm:px-6 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3.5px_3.5px_0px_#221C16]"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Study (Bắt đầu học)</span>
            </Link>
          </div>
        </div>

        {/* Deck Status Counters & Filter Bar */}
        <div className="pt-4 border-t-2 border-[#221C16] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#6B6258] flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            <span>Bộ lọc:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterStatus("ALL")}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filterStatus === "ALL"
                  ? "bg-[#221C16] text-white shadow-[2px_2px_0px_#E06B43]"
                  : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
              }`}
            >
              Tất cả ({cards.length})
            </button>

            <button
              onClick={() => setFilterStatus(FlashcardStatus.NEW)}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filterStatus === FlashcardStatus.NEW
                  ? "bg-[#0284C7] text-white shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#E0F2FE] text-[#0369A1] hover:bg-[#BAE6FD]"
              }`}
            >
              Mới ({newCount})
            </button>

            <button
              onClick={() => setFilterStatus(FlashcardStatus.LEARNING)}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filterStatus === FlashcardStatus.LEARNING
                  ? "bg-[#D97706] text-white shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]"
              }`}
            >
              Đang học ({learningCount})
            </button>

            <button
              onClick={() => setFilterStatus(FlashcardStatus.KNOWN)}
              className={`px-3 py-1 text-xs font-black rounded-lg border-2 border-[#221C16] transition-all ${
                filterStatus === FlashcardStatus.KNOWN
                  ? "bg-[#16A34A] text-white shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0]"
              }`}
            >
              Đã thuộc ({knownCount})
            </button>
          </div>
        </div>
      </div>

      {/* Cards List */}
      {filteredCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {filteredCards.map((card) => (
            <FlashcardItem
              key={card.id}
              card={card}
              onStatusChange={handleStatusChange}
              onDelete={handleCardDelete}
              onUpdate={handleCardUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-3">
          <WordNestMascot mood="thinking" size={80} />
          <p className="text-sm font-bold text-[#6B6258]">
            Không có thẻ nào thuộc bộ lọc này.
          </p>
          <button
            onClick={() => setFilterStatus("ALL")}
            className="brick-button-secondary text-xs px-3 py-1.5"
          >
            Hiện tất cả thẻ ({cards.length})
          </button>
        </div>
      )}
    </div>
  );
}
