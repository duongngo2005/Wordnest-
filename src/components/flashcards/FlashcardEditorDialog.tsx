"use client";
/* eslint-disable @next/next/no-img-element -- user-provided image URLs are not configured for Next/Image. */

import { useEffect, useRef, useState } from "react";
import { Edit3, Search, X } from "lucide-react";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { useToast } from "@/components/ui/ToastProvider";
import { ImagePickerModal } from "./ImagePickerModal";
import type { FlashcardData } from "./FlashcardItem";

export type FlashcardEditDraft = Pick<
  FlashcardData,
  | "term"
  | "meaningVi"
  | "definitionEn"
  | "ipa"
  | "partOfSpeech"
  | "cefr"
  | "exampleEn"
  | "exampleVi"
  | "imageUrl"
  | "imageSource"
  | "imageSearchQuery"
  | "imagePageUrl"
  | "imageAuthor"
  | "imageLicense"
>;

export function flashcardEditDraftFrom(card: FlashcardData): FlashcardEditDraft {
  return {
    term: card.term,
    meaningVi: card.meaningVi,
    definitionEn: card.definitionEn,
    ipa: card.ipa,
    partOfSpeech: card.partOfSpeech,
    cefr: card.cefr,
    exampleEn: card.exampleEn,
    exampleVi: card.exampleVi,
    imageUrl: card.imageUrl,
    imageSource: card.imageSource,
    imageSearchQuery: card.imageSearchQuery,
    imagePageUrl: card.imagePageUrl ?? null,
    imageAuthor: card.imageAuthor ?? null,
    imageLicense: card.imageLicense ?? null,
  };
}

interface FlashcardEditorDialogProps {
  card: FlashcardData;
  onClose: () => void;
  onSave: (draft: FlashcardEditDraft) => Promise<void>;
}

