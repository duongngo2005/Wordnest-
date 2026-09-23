"use client";

import React, { useState } from "react";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { PronounceButton } from "./PronounceButton";
import { StatusBadge } from "./StatusBadge";
import { Edit3, Trash2, X, Image as ImageIcon, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { ImagePickerModal } from "./ImagePickerModal";
import { SerializedPracticeEvidenceSummary } from "@/services/vocabulary";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";

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

export function FlashcardItem({
  card,
  evidence,
  onDelete,
  onUpdate,
}: FlashcardItemProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);

  // Edit form state
  const [term, setTerm] = useState(card.term);
  const [meaningVi, setMeaningVi] = useState(card.meaningVi);
  const [definitionEn, setDefinitionEn] = useState(card.definitionEn || "");
  const [ipa, setIpa] = useState(card.ipa || "");
  const [partOfSpeech, setPartOfSpeech] = useState(card.partOfSpeech || "");
  const [cefr, setCefr] = useState(card.cefr || "");
  const [exampleEn, setExampleEn] = useState(card.exampleEn || "");
  const [exampleVi, setExampleVi] = useState(card.exampleVi || "");
  const [imageUrl, setImageUrl] = useState(card.imageUrl || "");
  const [imageSource, setImageSource] = useState(card.imageSource);
  const [imageSearchQuery, setImageSearchQuery] = useState(card.imageSearchQuery);
  const [imagePageUrl, setImagePageUrl] = useState(card.imagePageUrl || null);
  const [imageAuthor, setImageAuthor] = useState(card.imageAuthor || null);
  const [imageLicense, setImageLicense] = useState(card.imageLicense || null);
  const [imageError, setImageError] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [lastImageUrl, setLastImageUrl] = useState(card.imageUrl);
  if (card.imageUrl !== lastImageUrl) {
    setLastImageUrl(card.imageUrl);
    setImageError(false);
  }

  const handleStartEdit = () => {
    setTerm(card.term);
    setMeaningVi(card.meaningVi);
    setDefinitionEn(card.definitionEn || "");
    setIpa(card.ipa || "");
    setPartOfSpeech(card.partOfSpeech || "");
    setCefr(card.cefr || "");
    setExampleEn(card.exampleEn || "");
    setExampleVi(card.exampleVi || "");
    setImageUrl(card.imageUrl || "");
    setImageSource(card.imageSource);
    setImageSearchQuery(card.imageSearchQuery);
    setImagePageUrl(card.imagePageUrl || null);
    setImageAuthor(card.imageAuthor || null);
    setImageLicense(card.imageLicense || null);
    setIsEditing(true);
  };

  const handleImagePickerSelect = async (
    imageData: {
      imageUrl: string;
      imageSource?: string | null;
      imageSearchQuery?: string | null;
      imagePageUrl?: string | null;
      imageAuthor?: string | null;
    },
    options?: { silentToast?: boolean }
  ) => {
    setImageError(false);
    setImageUrl(imageData.imageUrl);
    setImageSource(imageData.imageSource || "MANUAL");
    setImageSearchQuery(imageData.imageSearchQuery || null);
    setImagePageUrl(imageData.imagePageUrl || null);
    setImageAuthor(imageData.imageAuthor || null);
    setImageLicense(null);
    if (!isEditing && onUpdate) {
      await onUpdate(card.id, {
        imageUrl: imageData.imageUrl,
        imageSource: imageData.imageSource || null,
        imageSearchQuery: imageData.imageSearchQuery || null,
        imagePageUrl: imageData.imagePageUrl || null,
        imageAuthor: imageData.imageAuthor || null,
        imageLicense: null,
      });
      if (!options?.silentToast) {
        toast.success("Đã cập nhật hình ảnh", {
          description: `Hình ảnh của từ “${card.term}” đã được thay đổi.`,
        });
      }
    }
  };

  const handleImagePickerRemove = async () => {
    setImageUrl("");
    setImageSource(null);
    setImageSearchQuery(null);
    setImagePageUrl(null);
    setImageAuthor(null);
    setImageLicense(null);
    if (!isEditing && onUpdate) {
      if (card.imageUrl && card.imageUrl.startsWith("/uploads/cards/")) {
        fetch(`/api/upload/image?url=${encodeURIComponent(card.imageUrl)}`, {
          method: "DELETE",
        }).catch((err) => console.warn("Could not delete local file:", err));
      }

      await onUpdate(card.id, {
        imageUrl: null,
        imageSource: null,
        imageSearchQuery: null,
        imagePageUrl: null,
        imageAuthor: null,
        imageLicense: null,
      });
      toast.success("Đã xóa hình ảnh", {
        description: `Đã gỡ bỏ hình ảnh của thẻ “${card.term}”.`,
      });
    }
  };

  const handleCardPaste = async (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          if (isPasting) return;
          setIsPasting(true);
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload/image", {
              method: "POST",
              body: formData,
            });
            const data = await res.json();
            if (res.ok && data.success) {
              if (card.imageUrl && card.imageUrl.startsWith("/uploads/cards/")) {
                fetch(`/api/upload/image?url=${encodeURIComponent(card.imageUrl)}`, {
                  method: "DELETE",
                }).catch(() => {});
              }
              await handleImagePickerSelect(
                {
                  imageUrl: data.imageUrl,
                  imageSource: "MANUAL",
                },
                { silentToast: true }
              );
              toast.success("Đã dán ảnh từ clipboard", {
                description: `Đã cập nhật ảnh cho từ “${card.term}”.`,
              });
            } else {
              toast.error("Không thể dán ảnh", {
                description: data.error || "Vui lòng thử lại.",
              });
            }
          } catch (err) {
            console.error("Paste image failed:", err);
            toast.error("Không thể dán ảnh", {
              description: "Đã xảy ra lỗi khi tải ảnh lên.",
            });
          } finally {
            setIsPasting(false);
          }
          return;
        }
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!onUpdate) return;
    if (!term.trim() || !meaningVi.trim()) {
      toast.error("Thiếu thông tin bắt buộc", { description: "Thuật ngữ và nghĩa tiếng Việt không được để trống." });
      return;
    }
    setIsSaving(true);
    try {
      await onUpdate(card.id, {
        term,
        meaningVi,
        definitionEn: definitionEn || null,
        ipa: ipa || null,
        partOfSpeech: partOfSpeech || null,
        cefr: cefr || null,
        exampleEn: exampleEn || null,
        exampleVi: exampleVi || null,
        imageUrl: imageUrl || null,
        imageSource: imageUrl ? imageSource || "MANUAL" : null,
        imageSearchQuery: imageUrl ? imageSearchQuery : null,
        imagePageUrl: imageUrl ? imagePageUrl : null,
        imageAuthor: imageUrl ? imageAuthor : null,
        imageLicense: imageUrl ? imageLicense : null,
      });
      setIsEditing(false);
      toast.success("Đã lưu thay đổi", { description: `Thẻ “${term}” đã được cập nhật.` });
    } catch (err) {
      console.error("Failed to update card:", err);
      toast.error("Không thể lưu cập nhật", {
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Bạn có chắc muốn xóa thẻ "${card.term}" không?`)) {
      setIsDeleting(true);
      try {
        await onDelete(card.id);
        toast.success("Đã xóa thẻ", { description: `Thẻ “${card.term}” đã được xóa.` });
      } catch (err) {
        console.error("Failed to delete card:", err);
        toast.error("Không thể xóa thẻ", { description: "Vui lòng thử lại." });
        setIsDeleting(false);
      }
    }
  };

  if (isEditing) {
    return (
      <div className="brick-card p-4 sm:p-5 bg-[#FFFDF9] space-y-3">
        <div className="flex items-center justify-between border-b-2 border-[#221C16] pb-2">
          <span className="font-extrabold text-sm text-[#221C16]">
            Chỉnh sửa thẻ: {card.term}
          </span>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1.5 text-[#6B6258] hover:text-[#221C16] rounded-md"
            aria-label="Đóng chỉnh sửa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#6B6258]">Cốt lõi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">
              Thuật ngữ / Cụm từ
            </label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm font-bold bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">
              Nghĩa tiếng Việt
            </label>
            <input
              type="text"
              value={meaningVi}
              onChange={(e) => setMeaningVi(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm font-semibold bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">Từ loại</label>
            <select value={partOfSpeech} onChange={(e) => setPartOfSpeech(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
              <option value="">Không chọn</option>
              {partOfSpeech && !PART_OF_SPEECH_OPTIONS.includes(partOfSpeech as typeof PART_OF_SPEECH_OPTIONS[number]) ? <option value={partOfSpeech}>Giá trị hiện có: {partOfSpeech}</option> : null}
              {PART_OF_SPEECH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">CEFR</label>
            <select value={cefr} onChange={(e) => setCefr(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
              <option value="">Không chọn</option>
              {cefr && !CEFR_LEVELS.includes(cefr as typeof CEFR_LEVELS[number]) ? <option value={cefr}>Giá trị hiện có: {cefr}</option> : null}
              {CEFR_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#6B6258]">Phát âm</h3>
          <label className="block text-xs font-bold text-[#6B6258]">Phát âm IPA
            <input type="text" value={ipa} onChange={(e) => setIpa(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]" />
          </label>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#6B6258]">Nghĩa & ngữ cảnh</h3>
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">Định nghĩa tiếng Anh</label>
            <textarea rows={2} value={definitionEn} onChange={(e) => setDefinitionEn(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">
              Ví dụ (Tiếng Anh)
            </label>
            <textarea
              rows={2}
              value={exampleEn}
              onChange={(e) => setExampleEn(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6258] mb-1">
              Dịch ví dụ (Tiếng Việt)
            </label>
            <textarea
              rows={2}
              value={exampleVi}
              onChange={(e) => setExampleVi(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>
        </div>
          {exampleEn.trim() && term.trim() && !exampleEn.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()) ? <p className="text-[11px] font-medium text-[#6B6258]">Lưu ý: ví dụ không chứa nguyên dạng thuật ngữ. Điều này vẫn có thể đúng nếu câu dùng biến thể như “allocated”.</p> : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#6B6258]">Hình ảnh</h3>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-[#6B6258]">
              URL Hình ảnh (bỏ trống nếu muốn xóa ảnh)
            </label>
            <button
              type="button"
              onClick={() => setIsImagePickerOpen(true)}
              className="text-[11px] font-bold text-[#E06B43] hover:underline flex items-center gap-1"
            >
              <Search className="w-3 h-3" /> Tìm ảnh trên web
            </button>
          </div>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setImageSource(e.target.value.trim() ? "MANUAL" : null);
              setImageSearchQuery(null);
              setImagePageUrl(null);
              setImageAuthor(null);
              setImageLicense(null);
            }}
            placeholder="https://..."
            className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
          />
        </div>
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] hover:bg-gray-100"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={isSaving}
            className="brick-button-primary px-4 py-1.5 text-xs text-white font-bold"
          >
            {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>

        {isImagePickerOpen && (
          <ImagePickerModal
            isOpen={isImagePickerOpen}
            onClose={() => setIsImagePickerOpen(false)}
            term={card.term}
            currentImageUrl={imageUrl}
            initialQuery={card.imageSearchQuery}
            onSelectImage={handleImagePickerSelect}
            onRemoveImage={handleImagePickerRemove}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <article
        tabIndex={0}
        onPaste={handleCardPaste}
        aria-label={`Thẻ từ vựng: ${card.term}`}
        className="surface-card relative flex flex-col justify-between gap-4 p-4 sm:p-5 focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
      >
        {isPasting && (
          <div className="absolute inset-0 bg-[#FFFDF9]/80 backdrop-blur-xs rounded-2xl flex items-center justify-center z-20">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl font-bold text-xs shadow-[2px_2px_0px_#221C16]">
              <RefreshCw className="w-3.5 h-3.5 text-[#E06B43] animate-spin" />
              <span>Đang dán ảnh từ clipboard...</span>
            </div>
          </div>
        )}
      <div className="space-y-3">
        {/* Top bar: CEFR, Part of speech, Status & Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {card.cefr && (
              <span className="brick-badge bg-[#E06B43] text-white border-[#221C16]">
                {card.cefr}
              </span>
            )}
            {card.partOfSpeech && (
              <span className="text-xs font-bold italic text-[#6B6258] px-1.5 py-0.5 bg-[#FAF6EE] rounded border border-[#221C16]/20">
                {card.partOfSpeech}
              </span>
            )}
            {evidence && evidence.classification !== "NO_EVIDENCE" && (
              <span
                data-testid={`practice-badge-${card.id}`}
                className={`text-[10px] font-black px-2 py-0.5 rounded border transition-all ${
                  evidence.classification === "NEEDS_PRACTICE"
                    ? "border-[#B45309] bg-[#FEF3C7] text-[#92400E] shadow-[1px_1px_0px_#B45309]"
                    : evidence.classification === "MIXED"
                    ? "border-[#0369A1] bg-[#E0F2FE] text-[#0369A1]"
                    : evidence.classification === "RECENTLY_SUCCESSFUL"
                    ? "border-[#15803D] bg-[#DCFCE7] text-[#15803D]"
                    : "border-gray-400 bg-[#F5F5F4] text-gray-600"
                }`}
                title={evidence.explanationVi}
              >
                {evidence.classification === "NEEDS_PRACTICE"
                  ? "Cần luyện thêm"
                  : evidence.classification === "MIXED"
                  ? "Chưa ổn định"
                  : evidence.classification === "RECENTLY_SUCCESSFUL"
                  ? "Thực hành tốt"
                  : "Cần thêm dữ liệu"}
              </span>
            )}
          </div>

          <details className="relative">
            <summary aria-label={`Tùy chọn cho ${card.term}`} className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-[#4A4036] hover:bg-[#F4EFE6]">
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-[#221C16]/15 bg-[#FFFDF9] p-1.5 shadow-lg">
              <div className="px-2 py-1"><StatusBadge status={card.status} /></div>
              <button onClick={handleStartEdit} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold hover:bg-[#F6F0E6]">
                <Edit3 className="h-4 w-4" /> Chỉnh sửa
              </button>
              <button onClick={handleDelete} disabled={isDeleting} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> {isDeleting ? "Đang xóa..." : "Xóa thẻ"}
              </button>
            </div>
          </details>
        </div>

        {/* Hierarchy 1: Term & Audio & IPA */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-xl font-black tracking-tight text-[#221C16] sm:text-2xl">
              {card.term}
            </h3>
            {card.ipa && (
              <p className="text-xs sm:text-sm font-mono text-[#6B6258] mt-0.5">
                {card.ipa}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PronounceButton text={card.term} label="Nghe" size="sm" />
          </div>
        </div>

        {/* Images are useful context, but should not displace the word and meaning. */}
        {!imageError && card.imageUrl && (
          <details className="border-t border-[#221C16]/10 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#6B6258] hover:text-[#221C16]">Xem ảnh minh họa</summary>
            <div className="relative mt-3 h-40 w-full overflow-hidden rounded-xl bg-[#F4EFE6] sm:h-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.term}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
            <button
              type="button"
              onClick={() => setIsImagePickerOpen(true)}
              className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-[#FFFDF9] px-2 py-1 text-[11px] font-bold text-[#221C16] shadow-sm"
              title="Đổi ảnh minh họa khác"
            >
              <RefreshCw className="w-3 h-3 text-[#E06B43]" />
              Đổi ảnh
            </button>
            </div>
          </details>
        )}

        {/* Hierarchy 2: Vietnamese Meaning */}
        <div>
          <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[#9A4A2E]">
            Nghĩa tiếng Việt
          </div>
          <p className="text-base font-extrabold leading-snug text-[#221C16] sm:text-lg">
            {card.meaningVi}
          </p>
        </div>

        <details className="border-t border-[#221C16]/10 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#6B6258] hover:text-[#221C16]">Xem ví dụ và chi tiết</summary>
          <div className="mt-3 space-y-3">
        {(!card.imageUrl || imageError) ? <button type="button" onClick={() => setIsImagePickerOpen(true)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#6B6258] hover:bg-[#F4EFE6] hover:text-[#E06B43]">
          <ImageIcon className="h-4 w-4" /> Thêm ảnh
        </button> : null}
        {card.definitionEn ? <p className="text-sm italic text-[#6B6258]">{card.definitionEn}</p> : null}
        {card.exampleEn ? <div className="space-y-1.5 rounded-lg bg-[#FAF6EE] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">
              Ví dụ minh họa
            </span>
            <PronounceButton text={card.exampleEn} size="sm" />
          </div>
          <p className="text-sm font-semibold text-[#221C16] leading-snug">
            &ldquo;{card.exampleEn}&rdquo;
          </p>
          {card.exampleVi ? <p className="text-xs text-[#6B6258] font-medium leading-snug">&rarr; {card.exampleVi}</p> : null}
        </div> : null}

        {/* Historical evidence stays available without competing with recall. */}
        {evidence && evidence.firstPassAttempts > 0 && (
          <div
            data-testid={`practice-evidence-${card.id}`}
            className="pt-2 border-t border-black/10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-[#6B6258]"
          >
            {evidence.breakdownByQuestionType.typedRecall.attempts > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-[#221C16]">Gõ từ:</span>
                <span
                  className={
                    evidence.breakdownByQuestionType.typedRecall.incorrect > 0
                      ? "text-[#DC2626]"
                      : "text-[#15803D]"
                  }
                >
                  {evidence.breakdownByQuestionType.typedRecall.correct}/
                  {evidence.breakdownByQuestionType.typedRecall.attempts}
                </span>
              </span>
            )}
            {evidence.breakdownByQuestionType.storyCloze.attempts > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-[#221C16]">Story Cloze:</span>
                <span
                  className={
                    evidence.breakdownByQuestionType.storyCloze.incorrect > 0
                      ? "text-[#DC2626]"
                      : "text-[#15803D]"
                  }
                >
                  {evidence.breakdownByQuestionType.storyCloze.correct}/
                  {evidence.breakdownByQuestionType.storyCloze.attempts}
                </span>
              </span>
            )}
            {evidence.breakdownByQuestionType.multipleChoice.attempts > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-[#221C16]">Trắc nghiệm:</span>
                <span className="text-[#15803D]">
                  {evidence.breakdownByQuestionType.multipleChoice.correct}/
                  {evidence.breakdownByQuestionType.multipleChoice.attempts}
                </span>
              </span>
            )}
            {evidence.latestFirstPassCorrect !== null && (
              <span>
                Lần gần nhất:{" "}
                <strong
                  className={
                    evidence.latestFirstPassCorrect ? "text-[#15803D]" : "text-[#DC2626]"
                  }
                >
                  {evidence.latestFirstPassCorrect ? "đúng" : "chưa đúng"}
                </strong>
              </span>
            )}
            {evidence.retryAttempts > 0 && (
              <span className="text-[#2563EB]">
                Sửa khi luyện lại: {evidence.retryCorrect}/{evidence.retryAttempts}
              </span>
            )}
          </div>
        )}
          </div>
        </details>
      </div>
    </article>

    {isImagePickerOpen && (
      <ImagePickerModal
        isOpen={isImagePickerOpen}
        onClose={() => setIsImagePickerOpen(false)}
        term={card.term}
        currentImageUrl={card.imageUrl}
        initialQuery={card.imageSearchQuery}
        onSelectImage={handleImagePickerSelect}
        onRemoveImage={handleImagePickerRemove}
      />
    )}
  </>
);
}
