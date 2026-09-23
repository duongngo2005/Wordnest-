"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, X } from "lucide-react";
import { ManualCardsEditor } from "./ManualCardsEditor";

interface BulkInputFormProps {
  folders?: { id: string; name: string }[];
}

export function BulkInputForm({ folders = [] }: BulkInputFormProps) {
  const router = useRouter();
  const [deckName, setDeckName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section id="add-vocabulary" className="surface-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls="home-add-vocabulary"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDE68A] text-[#92400E]">
            <BookOpen className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-base font-black text-[#221C16]">Thêm từ mới</span>
            <span className="mt-0.5 block text-xs font-medium text-[#6B6258]">Nhập từng thẻ hoặc dán nhiều dòng từ Excel/Google Sheets.</span>
          </span>
        </span>
        <span className="brick-button-primary shrink-0 px-3 py-2 text-xs">{isOpen ? "Đóng" : "Thêm từ"}</span>
      </button>

      {isOpen ? (
        <div id="home-add-vocabulary" className="border-t border-[#221C16]/12 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#221C16]">Bộ từ của bạn</h2>
              <p className="mt-1 text-xs font-medium text-[#6B6258]">Word và nghĩa tiếng Việt là đủ để bắt đầu. Không cần AI.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng form thêm từ" className="rounded-lg p-2 text-[#6B6258] hover:bg-[#F4EFE6]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-[#4A4036]">
              Tên bộ từ vựng (tùy chọn)
              <input
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                placeholder="Ví dụ: Oxford 3000"
                className="field-control mt-1.5"
              />
            </label>
            {folders.length > 0 ? (
              <label className="text-xs font-bold text-[#4A4036]">
                Collection (tùy chọn)
                <select value={folderId} onChange={(event) => setFolderId(event.target.value)} className="field-control mt-1.5">
                  <option value="">Chưa phân loại</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          <ManualCardsEditor
            deckName={deckName}
            folderId={folderId || undefined}
            onSaved={(data) => {
              setIsOpen(false);
              if (data.deck?.id) {
                router.push(`/decks/${data.deck.id}`);
              }
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
