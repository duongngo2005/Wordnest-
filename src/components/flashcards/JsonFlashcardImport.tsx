"use client";

/* eslint-disable @next/next/no-img-element -- next/image would server-fetch untrusted import URLs. */

import { Fragment, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { getJsonFlashcardImportPrompt } from "@/lib/flashcards/json-import-prompt";
import { useToast } from "@/components/ui/ToastProvider";

interface PreviewCard {
  term: string;
  meaningVi: string;
  partOfSpeech?: string | null;
  ipa?: string | null;
  definitionEn?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  cefr?: string | null;
  imageUrl?: string | null;
}

interface JsonImportPreview {
  valid: boolean;
  cards: PreviewCard[];
  errors: string[];
}

interface JsonFlashcardImportProps {
  deckId: string;
  deckName: string;
  collectionName?: string | null;
  onSaved: () => void;
}

function getErrorMessage(data: unknown, fallback: string): string {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

function getErrorDetails(data: unknown): string[] {
  return typeof data === "object" && data !== null && "details" in data && Array.isArray(data.details)
    ? data.details.filter((detail): detail is string => typeof detail === "string")
    : [];
}

function isPreviewCard(value: unknown): value is PreviewCard {
  if (typeof value !== "object" || value === null) return false;

  const card = value as Record<string, unknown>;
  const optionalFields = ["partOfSpeech", "ipa", "definitionEn", "exampleEn", "exampleVi", "cefr", "imageUrl"];
  return typeof card.term === "string" &&
    typeof card.meaningVi === "string" &&
    optionalFields.every((field) => !(field in card) || card[field] === null || typeof card[field] === "string");
}

function isJsonImportPreview(value: unknown): value is JsonImportPreview {
  return typeof value === "object" && value !== null &&
    "valid" in value && typeof value.valid === "boolean" &&
    "cards" in value && Array.isArray(value.cards) && value.cards.every(isPreviewCard) &&
    "errors" in value && Array.isArray(value.errors) && value.errors.every((error) => typeof error === "string");
}

export function JsonFlashcardImport({
  deckId,
  deckName,
  collectionName,
  onSaved,
}: JsonFlashcardImportProps) {
  const toast = useToast();
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<JsonImportPreview | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [imageStates, setImageStates] = useState<Record<number, "loaded" | "failed">>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [expandedPreviewRows, setExpandedPreviewRows] = useState<Record<number, boolean>>({});

  const prompt = useMemo(
    () => getJsonFlashcardImportPrompt({ collectionName, deckName }),
    [collectionName, deckName]
  );
  const imageCards = preview?.cards.flatMap((card, index) => card.imageUrl ? [{ card, index }] : []) ?? [];
  const failedImages = imageCards.filter(({ index }) => imageStates[index] === "failed");
  const pendingImages = imageCards.filter(({ index }) => !imageStates[index]);
  const canImport = Boolean(preview?.valid && pendingImages.length === 0 && failedImages.length === 0 && !isImporting);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Đã sao chép prompt", { description: "Dán prompt vào ChatGPT, Gemini hoặc Claude rồi gửi danh sách từ." });
    } catch {
      toast.error("Không thể sao chép prompt", { description: "Trình duyệt không cho phép truy cập clipboard." });
    }
  };

  const validateAndPreview = async () => {
    if (!rawJson.trim()) {
      setRequestError("Vui lòng dán JSON trước khi kiểm tra.");
      return;
    }

    setIsValidating(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/json-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", rawJson }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true || !("data" in data)) {
        throw new Error(getErrorMessage(data, "Không thể kiểm tra JSON."));
      }

      if (!isJsonImportPreview(data.data)) {
        throw new Error("Máy chủ trả về dữ liệu preview không hợp lệ.");
      }
      const result = data.data;
      setPreview(result);
      setImageStates({});
      setExpandedPreviewRows({});
      if (!result.valid) {
        toast.error("JSON cần được sửa", { description: `${result.errors.length} lỗi đang chặn import.` });
      }
    } catch (error) {
      setPreview(null);
      const message = error instanceof Error ? error.message : "Không thể kiểm tra JSON.";
      setRequestError(message);
      toast.error("Không thể kiểm tra JSON", { description: message });
    } finally {
      setIsValidating(false);
    }
  };

  const importCards = async () => {
    if (!canImport) return;

    setIsImporting(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/json-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", rawJson }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) {
        const details = getErrorDetails(data);
        setPreview((current) => current ? { ...current, valid: false, errors: details.length > 0 ? details : current.errors } : current);
        throw new Error(getErrorMessage(data, "Không thể nhập JSON flashcard."));
      }

      const cardsCreated = "data" in data && data.data && typeof data.data === "object" && "cardsCreated" in data.data && typeof data.data.cardsCreated === "number"
        ? data.data.cardsCreated
        : preview?.cards.length ?? 0;
      setRawJson("");
      setPreview(null);
      setImageStates({});
      setExpandedPreviewRows({});
      toast.success("Đã nhập flashcard", { description: `${cardsCreated} thẻ đã được thêm vào bộ “${deckName}”.` });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể nhập JSON flashcard.";
      setRequestError(message);
      toast.error("Không thể nhập flashcard", { description: message });
    } finally {
      setIsImporting(false);
    }
  };

  const changeJson = (value: string) => {
    setRawJson(value);
    setPreview(null);
    setImageStates({});
    setExpandedPreviewRows({});
    setRequestError(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border-2 border-[#221C16] bg-[#FEF3C7] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs font-semibold text-[#6B6258]">
          Sao chép prompt, dùng chatbot bên ngoài tạo JSON, rồi dán vào đây. WordNest không gọi AI hoặc tự tìm ảnh trong luồng này.
        </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsPromptVisible((visible) => !visible)} className="brick-button-secondary px-3 py-2 text-xs font-black" aria-expanded={isPromptVisible}>
              {isPromptVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {isPromptVisible ? "Ẩn AI Prompt" : "Hiện AI Prompt"}
            </button>
            <button type="button" onClick={copyPrompt} className="brick-button-secondary px-3 py-2 text-xs font-black">
              <ClipboardCopy className="h-4 w-4" /> Copy AI Prompt
            </button>
          </div>
        </div>
        {isPromptVisible ? <label className="block text-xs font-extrabold text-[#221C16]">
          AI Prompt — bạn có thể bôi đen và copy thủ công
          <textarea readOnly rows={14} value={prompt} className="mt-1.5 w-full resize-y rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] p-3 font-mono text-xs leading-5 text-[#221C16]" />
        </label> : null}
      </div>

      <label htmlFor="json-flashcard-import" className="block text-xs font-extrabold text-[#221C16]">
        JSON flashcard
        <textarea
          id="json-flashcard-import"
          rows={12}
          value={rawJson}
          onChange={(event) => changeJson(event.target.value)}
          disabled={isValidating || isImporting}
          placeholder={'{\n  "schemaVersion": 1,\n  "cards": []\n}'}
          className="mt-1.5 w-full resize-y rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3 font-mono text-xs leading-5 text-[#221C16] shadow-[2px_2px_0px_#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43] disabled:opacity-60"
        />
      </label>

      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => changeJson("")} disabled={!rawJson || isValidating || isImporting} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Clear
        </button>
        <button type="button" onClick={validateAndPreview} disabled={isValidating || isImporting} className="brick-button-primary px-4 py-2.5 text-xs font-black disabled:opacity-50">
          {isValidating ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</> : <><CheckCircle2 className="h-4 w-4" /> Validate & Preview</>}
        </button>
      </div>

      {requestError ? <ImportError errors={[requestError]} /> : null}
      {preview && !preview.valid ? <ImportError errors={preview.errors} /> : null}

      {preview ? (
        <div className="space-y-3 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <PreviewStat label="Tổng thẻ" value={preview.cards.length} />
            <PreviewStat label="Lỗi" value={preview.errors.length} />
            <PreviewStat label="Có ảnh" value={imageCards.length} />
            <PreviewStat label="Không ảnh" value={preview.cards.length - imageCards.length} />
          </div>
          {pendingImages.length > 0 ? <p className="text-xs font-bold text-[#B45309]">Đang kiểm tra {pendingImages.length} ảnh trước khi cho phép import.</p> : null}
          {failedImages.length > 0 ? <ImportError errors={failedImages.map(({ card }) => `Ảnh của “${card.term}” không tải được. Hãy bỏ hoặc thay imageUrl.`)} /> : null}
          <div className="overflow-x-auto rounded-lg border border-[#221C16]/30">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[#EAE3D2] text-[#221C16]"><tr><th className="p-2">Term</th><th className="p-2">Meaning</th><th className="p-2">POS</th><th className="p-2">CEFR</th><th className="p-2">Image</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {preview.cards.map((card, index) => {
                  const isExpanded = Boolean(expandedPreviewRows[index]);
                  return <Fragment key={`${card.term}-${index}`}>
                    <tr className="border-t border-[#221C16]/15">
                      <td className="p-2 font-bold"><div className="flex min-w-28 items-center justify-between gap-1"><span>{card.term}</span><button type="button" onClick={() => setExpandedPreviewRows((rows) => ({ ...rows, [index]: !isExpanded }))} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Ẩn" : "Xem"} chi tiết ${card.term}`} className="rounded p-0.5 text-[#6B6258] hover:bg-[#EAE3D2] hover:text-[#221C16]">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div></td><td className="p-2">{card.meaningVi}</td><td className="p-2">{card.partOfSpeech || "—"}</td><td className="p-2">{card.cefr || "—"}</td>
                      <td className="p-2">{card.imageUrl ? <span className="flex items-center gap-1"><ImageIcon className="h-4 w-4" /><img src={card.imageUrl} alt="" className="h-8 w-8 rounded object-cover" onLoad={() => setImageStates((state) => ({ ...state, [index]: "loaded" }))} onError={() => setImageStates((state) => ({ ...state, [index]: "failed" }))} /></span> : "—"}</td>
                      <td className="p-2 font-bold">{card.imageUrl && !imageStates[index] ? "Checking image" : imageStates[index] === "failed" ? "Image failed" : "Ready"}</td>
                    </tr>
                    {isExpanded ? <tr className="border-t border-[#221C16]/15 bg-[#FAF6EE]"><td colSpan={6} className="p-3"><dl className="grid gap-2 text-xs sm:grid-cols-2"><PreviewDetail label="IPA" value={card.ipa} /><PreviewDetail label="Definition" value={card.definitionEn} /><PreviewDetail label="Example (EN)" value={card.exampleEn} /><PreviewDetail label="Example (VI)" value={card.exampleVi} /><PreviewDetail label="Image URL" value={card.imageUrl} isUrl /></dl></td></tr> : null}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>
          {preview.valid ? <button type="button" onClick={importCards} disabled={!canImport} className="brick-button-primary w-full px-4 py-3 text-sm font-black disabled:opacity-50">
              {isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang nhập toàn bộ thẻ...</> : `Import ${preview.cards.length} flashcard`}
            </button> : null}
        </div>
      ) : null}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[#221C16]/25 bg-[#FAF6EE] p-2"><p className="text-lg font-black text-[#221C16]">{value}</p><p className="text-[11px] font-bold text-[#6B6258]">{label}</p></div>;
}

function PreviewDetail({ label, value, isUrl = false }: { label: string; value: string | null | undefined; isUrl?: boolean }) {
  return <div><dt className="font-extrabold text-[#6B6258]">{label}</dt><dd className="mt-0.5 break-words text-[#221C16]">{value ? isUrl ? <a href={value} target="_blank" rel="noreferrer" className="underline">{value}</a> : value : "—"}</dd></div>;
}

function ImportError({ errors }: { errors: string[] }) {
  return <div role="alert" className="rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] p-3 text-xs font-bold text-[#991B1B]"><div className="flex gap-2"><AlertCircle className="h-4 w-4 shrink-0" /><ul className="space-y-1">{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div></div>;
}
