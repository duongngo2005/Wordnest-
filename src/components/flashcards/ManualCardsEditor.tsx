"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { parseManualFlashcardPaste } from "@/services/vocabulary/parser";
import { useToast } from "@/components/ui/ToastProvider";

export interface ManualCardRow {
  id: string;
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

let nextRowId = 0;

export function createManualCardRow(term = "", meaningVi = ""): ManualCardRow {
  nextRowId += 1;
  return {
    id: `manual-card-${nextRowId}`,
    term,
    meaningVi,
    partOfSpeech: "",
    ipa: "",
    definitionEn: "",
    exampleEn: "",
    exampleVi: "",
    cefr: "",
    imageUrl: "",
  };
}

interface ManualCardsEditorProps {
  deckId?: string;
  deckName?: string;
  folderId?: string;
  seedTerms?: string[];
  onSaved: (response: { deck?: { id: string }; data?: { cardsCreated: number } }) => void;
}

function hasCardContent(row: ManualCardRow) {
  return Boolean(row.term.trim() || row.meaningVi.trim());
}

export function ManualCardsEditor({
  deckId,
  deckName,
  folderId,
  seedTerms = [],
  onSaved,
}: ManualCardsEditorProps) {
  const toast = useToast();
  const [rows, setRows] = useState<ManualCardRow[]>(() =>
    seedTerms.length > 0 ? seedTerms.map((term) => createManualCardRow(term)) : [createManualCardRow()]
  );
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const populatedRows = rows.filter(hasCardContent);
  const hasPartialRow = populatedRows.some((row) => !row.term.trim() || !row.meaningVi.trim());
  const canSubmit = populatedRows.length > 0 && !hasPartialRow && !isSubmitting;

  const updateRow = (id: string, field: keyof ManualCardRow, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    setErrorMessage(null);
  };

  const addRow = () => setRows((currentRows) => [...currentRows, createManualCardRow()]);

  const removeRow = (id: string) => {
    setRows((currentRows) => {
      const remainingRows = currentRows.filter((row) => row.id !== id);
      return remainingRows.length > 0 ? remainingRows : [createManualCardRow()];
    });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLFormElement>) => {
    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedText.includes("\t") || !pastedText.includes("\n")) return;

    const pastedRows = parseManualFlashcardPaste(pastedText);
    if (pastedRows.length === 0) return;

    event.preventDefault();
    const newRows = pastedRows.map(({ term, meaningVi }) => createManualCardRow(term, meaningVi));
    setRows((currentRows) => {
      const existingRows = currentRows.filter(hasCardContent);
      return [...existingRows, ...newRows];
    });
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      setErrorMessage("Mỗi thẻ cần có Word và Meaning Vietnamese.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const cards = populatedRows.map((row) => ({
        term: row.term,
        meaningVi: row.meaningVi,
        partOfSpeech: row.partOfSpeech,
        ipa: row.ipa,
        definitionEn: row.definitionEn,
        exampleEn: row.exampleEn,
        exampleVi: row.exampleVi,
        cefr: row.cefr,
        imageUrl: row.imageUrl,
      }));
      const response = await fetch(deckId ? `/api/decks/${deckId}/cards/manual` : "/api/decks/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deckId ? { cards } : { deckName, folderId, cards }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Không thể lưu thẻ thủ công.";
        throw new Error(message);
      }

      const createdCount = deckId
        ? "data" in data && data.data && typeof data.data === "object" && "cardsCreated" in data.data && typeof data.data.cardsCreated === "number"
          ? data.data.cardsCreated
          : populatedRows.length
        : populatedRows.length;
      toast.success("Đã lưu thẻ thủ công", {
        description: `${createdCount} thẻ đã sẵn sàng để học.`,
      });
      onSaved(data as { deck?: { id: string }; data?: { cardsCreated: number } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu thẻ thủ công.";
      setErrorMessage(message);
      toast.error("Không thể lưu thẻ thủ công", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" onPaste={handlePaste}>
      <p className="text-xs font-medium text-[#6B6258]">
        Nhập Word và Meaning Vietnamese. Bạn có thể dán dữ liệu từ Excel/Google Sheets theo dạng <code>word[TAB]meaning</code>.
      </p>

      <div className="space-y-3">
        {rows.map((row, index) => {
          const detailsOpen = openDetails[row.id] ?? false;
          return (
            <div key={row.id} className="rounded-xl border-2 border-[#221C16]/40 bg-[#FAF6EE] p-3 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs font-bold text-[#221C16]">
                  Word *
                  <input
                    value={row.term}
                    onChange={(event) => updateRow(row.id, "term", event.target.value)}
                    placeholder="troubleshoot"
                    disabled={isSubmitting}
                    className="mt-1 w-full rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-bold text-[#221C16]">
                  Meaning Vietnamese *
                  <input
                    value={row.meaningVi}
                    onChange={(event) => updateRow(row.id, "meaningVi", event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        addRow();
                      }
                    }}
                    placeholder="xử lý sự cố"
                    disabled={isSubmitting}
                    className="mt-1 w-full rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={isSubmitting || rows.length === 1}
                  aria-label={`Xóa dòng ${index + 1}`}
                  className="rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] p-2 text-[#991B1B] disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOpenDetails((current) => ({ ...current, [row.id]: !detailsOpen }))}
                className="flex items-center gap-1 text-xs font-bold text-[#E06B43]"
              >
                {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Thêm thông tin
              </button>

              {detailsOpen ? (
                <div className="grid grid-cols-1 gap-2 border-t border-[#221C16]/20 pt-3 sm:grid-cols-2">
                  <ManualTextField label="Từ loại" value={row.partOfSpeech} onChange={(value) => updateRow(row.id, "partOfSpeech", value)} />
                  <ManualTextField label="IPA" value={row.ipa} onChange={(value) => updateRow(row.id, "ipa", value)} />
                  <ManualTextField label="Định nghĩa tiếng Anh" value={row.definitionEn} onChange={(value) => updateRow(row.id, "definitionEn", value)} />
                  <ManualTextField label="CEFR" value={row.cefr} onChange={(value) => updateRow(row.id, "cefr", value)} placeholder="A1 – C2" />
                  <ManualTextField label="Ví dụ tiếng Anh" value={row.exampleEn} onChange={(value) => updateRow(row.id, "exampleEn", value)} />
                  <ManualTextField label="Dịch ví dụ tiếng Việt" value={row.exampleVi} onChange={(value) => updateRow(row.id, "exampleVi", value)} />
                  <ManualTextField label="URL hình ảnh" value={row.imageUrl} onChange={(value) => updateRow(row.id, "imageUrl", value)} placeholder="https://..." />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {errorMessage ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] p-3 text-xs font-bold text-[#991B1B]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[#221C16]/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={addRow} disabled={isSubmitting} className="inline-flex items-center gap-1 text-xs font-bold text-[#E06B43]">
          <Plus className="h-4 w-4" /> Add row
        </button>
        <button type="submit" disabled={!canSubmit} className="brick-button-primary px-4 py-2.5 text-xs font-black disabled:opacity-50">
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</> : "Lưu flashcard"}
        </button>
      </div>
    </form>
  );
}

function ManualTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs font-bold text-[#6B6258]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-2 text-sm"
      />
    </label>
  );
}
