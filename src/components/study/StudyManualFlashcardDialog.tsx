"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { useToast } from "@/components/ui/ToastProvider";

export interface StudyManualFlashcardDraft {
  term: string;
  meaningVi: string;
  partOfSpeech?: string;
  ipa?: string;
  definitionEn?: string;
  exampleEn?: string;
  exampleVi?: string;
  cefr?: string;
  imageUrl?: string;
}

interface StudyManualExistingCard {
  id: string;
  term: string;
  meaningVi: string;
  partOfSpeech: string | null;
  ipa: string | null;
  definitionEn: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  cefr: string | null;
  imageUrl: string | null;
  contentVersion: string;
  locations: Array<{
    cardId: string;
    deckId: string;
    deckName: string;
    folderName?: string;
  }>;
}

export interface StudyManualDuplicatePreview {
  classification: "new" | "existing" | "ambiguous";
  incomingFingerprint: string;
  existingCard?: StudyManualExistingCard;
  existingCandidates?: StudyManualExistingCard[];
  changedFields: string[];
  reason?: string;
}

interface StudyManualFlashcardDialogProps {
  deckId: string;
  initialDraft?: StudyManualFlashcardDraft;
  onClose: () => void;
  onDuplicateFound: (draft: StudyManualFlashcardDraft, preview: StudyManualDuplicatePreview) => void;
  onCreated: () => void;
}

interface StudyManualDuplicateReviewDialogProps {
  deckId: string;
  draft: StudyManualFlashcardDraft;
  preview: StudyManualDuplicatePreview;
  onBack: () => void;
  onClose: () => void;
}

const EMPTY_DRAFT: StudyManualFlashcardDraft = {
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

const FIELD_LABELS: Record<string, string> = {
  meaningVi: "Nghĩa tiếng Việt",
  partOfSpeech: "Từ loại",
  ipa: "IPA",
  definitionEn: "Định nghĩa tiếng Anh",
  exampleEn: "Ví dụ tiếng Anh",
  exampleVi: "Dịch ví dụ",
  cefr: "CEFR",
  imageUrl: "URL hình ảnh",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readApiData<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string"
      ? body.error
      : "Máy chủ không thể xử lý thẻ lúc này.";
    throw new Error(message);
  }
  if (!isRecord(body) || body.success !== true || !("data" in body)) {
    throw new Error("Máy chủ không trả về dữ liệu thẻ hợp lệ.");
  }
  return body.data as T;
}

function isExistingPreview(preview: StudyManualDuplicatePreview): preview is StudyManualDuplicatePreview & {
  classification: "existing";
  existingCard: StudyManualExistingCard;
} {
  return preview.classification === "existing" && Boolean(preview.existingCard);
}

function draftValue(draft: StudyManualFlashcardDraft, field: string): string {
  const value = draft[field as keyof StudyManualFlashcardDraft];
  return typeof value === "string" && value.trim() ? value : "Không thay đổi";
}

function existingValue(card: StudyManualExistingCard, field: string): string {
  const value = card[field as keyof StudyManualExistingCard];
  return typeof value === "string" && value.trim() ? value : "Chưa có";
}

function useStudyDialogFocus(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  initialFocusRef: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (dialog?.open) dialog.close();
      opener?.focus();
    };
  }, [dialogRef, initialFocusRef]);
}

function FormError({ error }: { error: string | null }) {
  return (
    <p
      id="study-manual-card-error"
      role="alert"
      className={error ? "wn-form-error" : "wn-sr-only"}
    >
      {error ?? ""}
    </p>
  );
}

