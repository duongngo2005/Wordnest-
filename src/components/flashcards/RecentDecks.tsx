"use client";

import React from "react";
import Link from "next/link";
import { Layers, ChevronRight, Calendar } from "lucide-react";
import { DeckSummary } from "@/services/vocabulary";

interface RecentDecksProps {
  decks: DeckSummary[];
  onDeleteDeck?: (id: string) => void;
}

export function RecentDecks({ decks }: RecentDecksProps) {
  if (!decks || decks.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg sm:text-xl font-black text-[#221C16] flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#E06B43]" />
          Bộ từ vựng gần đây ({decks.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {decks.map((deck) => {
          const formattedDate = new Date(deck.createdAt).toLocaleDateString("vi-VN", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
          });

          return (
            <Link
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="brick-card p-4 sm:p-5 bg-[#FFFDF9] hover:bg-[#FAF6EE] hover:-translate-y-1 transition-all group flex flex-col justify-between block"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-base sm:text-lg font-black text-[#221C16] group-hover:text-[#E06B43] transition-colors line-clamp-1">
                    {deck.name}
                  </h4>
                  <ChevronRight className="w-5 h-5 text-[#6B6258] group-hover:translate-x-1 transition-transform shrink-0" />
                </div>

                {deck.description && (
                  <p className="text-xs text-[#6B6258] line-clamp-2">
                    {deck.description}
                  </p>
                )}
              </div>

              <div className="pt-4 mt-3 border-t border-[#221C16]/20 flex items-center justify-between text-xs font-bold text-[#6B6258]">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formattedDate}</span>
                </div>

                {/* Progress Mini-Pills */}
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="bg-[#E0F2FE] text-[#0369A1] px-1.5 py-0.5 rounded border border-[#0284C7]/30">
                    {deck.newCount} mới
                  </span>
                  <span className="bg-[#FEF3C7] text-[#B45309] px-1.5 py-0.5 rounded border border-[#D97706]/30">
                    {deck.learningCount} học
                  </span>
                  <span className="bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded border border-[#16A34A]/30">
                    {deck.knownCount} thuộc
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
