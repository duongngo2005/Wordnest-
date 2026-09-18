"use client";

import React, { useState } from "react";
import { FlashcardStatus } from "@prisma/client";
import { PronounceButton } from "./PronounceButton";
import { StatusBadge } from "./StatusBadge";
import { Edit3, Trash2, X } from "lucide-react";

export interface FlashcardData {
  id: string;
  deckId: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  definitionEn: string;
  ipa: string | null;
  partOfSpeech: string | null;
  cefr: string | null;
  exampleEn: string;
  exampleVi: string;
  imageUrl: string | null;
  imageSource: string | null;
  imageSearchQuery: string | null;
  status: FlashcardStatus;
}

interface FlashcardItemProps {
  card: FlashcardData;
  onStatusChange: (cardId: string, newStatus: FlashcardStatus) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
  onUpdate?: (cardId: string, updated: Partial<FlashcardData>) => Promise<void>;
}

export function FlashcardItem({
  card,
  onStatusChange,
  onDelete,
  onUpdate,
}: FlashcardItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [term, setTerm] = useState(card.term);
  const [meaningVi, setMeaningVi] = useState(card.meaningVi);
  const [definitionEn, setDefinitionEn] = useState(card.definitionEn);
  const [ipa, setIpa] = useState(card.ipa || "");
  const [exampleEn, setExampleEn] = useState(card.exampleEn);
  const [exampleVi, setExampleVi] = useState(card.exampleVi);
  const [imageUrl, setImageUrl] = useState(card.imageUrl || "");

  const handleSaveEdit = async () => {
    if (!onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate(card.id, {
        term,
        meaningVi,
        definitionEn,
        ipa: ipa || null,
        exampleEn,
        exampleVi,
        imageUrl: imageUrl || null,
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update card:", err);
      alert("Không thể lưu cập nhật. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Bạn có chắc muốn xóa thẻ "${card.term}" không?`)) {
      setIsDeleting(true);
      try {
        await onDelete(card.id);
      } catch (err) {
        console.error("Failed to delete card:", err);
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
              Phát âm IPA
            </label>
            <input
              type="text"
              value={ipa}
              onChange={(e) => setIpa(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>
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
          <label className="block text-xs font-bold text-[#6B6258] mb-1">
            Định nghĩa tiếng Anh
          </label>
          <textarea
            rows={2}
            value={definitionEn}
            onChange={(e) => setDefinitionEn(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
          />
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

        <div>
          <label className="block text-xs font-bold text-[#6B6258] mb-1">
            URL Hình ảnh (bỏ trống nếu muốn xóa ảnh)
          </label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-2.5 py-1.5 rounded-lg border-2 border-[#221C16] text-sm bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
          />
        </div>

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
      </div>
    );
  }

  return (
    <article className="brick-card p-4 sm:p-5 flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5">
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
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge
              status={card.status}
              interactive={true}
              onChange={(newStatus) => onStatusChange(card.id, newStatus)}
            />

            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 rounded-md border border-[#221C16] hover:bg-[#FEF3C7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
              title="Chỉnh sửa thẻ"
              aria-label="Chỉnh sửa thẻ"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#221C16]" />
            </button>

            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1.5 rounded-md border border-[#221C16] text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
              title="Xóa thẻ"
              aria-label="Xóa thẻ"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Hierarchy 1: Term & Audio & IPA */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-[#221C16] tracking-tight break-words">
              {card.term}
            </h3>
            {card.ipa && (
              <p className="text-xs sm:text-sm font-mono text-[#6B6258] mt-0.5">
                {card.ipa}
              </p>
            )}
          </div>
          <PronounceButton text={card.term} label="Nghe" size="sm" />
        </div>

        {/* Optional Image */}
        {card.imageUrl && (
          <div className="relative w-full h-40 sm:h-48 rounded-xl overflow-hidden border-2 border-[#221C16] bg-[#F4EFE6] my-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.term}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // If image fails to load, gracefully hide it without crashing
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            {card.imageSource && (
              <span className="absolute bottom-1 right-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                {card.imageSource}
              </span>
            )}
          </div>
        )}

        {/* Hierarchy 2: Vietnamese Meaning */}
        <div className="bg-[#FAF6EE] p-3 rounded-xl border-2 border-[#221C16]/40">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#E06B43] mb-0.5">
            Nghĩa tiếng Việt
          </div>
          <p className="text-base sm:text-lg font-extrabold text-[#221C16]">
            {card.meaningVi}
          </p>
          <p className="text-xs text-[#6B6258] mt-1 italic">
            {card.definitionEn}
          </p>
        </div>

        {/* Hierarchy 3: Example Sentence & Audio */}
        <div className="bg-[#FFFDF9] p-3 rounded-xl border-2 border-[#221C16] space-y-1.5 shadow-[2px_2px_0px_#221C16]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">
              Ví dụ minh họa
            </span>
            <PronounceButton text={card.exampleEn} size="sm" />
          </div>
          <p className="text-sm font-semibold text-[#221C16] leading-snug">
            &ldquo;{card.exampleEn}&rdquo;
          </p>
          <p className="text-xs text-[#6B6258] font-medium leading-snug">
            &rarr; {card.exampleVi}
          </p>
        </div>
      </div>
    </article>
  );
}
