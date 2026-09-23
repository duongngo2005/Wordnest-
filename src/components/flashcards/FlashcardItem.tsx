"use client";
/* eslint-disable @next/next/no-img-element -- user-provided image URLs are not configured for Next/Image. */

import { useEffect, useRef, useState } from "react";
import { Edit3, Image as ImageIcon, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { PronounceButton } from "./PronounceButton";
import { ImagePickerModal } from "./ImagePickerModal";
import { SerializedPracticeEvidenceSummary } from "@/services/vocabulary";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { useToast } from "@/components/ui/ToastProvider";

export interface FlashcardData {
  id: string;
  deckId: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  definitionEn: string | null;
  ipa: string | null;
  partOfSpeech: string | null;
  cefr: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageSearchQuery: string | null;
  imagePageUrl?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  status: FlashcardStatus;
  due?: Date | string;
  lastReviewAt?: Date | string | null;
  reps?: number;
  lapses?: number;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  learningSteps?: number;
  state?: number;
  schedulerVersion?: number;
}

interface FlashcardItemProps {
  card: FlashcardData;
  evidence?: SerializedPracticeEvidenceSummary | null;
  onDelete: (cardId: string) => Promise<void>;
  onUpdate?: (cardId: string, updated: Partial<FlashcardData>) => Promise<void>;
}

type Draft = Pick<
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

function draftFrom(card: FlashcardData): Draft {
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

export function FlashcardItem({ card, evidence, onDelete, onUpdate }: FlashcardItemProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(card));
  const editorRef = useRef<HTMLElement | null>(null);
  const editorTermRef = useRef<HTMLInputElement | null>(null);

  const evidenceLabel =
    !evidence || evidence.classification === "NO_EVIDENCE"
      ? null
      : evidence.classification === "RECENTLY_SUCCESSFUL"
      ? "Thực hành tốt"
      : evidence.classification === "INSUFFICIENT_DATA"
      ? "Cần thêm dữ liệu"
      : evidence.explanationVi;

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const startEdit = () => {
    setDraft(draftFrom(card));
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => editorTermRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsEditing(false);
      }
      if (event.key !== "Tab" || !editorRef.current) return;
      const focusable = editorRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [isEditing]);

  const selectImage = async (image: {
    imageUrl: string;
    imageSource?: string | null;
    imageSearchQuery?: string | null;
    imagePageUrl?: string | null;
    imageAuthor?: string | null;
  }) => {
    const media: Partial<FlashcardData> = {
      imageUrl: image.imageUrl,
      imageSource: image.imageSource ?? "MANUAL",
      imageSearchQuery: image.imageSearchQuery ?? null,
      imagePageUrl: image.imagePageUrl ?? null,
      imageAuthor: image.imageAuthor ?? null,
      imageLicense: null,
    };
    setImageError(false);
    if (isEditing) {
      setDraft((current) => ({ ...current, ...media }));
      return;
    }
    if (!onUpdate) return;
    await onUpdate(card.id, media);
    toast.success("Đã cập nhật hình ảnh");
  };

  const removeImage = async () => {
    const media: Partial<FlashcardData> = {
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: null,
      imagePageUrl: null,
      imageAuthor: null,
      imageLicense: null,
    };
    if (isEditing) {
      setDraft((current) => ({ ...current, ...media }));
      return;
    }
    if (!onUpdate) return;
    await onUpdate(card.id, media);
    toast.success("Đã xóa hình ảnh");
  };

  const save = async () => {
    if (!draft.term.trim() || !draft.meaningVi.trim() || !onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate(card.id, draft);
      setIsEditing(false);
      toast.success("Đã lưu thẻ");
    } catch (error) {
      toast.error("Không thể lưu thẻ", {
        description: error instanceof Error ? error.message : "Thử lại.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setIsDeleting(true);
    try {
      await onDelete(card.id);
    } catch {
      setIsDeleting(false);
      toast.error("Không thể xóa thẻ", { description: "Thử lại." });
    }
  };

  if (isEditing) {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-[#221C16]/35 p-0 sm:items-center sm:justify-center sm:p-6">
      <article
        ref={editorRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`edit-card-${card.id}`}
        className="wn-primary-surface flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none bg-[#FFFDF9] sm:rounded-[var(--radius-lg)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-dashed border-[#DCD3C5] bg-[#FEF3C7] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1.5px_1.5px_0px_#221C16]">
              <Edit3 className="h-4 w-4 text-[#E06B43]" strokeWidth={2.5} />
            </span>
            <h3 id={`edit-card-${card.id}`} className="text-base font-black text-[#221C16]">Chỉnh sửa thẻ</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            aria-label="Đóng chỉnh sửa"
            className="wn-button wn-button-quiet wn-icon-button"
          >
            <X className="h-5 w-5 text-[#6B6258]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <section className="wn-form-group">
          <h4 className="text-sm font-black text-[#221C16]">Cơ bản</h4>
          <label className="wn-field-label">
            <span>Từ</span>
            <input
              ref={editorTermRef}
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
                {draft.partOfSpeech &&
                !PART_OF_SPEECH_OPTIONS.includes(
                  draft.partOfSpeech as (typeof PART_OF_SPEECH_OPTIONS)[number]
                ) ? (
                  <option value={draft.partOfSpeech}>{draft.partOfSpeech}</option>
                ) : null}
                {PART_OF_SPEECH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
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
                {draft.cefr &&
                !CEFR_LEVELS.includes(draft.cefr as (typeof CEFR_LEVELS)[number]) ? (
                  <option value={draft.cefr}>{draft.cefr}</option>
                ) : null}
                {CEFR_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="wn-form-group">
          <h4 className="text-sm font-black text-[#221C16]">Phát âm</h4>
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
          <h4 className="text-sm font-black text-[#221C16]">Ngữ cảnh</h4>
          <label className="wn-field-label">
            <span>Định nghĩa tiếng Anh</span>
            <textarea
              value={draft.definitionEn ?? ""}
              onChange={(event) => updateDraft("definitionEn", event.target.value || null)}
              rows={2}
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Ví dụ tiếng Anh</span>
            <textarea
              value={draft.exampleEn ?? ""}
              onChange={(event) => updateDraft("exampleEn", event.target.value || null)}
              rows={2}
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Dịch ví dụ</span>
            <textarea
              value={draft.exampleVi ?? ""}
              onChange={(event) => updateDraft("exampleVi", event.target.value || null)}
              rows={2}
              className="wn-field"
            />
          </label>
        </section>

        <section className="wn-form-group">
          <h4 className="text-sm font-black text-[#221C16]">Hình ảnh</h4>
          {draft.imageUrl ? (
            <div className="relative overflow-hidden rounded-xl border-2 border-[#221C16]">
              <img
                src={draft.imageUrl}
                alt=""
                className="max-h-48 w-full object-cover"
                onError={() => setImageError(true)}
              />
            </div>
          ) : null}
          {imageError ? (
            <p className="text-xs font-bold text-[#B91C1C]">Không thể tải ảnh hiện tại.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="brick-button-secondary px-3 py-1.5 text-xs font-black"
            >
              <Search className="h-4 w-4" />
              <span>Tìm hoặc tải ảnh</span>
            </button>
            {draft.imageUrl ? (
              <button
                type="button"
                onClick={removeImage}
                className="wn-button-quiet text-xs font-bold px-3 py-1.5"
              >
                Gỡ ảnh
              </button>
            ) : null}
          </div>
        </section>

        </div>
        <div className="wn-form-actions shrink-0 bg-[#FFFDF9] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="brick-button-primary px-5 py-2 text-sm font-black"
          >
            {isSaving ? "Đang lưu..." : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="brick-button-secondary px-4 py-2 text-sm font-bold"
          >
            Hủy
          </button>
        </div>

        {isPickerOpen ? (
          <ImagePickerModal
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            term={card.term}
            currentImageUrl={draft.imageUrl}
            initialQuery={draft.imageSearchQuery}
            onSelectImage={selectImage}
            onRemoveImage={removeImage}
          />
        ) : null}
      </article>
      </div>
    );
  }

  return (
    <article
      className="wn-vocabulary-card relative flex flex-col justify-between overflow-visible p-4 sm:p-5 focus-within:z-30"
      aria-label={`Thẻ từ vựng: ${card.term}`}
    >
      <div>
        {/* Top Header of Card: Term, IPA, Audio & Menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-all text-xl font-black tracking-tight text-[#221C16] sm:text-2xl">
              {card.term}
            </h3>
            {card.ipa ? (
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#6B6258]">
                {card.ipa}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <PronounceButton text={card.term} label="Nghe" size="sm" />
            <details className="relative wn-menu-details">
              <summary
                aria-label={`Tùy chọn cho ${card.term}`}
                className="wn-button wn-button-quiet wn-icon-button cursor-pointer list-none"
              >
                <MoreHorizontal className="h-5 w-5 text-[#6B6258]" />
              </summary>
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              />
              <div className="absolute right-0 top-full z-50 mt-1.5 grid w-40 gap-1 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-1.5 shadow-[3px_3px_0px_#221C16]">
                <button
                  type="button"
                  onClick={startEdit}
                  className="wn-button wn-button-quiet justify-start text-xs font-bold"
                >
                  <Edit3 className="h-3.5 w-3.5 text-[#E06B43]" />
                  <span>Chỉnh sửa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="wn-button wn-button-quiet wn-button-danger justify-start text-xs font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa</span>
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-[#DCD3C5] pt-3">
          <p className="text-base sm:text-lg font-black text-[#221C16]">{card.meaningVi}</p>
        </div>

        {/* Practice Evidence Badge */}
        {evidenceLabel ? (
          <p className="mt-2.5 text-xs font-bold text-[#6B6258]">
            <span
              data-testid={`practice-badge-${card.id}`}
              className={`font-black ${
                evidence?.classification === "NEEDS_PRACTICE"
                  ? "text-[#B45309]"
                  : evidence?.classification === "RECENTLY_SUCCESSFUL"
                  ? "text-[#15803D]"
                  : "text-[#6B6258]"
              }`}
            >
              {evidenceLabel}
            </span>
          </p>
        ) : null}

        {/* Collapsible Details */}
        <details className="mt-3 border-t-2 border-dashed border-[#DCD3C5] pt-3 group">
          <summary className="cursor-pointer text-xs font-black text-[#6B6258] hover:text-[#221C16] select-none list-none flex items-center justify-between">
            <span>Xem ví dụ và chi tiết</span>
            <span className="text-[11px] font-bold text-[#E06B43] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="grid gap-3 pt-3 text-xs font-semibold text-[#6B6258]">
            {card.partOfSpeech || card.cefr ? (
              <p>{[card.partOfSpeech, card.cefr].filter(Boolean).join(" · ")}</p>
            ) : null}

            {card.definitionEn ? (
              <p className="italic text-[#221C16]">
                {card.definitionEn}
              </p>
            ) : null}

            {card.exampleEn ? (
              <div className="space-y-1 border-l-2 border-[#DCD3C5] pl-3">
                <p className="font-bold text-[#221C16]">&ldquo;{card.exampleEn}&rdquo;</p>
                {card.exampleVi ? (
                  <p className="text-xs text-[#6B6258] font-medium">&rarr; {card.exampleVi}</p>
                ) : null}
              </div>
            ) : null}

            {evidence ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <p>
                  Trắc nghiệm: {evidence.breakdownByQuestionType.multipleChoice.correct}/
                  {evidence.breakdownByQuestionType.multipleChoice.attempts}
                </p>
                <p>
                  Gõ từ: {evidence.breakdownByQuestionType.typedRecall.correct}/
                  {evidence.breakdownByQuestionType.typedRecall.attempts}
                </p>
              </div>
            ) : null}

            {card.imageUrl && !imageError ? (
              <div className="overflow-hidden rounded-xl border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16]">
                <img
                  src={card.imageUrl}
                  alt={card.term}
                  className="max-h-52 w-full object-cover"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="brick-button-secondary w-fit px-3 py-1.5 text-xs font-black"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>{card.imageUrl ? "Đổi ảnh" : "Thêm ảnh"}</span>
            </button>
          </div>
        </details>
      </div>

      {/* Delete Confirmation */}
      {confirmDelete ? (
        <div className="mt-3 rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs font-bold text-[#991B1B]">
          <p>Xóa thẻ &ldquo;{card.term}&rdquo;?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={isDeleting}
              className="wn-button-danger brick-button-secondary px-3 py-1 text-xs font-black"
            >
              {isDeleting ? "Đang xóa..." : "Xóa"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="brick-button-secondary px-3 py-1 text-xs font-bold"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      {isPickerOpen ? (
        <ImagePickerModal
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          term={card.term}
          currentImageUrl={card.imageUrl}
          initialQuery={card.imageSearchQuery}
          onSelectImage={selectImage}
          onRemoveImage={removeImage}
        />
      ) : null}
    </article>
  );
}
