"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

export interface ManualCardRow {
  term: string;
  meaningVi: string;
  partOfSpeech: string;
  ipa: string;
  definitionEn: string;
  exampleEn: string;
  exampleVi: string;
  cefr: string;
  imageUrl: string;
}

const emptyCard: ManualCardRow = {
  term: "",
  meaningVi: "",
  partOfSpeech: "",
  ipa: "",
  definitionEn: "",
  exampleEn: "",
  exampleVi: "",
  cefr: "",
  imageUrl: "",
};

interface ManualCardsEditorProps {
  deckId: string;
  onSaved: () => void;
}

export function ManualCardsEditor({ deckId, onSaved }: ManualCardsEditorProps) {
  const toast = useToast();
  const [card, setCard] = useState<ManualCardRow>(emptyCard);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof ManualCardRow, value: string) => {
    setCard((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!card.term.trim() || !card.meaningVi.trim()) {
      setError("Vui lòng nhập từ tiếng Anh và nghĩa tiếng Việt.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [card] }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Không thể lưu thẻ.";
        throw new Error(message);
      }
      toast.success("Đã thêm thẻ mới");
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Không thể lưu thẻ.";
      setError(message);
      toast.error("Không thể lưu thẻ", { description: "Thử lại." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="wn-form-group">
      <div className="grid gap-3">
        <label className="wn-field-label">
          <span>Từ</span>
          <input
            value={card.term}
            onChange={(event) => update("term", event.target.value)}
            placeholder="allocate"
            disabled={isSubmitting}
            className="wn-field"
          />
        </label>
        <label className="wn-field-label">
          <span>Nghĩa tiếng Việt</span>
          <input
            value={card.meaningVi}
            onChange={(event) => update("meaningVi", event.target.value)}
            placeholder="phân bổ"
            disabled={isSubmitting}
            className="wn-field"
          />
        </label>
      </div>

      <details className="rounded-xl border-2 border-dashed border-[#DCD3C5] bg-[#FAF6EE] p-3 group">
        <summary className="cursor-pointer text-xs font-black text-[#6B6258] hover:text-[#221C16] flex items-center justify-between select-none list-none">
          <span>Thông tin thêm (IPA, ví dụ, hình ảnh...)</span>
          <ChevronDown className="h-4 w-4 text-[#E06B43] group-open:rotate-180 transition-transform" />
        </summary>
        <div className="wn-form-group pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="wn-field-label">
              <span>Từ loại</span>
              <input
                value={card.partOfSpeech}
                onChange={(event) => update("partOfSpeech", event.target.value)}
                placeholder="verb, noun..."
                className="wn-field"
              />
            </label>
            <label className="wn-field-label">
              <span>CEFR</span>
              <input
                value={card.cefr}
                onChange={(event) => update("cefr", event.target.value)}
                placeholder="A1, B2, C1..."
                className="wn-field"
              />
            </label>
          </div>
          <label className="wn-field-label">
            <span>IPA</span>
            <input
              value={card.ipa}
              onChange={(event) => update("ipa", event.target.value)}
              placeholder="/ˈæləkeɪt/"
              className="wn-field font-mono"
            />
          </label>
          <label className="wn-field-label">
            <span>Định nghĩa tiếng Anh</span>
            <textarea
              value={card.definitionEn}
              onChange={(event) => update("definitionEn", event.target.value)}
              rows={2}
              placeholder="to set apart for a particular purpose..."
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Ví dụ tiếng Anh</span>
            <textarea
              value={card.exampleEn}
              onChange={(event) => update("exampleEn", event.target.value)}
              rows={2}
              placeholder="The project manager allocated the budget..."
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Dịch ví dụ</span>
            <textarea
              value={card.exampleVi}
              onChange={(event) => update("exampleVi", event.target.value)}
              rows={2}
              placeholder="Người quản lý dự án đã phân bổ ngân sách..."
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>URL hình ảnh</span>
            <input
              value={card.imageUrl}
              onChange={(event) => update("imageUrl", event.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="wn-field"
            />
          </label>
        </div>
      </details>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-lg border-2 border-[#B91C1C] bg-[#FEE2E2] p-2 text-xs font-bold text-[#B91C1C]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="wn-form-actions">
        <button
          disabled={isSubmitting}
          className="brick-button-primary px-5 py-2.5 text-sm font-black"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang lưu...</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>Thêm thẻ</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