export function StudyManualFlashcardDialog({
  deckId,
  initialDraft,
  onClose,
  onDuplicateFound,
  onCreated,
}: StudyManualFlashcardDialogProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<StudyManualFlashcardDraft>(() => initialDraft ?? EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useStudyDialogFocus(dialogRef, termInputRef);

  const updateDraft = (field: keyof StudyManualFlashcardDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (error) setError(null);
  };

  const commitNewCard = async (preview: StudyManualDuplicatePreview) => {
    await readApiData(
      await fetch(`/api/decks/${deckId}/cards/manual/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: draft,
          decision: { action: "create", incomingFingerprint: preview.incomingFingerprint },
        }),
      })
    );
    toast.success("Đã thêm thẻ mới");
    onCreated();
  };

  const checkAndSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.term.trim() || !draft.meaningVi.trim()) {
      setError("Nhập từ tiếng Anh và nghĩa tiếng Việt trước khi kiểm tra.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const preview = await readApiData<StudyManualDuplicatePreview>(
        await fetch(`/api/decks/${deckId}/cards/manual/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card: draft }),
        })
      );
      if (isExistingPreview(preview)) {
        onDuplicateFound(draft, preview);
        return;
      }
      if (preview.classification === "ambiguous") {
        setError(preview.reason ?? "Có nhiều thẻ cũ cùng từ này nên chưa thể ghi đè an toàn.");
        return;
      }
      await commitNewCard(preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể kiểm tra thẻ trùng.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="study-manual-card-title"
      className="m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-xl overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-0 text-[#221C16] shadow-[6px_6px_0px_#221C16] backdrop:bg-[#221C16]/45"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSubmitting) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <form onSubmit={checkAndSave} className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-dashed border-[#DCD3C5] bg-[#FEF8ED] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="study-manual-card-title" className="text-lg font-black tracking-tight">Thêm từ trong lúc ôn</h2>
            <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Nhập tay, không dùng AI.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="wn-button wn-button-quiet wn-icon-button shrink-0"
            aria-label="Đóng thêm từ"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="wn-form-group">
            <div className="grid gap-3">
              <label className="wn-field-label">
                <span>Từ</span>
                <input
                  ref={termInputRef}
                  value={draft.term}
                  onChange={(event) => updateDraft("term", event.target.value)}
                  disabled={isSubmitting}
                  autoCapitalize="none"
                  autoComplete="off"
                  required
                  aria-describedby={error ? "study-manual-card-error" : undefined}
                  className="wn-field"
                />
              </label>
              <label className="wn-field-label">
                <span>Nghĩa tiếng Việt</span>
                <input
                  value={draft.meaningVi}
                  onChange={(event) => updateDraft("meaningVi", event.target.value)}
                  disabled={isSubmitting}
                  required
                  aria-describedby={error ? "study-manual-card-error" : undefined}
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
                    <select value={draft.partOfSpeech ?? ""} onChange={(event) => updateDraft("partOfSpeech", event.target.value)} disabled={isSubmitting} className="wn-field">
                      <option value="">Không chọn</option>
                      {PART_OF_SPEECH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="wn-field-label">
                    <span>CEFR</span>
                    <select value={draft.cefr ?? ""} onChange={(event) => updateDraft("cefr", event.target.value)} disabled={isSubmitting} className="wn-field">
                      <option value="">Không chọn</option>
                      {CEFR_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <label className="wn-field-label">
                  <span>IPA</span>
                  <input value={draft.ipa ?? ""} onChange={(event) => updateDraft("ipa", event.target.value)} disabled={isSubmitting} autoCapitalize="none" className="wn-field font-mono" />
                </label>
                <label className="wn-field-label">
                  <span>Định nghĩa tiếng Anh</span>
                  <textarea value={draft.definitionEn ?? ""} onChange={(event) => updateDraft("definitionEn", event.target.value)} disabled={isSubmitting} rows={2} className="wn-field" />
                </label>
                <label className="wn-field-label">
                  <span>Ví dụ tiếng Anh</span>
                  <textarea value={draft.exampleEn ?? ""} onChange={(event) => updateDraft("exampleEn", event.target.value)} disabled={isSubmitting} rows={2} className="wn-field" />
                </label>
                <label className="wn-field-label">
                  <span>Dịch ví dụ</span>
                  <textarea value={draft.exampleVi ?? ""} onChange={(event) => updateDraft("exampleVi", event.target.value)} disabled={isSubmitting} rows={2} className="wn-field" />
                </label>
                <label className="wn-field-label">
                  <span>URL hình ảnh</span>
                  <input value={draft.imageUrl ?? ""} onChange={(event) => updateDraft("imageUrl", event.target.value)} disabled={isSubmitting} autoCapitalize="none" className="wn-field" />
                </label>
              </div>
            </details>

            <p aria-live="polite" className={isSubmitting ? "text-xs font-bold text-[#6B6258]" : "wn-sr-only"}>
              {isSubmitting ? "Đang kiểm tra thẻ trùng..." : ""}
            </p>
            <FormError error={error} />
          </div>
        </div>

        <footer className="wn-form-actions wn-modal-footer-safe shrink-0 bg-[#FFFDF9] px-4 sm:px-5">
          <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="brick-button-primary px-5 py-2 text-sm font-black">
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Đang kiểm tra...</span></> : <><Check className="h-4 w-4" aria-hidden="true" /><span>Kiểm tra và thêm</span></>}
          </button>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="brick-button-secondary px-4 py-2 text-sm font-bold">Hủy</button>
        </footer>
      </form>
    </dialog>
  );
}

