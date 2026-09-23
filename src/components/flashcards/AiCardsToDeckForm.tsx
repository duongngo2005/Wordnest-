"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Braces, Loader2, PenLine, Sparkles } from "lucide-react";
import { parseVocabularyInput } from "@/services/vocabulary/parser";
import { useToast } from "@/components/ui/ToastProvider";

type GeneratedCard = {
  term: string;
  meaningVi: string;
  partOfSpeech?: string;
  ipa?: string;
  definitionEn?: string;
  exampleEn?: string;
  exampleVi?: string;
  cefr?: string;
};

interface AiCardsToDeckFormProps {
  deckId: string;
  onSaved: () => void;
  onChooseManual: () => void;
  onChooseJson: () => void;
}

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  if ("error" in data && typeof data.error === "string") return data.error;
  if ("message" in data && typeof data.message === "string") return data.message;
  return fallback;
}

export function AiCardsToDeckForm({
  deckId,
  onSaved,
  onChooseManual,
  onChooseJson,
}: AiCardsToDeckFormProps) {
  const toast = useToast();
  const [rawInput, setRawInput] = useState("");
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const parsed = useMemo(() => parseVocabularyInput(rawInput, 12), [rawInput]);

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (parsed.terms.length === 0) {
      setError("Nhập ít nhất một từ hoặc cụm từ.");
      return;
    }

    setError(null);
    setCards([]);
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", rawInput }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true || !("data" in data)) {
        throw new Error(messageFrom(data, "Không thể tạo thẻ bằng AI."));
      }
      const result = data.data as {
        cards?: GeneratedCard[];
        skippedExistingTerms?: string[];
        duplicateInputCount?: number;
      };
      if (!Array.isArray(result.cards) || result.cards.length === 0) {
        throw new Error("AI chưa trả về thẻ hợp lệ. Hãy thử lại.");
      }
      setCards(result.cards);
      const notes = [
        result.duplicateInputCount ? `Đã bỏ ${result.duplicateInputCount} từ trùng.` : "",
        result.skippedExistingTerms?.length ? `${result.skippedExistingTerms.length} từ đã có trong bộ.` : "",
      ].filter(Boolean);
      toast.success("Đã tạo bản xem trước", { description: notes.join(" ") || `${result.cards.length} thẻ sẵn sàng để thêm.` });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Không thể tạo thẻ bằng AI.";
      setError(message);
      toast.error("Không thể tạo bằng AI", { description: "Bạn vẫn có thể nhập thủ công hoặc dùng JSON." });
    } finally {
      setIsGenerating(false);
    }
  };

  const persist = async () => {
    if (cards.length === 0) return;
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "persist", cards }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) {
        throw new Error(messageFrom(data, "Không thể thêm thẻ AI."));
      }
      const created = "data" in data && data.data && typeof data.data === "object" && "cardsCreated" in data.data && typeof data.data.cardsCreated === "number"
        ? data.data.cardsCreated
        : cards.length;
      toast.success("Đã thêm thẻ", { description: `${created} thẻ đã được thêm vào bộ từ.` });
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Không thể thêm thẻ AI.";
      setError(message);
      toast.error("Không thể thêm thẻ", { description: "Bản xem trước vẫn được giữ lại." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="wn-form-group">
      <form onSubmit={generate} className="wn-form-group" noValidate>
        <label className="wn-field-label" htmlFor="ai-card-terms">
          Từ vựng
          <textarea
            id="ai-card-terms"
            value={rawInput}
            onChange={(event) => {
              setRawInput(event.target.value);
              setCards([]);
              setError(null);
            }}
            rows={5}
            maxLength={4_000}
            placeholder={"allocate; resilient; meticulous\ncapacity"}
            className="wn-field min-h-36 resize-y leading-6"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#6B6258]" aria-live="polite">
          <span>{parsed.terms.length ? `${parsed.terms.length}/12 từ` : "Dùng dấu ; hoặc xuống dòng"}</span>
          {parsed.duplicateCount ? <span>Đã bỏ {parsed.duplicateCount} từ trùng.</span> : null}
        </div>

        <button type="submit" disabled={isGenerating || isSaving} className="brick-button-primary w-full px-4 py-3 text-sm font-black sm:w-fit">
          {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</> : <><Sparkles className="h-4 w-4" /> Tạo bản xem trước</>}
        </button>
      </form>

      {error ? (
        <div role="alert" className="rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-sm font-bold text-[#991B1B]">
          <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onChooseManual} className="brick-button-secondary px-3 py-2 text-xs font-black"><PenLine className="h-4 w-4" /> Nhập thủ công</button>
            <button type="button" onClick={onChooseJson} className="brick-button-secondary px-3 py-2 text-xs font-black"><Braces className="h-4 w-4" /> Dùng JSON</button>
          </div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <section className="wn-paper-surface p-3 sm:p-4" aria-labelledby="ai-preview-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="ai-preview-heading" className="font-black text-[#221C16]">Bản xem trước</h3>
              <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Kiểm tra nội dung trước khi thêm.</p>
            </div>
            <span className="text-sm font-black text-[#A64B2B]">{cards.length} thẻ</span>
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {cards.map((card) => (
              <li key={card.term} className="rounded-lg border border-[#DCD3C5] bg-[#FAF6EE] p-3">
                <p className="break-words font-black text-[#221C16]">{card.term}</p>
                <p className="mt-0.5 break-words text-sm font-semibold text-[#4A4036]">{card.meaningVi}</p>
                {card.partOfSpeech || card.cefr ? <p className="mt-2 text-xs font-bold text-[#6B6258]">{[card.partOfSpeech, card.cefr].filter(Boolean).join(" · ")}</p> : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-[#DCD3C5] pt-3">
            <button type="button" onClick={persist} disabled={isSaving || isGenerating} className="brick-button-primary flex-1 px-4 py-3 text-sm font-black sm:flex-none">
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang thêm...</> : `Thêm ${cards.length} thẻ`}
            </button>
            <button type="button" onClick={() => setCards([])} disabled={isSaving} className="brick-button-secondary px-4 py-3 text-sm font-black">Tạo lại</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