export function FlashcardEditorDialog({ card, onClose, onSave }: FlashcardEditorDialogProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<FlashcardEditDraft>(() => flashcardEditDraftFrom(card));
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const termInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => termInputRef.current?.focus(), 0);

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", trapFocus);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const updateDraft = <Key extends keyof FlashcardEditDraft>(
    key: Key,
    value: FlashcardEditDraft[Key]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const updateImage = async (image: {
    imageUrl: string;
    imageSource?: string | null;
    imageSearchQuery?: string | null;
    imagePageUrl?: string | null;
    imageAuthor?: string | null;
  }) => {
    setImageError(false);
    setDraft((current) => ({
      ...current,
      imageUrl: image.imageUrl,
      imageSource: image.imageSource ?? "MANUAL",
      imageSearchQuery: image.imageSearchQuery ?? null,
      imagePageUrl: image.imagePageUrl ?? null,
      imageAuthor: image.imageAuthor ?? null,
      imageLicense: null,
    }));
  };

  const removeImage = async () => {
    setDraft((current) => ({
      ...current,
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      imagePageUrl: null,
      imageAuthor: null,
      imageLicense: null,
    }));
  };

  const save = async () => {
    if (!draft.term.trim() || !draft.meaningVi.trim()) return;

    setIsSaving(true);
    try {
      await onSave(draft);
      toast.success("Đã lưu thẻ");
      onClose();
    } catch (error) {
      toast.error("Không thể lưu thẻ", {
        description: error instanceof Error ? error.message : "Thử lại.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="wn-modal-sheet-backdrop fixed inset-0 z-50 flex items-end bg-[#221C16]/35 p-0 sm:items-center sm:justify-center sm:p-6">
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`edit-card-${card.id}`}
        className="brick-card flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none border-2 border-[#221C16] bg-[#FFFDF9] shadow-[4px_4px_0px_#221C16] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-dashed border-[#DCD3C5] bg-[#FEF8ED] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1.5px_1.5px_0px_#221C16]">
              <Edit3 className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
            </span>
            <h2 id={`edit-card-${card.id}`} className="text-base font-black text-[#221C16]">Chỉnh sửa thẻ</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chỉnh sửa"
            className="wn-button wn-button-quiet wn-icon-button"
          >
            <X className="h-5 w-5 text-[#6B6258]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <section className="wn-form-group">
            <h3 className="text-sm font-black text-[#221C16]">Cơ bản</h3>
            <label className="wn-field-label">
              <span>Từ</span>
              <input
                ref={termInputRef}
                value={draft.term}
                onChange={(event) => updateDraft("term", event.target.value)}
                className="wn-field"
              />
            </label>
            <label className="wn-field-label">
              <span>Nghĩa tiếng Việt</span>
              <input
                value={draft.meaningVi}
                onChange={(event) => updateDraft("meaningVi", event.target.value)}
                className="wn-field"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="wn-field-label">
                <span>Từ loại</span>
                <select
                  value={draft.partOfSpeech ?? ""}
                  onChange={(event) => updateDraft("partOfSpeech", event.target.value || null)}
                  className="wn-field"
                >
                  <option value="">Không chọn</option>
                  {draft.partOfSpeech && !PART_OF_SPEECH_OPTIONS.includes(draft.partOfSpeech as (typeof PART_OF_SPEECH_OPTIONS)[number]) ? (
                    <option value={draft.partOfSpeech}>{draft.partOfSpeech}</option>
                  ) : null}
                  {PART_OF_SPEECH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="wn-field-label">
                <span>CEFR</span>
                <select
                  value={draft.cefr ?? ""}
                  onChange={(event) => updateDraft("cefr", event.target.value || null)}
                  className="wn-field"
                >
                  <option value="">Không chọn</option>
                  {draft.cefr && !CEFR_LEVELS.includes(draft.cefr as (typeof CEFR_LEVELS)[number]) ? (
                    <option value={draft.cefr}>{draft.cefr}</option>
                  ) : null}
                  {CEFR_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="wn-form-group">
            <h3 className="text-sm font-black text-[#221C16]">Phát âm</h3>
            <label className="wn-field-label">
              <span>IPA</span>
              <input
                value={draft.ipa ?? ""}
                onChange={(event) => updateDraft("ipa", event.target.value || null)}
                placeholder="/.../"
                className="wn-field font-mono"
              />
            </label>
          </section>

          <section className="wn-form-group">
            <h3 className="text-sm font-black text-[#221C16]">Ngữ cảnh</h3>
            <label className="wn-field-label">
              <span>Định nghĩa tiếng Anh</span>
              <textarea value={draft.definitionEn ?? ""} onChange={(event) => updateDraft("definitionEn", event.target.value || null)} rows={2} className="wn-field" />
            </label>
            <label className="wn-field-label">
              <span>Ví dụ tiếng Anh</span>
              <textarea value={draft.exampleEn ?? ""} onChange={(event) => updateDraft("exampleEn", event.target.value || null)} rows={2} className="wn-field" />
            </label>
            <label className="wn-field-label">
              <span>Dịch ví dụ</span>
              <textarea value={draft.exampleVi ?? ""} onChange={(event) => updateDraft("exampleVi", event.target.value || null)} rows={2} className="wn-field" />
            </label>
          </section>

          <section className="wn-form-group">
            <h3 className="text-sm font-black text-[#221C16]">Hình ảnh</h3>
            {draft.imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border-2 border-[#221C16]">
                <img src={draft.imageUrl} alt="" className="max-h-48 w-full object-cover" onError={() => setImageError(true)} />
              </div>
            ) : null}
            {imageError ? <p className="text-xs font-bold text-[#B91C1C]">Không thể tải ảnh hiện tại.</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsPickerOpen(true)} className="brick-button-secondary px-3 py-1.5 text-xs font-black">
                <Search className="h-4 w-4" />
                <span>Tìm hoặc tải ảnh</span>
              </button>
              {draft.imageUrl ? <button type="button" onClick={removeImage} className="wn-button-quiet px-3 py-1.5 text-xs font-bold">Gỡ ảnh</button> : null}
            </div>
          </section>
        </div>

        <div className="wn-form-actions wn-modal-footer-safe shrink-0 bg-[#FFFDF9] px-4 sm:px-5">
          <button type="button" onClick={() => void save()} disabled={isSaving} className="brick-button-primary px-5 py-2 text-sm font-black">
            {isSaving ? "Đang lưu..." : "Lưu"}
          </button>
          <button type="button" onClick={onClose} className="brick-button-secondary px-4 py-2 text-sm font-bold">Hủy</button>
        </div>

        {isPickerOpen ? (
          <ImagePickerModal
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            term={draft.term}
            currentImageUrl={draft.imageUrl}
            initialQuery={draft.imageSearchQuery}
            onSelectImage={updateImage}
            onRemoveImage={removeImage}
          />
        ) : null}
      </article>
    </div>
  );
}
