"use client";

import { useEffect, useState } from "react";
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

  const [deckPendingDelete, setDeckPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  useEffect(() => {
    if (!deckPendingDelete && !isConfirmingDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isDeletingDeck && deckPendingDelete) {
          setDeckPendingDelete(null);
        }
        if (!isDeleting && isConfirmingDelete) {
          setIsConfirmingDelete(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deckPendingDelete, isDeletingDeck, isConfirmingDelete, isDeleting]);

  const confirmDeleteDeck = async () => {
    if (!deckPendingDelete) return;
    setIsDeletingDeck(true);
    try {
      const response = await fetch(`/api/decks/${deckPendingDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa bộ từ", { description: "Thử lại sau." });
        return;
      }
      toast.success(`Đã xóa bộ từ “${deckPendingDelete.name}”`);
      setDeckPendingDelete(null);
      router.refresh();
    } catch {
      toast.error("Không thể xóa bộ từ", { description: "Kiểm tra kết nối mạng rồi thử lại." });
    } finally {
      setIsDeletingDeck(false);
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

      {/* Collection Header Card (Binder Section Metaphor) */}
      <section className="brick-card relative overflow-visible bg-[#FFFDF9] border-l-[6px] border-l-[#D97706] focus-within:z-30">
        <div className="flex items-center justify-between rounded-t-[calc(var(--radius-lg)-2px)] border-b-2 border-dashed border-[#DCD3C5] bg-[#F8F4EC] px-4 py-3 sm:px-5">
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
              <span className="wn-marker-amber text-xs font-black text-[#9A3412]">
                {dueCount} cần ôn
              </span>
            ) : (
              <span className="text-xs font-bold text-[#6B6258]">
                {folder.decks.length} bộ từ
              </span>
            )}

            <details className="relative wn-menu-details">
              <summary
                aria-label={`Tùy chọn cho ${folder.name}`}
                className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
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
              <div className="absolute right-0 top-full z-50 mt-1.5 grid w-48 gap-1 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
                <Link
                  href={`/progress/folders/${folder.id}`}
                  className="wn-button wn-button-quiet justify-start text-xs font-bold"
                >
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  <span>Tiến độ</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                    setIsConfirmingDelete(true);
                  }}
                  className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold cursor-pointer"
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

            {/* Visible primary action: the icon supplies the plus sign. */}
            <button
              type="button"
              onClick={() => setIsCreatingDeck((prev) => !prev)}
              aria-label="Tạo bộ từ"
              className="brick-button-secondary px-4 py-2 text-xs sm:text-sm font-black"
            >
              <Plus className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
              <span>Bộ từ</span>
            </button>
          </div>
        </div>
      </section>

      {/* Modal Toast Xác nhận Xóa Bộ sưu tập */}
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
            aria-labelledby="delete-folder-dialog-title"
            aria-describedby="delete-folder-dialog-desc"
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
                  id="delete-folder-dialog-title"
                  className="mt-1 text-lg font-black text-[#221C16] leading-snug break-words"
                >
                  Xóa bộ sưu tập &ldquo;{folder.name}&rdquo;?
                </h3>
                <p
                  id="delete-folder-dialog-desc"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-[#6B6258] leading-relaxed"
                >
                  Các bộ từ bên trong sẽ được giữ lại an toàn ở mục Chưa phân loại trong Thư viện.
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
                onClick={deleteFolder}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#B91C1C] bg-[#B91C1C] text-xs sm:text-sm font-black text-white shadow-[2px_2px_0px_#221C16] hover:bg-[#991B1B] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? "Đang xóa..." : "Xóa bộ sưu tập"}</span>
              </button>
            </div>
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

        <div className="brick-card bg-[#FFFDF9] p-4 sm:p-5">
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
            <ul className="grid gap-3 md:grid-cols-2">
              {folder.decks.map((deck) => {
                const isDue = deck.dueTodayCount > 0;
                return (
                  <li key={deck.id} className="relative min-w-0 overflow-visible focus-within:z-30">
                    <Link
                      href={`/decks/${deck.id}`}
                      className="group flex min-h-36 min-w-0 flex-col rounded-xl border-2 border-[#221C16] border-t-4 border-t-[#E06B43] bg-[#FAF6EE] p-4 pr-14 shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#E06B43] active:translate-y-0.5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
                          <Book className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black text-[#221C16] group-hover:text-[#E06B43]">
                            {deck.name}
                          </h3>
                          {deck.description ? (
                            <p className="mt-0.5 line-clamp-1 text-xs font-semibold leading-relaxed text-[#6B6258]">
                              {deck.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t-2 border-dashed border-[#DCD3C5] pt-2.5 text-xs font-bold text-[#6B6258]">
                        <span>{deck.totalCards} thẻ</span>
                        {deck.newCount > 0 ? (
                          <>
                            <span aria-hidden="true" className="text-[#C9BFB1]">•</span>
                            <span>{deck.newCount} mới</span>
                          </>
                        ) : null}
                        {deck.learningCount > 0 ? (
                          <>
                            <span aria-hidden="true" className="text-[#C9BFB1]">•</span>
                            <span>{deck.learningCount} đang học</span>
                          </>
                        ) : null}
                        {isDue ? (
                          <>
                            <span aria-hidden="true" className="text-[#C9BFB1]">•</span>
                            <span className="wn-marker-amber text-[#9A3412] font-black">
                              {deck.dueTodayCount} cần ôn
                            </span>
                          </>
                        ) : null}
                      </div>
                    </Link>

                    <details className="absolute right-3 top-3 wn-menu-details">
                      <summary
                        aria-label={`Tùy chọn cho ${deck.name}`}
                        className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
                      >
                        <MoreHorizontal className="h-4 w-4 text-[#6B6258]" aria-hidden="true" />
                      </summary>
                      <div
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                      />
                      <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            setDeckPendingDelete({ id: deck.id, name: deck.name });
                          }}
                          className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Xóa bộ từ</span>
                        </button>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Modal Toast Xác nhận Xóa Bộ từ */}
      {deckPendingDelete ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#221C16]/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingDeck) {
              setDeckPendingDelete(null);
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
                  Xóa bộ từ &ldquo;{deckPendingDelete.name}&rdquo;?
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
                disabled={isDeletingDeck}
                onClick={() => setDeckPendingDelete(null)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] text-xs sm:text-sm font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] hover:bg-[#F4EFE6] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingDeck}
                onClick={confirmDeleteDeck}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#B91C1C] bg-[#B91C1C] text-xs sm:text-sm font-black text-white shadow-[2px_2px_0px_#221C16] hover:bg-[#991B1B] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeletingDeck ? "Đang xóa..." : "Xóa bộ từ"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
