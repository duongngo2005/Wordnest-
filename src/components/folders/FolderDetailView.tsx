"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Book,
  Layers,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { FolderDetail } from "@/services/vocabulary/folder-service";
import { useToast } from "@/components/ui/ToastProvider";

interface FolderDetailViewProps {
  folder: FolderDetail;
}

export function FolderDetailView({ folder }: FolderDetailViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const dueCount = folder.progress.dueTodayCount;
  const nextDeck = folder.decks.find((deck) => deck.learningStatus !== "COMPLETED") ?? folder.decks[0];
  const continueHref = nextDeck ? `/decks/${nextDeck.id}/study` : `/folders/${folder.id}/review`;

  const deleteFolder = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa bộ sưu tập", { description: "Thử lại sau." });
        setIsDeleting(false);
        return;
      }
      toast.success("Đã xóa bộ sưu tập");
      router.push("/");
    } catch {
      setIsDeleting(false);
      toast.error("Không thể xóa bộ sưu tập", { description: "Kiểm tra kết nối mạng rồi thử lại." });
    }
  };

  const deleteDeck = async (deckId: string, deckTitle: string) => {
    if (!window.confirm(`Xóa bộ từ “${deckTitle}”? Toàn bộ thẻ trong bộ từ này sẽ bị xóa.`)) return;
    try {
      const response = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa bộ từ", { description: "Thử lại sau." });
        return;
      }
      toast.success("Đã xóa bộ từ");
      router.refresh();
    } catch {
      toast.error("Không thể xóa bộ từ", { description: "Kiểm tra kết nối mạng rồi thử lại." });
    }
  };

  const handleCreateDeck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!deckName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deckName.trim(), folderId: folder.id }),
      });

      if (!response.ok) {
        toast.error("Không thể tạo bộ từ", { description: "Vui lòng thử lại sau." });
        return;
      }

      const data: unknown = await response.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "deck" in data &&
        typeof data.deck === "object" &&
        data.deck !== null &&
        "id" in data.deck &&
        typeof data.deck.id === "string"
      ) {
        toast.success("Đã tạo bộ từ mới!");
        router.push(`/decks/${data.deck.id}`);
        return;
      }
      setIsCreatingDeck(false);
      setDeckName("");
      router.refresh();
    } catch {
      toast.error("Không thể tạo bộ từ", { description: "Kiểm tra kết nối mạng rồi thử lại." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="wn-stack">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        <span>Thư viện</span>
      </Link>

      {/* Collection Header Card */}
      <section className="brick-card overflow-hidden bg-[#FFFDF9]">
        <div className="flex items-center justify-between border-b-2 border-[#221C16] bg-[#FEF3C7] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
              <Layers className="h-4 w-4 text-[#D97706]" strokeWidth={2.5} />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-[#6B6258]">
              Bộ sưu tập
            </span>
          </div>

          <div className="flex items-center gap-2">
            {dueCount > 0 ? (
              <span className="rounded-full border-2 border-[#221C16] bg-[#E06B43] px-2.5 py-0.5 text-xs font-black text-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
                {dueCount} cần ôn
              </span>
            ) : (
              <span className="rounded-full border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-0.5 text-xs font-extrabold text-[#6B6258] shadow-[1.5px_1.5px_0px_#221C16]">
                {folder.decks.length} bộ từ
              </span>
            )}

            <details className="relative">
              <summary
                aria-label={`Tùy chọn cho ${folder.name}`}
                className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
              >
                <MoreHorizontal className="h-4 w-4 text-[#6B6258]" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa bộ sưu tập</span>
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="break-words text-2xl sm:text-3xl font-black tracking-tight text-[#221C16]">
              {folder.name}
            </h1>
            {folder.description ? (
              <p className="mt-1 text-xs sm:text-sm font-semibold text-[#6B6258]">
                {folder.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            {nextDeck ? (
              <Link
                href={continueHref}
                className="brick-button-primary px-4 py-2 text-xs sm:text-sm font-black"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                <span>Ôn tập</span>
              </Link>
            ) : null}

            {dueCount > 0 ? (
              <Link
                href={`/folders/${folder.id}/review`}
                className="brick-button-secondary px-4 py-2 text-xs sm:text-sm font-black"
              >
                <span>Ôn cả bộ ({dueCount})</span>
              </Link>
            ) : null}

            {/* Crucial Visible Action: + Bộ từ inside Collection */}
            <button
              type="button"
              onClick={() => setIsCreatingDeck((prev) => !prev)}
              aria-label="Tạo bộ từ"
              className="brick-button-secondary px-4 py-2 text-xs sm:text-sm font-black"
            >
              <Plus className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
              <span>+ Bộ từ</span>
            </button>
            <Link
              href={`/progress/folders/${folder.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-xs font-black text-[#6B6258] underline decoration-dashed underline-offset-4 hover:text-[#E06B43] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Tiến độ
            </Link>
          </div>
        </div>
      </section>

      {/* Delete Folder Confirmation Dialog */}
      {isConfirmingDelete ? (
        <div
          role="alertdialog"
          aria-labelledby="delete-folder-title"
          className="brick-card wn-form-group bg-[#FFFDF9] p-4 sm:p-5"
        >
          <h2 id="delete-folder-title" className="text-lg font-black text-[#B91C1C]">
            Xóa bộ sưu tập &ldquo;{folder.name}&rdquo;?
          </h2>
          <p className="text-xs sm:text-sm font-bold text-[#6B6258]">
            Các bộ từ bên trong sẽ được giữ lại an toàn ở mục Chưa phân loại trong Thư viện.
          </p>
          <div className="wn-form-actions">
            <button
              type="button"
              disabled={isDeleting}
              onClick={deleteFolder}
              className="wn-button-danger brick-button-secondary px-4 py-2 text-xs sm:text-sm font-black"
            >
              {isDeleting ? "Đang xóa..." : "Xóa bộ sưu tập"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="brick-button-secondary px-4 py-2 text-xs sm:text-sm font-bold"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      {/* Create Deck Sheet/Form */}
      {isCreatingDeck ? (
        <form
          onSubmit={handleCreateDeck}
          className="brick-card wn-form-group bg-[#FFFDF9] p-4 sm:p-5"
          aria-label="Tạo bộ từ trong bộ sưu tập"
        >
          <div className="flex items-center gap-2 border-b-2 border-dashed border-[#DCD3C5] pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1.5px_1.5px_0px_#221C16]">
              <Plus className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
            </span>
            <h2 className="text-base font-black text-[#221C16]">
              Thêm bộ từ vào &ldquo;{folder.name}&rdquo;
            </h2>
          </div>
          <label className="wn-field-label">
            <span>Tên bộ từ</span>
            <input
              autoFocus
              required
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="VD: Day 01, Topic 1..."
              className="wn-field"
            />
          </label>
          <div className="wn-form-actions">
            <button
              disabled={isSubmitting}
              className="brick-button-primary px-5 py-2 text-sm font-black"
            >
              {isSubmitting ? "Đang tạo..." : "Tạo"}
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingDeck(false)}
              className="brick-button-secondary px-4 py-2 text-sm font-bold"
            >
              Hủy
            </button>
          </div>
        </form>
      ) : null}

      {/* Decks List */}
      <section className="wn-section" aria-labelledby="collection-decks">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-full bg-[#E06B43]" />
            <h2 id="collection-decks" className="text-lg font-black text-[#221C16]">
              Bộ từ
            </h2>
          </div>
          <span className="text-xs font-bold text-[#6B6258]">
            {folder.decks.length} bộ từ
          </span>
        </div>

        <div className="brick-card bg-[#FFFDF9] px-4">
          {folder.decks.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm font-bold text-[#6B6258]">Chưa có bộ từ</p>
              <button
                type="button"
                onClick={() => setIsCreatingDeck(true)}
                className="brick-button-primary px-4 py-2 text-xs font-black inline-flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>+ Bộ từ</span>
              </button>
            </div>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-[#DCD3C5]">
              {folder.decks.map((deck) => {
                const isDue = deck.dueTodayCount > 0;
                return (
                  <li key={deck.id} className="flex items-center justify-between gap-3 py-3">
                    <Link
                      href={`/decks/${deck.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 transition-transform active:translate-x-0.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] shadow-[1.5px_1.5px_0px_#221C16]">
                        <Book className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-black text-[#221C16] group-hover:text-[#E06B43] sm:text-base">
                          {deck.name}
                        </span>
                        <span
                          className={`inline-block text-xs font-bold ${
                            isDue ? "text-[#E06B43]" : "text-[#6B6258]"
                          }`}
                        >
                          {isDue ? `${deck.dueTodayCount} cần ôn` : `${deck.totalCards} thẻ`}
                        </span>
                      </div>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2">
                      <details className="relative">
                        <summary
                          aria-label={`Tùy chọn cho ${deck.name}`}
                          className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
                        >
                          <MoreHorizontal className="h-4 w-4 text-[#6B6258]" aria-hidden="true" />
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
                          <button
                            type="button"
                            onClick={() => deleteDeck(deck.id, deck.name)}
                            className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xóa bộ từ</span>
                          </button>
                        </div>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
