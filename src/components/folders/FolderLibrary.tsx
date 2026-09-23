"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Book,
  ChevronDown,
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

type Composer = "deck" | "folder" | null;

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
  onReorder,
  onDelete,
}: {
  deck: FolderDeckSummary;
  folders: FolderDetail[];
  currentFolderId: string | null;
  onMove: (deckId: string, folderId: string | null) => void;
  onReorder?: (direction: "up" | "down") => void;
  onDelete?: (deck: FolderDeckSummary) => void;
}) {
  const isDue = deck.dueTodayCount > 0;
  const summary = isDue ? `${deck.dueTodayCount} thẻ cần ôn` : `${deck.totalCards} thẻ`;

  return (
    <li className="wn-tile flex min-w-0 flex-col justify-between gap-4 p-3.5">
      <Link
        href={`/decks/${deck.id}`}
        className="group flex min-w-0 items-start gap-3 rounded-lg p-0.5 transition-transform active:translate-x-0.5"
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

        <details className="relative">
          <summary
            aria-label={`Tùy chọn cho ${deck.name}`}
            className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
          >
            <MoreHorizontal className="h-4 w-4 text-[#6B6258]" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3 shadow-[3px_3px_0px_#221C16]">
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
            {onReorder ? (
              <div className="mt-2.5 flex gap-2 border-t border-[#DCD3C5] pt-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    const details = e.currentTarget.closest("details");
                    if (details) details.removeAttribute("open");
                    onReorder("up");
                  }}
                  className="brick-button-secondary flex-1 py-2 text-xs font-bold"
                >
                  Lên
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const details = e.currentTarget.closest("details");
                    if (details) details.removeAttribute("open");
                    onReorder("down");
                  }}
                  className="brick-button-secondary flex-1 py-2 text-xs font-bold"
                >
                  Xuống
                </button>
              </div>
            ) : null}
            {onDelete ? (
              <div className="mt-2.5 border-t border-[#DCD3C5] pt-2.5">
                <button
                  type="button"
                  onClick={() => onDelete(deck)}
                  className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold"
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [composer, setComposer] = useState<Composer>(null);
  const [deckName, setDeckName] = useState("");
  const [deckFolderId, setDeckFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<FolderDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const openDeckComposer = (folderId: string | null = null) => {
    setDeckName("");
    setDeckFolderId(folderId);
    setComposer("deck");
  };

  const openFolderComposer = (folder?: FolderDetail) => {
    setFolderName(folder?.name ?? "");
    setEditingFolder(folder ?? null);
    setComposer("folder");
  };

  const closeComposer = () => {
    setComposer(null);
    setEditingFolder(null);
  };

  const createDeck = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deckName, folderId: deckFolderId }),
      });
      if (!response.ok) {
        toast.error("Không thể tạo bộ từ", { description: await responseError(response, "Thử lại.") });
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
        router.push(`/decks/${data.deck.id}`);
        return;
      }
      toast.error("Không thể tạo bộ từ", { description: "Thử lại." });
    } catch {
      toast.error("Không thể tạo bộ từ", { description: "Kiểm tra kết nối rồi thử lại." });
    }
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

  const deleteFolder = async (folder: FolderDetail) => {
    if (!window.confirm(`Xóa bộ sưu tập “${folder.name}”? Các bộ từ vẫn được giữ lại.`)) return;
    try {
      const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa bộ sưu tập", { description: await responseError(response, "Thử lại.") });
        return;
      }
      toast.success("Đã xóa bộ sưu tập");
      refresh();
    } catch {
      toast.error("Không thể xóa bộ sưu tập", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const deleteDeck = async (deck: FolderDeckSummary) => {
    if (!window.confirm(`Xóa bộ từ “${deck.name}”? Toàn bộ thẻ trong bộ từ này sẽ bị xóa.`)) return;
    try {
      const response = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa bộ từ", { description: await responseError(response, "Thử lại.") });
        return;
      }
      toast.success("Đã xóa bộ từ");
      refresh();
    } catch {
      toast.error("Không thể xóa bộ từ", { description: "Kiểm tra kết nối mạng rồi thử lại." });
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

  const reorderDeck = async (folder: FolderDetail, deckId: string, direction: "up" | "down") => {
    const currentIndex = folder.decks.findIndex((deck) => deck.id === deckId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= folder.decks.length) return;
    const deckIds = folder.decks.map((deck) => deck.id);
    [deckIds[currentIndex], deckIds[targetIndex]] = [deckIds[targetIndex], deckIds[currentIndex]];
    try {
      const response = await fetch(`/api/folders/${folder.id}/decks/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds }),
      });
      if (!response.ok) {
        toast.error("Không thể sắp xếp bộ từ", { description: await responseError(response, "Thử lại.") });
        return;
      }
      refresh();
    } catch {
      toast.error("Không thể sắp xếp bộ từ", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  return (
    <section className="wn-section" aria-labelledby="library-heading">
      {/* Top Header & Prominent Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="library-heading" className="text-2xl sm:text-3xl font-black tracking-tight text-[#221C16]">
          Thư viện
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openDeckComposer()}
            className="brick-button-primary px-3.5 py-2 text-xs sm:text-sm font-black"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Bộ từ</span>
          </button>
          <button
            type="button"
            onClick={() => openFolderComposer()}
            className="brick-button-secondary px-3.5 py-2 text-xs sm:text-sm font-black"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Bộ sưu tập</span>
          </button>
        </div>
      </div>

      {/* Composer Modal / Sheet */}
      {composer === "deck" ? (
        <form
          onSubmit={createDeck}
          className="brick-card wn-form-group bg-[#FFFDF9] p-4 sm:p-5"
          aria-label="Tạo bộ từ"
        >
          <div className="flex items-center gap-2 border-b-2 border-dashed border-[#DCD3C5] pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1.5px_1.5px_0px_#221C16]">
              <Plus className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
            </span>
            <h2 className="text-base font-black text-[#221C16]">Tạo bộ từ mới</h2>
          </div>
          <label className="wn-field-label">
            <span>Tên bộ từ</span>
            <input
              autoFocus
              required
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              placeholder="VD: 300 từ vựng cốt lõi..."
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Bộ sưu tập</span>
            <select
              value={deckFolderId ?? ""}
              onChange={(event) => setDeckFolderId(event.target.value || null)}
              className="wn-field"
            >
              <option value="">Không có (Bộ từ độc lập)</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <div className="wn-form-actions">
            <button disabled={isPending} className="brick-button-primary px-5 py-2 text-sm font-black">
              Tạo
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
          <h2 className="text-xl font-black text-[#221C16]">Chưa có bộ từ</h2>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => openDeckComposer()}
              className="brick-button-primary px-4 py-2.5 text-xs sm:text-sm font-black"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>+ Bộ từ</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Folders / Collections Grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        {folders.map((folder) => {
          const isExpanded = expanded.has(folder.id);
          const isDue = folder.progress.dueTodayCount > 0;
          const summary = isDue
            ? `${folder.progress.dueTodayCount} thẻ cần ôn`
            : `${folder.progress.deckCount} bộ từ`;

          return (
            <article key={folder.id} className="wn-primary-surface overflow-hidden bg-[#FFFDF9]">
              {/* Folder Top Bar */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b-2 border-[#221C16] bg-[#FEF3C7] p-3 sm:px-4">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    })
                  }
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Thu gọn" : "Mở"} ${folder.name}`}
                  className="wn-button wn-button-quiet wn-icon-button h-11 w-11 rounded-lg"
                >
                  <span className="sr-only">{isExpanded ? "Thu gọn" : "Mở"}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-[#221C16]" strokeWidth={2.5} />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-[#221C16]" strokeWidth={2.5} />
                  )}
                </button>

                <Link
                  href={`/folders/${folder.id}`}
                  className="group flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-transform active:translate-x-0.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
                    <Layers className="h-4 w-4 text-[#D97706]" strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate font-black text-[#221C16] group-hover:text-[#E06B43] sm:text-base">
                      {folder.name}
                    </span>
                    <span
                      className={`inline-block text-xs font-bold ${
                        isDue ? "text-[#E06B43]" : "text-[#6B6258]"
                      }`}
                    >
                      {summary}
                    </span>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => openDeckComposer(folder.id)}
                  aria-label={`Tạo bộ từ trong ${folder.name}`}
                  className="brick-button-secondary px-2.5 py-2 text-xs font-black"
                >
                  <Plus className="h-4 w-4 text-[#E06B43]" />
                  <span>Bộ từ</span>
                </button>

                <details className="relative">
                  <summary
                    aria-label={`Tùy chọn cho ${folder.name}`}
                    className="wn-icon-button flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
                  >
                    <MoreHorizontal className="h-4 w-4 text-[#6B6258]" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2 shadow-[3px_3px_0px_#221C16]">
                    <button
                      type="button"
                      onClick={() => openFolderComposer(folder)}
                      className="wn-button wn-button-quiet w-full justify-start text-xs font-bold"
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFolder(folder)}
                      className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </details>
              </div>

              {/* Expanded Deck List */}
              {isExpanded ? (
                <ul className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folder.decks.length === 0 ? (
                    <li className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm font-bold text-[#6B6258]">
                      <span>Chưa có bộ từ</span>
                      <button type="button" onClick={() => openDeckComposer(folder.id)} className="brick-button-primary px-3 py-2 text-xs font-black">
                        <Plus className="h-4 w-4" /> Bộ từ
                      </button>
                    </li>
                  ) : (
                    folder.decks.map((deck) => (
                      <DeckRow
                        key={deck.id}
                        deck={deck}
                        folders={folders}
                        currentFolderId={folder.id}
                        onMove={moveDeck}
                        onReorder={(direction) => reorderDeck(folder, deck.id, direction)}
                        onDelete={deleteDeck}
                      />
                    ))
                  )}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* Standalone Decks */}
      {uncategorizedDecks.length > 0 ? (
        <section className="wn-section pt-2" aria-labelledby="independent-decks-heading">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-full bg-[#E06B43]" />
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
    </section>
  );
}
