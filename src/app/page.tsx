import React from "react";
import { Header } from "@/components/ui/Header";
import { WordNestMascot } from "@/components/ui/Mascot";
import { BulkInputForm } from "@/components/flashcards/BulkInputForm";
import { RecentDecks } from "@/components/flashcards/RecentDecks";
import { deckService } from "@/services/vocabulary";
import { Sparkles } from "lucide-react";

// Revalidate frequently so newly created decks appear
export const revalidate = 0;

export default async function HomePage() {
  const recentDecks = await deckService.getRecentDecks(8);

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-10 space-y-8 sm:space-y-10">
        {/* Hero Section with Mascot */}
        <section className="brick-card p-6 sm:p-8 bg-[#FFFDF9] flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden relative">
          {/* Subtle Background Pattern Accent */}
          <div className="space-y-3 text-center sm:text-left z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 border-[#221C16] bg-[#FEF3C7] text-xs font-black text-[#92400E]">
              <Sparkles className="w-3.5 h-3.5 text-[#E06B43]" />
              Smart English Flashcards for Vietnamese Learners
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-[#221C16] tracking-tight leading-none">
              Turn words into <span className="text-[#E06B43] underline decoration-[#F59E0B] decoration-wavy decoration-2">stories.</span>
            </h1>

            <p className="text-sm sm:text-base text-[#6B6258] font-medium max-w-lg leading-relaxed">
              Nhập danh sách từ vựng bất kỳ &mdash; WordNest sẽ tự động phân tích nghĩa tiếng Việt chuẩn xác, phiên âm IPA, câu ví dụ thực tế và hình ảnh trực quan giúp bạn ghi nhớ nhanh hơn.
            </p>
          </div>

          {/* Mascot Display Area */}
          <div className="shrink-0 flex flex-col items-center justify-center p-2 z-10">
            <div className="transition-transform hover:scale-105 duration-200">
              <WordNestMascot mood="happy" size={130} />
            </div>
            <span className="text-[11px] font-bold text-[#6B6258] mt-1 bg-[#FAF6EE] px-2 py-0.5 rounded-full border border-[#221C16]/20">
              Nesty Mascot
            </span>
          </div>
        </section>

        {/* Bulk Input Form */}
        <section>
          <BulkInputForm />
        </section>

        {/* Recent Decks */}
        <section>
          <RecentDecks decks={recentDecks} />
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t-2 border-[#221C16] py-6 bg-[#FAF6EE] text-center text-xs text-[#6B6258] font-bold">
        <p>WordNest &bull; Turn words into stories &bull; Built for learners</p>
      </footer>
    </div>
  );
}