export function StudyManualDuplicateReviewDialog({
  deckId,
  draft,
  preview,
  onBack,
  onClose,
}: StudyManualDuplicateReviewDialogProps) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const existingCard = preview.existingCard;

  useStudyDialogFocus(dialogRef, keepButtonRef);

  const keepExistingCard = () => {
    toast.info("Giữ nguyên thẻ hiện có");
    onClose();
  };

  const overwriteExistingCard = async () => {
    if (!existingCard) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await readApiData(
        await fetch(`/api/decks/${deckId}/cards/manual/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card: draft,
            decision: {
              action: "overwrite",
              existingCardId: existingCard.id,
              contentVersion: existingCard.contentVersion,
              incomingFingerprint: preview.incomingFingerprint,
            },
          }),
        })
      );
      toast.success("Đã ghi đè thẻ hiện có");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể ghi đè thẻ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!existingCard) return null;
  const locations = existingCard.locations.map((location) => `${location.folderName ? `${location.folderName} › ` : ""}${location.deckName}`).join(", ");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="study-manual-duplicate-title"
      className="m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-xl overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-0 text-[#221C16] shadow-[6px_6px_0px_#221C16] backdrop:bg-[#221C16]/45"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSubmitting) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-dashed border-[#DCD3C5] bg-[#FEF8ED] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="study-manual-duplicate-title" className="text-lg font-black tracking-tight">Thẻ đã tồn tại</h2>
            <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">{existingCard.term} đang có trong {locations || "WordNest"}.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="wn-button wn-button-quiet wn-icon-button shrink-0" aria-label="Đóng xem thẻ trùng">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-4">
            <section aria-labelledby="study-manual-existing-card" className="rounded-xl border-2 border-[#221C16] bg-[#FEF8ED] p-3.5 shadow-[2px_2px_0px_#221C16]">
              <h3 id="study-manual-existing-card" className="text-sm font-black">Thẻ hiện có</h3>
              <p className="mt-2 text-lg font-black break-words">{existingCard.term}</p>
              <p className="mt-0.5 font-semibold text-[#6B6258]">{existingCard.meaningVi}</p>
              {existingCard.definitionEn ? <p className="mt-2 text-xs italic text-[#6B6258]">{existingCard.definitionEn}</p> : null}
              {existingCard.exampleEn ? <p className="mt-2 text-xs font-semibold">“{existingCard.exampleEn}”</p> : null}
              {existingCard.exampleVi ? <p className="mt-1 text-xs text-[#6B6258]">{existingCard.exampleVi}</p> : null}
            </section>

            <section aria-labelledby="study-manual-changes" className="border-t-2 border-dashed border-[#DCD3C5] pt-4">
              <h3 id="study-manual-changes" className="text-sm font-black">Nội dung sẽ đổi</h3>
              <dl className="mt-3 grid gap-3">
                {preview.changedFields.length > 0 ? preview.changedFields.map((field) => (
                  <div key={field} className="grid gap-1 border-l-2 border-[var(--accent)] pl-3">
                    <dt className="text-xs font-black text-[#6B6258]">{FIELD_LABELS[field] ?? field}</dt>
                    <dd className="grid gap-1 text-xs">
                      <span className="text-[#6B6258]">Đang có: {existingValue(existingCard, field)}</span>
                      <span className="font-bold">Mới: {draftValue(draft, field)}</span>
                    </dd>
                  </div>
                )) : <p className="text-xs font-semibold text-[#6B6258]">Nội dung giống nhau; chỉ cần giữ thẻ hiện có.</p>}
              </dl>
              <p className="mt-3 text-xs font-semibold text-[#6B6258]">Trường để trống sẽ giữ nguyên. Lịch sử ôn và lịch sử luyện không thay đổi.</p>
            </section>

            <p role="alert" className={error ? "wn-form-error" : "wn-sr-only"}>{error ?? ""}</p>
          </div>
        </div>

        <footer className="wn-form-actions wn-modal-footer-safe shrink-0 bg-[#FFFDF9] px-4 sm:px-5">
          <button type="button" onClick={onBack} disabled={isSubmitting} className="brick-button-secondary px-4 py-2 text-sm font-bold">Quay lại chỉnh sửa</button>
          <button ref={keepButtonRef} type="button" onClick={keepExistingCard} disabled={isSubmitting} className="wn-button wn-button-quiet px-4 py-2 text-sm font-bold">Giữ thẻ hiện có</button>
          <button type="button" onClick={() => void overwriteExistingCard()} disabled={isSubmitting || preview.changedFields.length === 0} aria-busy={isSubmitting} className="brick-button-primary px-5 py-2 text-sm font-black">
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Đang ghi đè...</span></> : <><RefreshCw className="h-4 w-4" aria-hidden="true" /><span>Ghi đè thẻ hiện có</span></>}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
