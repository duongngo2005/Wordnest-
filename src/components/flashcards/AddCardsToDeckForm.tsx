"use client";

import { useState } from "react";
import { Braces, PenLine, X } from "lucide-react";
import { ManualCardsEditor } from "./ManualCardsEditor";
import { JsonFlashcardImport } from "./JsonFlashcardImport";

interface AddCardsToDeckFormProps {
  deckId: string;
  deckName: string;
  collectionName?: string | null;
  onClose: () => void;
  onCardsCreated: () => void;
}

export function AddCardsToDeckForm({
  deckId,
  deckName,
  collectionName,
  onClose,
  onCardsCreated,
}: AddCardsToDeckFormProps) {
  const [creationMode, setCreationMode] = useState<"manual" | "json">("manual");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <section className="mt-5 border-t border-[#221C16]/12 pt-5" aria-label="Thêm flashcard">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#221C16]">Thêm vào {deckName}</h2>
          <p className="mt-1 text-xs font-medium text-[#6B6258]">Tạo thẻ thủ công trước; dữ liệu nâng cao chỉ mở khi bạn cần.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#6B6258] hover:bg-[#F4EFE6]" aria-label="Đóng form thêm flashcard">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Phương thức thêm flashcard">
        <button type="button" role="tab" aria-selected={creationMode === "manual"} onClick={() => setCreationMode("manual")} className={`rounded-lg px-3 py-2 text-xs font-black ${creationMode === "manual" ? "bg-[#221C16] text-white" : "bg-[#F5EEDD] text-[#4A4036]"}`}>
          <PenLine className="mr-1 inline h-4 w-4" /> Tạo thủ công
        </button>
        <button type="button" role="tab" aria-selected={creationMode === "json"} onClick={() => { setCreationMode("json"); setIsAdvancedOpen(true); }} className={`rounded-lg px-3 py-2 text-xs font-black ${creationMode === "json" ? "bg-[#315F9E] text-white" : "bg-[#F5EEDD] text-[#4A4036]"}`}>
          <Braces className="mr-1 inline h-4 w-4" /> Nhập JSON
        </button>
      </div>

      {creationMode === "manual" ? (
        <div className="mt-4"><ManualCardsEditor deckId={deckId} onSaved={onCardsCreated} /></div>
      ) : (
        <details className="mt-4 rounded-xl border border-[#221C16]/14 bg-[#FAF6EE]" open={isAdvancedOpen} onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer px-3 py-3 text-sm font-black text-[#221C16]">Nhập JSON từ chatbot bên ngoài</summary>
          <div className="border-t border-[#221C16]/12 p-3 sm:p-4">
            <JsonFlashcardImport deckId={deckId} deckName={deckName} collectionName={collectionName} onSaved={onCardsCreated} />
          </div>
        </details>
      )}
    </section>
  );
}
