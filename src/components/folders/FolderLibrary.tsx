"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Book,
  ChevronRight,
  Folder as FolderIcon,
  Layers,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import type { FolderDeckSummary, FolderDetail } from "@/services/vocabulary/folder-service";
import { useToast } from "@/components/ui/ToastProvider";
import { WordNestMascot } from "@/components/ui/Mascot";

interface FolderLibraryProps {
  folders: FolderDetail[];
  uncategorizedDecks: FolderDeckSummary[];
}

type Composer = "folder" | null;

async function responseError(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => null);
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

function DeckRow({
  deck,
  folders,
  currentFolderId,
  onMove,
  onDelete,
}: {
  deck: FolderDeckSummary;
  folders: FolderDetail[];
  currentFolderId: string | null;
  onMove: (deckId: string, folderId: string | null) => void;
  onDelete?: (deck: FolderDeckSummary) => void;
}) {
  const isDue = deck.dueTodayCount > 0;
  const summary = isDue ? `${deck.dueTodayCount} thẻ cần ôn` : `${deck.totalCards} thẻ`;

  return (
    <li className="wn-tile relative flex min-w-0 flex-col justify-between gap-4 p-3.5 overflow-visible rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] border-t-[3px] border-t-[var(--accent)] shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 focus-within:z-30">
      <Link
        href={`/decks/${deck.id}`}
        className="group flex min-w-0 items-start gap-3 rounded-lg p-0.5 transition-transform active:translate-x-0.5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] shadow-[1.5px_1.5px_0px_#221C16]">
          <Book className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <span className="block truncate font-black text-[#221C16] group-hover:text-[var(--accent)] sm:text-base">
            {deck.name}
          </span>
          <span
            className={`inline-block text-xs font-bold ${
              isDue ? "text-[var(--accent)]" : "text-[#6B6258]"
            }`}
          >
            {summary}
          </span>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-dashed border-[#DCD3C5] pt-3">
        <Link
          href={`/decks/${deck.id}/study`}
          className={`px-3 py-2 text-xs font-black ${isDue ? "brick-button-primary" : "brick-button-secondary"}`}
        >
          Ôn tập
        </Link>

        <details className="relative wn-menu-details">
          <summary
            aria-label={`Tùy chọn cho ${deck.name}`}
            className="wn-icon-button relative z-50 flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
          >
            <MoreHorizontal className="h-4 w-4 text-[#6B6258]" aria-hidden="true" />
          </summary>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3 shadow-[3px_3px_0px_#221C16]">
            <label className="wn-field-label">
              <span>Chuyển bộ sưu tập</span>
              <select
                aria-label={`Chuyển ${deck.name} tới bộ sưu tập`}
                value={currentFolderId ?? ""}
                onChange={(event) => {
                  const details = event.currentTarget.closest("details");
                  if (details) details.removeAttribute("open");
                  onMove(deck.id, event.target.value || null);
                }}
                className="wn-field mt-1 text-xs"
              >
                <option value="">Không có</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            {onDelete ? (
              <div className="mt-2.5 border-t border-[#DCD3C5] pt-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                    onDelete(deck);
                  }}
                  className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa bộ từ</span>
                </button>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </li>
  );
}

export function FolderLibrary({ folders, uncategorizedDecks }: FolderLibraryProps) {
  const router = useRouter();
  const toast = useToast();
  const [composer, setComposer] = useState<Composer>(null);
  const [folderName, setFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<FolderDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const openFolderComposer = (folder?: FolderDetail) => {
    setFolderName(folder?.name ?? "");
    setEditingFolder(folder ?? null);
    setComposer("folder");
  };

  const closeComposer = () => {
    setComposer(null);
    setEditingFolder(null);
  };

  const saveFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isEditing = Boolean(editingFolder);
    try {
      const response = await fetch(isEditing ? `/api/folders/${editingFolder?.id}` : "/api/folders", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
      if (!response.ok) {
        toast.error("Không thể lưu bộ sưu tập", { description: await responseError(response, "Thử lại.") });
        return;
      }
      closeComposer();
      refresh();
    } catch {
      toast.error("Không thể lưu bộ sưu tập", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const [itemPendingDelete, setItemPendingDelete] = useState<
    | { type: "folder"; id: string; name: string }
    | { type: "deck"; id: string; name: string }
    | null
  >(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  useEffect(() => {
    if (!itemPendingDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeletingItem) {
        setItemPendingDelete(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemPendingDelete, isDeletingItem]);

  const deleteFolder = (folder: FolderDetail) => {
    setItemPendingDelete({ type: "folder", id: folder.id, name: folder.name });
  };

  const deleteDeck = (deck: FolderDeckSummary) => {
    setItemPendingDelete({ type: "deck", id: deck.id, name: deck.name });
  };

  const confirmDeleteItem = async () => {
    if (!itemPendingDelete) return;
    setIsDeletingItem(true);
    try {
      if (itemPendingDelete.type === "folder") {
        const response = await fetch(`/api/folders/${itemPendingDelete.id}`, { method: "DELETE" });
        if (!response.ok) {
          toast.error("Không thể xóa bộ sưu tập", { description: await responseError(response, "Thử lại.") });
          return;
        }
        toast.success(`Đã xóa bộ sưu tập “${itemPendingDelete.name}”`);
      } else {
        const response = await fetch(`/api/decks/${itemPendingDelete.id}`, { method: "DELETE" });
        if (!response.ok) {
          toast.error("Không thể xóa bộ từ", { description: await responseError(response, "Thử lại.") });
          return;
        }
        toast.success(`Đã xóa bộ từ “${itemPendingDelete.name}”`);
      }
      setItemPendingDelete(null);
      refresh();
    } catch {
      toast.error(
        itemPendingDelete.type === "folder" ? "Không thể xóa bộ sưu tập" : "Không thể xóa bộ từ",
        { description: "Kiểm tra kết nối rồi thử lại." }
      );
    } finally {
      setIsDeletingItem(false);
    }
  };

  const moveDeck = async (deckId: string, folderId: string | null) => {
    try {
      const response = await fetch(`/api/decks/${deckId}/folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!response.ok) {
        toast.error("Không thể chuyển bộ từ", { description: await responseError(response, "Thử lại.") });
        return;
      }
      refresh();
    } catch {
      toast.error("Không thể chuyển bộ từ", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  return (
    <section className="wn-section" aria-labelledby="library-heading">
      {/* Top Header & Collection Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="library-heading" className="text-2xl sm:text-3xl font-black tracking-tight text-[#221C16]">
          Thư viện
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openFolderComposer()}
            className="brick-button-primary px-3.5 py-2 text-xs sm:text-sm font-black"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Bộ sưu tập</span>
          </button>
        </div>
      </div>

      {composer === "folder" ? (
        <form
          onSubmit={saveFolder}
          className="brick-card wn-form-group bg-[#FFFDF9] p-4 sm:p-5"
          aria-label={editingFolder ? "Đổi tên bộ sưu tập" : "Tạo bộ sưu tập"}
        >
          <div className="flex items-center gap-2 border-b-2 border-dashed border-[#DCD3C5] pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#DDF5F1] shadow-[1.5px_1.5px_0px_#221C16]">
              <FolderIcon className="h-4 w-4 text-[#0D9488]" strokeWidth={2.5} />
            </span>
            <h2 className="text-base font-black text-[#221C16]">
              {editingFolder ? "Đổi tên bộ sưu tập" : "Tạo bộ sưu tập"}
            </h2>
          </div>
          <label className="wn-field-label">
            <span>Tên bộ sưu tập</span>
            <input
              autoFocus
              required
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="VD: Oxford 3000, IELTS Topic..."
              className="wn-field"
            />
          </label>
          <div className="wn-form-actions">
            <button disabled={isPending} className="brick-button-primary px-5 py-2 text-sm font-black">
              Lưu
            </button>
            <button
              type="button"
              onClick={closeComposer}
              className="brick-button-secondary px-4 py-2 text-sm font-bold"
            >
              Hủy
            </button>
          </div>
        </form>
      ) : null}

      {/* Empty State */}
      {folders.length === 0 && uncategorizedDecks.length === 0 ? (
        <div className="brick-card flex flex-col items-center justify-center p-8 text-center bg-[#FFFDF9] space-y-4">
          <WordNestMascot mood="reading" size={96} />
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-[#221C16]">Chưa có bộ sưu tập</h2>
            <p className="text-sm font-semibold leading-relaxed text-[#6B6258]">
              Tạo bộ sưu tập trước, rồi thêm bộ từ bên trong.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => openFolderComposer()}
              className="brick-button-primary px-4 py-2.5 text-xs sm:text-sm font-black"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>+ Bộ sưu tập</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Folders / Collections Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {folders.map((folder) => {
          const isDue = folder.progress.dueTodayCount > 0;
          const summary = isDue
            ? `${folder.progress.dueTodayCount} thẻ cần ôn`
            : `${folder.progress.deckCount} bộ từ`;

          return (
            <article
              key={folder.id}
              data-collection-card={folder.id}
              className="wn-primary-surface relative scroll-mt-20 overflow-visible rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] border-t-4 border-t-[#D97706] shadow-[3px_3px_0px_#221C16] transition-all hover:shadow-[4px_4px_0px_#221C16] focus-within:z-30"
            >
              {/* Home stays collection-first: opening a collection reveals its decks. */}
              <div className="lg:hidden">
                <div className="rounded-[calc(var(--radius-lg)-2px)] bg-[#F8F4EC] p-3 sm:px-4">
                  <Link
                    href={`/folders/${folder.id}`}
                    aria-label={`Mở bộ sưu tập ${folder.name}`}
                    className="group flex min-w-0 items-center justify-between gap-2.5 rounded-lg p-1 transition-transform active:translate-x-0.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
                        <Layers className="h-4 w-4 text-[#D97706]" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-black text-[#221C16] group-hover:text-[var(--accent)] sm:text-base">
                          {folder.name}
                        </span>
                        <span className={`inline-block text-xs font-bold ${isDue ? "text-[var(--accent)]" : "text-[#6B6258]"}`}>
                          {summary}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#8C8275] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" strokeWidth={2.5} />
                  </Link>
                </div>
              </div>

              {/* Desktop: Study binder folder with organic metrics. */}
              <div className="hidden min-h-44 flex-col p-5 lg:flex">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/folders/${folder.id}`}
                    aria-label={`Mở bộ sưu tập ${folder.name}`}
                    className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg transition-transform active:translate-x-0.5"
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1.5px_1.5px_0px_#221C16]">
                      <Layers className="h-5 w-5 text-[#D97706]" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-black uppercase tracking-wider text-[#8A5817]">Bộ sưu tập</span>
                      <span className="mt-0.5 block break-words text-xl font-black tracking-tight text-[#221C16] group-hover:text-[var(--accent-strong)]">
                        {folder.name}
                      </span>
                      {folder.description ? (
                        <span className="mt-1 block text-sm font-semibold leading-relaxed text-[#6B6258]">{folder.description}</span>
                      ) : null}
                    </span>
                  </Link>
                </div>

                {/* Organic Metrics & Status replacing the rigid 3-box strip */}
                <dl className="mt-auto flex items-center justify-between border-t border-dashed border-[#DCD3C5] pt-3 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#6B6258]">
                    <div>
                      <dt className="sr-only">Bộ thẻ</dt>
                      <dd>{folder.progress.deckCount} bộ thẻ</dd>
                    </div>
                    <span aria-hidden="true" className="text-[#C9BFB1]">·</span>
                    <div>
                      <dt className="sr-only">Từ vựng</dt>
                      <dd>{folder.progress.totalCards} từ</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="sr-only">Hôm nay</dt>
                    <dd>
                      {isDue ? (
                        <span className="wn-marker-amber text-xs font-black text-[var(--accent-strong)]">
                          {folder.progress.dueTodayCount} thẻ cần ôn
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-[#15803D]">
                          Không cần ôn
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>

      {/* Standalone Decks */}
      {uncategorizedDecks.length > 0 ? (
        <section className="wn-section pt-2" aria-labelledby="independent-decks-heading">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-full bg-[var(--accent)]" />
            <h2 id="independent-decks-heading" className="text-lg font-black text-[#221C16]">
              Bộ từ độc lập
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ul className="contents">
              {uncategorizedDecks.map((deck) => (
                <DeckRow
                  key={deck.id}
                  deck={deck}
                  folders={folders}
                  currentFolderId={null}
                  onMove={moveDeck}
                  onDelete={deleteDeck}
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Modal Toast Xác nhận Xóa */}
      {itemPendingDelete ? (
        <div
          role="presentation"
          className="wn-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#221C16]/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingItem) {
              setItemPendingDelete(null);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc"
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
                  id="delete-dialog-title"
                  className="mt-1 text-lg font-black text-[#221C16] leading-snug break-words"
                >
                  {itemPendingDelete.type === "folder"
                    ? `Xóa bộ sưu tập “${itemPendingDelete.name}”?`
                    : `Xóa bộ từ “${itemPendingDelete.name}”?`}
                </h3>
                <p
                  id="delete-dialog-desc"
                  className="mt-1.5 text-xs sm:text-sm font-semibold text-[#6B6258] leading-relaxed"
                >
                  {itemPendingDelete.type === "folder"
                    ? "Các bộ từ bên trong sẽ được giữ lại an toàn ở mục Chưa phân loại trong Thư viện."
                    : "Toàn bộ thẻ flashcard và tiến trình học trong bộ từ này sẽ bị xóa hoàn toàn. Hành động này không thể hoàn tác."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-dashed border-[#221C16]/15">
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setItemPendingDelete(null)}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] text-xs sm:text-sm font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] hover:bg-[#F4EFE6] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={confirmDeleteItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#B91C1C] bg-[#B91C1C] text-xs sm:text-sm font-black text-white shadow-[2px_2px_0px_#221C16] hover:bg-[#991B1B] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>
                  {isDeletingItem
                    ? "Đang xóa..."
                    : itemPendingDelete.type === "folder"
                    ? "Xóa bộ sưu tập"
                    : "Xóa bộ từ"}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
