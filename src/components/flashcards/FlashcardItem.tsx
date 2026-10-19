"use client";
/* eslint-disable @next/next/no-img-element -- user-provided image URLs are not configured for Next/Image. */

import { useState } from "react";
import { Edit3, Image as ImageIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { PronounceButton } from "./PronounceButton";
import { ImagePickerModal } from "./ImagePickerModal";
import { SerializedPracticeEvidenceSummary } from "@/services/vocabulary";
import { useToast } from "@/components/ui/ToastProvider";
import { FlashcardEditorDialog } from "./FlashcardEditorDialog";

export interface FlashcardData {
  id: string;
  // The primary source deck is legacy metadata. A card can now be shared by
  // several decks or intentionally have no source membership.
  deckId: string | null;
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
  sources?: Array<{
    deckId: string;
    deckName: string;
    folderName: string | null;
  }>;
}

interface FlashcardItemProps {
  card: FlashcardData;
  evidence?: SerializedPracticeEvidenceSummary | null;
  onDelete: (cardId: string) => Promise<void>;
  onUpdate?: (cardId: string, updated: Partial<FlashcardData>) => Promise<void>;
}

export function FlashcardItem({ card, evidence, onDelete, onUpdate }: FlashcardItemProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageError, setImageError] = useState(false);

  const evidenceLabel =
    !evidence || evidence.classification === "NO_EVIDENCE"
      ? null
      : evidence.classification === "RECENTLY_SUCCESSFUL"
      ? "Thực hành tốt"
      : evidence.classification === "INSUFFICIENT_DATA"
      ? "Cần thêm dữ liệu"
      : evidence.explanationVi;

  const startEdit = () => setIsEditing(true);

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
    if (!onUpdate) return;
    await onUpdate(card.id, media);
    toast.success("Đã xóa hình ảnh");
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
      <FlashcardEditorDialog
        card={card}
        onClose={() => setIsEditing(false)}
        onSave={async (draft) => {
          if (!onUpdate) throw new Error("Không thể cập nhật thẻ từ vựng.");
          await onUpdate(card.id, draft);
        }}
      />
    );
  }

  return (
    <article
      className="wn-index-card wn-vocabulary-card brick-card relative flex flex-col justify-between overflow-visible p-4 sm:p-5 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[3px_3px_0px_#221C16] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#221C16] transition-all border-t-4 border-t-[var(--accent)] focus-within:z-30"
      aria-label={`Thẻ từ vựng: ${card.term}`}
    >
      <div>
        {/* Top Header of Card: Term, IPA, Audio & Menu */}
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#DCD3C5] pb-3">
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

          <div className="flex shrink-0 items-center gap-1.5">
            <PronounceButton text={card.term} variant="card" />
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
                  <Edit3 className="h-3.5 w-3.5 text-[var(--accent)]" />
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

        {/* Vietnamese Meaning Box (Flashcard Accent) */}
        <div className="mt-3 rounded-xl border-2 border-[#221C16] bg-[#FEF8ED] p-3 shadow-[1.5px_1.5px_0px_#221C16]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] block mb-0.5">
            Nghĩa tiếng Việt
          </span>
          <p className="text-base sm:text-lg font-black text-[#221C16] leading-snug break-words">
            {card.meaningVi}
          </p>
        </div>

        {/* Practice Evidence Badge with tactile study marker */}
        {evidenceLabel ? (
          <p className="mt-2.5 text-xs font-bold text-[#6B6258]">
            <span
              data-testid={`practice-badge-${card.id}`}
              className={`font-black ${
                evidence?.classification === "NEEDS_PRACTICE"
                  ? "wn-marker-amber text-[#9A3412]"
                  : evidence?.classification === "RECENTLY_SUCCESSFUL"
                  ? "wn-marker-green text-[#15803D]"
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
            <span className="text-[11px] font-bold text-[var(--accent)] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="grid gap-3 pt-3 text-xs font-semibold text-[#6B6258]">
            {card.partOfSpeech || card.cefr ? (
              <p>{[card.partOfSpeech, card.cefr].filter(Boolean).join(" · ")}</p>
            ) : null}

            {card.sources && card.sources.length > 0 ? (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B6258]">Nguồn học</p>
                <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Nguồn học của ${card.term}`}>
                  {card.sources.map((source) => (
                    <li key={source.deckId} className="rounded-md border border-[#DCD3C5] bg-[#FAF6EE] px-2 py-1 text-[11px] font-bold text-[#4A4036]">
                      {source.folderName ? `${source.folderName} → ` : ""}{source.deckName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {card.definitionEn ? (
              <p className="italic text-[#221C16]">
                {card.definitionEn}
              </p>
            ) : null}

            {card.exampleEn ? (
              <div className="rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] p-3 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#6B6258] block">
                  Ví dụ minh họa
                </span>
                <p className="text-xs sm:text-sm font-semibold text-[#221C16]">&ldquo;{card.exampleEn}&rdquo;</p>
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
