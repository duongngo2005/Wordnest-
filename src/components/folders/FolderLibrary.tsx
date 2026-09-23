"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  CheckCircle2,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  BookOpen,
} from "lucide-react";
import type { FolderDeckSummary, FolderDetail } from "@/services/vocabulary/folder-service";
import {
  FolderIcon,
  folderAppearanceOptions,
  folderColorOptions,
  getFolderColorClasses,
} from "./folder-presentation";
import { useToast } from "@/components/ui/ToastProvider";

interface FolderLibraryProps {
  folders: FolderDetail[];
  uncategorizedDecks: FolderDeckSummary[];
}

type FolderFormState = {
  name: string;
  description: string;
  icon: string;
  color: string;
};

const emptyFolderForm: FolderFormState = {
  name: "",
  description: "",
  icon: "book",
  color: "orange",
};

async function getResponseError(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => null);
  if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
    return data.error;
  }
  return fallback;
}

function DeckStatus({ deck }: { deck: FolderDeckSummary }) {
  if (deck.learningStatus === "COMPLETED") {
    return <span className="inline-flex items-center gap-1 text-[#15803D]"><CheckCircle2 className="w-3.5 h-3.5" /> Đã vào Review</span>;
  }
  if (deck.learningStatus === "IN_PROGRESS") {
    return <span className="inline-flex items-center gap-1 text-[#B45309]"><CircleDot className="w-3.5 h-3.5" /> Đang học</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[#6B6258]"><Circle className="w-3.5 h-3.5" /> Chưa bắt đầu</span>;
}

function DeckRow({
  deck,
  folders,
  currentFolderId,
  canReorder,
  onMove,
  onReorder,
}: {
  deck: FolderDeckSummary;
  folders: FolderDetail[];
  currentFolderId: string | null;
  canReorder: boolean;
  onMove: (deckId: string, folderId: string | null) => void;
  onReorder?: (direction: "up" | "down") => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#221C16]/15 py-3 first:border-t-0 sm:flex-row sm:items-center">
      <Link
        href={`/decks/${deck.id}`}
        className="min-w-0 flex-1 rounded-lg px-1 py-1 hover:bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-black text-[#221C16]">{deck.name}</span>
          {deck.dueTodayCount > 0 && (
            <span className="shrink-0 rounded-md border border-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-black text-[#92400E]">
              {deck.dueTodayCount} cần ôn
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-[#6B6258]">
          <DeckStatus deck={deck} />
          <span>{deck.knownCount}/{deck.totalCards} từ thuộc</span>
        </div>
      </Link>

      <details className="relative self-end sm:self-auto">
        <summary role="button" aria-label={`Quản lý ${deck.name}`} className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-bold text-[#6B6258] hover:bg-[#F4EFE6]">Quản lý</summary>
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-[#221C16]/14 bg-[#FFFDF9] p-2 shadow-lg">
          <label className="block text-[11px] font-bold text-[#6B6258]">Chuyển collection
            <select aria-label={`Chuyển ${deck.name} tới collection khác`} value={currentFolderId ?? ""} onChange={(event) => onMove(deck.id, event.target.value || null)} className="mt-1 w-full rounded-lg border border-[#221C16]/20 bg-white px-2 py-1.5 text-xs text-[#221C16]">
              <option value="">Chưa phân loại</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          {canReorder && onReorder ? <div className="mt-2 flex gap-1"><button type="button" onClick={() => onReorder("up")} className="rounded px-2 py-1 text-xs font-bold text-[#4A4036] hover:bg-[#F4EFE6]" aria-label={`Đưa ${deck.name} lên`}><ArrowUp className="mr-1 inline h-3.5 w-3.5" />Lên</button><button type="button" onClick={() => onReorder("down")} className="rounded px-2 py-1 text-xs font-bold text-[#4A4036] hover:bg-[#F4EFE6]" aria-label={`Đưa ${deck.name} xuống`}><ArrowDown className="mr-1 inline h-3.5 w-3.5" />Xuống</button></div> : null}
        </div>
      </details>
    </div>
  );
}

export function FolderLibrary({ folders, uncategorizedDecks }: FolderLibraryProps) {
  const router = useRouter();
  const toast = useToast();
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderFormState>(emptyFolderForm);
  const [editingFolder, setEditingFolder] = useState<FolderDetail | null>(null);
  const [deckFolderId, setDeckFolderId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [isPending, startTransition] = useTransition();

  const refreshLibrary = () => startTransition(() => router.refresh());

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const saveFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isEditing = Boolean(editingFolder);
    try {
      const response = await fetch(isEditing ? `/api/folders/${editingFolder?.id}` : "/api/folders", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(folderForm),
      });
      if (!response.ok) {
        toast.error("Không thể lưu collection", { description: await getResponseError(response, "Vui lòng thử lại.") });
        return;
      }
      toast.success(isEditing ? "Đã cập nhật collection" : "Đã tạo collection", { description: `“${folderForm.name}” đã sẵn sàng.` });
      setFolderForm(emptyFolderForm);
      setEditingFolder(null);
      setIsCreatingFolder(false);
      refreshLibrary();
    } catch {
      toast.error("Không thể lưu collection", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const deleteFolder = async (folder: FolderDetail) => {
    if (!window.confirm(`Xóa “${folder.name}”? Các bộ thẻ và flashcard sẽ được giữ lại trong mục Chưa phân loại.`)) return;
    try {
      const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Không thể xóa collection", { description: await getResponseError(response, "Vui lòng thử lại.") });
        return;
      }
      toast.success("Đã xóa collection", { description: "Các bộ thẻ được giữ trong mục Chưa phân loại." });
      refreshLibrary();
    } catch {
      toast.error("Không thể xóa collection", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const createDeckInFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deckFolderId) return;
    try {
      const response = await fetch(`/api/folders/${deckFolderId}/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeckName }),
      });
      if (!response.ok) {
        toast.error("Không thể tạo bộ thẻ", { description: await getResponseError(response, "Vui lòng thử lại.") });
        return;
      }
      const data: unknown = await response.json();
      toast.success("Đã tạo bộ thẻ", { description: `“${newDeckName}” đã được thêm vào collection.` });
      if (typeof data === "object" && data !== null && "deck" in data && typeof data.deck === "object" && data.deck !== null && "id" in data.deck && typeof data.deck.id === "string") {
        router.push(`/decks/${data.deck.id}`);
        return;
      }
      refreshLibrary();
    } catch {
      toast.error("Không thể tạo bộ thẻ", { description: "Kiểm tra kết nối rồi thử lại." });
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
        toast.error("Không thể chuyển bộ thẻ", { description: await getResponseError(response, "Vui lòng thử lại.") });
        return;
      }
      toast.success(folderId ? "Đã chuyển bộ thẻ vào collection" : "Đã chuyển bộ thẻ ra ngoài collection");
      refreshLibrary();
    } catch {
      toast.error("Không thể chuyển bộ thẻ", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const reorderDeck = async (folder: FolderDetail, deckId: string, direction: "up" | "down") => {
    const currentIndex = folder.decks.findIndex((deck) => deck.id === deckId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= folder.decks.length) return;

    const deckIds = folder.decks.map((deck) => deck.id);
    [deckIds[currentIndex], deckIds[targetIndex]] = [deckIds[targetIndex], deckIds[currentIndex]];
    try {
      const response = await fetch(`/api/folders/${folder.id}/decks/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds }),
      });
      if (!response.ok) {
        toast.error("Không thể sắp xếp bộ thẻ", { description: await getResponseError(response, "Vui lòng thử lại.") });
        return;
      }
      toast.success("Đã sắp xếp bộ thẻ");
      refreshLibrary();
    } catch {
      toast.error("Không thể sắp xếp bộ thẻ", { description: "Kiểm tra kết nối rồi thử lại." });
    }
  };

  const openEditor = (folder: FolderDetail) => {
    setFolderForm({
      name: folder.name,
      description: folder.description ?? "",
      icon: folder.icon,
      color: folder.color,
    });
    setEditingFolder(folder);
    setIsCreatingFolder(true);
  };

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#221C16] sm:text-2xl">
            <Layers className="w-5 h-5 text-[#E06B43]" /> Thư viện học
          </h2>
          <p className="mt-1 text-xs font-medium text-[#6B6258]">Sắp xếp các bộ từ theo sách, khóa học hoặc lộ trình của bạn.</p>
        </div>
        <button
          type="button"
          onClick={() => { setFolderForm(emptyFolderForm); setEditingFolder(null); setIsCreatingFolder(true); }}
          className="brick-button-secondary px-3 py-2 text-xs font-black gap-1.5"
        >
          <FolderPlus className="w-4 h-4 text-[#E06B43]" /> Tạo collection
        </button>
      </div>

      {isCreatingFolder && (
        <form onSubmit={saveFolder} className="brick-card space-y-3 bg-[#FFFDF9] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-[#221C16]">{editingFolder ? "Chỉnh sửa collection" : "Learning collection mới"}</h3>
            <button type="button" onClick={() => { setIsCreatingFolder(false); setEditingFolder(null); }} className="text-xs font-bold text-[#6B6258] hover:text-[#221C16]">Hủy</button>
          </div>
          <input aria-label="Tên learning collection" required value={folderForm.name} onChange={(event) => setFolderForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="#30 Days Vocab TOEIC" className="w-full rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] px-3 py-2.5 text-sm font-bold" />
          <textarea aria-label="Mô tả learning collection" value={folderForm.description} onChange={(event) => setFolderForm((previous) => ({ ...previous, description: event.target.value }))} placeholder="Mô tả ngắn (tùy chọn)" rows={2} className="w-full rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] px-3 py-2.5 text-sm font-medium" />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-[#6B6258]">Biểu tượng<select value={folderForm.icon} onChange={(event) => setFolderForm((previous) => ({ ...previous, icon: event.target.value }))} className="mt-1 w-full rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] p-2 text-sm text-[#221C16]">{folderAppearanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="text-xs font-bold text-[#6B6258]">Màu sắc<select value={folderForm.color} onChange={(event) => setFolderForm((previous) => ({ ...previous, color: event.target.value }))} className="mt-1 w-full rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] p-2 text-sm text-[#221C16]">{folderColorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <button disabled={isPending} className="brick-button-primary px-4 py-2 text-xs font-black">{isPending ? "Đang cập nhật..." : editingFolder ? "Lưu thay đổi" : "Tạo collection"}</button>
        </form>
      )}

      <div className="space-y-3">
        {folders.map((folder) => {
          const expanded = expandedFolderIds.has(folder.id);
          const colors = getFolderColorClasses(folder.color);
          const nextDeck = folder.decks.find((deck) => deck.learningStatus !== "COMPLETED");
          const continueHref = nextDeck ? `/decks/${nextDeck.id}/study` : `/folders/${folder.id}/review`;
          return (
            <article key={folder.id} className={`brick-card overflow-hidden bg-[#FFFDF9] ${colors.border}`}>
              <div className="flex items-start gap-2 p-4 sm:p-5">
                <button type="button" onClick={() => toggleFolder(folder.id)} aria-expanded={expanded} aria-label={`${expanded ? "Thu gọn" : "Mở"} ${folder.name}`} className="mt-0.5 rounded p-1 text-[#6B6258] hover:bg-[#EAE3D2]">
                  {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/folders/${folder.id}`} className="flex min-w-0 items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] ${colors.badge}`}><FolderIcon icon={folder.icon} className={`w-5 h-5 ${colors.icon}`} /></span>
                      <span className="min-w-0"><span className="block truncate text-base font-black text-[#221C16] sm:text-lg">{folder.name}</span><span className="mt-0.5 block text-[11px] font-bold text-[#6B6258]">{folder.progress.completedDecks}/{folder.progress.deckCount} bộ vào Review · {folder.progress.knownCount}/{folder.progress.totalCards} thẻ Review</span></span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <details className="relative">
                        <summary role="button" className="cursor-pointer rounded-lg p-2 text-[#6B6258] hover:bg-[#F4EFE6]" aria-label={`Quản lý ${folder.name}`}><MoreHorizontal className="h-4 w-4" /></summary>
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-[#221C16]/14 bg-[#FFFDF9] p-1.5 shadow-lg">
                          <button type="button" aria-label={`Tạo bộ thẻ trong ${folder.name}`} onClick={() => { setDeckFolderId(folder.id); setNewDeckName(""); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#221C16] hover:bg-[#F4EFE6]"><Plus className="h-4 w-4" /> Tạo bộ thẻ</button>
                          <button type="button" onClick={() => openEditor(folder)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#221C16] hover:bg-[#F4EFE6]"><Pencil className="h-4 w-4" /> Sửa collection</button>
                          <button type="button" onClick={() => deleteFolder(folder)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#B42318] hover:bg-[#FDECEA]"><Trash2 className="h-4 w-4" /> Xóa collection</button>
                        </div>
                      </details>
                    </div>
                  </div>
                  {folder.description && <p className="mt-2 text-xs font-medium text-[#6B6258]">{folder.description}</p>}
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-[#221C16] bg-[#FAF6EE] p-0.5"><div className="h-full rounded-full bg-[#E06B43]" style={{ width: `${folder.progress.masteryRate}%` }} /></div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-[#6B6258]"><span>{folder.progress.masteryRate}% vào Review</span><span>{folder.progress.dueTodayCount} thẻ cần ôn hôm nay</span></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={continueHref} className="brick-button-primary px-3 py-2 text-xs font-black gap-1.5"><BookOpen className="w-3.5 h-3.5" /> {nextDeck ? "Tiếp tục học" : "Ôn collection"}</Link>
                    {folder.progress.dueTodayCount > 0 ? <Link href={`/folders/${folder.id}/review`} className="px-2 py-2 text-xs font-bold text-[#6B6258] hover:text-[#221C16]"><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Ôn {folder.progress.dueTodayCount} thẻ</Link> : null}
                  </div>
                </div>
              </div>

              {deckFolderId === folder.id && (
                <form onSubmit={createDeckInFolder} className="border-t-2 border-[#221C16] bg-[#FEF3C7] p-3 sm:px-5">
                  <label className="block text-xs font-black text-[#221C16]">Tên ngày / bộ thẻ mới</label>
                  <div className="mt-2 flex gap-2"><input autoFocus required value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} placeholder="Ví dụ: Ngày 01" className="min-w-0 flex-1 rounded-lg border-2 border-[#221C16] bg-white px-3 py-2 text-sm font-bold" /><button className="brick-button-primary px-3 py-2 text-xs font-black">Tạo</button><button type="button" onClick={() => setDeckFolderId(null)} className="px-2 text-xs font-bold text-[#6B6258]">Hủy</button></div>
                </form>
              )}

              {expanded && (
                <div className="border-t-2 border-[#221C16] bg-[#FFFDF9] px-4 sm:px-5">
                  {folder.decks.length === 0 ? <p className="py-4 text-xs font-bold text-[#6B6258]">Chưa có bộ thẻ. Tạo “Ngày 01” hoặc thêm deck hiện có vào collection này.</p> : folder.decks.map((deck) => <DeckRow key={deck.id} deck={deck} folders={folders} currentFolderId={folder.id} canReorder onMove={moveDeck} onReorder={(direction) => reorderDeck(folder, deck.id, direction)} />)}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <article className="brick-card bg-[#FFFDF9] p-4 sm:p-5">
        <div className="flex items-center gap-2"><MoreHorizontal className="w-5 h-5 text-[#6B6258]" /><h3 className="text-base font-black text-[#221C16]">Deck chưa phân loại</h3><span className="rounded-full bg-[#EAE3D2] px-2 py-0.5 text-[11px] font-black text-[#4A4036]">{uncategorizedDecks.length}</span></div>
        <div className="mt-3">{uncategorizedDecks.length === 0 ? <p className="py-2 text-xs font-bold text-[#6B6258]">Tất cả bộ thẻ đã được sắp xếp vào learning collection.</p> : uncategorizedDecks.map((deck) => <DeckRow key={deck.id} deck={deck} folders={folders} currentFolderId={null} canReorder={false} onMove={moveDeck} />)}</div>
      </article>
    </section>
  );
}
