import React from "react";
import { Header } from "@/components/ui/Header";
import { DocumentImportFlow } from "@/components/document/DocumentImportFlow";
import { deckService } from "@/services/vocabulary";

export const revalidate = 0;

export const metadata = {
  title: "Nhập từ vựng từ tài liệu | WordNest",
  description:
    "Tải lên tài liệu PDF, DOCX hoặc TXT để AI tự động trích xuất từ vựng và tạo bộ flashcard thông minh.",
};

export default async function DocumentImportPage() {
  const recentDecks = await deckService.getRecentDecks(50);
  const existingDecks = recentDecks.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8">
        <DocumentImportFlow existingDecks={existingDecks} />
      </main>
    </div>
  );
}
