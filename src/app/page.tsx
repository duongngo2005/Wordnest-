import React from "react";
import Link from "next/link";
import { ArrowDown, BookOpen, Plus } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { BulkInputForm } from "@/components/flashcards/BulkInputForm";
import { FolderLibrary } from "@/components/folders/FolderLibrary";
import { folderService } from "@/services/vocabulary";

export const revalidate = 0;

export default async function HomePage() {
  const library = await folderService.getLibrary();
  const deckCount = library.folders.reduce((count, folder) => count + folder.decks.length, 0) + library.uncategorizedDecks.length;

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container space-y-8 py-5 sm:py-9">
        <section className="home-intro">
          <div className="max-w-2xl">
            <p className="section-kicker">WordNest</p>
            <h1>Hôm nay bạn muốn học gì?</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6B6258] sm:text-base">
              Mở một bộ từ để ôn tập, hoặc thêm vài từ mới rồi bắt đầu theo nhịp của bạn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="#library" className="brick-button-primary gap-2 px-4 py-3 text-sm"><BookOpen className="h-4 w-4" /> Xem bộ từ</Link>
            <Link href="#add-vocabulary" className="brick-button-secondary gap-2 px-4 py-3 text-sm"><Plus className="h-4 w-4" /> Thêm từ</Link>
          </div>
        </section>

        <section className="learning-glance" aria-label="Tổng quan thư viện">
          <span className="text-sm font-black text-[#221C16]">{deckCount} bộ từ đang chờ bạn</span>
          <a href="#library" className="inline-flex items-center gap-1 text-xs font-bold text-[#A64B2B]">Đi tới thư viện <ArrowDown className="h-3.5 w-3.5" /></a>
        </section>

        <section id="library" className="scroll-mt-20">
          <FolderLibrary {...library} />
        </section>

        <BulkInputForm folders={library.folders.map((folder) => ({ id: folder.id, name: folder.name }))} />
      </main>
    </div>
  );
}
