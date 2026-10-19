"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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

      if (typeof data === "object" && data !== null && "data" in data) {
        const payload = (data as { data?: { cardsCreated?: number; message?: string; skippedDuplicates?: Array<{ reason: string }> } }).data;
        if (payload?.cardsCreated === 0) {
          const reason = payload.skippedDuplicates?.[0]?.reason || payload.message || "Từ này đã tồn tại trong hệ thống.";
          setError(reason);
          toast.error("Không thể thêm thẻ", { description: reason });
          return;
        }
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
            disabled={isSubmitting}
            className="wn-field"
          />
        </label>
        <label className="wn-field-label">
          <span>Nghĩa tiếng Việt</span>
          <input
            value={card.meaningVi}
            onChange={(event) => update("meaningVi", event.target.value)}
            disabled={isSubmitting}
            className="wn-field"
          />
        </label>
      </div>

      <details className="wn-manual-details">
        <summary>Thông tin thêm</summary>
        <div className="wn-form-group">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="wn-field-label">
              <span>Từ loại</span>
              <input
                value={card.partOfSpeech}
                onChange={(event) => update("partOfSpeech", event.target.value)}
                disabled={isSubmitting}
                className="wn-field"
              />
            </label>
            <label className="wn-field-label">
              <span>CEFR</span>
              <input
                value={card.cefr}
                onChange={(event) => update("cefr", event.target.value)}
                disabled={isSubmitting}
                className="wn-field"
              />
            </label>
          </div>
          <label className="wn-field-label">
            <span>IPA</span>
            <input
              value={card.ipa}
              onChange={(event) => update("ipa", event.target.value)}
              disabled={isSubmitting}
              className="wn-field font-mono"
            />
          </label>
          <label className="wn-field-label">
            <span>Định nghĩa tiếng Anh</span>
            <textarea
              value={card.definitionEn}
              onChange={(event) => update("definitionEn", event.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Ví dụ tiếng Anh</span>
            <textarea
              value={card.exampleEn}
              onChange={(event) => update("exampleEn", event.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>Dịch ví dụ</span>
            <textarea
              value={card.exampleVi}
              onChange={(event) => update("exampleVi", event.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="wn-field"
            />
          </label>
          <label className="wn-field-label">
            <span>URL hình ảnh</span>
            <input
              value={card.imageUrl}
              onChange={(event) => update("imageUrl", event.target.value)}
              disabled={isSubmitting}
              className="wn-field"
            />
          </label>
        </div>
      </details>

      {error ? (
        <p role="alert" className="wn-form-error">{error}</p>
      ) : null}

      <div className="wn-form-actions">
        <button
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="wn-dialog-primary"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang lưu...</span>
            </>
          ) : (
            "Thêm thẻ"
          )}
        </button>
      </div>
    </form>
  );
}
