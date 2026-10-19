"use client";

/* eslint-disable @next/next/no-img-element -- next/image would server-fetch untrusted import URLs. */

import { Fragment, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { EXTERNAL_AI_V3_PROMPT_TERM_LIMIT, getJsonFlashcardImportPrompt } from "@/lib/flashcards/json-import-prompt";
import type { ExternalAiV3Manifest, ExternalAiV3ManifestComparison } from "@/lib/flashcards/json-import";
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from "@/lib/validation/flashcard";
import { useToast } from "@/components/ui/ToastProvider";
import { parseVocabularyInput } from "@/services/vocabulary/parser";
import {
  ExternalAiV3DuplicateReview,
  type DuplicateDecision,
  type DuplicateReviewCard,
  type DuplicateReviewCandidate,
} from "@/components/flashcards/ExternalAiV3DuplicateReview";

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

interface SkippedCardInfo {
  term: string;
  normalizedTerm: string;
  reason: string;
  status?: "EXISTING_NOT_LINKED" | "EXISTING_ALREADY_LINKED" | "CONTENT_CONFLICT" | "AMBIGUOUS_LEGACY_IDENTITY" | "DUPLICATE_WITHIN_IMPORT";
  existingCardId?: string;
  existingDeckId?: string;
  existingDeckName?: string;
  existingFolderName?: string;
  existingLocations?: Array<{
    cardId: string;
    deckId: string;
    deckName: string;
    folderName?: string;
  }>;
  contentConflictFields?: string[];
  existingCard?: DuplicateReviewCandidate;
  existingCandidates?: DuplicateReviewCandidate[];
  effectiveIncomingCard?: PreviewCard;
  requiresIndividualOverwriteConfirmation?: boolean;
}

interface JsonImportPreview {
  valid: boolean;
  cards: PreviewCard[];
  newCards: PreviewCard[];
  skippedCards?: SkippedCardInfo[];
  existingCards?: SkippedCardInfo[];
  errors: string[];
  mode?: "legacy" | "external-ai-v3";
  manifest?: ExternalAiV3ManifestComparison;
  reviewSnapshots?: Array<{
    normalizedTerm: string;
    classification: "new" | "existing" | "ambiguous";
    incomingFingerprint: string;
    flashcardId?: string;
    contentVersion?: string;
  }>;
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

function isDuplicateReviewCandidate(value: unknown): value is DuplicateReviewCandidate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    typeof candidate.term === "string" &&
    typeof candidate.normalizedTerm === "string" &&
    typeof candidate.meaningVi === "string" &&
    (candidate.partOfSpeech === null || typeof candidate.partOfSpeech === "string") &&
    (candidate.ipa === null || typeof candidate.ipa === "string") &&
    (candidate.definitionEn === null || typeof candidate.definitionEn === "string") &&
    (candidate.exampleEn === null || typeof candidate.exampleEn === "string") &&
    (candidate.exampleVi === null || typeof candidate.exampleVi === "string") &&
    (candidate.cefr === null || typeof candidate.cefr === "string") &&
    (candidate.imageUrl === null || typeof candidate.imageUrl === "string") &&
    typeof candidate.contentVersion === "string" &&
    typeof candidate.reviewCount === "number" &&
    typeof candidate.fsrsState === "number" &&
    typeof candidate.fsrsRepetitions === "number" &&
    Array.isArray(candidate.locations);
}

function isSkippedCardInfo(value: unknown): value is SkippedCardInfo {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Record<string, unknown>;
  return typeof card.term === "string" &&
    typeof card.normalizedTerm === "string" &&
    typeof card.reason === "string" &&
    (!("existingCard" in card) || card.existingCard === undefined || isDuplicateReviewCandidate(card.existingCard)) &&
    (!("existingCandidates" in card) || card.existingCandidates === undefined || (Array.isArray(card.existingCandidates) && card.existingCandidates.every(isDuplicateReviewCandidate))) &&
    (!("effectiveIncomingCard" in card) || card.effectiveIncomingCard === undefined || isPreviewCard(card.effectiveIncomingCard));
}

function isReviewSnapshot(value: unknown): value is NonNullable<JsonImportPreview["reviewSnapshots"]>[number] {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.normalizedTerm === "string" &&
    (snapshot.classification === "new" || snapshot.classification === "existing" || snapshot.classification === "ambiguous") &&
    typeof snapshot.incomingFingerprint === "string" && /^[a-f0-9]{64}$/i.test(snapshot.incomingFingerprint) &&
    (!("flashcardId" in snapshot) || snapshot.flashcardId === undefined || typeof snapshot.flashcardId === "string") &&
    (!("contentVersion" in snapshot) || snapshot.contentVersion === undefined || typeof snapshot.contentVersion === "string");
}

function isJsonImportPreview(value: unknown): value is JsonImportPreview {
  const hasManifest = (candidate: Record<string, unknown>) => !("manifest" in candidate) || candidate.manifest === undefined || (
    typeof candidate.manifest === "object" && candidate.manifest !== null &&
    "expectedCount" in candidate.manifest && typeof candidate.manifest.expectedCount === "number" &&
    "receivedCount" in candidate.manifest && typeof candidate.manifest.receivedCount === "number" &&
    "missingTerms" in candidate.manifest && Array.isArray(candidate.manifest.missingTerms) &&
    "unexpectedTerms" in candidate.manifest && Array.isArray(candidate.manifest.unexpectedTerms) &&
    "duplicateTerms" in candidate.manifest && Array.isArray(candidate.manifest.duplicateTerms) &&
    "spellingChanges" in candidate.manifest && Array.isArray(candidate.manifest.spellingChanges) &&
    "orderMismatches" in candidate.manifest && Array.isArray(candidate.manifest.orderMismatches) &&
    "isExactMatch" in candidate.manifest && typeof candidate.manifest.isExactMatch === "boolean"
  );
  return typeof value === "object" && value !== null &&
    "valid" in value && typeof value.valid === "boolean" &&
    "cards" in value && Array.isArray(value.cards) && value.cards.every(isPreviewCard) &&
    "newCards" in value && Array.isArray(value.newCards) && value.newCards.every(isPreviewCard) &&
    "errors" in value && Array.isArray(value.errors) && value.errors.every((error) => typeof error === "string") &&
    (!("skippedCards" in value) || value.skippedCards === undefined || (Array.isArray(value.skippedCards) && value.skippedCards.every(isSkippedCardInfo))) &&
    (!("existingCards" in value) || value.existingCards === undefined || (Array.isArray(value.existingCards) && value.existingCards.every(isSkippedCardInfo))) &&
    (!("reviewSnapshots" in value) || value.reviewSnapshots === undefined || (Array.isArray(value.reviewSnapshots) && value.reviewSnapshots.every(isReviewSnapshot))) &&
    hasManifest(value as Record<string, unknown>);
}

function serializePreviewCards(cards: PreviewCard[]): string {
  return JSON.stringify({ schemaVersion: 1, cards }, null, 2);
}

function editableCard(card: PreviewCard): PreviewCard {
  return {
    term: card.term,
    meaningVi: card.meaningVi,
    partOfSpeech: card.partOfSpeech ?? "",
    ipa: card.ipa ?? null,
    definitionEn: card.definitionEn ?? "",
    exampleEn: card.exampleEn ?? "",
    exampleVi: card.exampleVi ?? "",
    cefr: card.cefr ?? null,
    imageUrl: card.imageUrl ?? null,
  };
}

/** Kept pure so the import action gate is regression-testable. */
export function canSaveJsonImportPreview({
  previewValid,
  hasLocalEdits,
  hasPendingImages,
  hasFailedImages,
  isImporting,
  newCardCount,
  linkExistingCount = 0,
  overwriteCount = 0,
  reviewedExistingCount = 0,
}: {
  previewValid: boolean;
  hasLocalEdits: boolean;
  hasPendingImages: boolean;
  hasFailedImages: boolean;
  isImporting: boolean;
  newCardCount: number;
  linkExistingCount?: number;
  overwriteCount?: number;
  reviewedExistingCount?: number;
}): boolean {
  return previewValid && newCardCount + linkExistingCount + overwriteCount + reviewedExistingCount > 0 && !hasLocalEdits && !hasPendingImages && !hasFailedImages && !isImporting;
}

export function JsonFlashcardImport({
  deckId,
  deckName,
  collectionName,
  onSaved,
}: JsonFlashcardImportProps) {
  const toast = useToast();
  const [rawJson, setRawJson] = useState("");
  const [rawTerms, setRawTerms] = useState("");
  const [sourceContext, setSourceContext] = useState("");
  const [externalManifest, setExternalManifest] = useState<ExternalAiV3Manifest | null>(null);
  const [preview, setPreview] = useState<JsonImportPreview | null>(null);
  const [editableCards, setEditableCards] = useState<PreviewCard[] | null>(null);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [imageStates, setImageStates] = useState<Record<number, "loaded" | "failed">>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [expandedPreviewRows, setExpandedPreviewRows] = useState<Record<number, boolean>>({});
  const [linkExistingCardIds, setLinkExistingCardIds] = useState<string[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<string, DuplicateDecision>>({});
  const [posAcknowledgements, setPosAcknowledgements] = useState<Record<string, boolean>>({});

  const parsedTerms = useMemo(() => parseVocabularyInput(rawTerms, EXTERNAL_AI_V3_PROMPT_TERM_LIMIT), [rawTerms]);
  const prompt = useMemo(
    () => getJsonFlashcardImportPrompt({ collectionName, deckName, terms: parsedTerms.terms, sourceContext }),
    [collectionName, deckName, parsedTerms.terms, sourceContext]
  );
  const displayCards = editableCards ?? preview?.cards ?? [];
  const saveableTerms = new Set(preview?.newCards.map((card) => card.term) ?? []);
  const imageCards = displayCards.flatMap((card, index) => card.imageUrl && saveableTerms.has(card.term) ? [{ card, index }] : []);
  const failedImages = imageCards.filter(({ index }) => imageStates[index] === "failed");
  const pendingImages = imageCards.filter(({ index }) => !imageStates[index]);
  const newCardCount = preview?.newCards.length ?? 0;
  const linkExistingCount = linkExistingCardIds.length;
  const isExternalV3 = externalManifest !== null;
  const duplicateReviewCards = isExternalV3 ? (preview?.existingCards ?? []) as DuplicateReviewCard[] : [];
  const overwriteCount = duplicateReviewCards.filter((card) => card.existingCard && duplicateDecisions[card.existingCard.id] === "overwrite").length;
  const keepExistingCount = duplicateReviewCards.filter((card) => card.existingCard && duplicateDecisions[card.existingCard.id] !== "overwrite").length;
  const ambiguousExistingCount = duplicateReviewCards.filter((card) => !card.existingCard).length;
  const overwriteDecisions = duplicateReviewCards.flatMap((card) => {
    const existing = card.existingCard;
    return existing && duplicateDecisions[existing.id] === "overwrite"
      ? [{ flashcardId: existing.id, action: "overwrite" as const, confirmsPartOfSpeechChange: Boolean(posAcknowledgements[existing.id]) }]
      : [];
  });
  const canImport = canSaveJsonImportPreview({
    previewValid: Boolean(preview?.valid),
    hasLocalEdits,
    hasPendingImages: pendingImages.length > 0,
    hasFailedImages: failedImages.length > 0,
    isImporting,
    newCardCount,
    linkExistingCount,
    overwriteCount,
    reviewedExistingCount: isExternalV3 ? keepExistingCount + ambiguousExistingCount : 0,
  });

  const rememberManifest = (): ExternalAiV3Manifest | null => {
    if (parsedTerms.error || parsedTerms.terms.length === 0) return null;
    const manifest = { terms: [...parsedTerms.terms] };
    setExternalManifest(manifest);
    return manifest;
  };

  const copyPrompt = async () => {
    if (parsedTerms.error) {
      setRequestError(parsedTerms.error);
      return;
    }
    if (parsedTerms.terms.length === 0) {
      setRequestError("Nhập ít nhất một từ để tạo AI Prompt.");
      return;
    }
    rememberManifest();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(prompt);
      } else {
        // Fallback for insecure context / HTTP on LAN IP
        const textArea = document.createElement("textarea");
        textArea.value = prompt;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success("Đã sao chép prompt", { description: "Dán vào công cụ AI của bạn." });
    } catch {
      toast.error("Không thể sao chép prompt", { description: "Trình duyệt không cho phép truy cập clipboard." });
    }
  };

  const validateAndPreview = async (rawJsonOverride = rawJson) => {
    if (!rawJsonOverride.trim()) {
      setRequestError("Vui lòng dán JSON trước khi kiểm tra.");
      return;
    }

    setIsValidating(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/decks/${deckId}/cards/json-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          rawJson: rawJsonOverride,
          mode: isExternalV3 ? "external-ai-v3" : "legacy",
          manifest: externalManifest ?? undefined,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true || !("data" in data)) {
        throw new Error(getErrorMessage(data, "Không thể kiểm tra JSON."));
      }

      if (!isJsonImportPreview(data.data)) {
        throw new Error("Máy chủ trả về dữ liệu preview không hợp lệ.");
      }
      const result = data.data;
      const resultCards = isExternalV3
        ? result.cards.length > 0 ? result.cards.map(editableCard) : editableCards
        : null;
      setPreview(resultCards && !result.valid ? { ...result, cards: resultCards } : result);
      setEditableCards(resultCards);
      setImageStates({});
      setExpandedPreviewRows({});
      setLinkExistingCardIds([]);
      setDuplicateDecisions({});
      setPosAcknowledgements({});
      setHasLocalEdits(false);
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
        body: JSON.stringify({
          action: "import",
          rawJson: isExternalV3 && editableCards ? serializePreviewCards(editableCards) : rawJson,
          mode: isExternalV3 ? "external-ai-v3" : "legacy",
          manifest: externalManifest ?? undefined,
          // V3 never links an existing canonical card into the target Deck.
          // The legacy workflow keeps its independent explicit link behavior.
          linkExistingCardIds: isExternalV3 ? [] : linkExistingCardIds,
          review: isExternalV3 && preview?.reviewSnapshots
            ? { snapshots: preview.reviewSnapshots, decisions: overwriteDecisions }
            : undefined,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) {
        const details = getErrorDetails(data);
        setPreview((current) => current ? { ...current, valid: false, errors: details.length > 0 ? details : current.errors } : current);
        throw new Error(getErrorMessage(data, "Không thể nhập JSON flashcard."));
      }

      const resultData = "data" in data && data.data && typeof data.data === "object" ? data.data : null;
      const cardsCreated = resultData && "cardsCreated" in resultData && typeof resultData.cardsCreated === "number"
        ? resultData.cardsCreated
        : preview?.cards.length ?? 0;
      const skippedCount = resultData && "skippedDuplicates" in resultData && Array.isArray(resultData.skippedDuplicates)
        ? resultData.skippedDuplicates.length
        : preview?.skippedCards?.length ?? 0;
      const linkedExistingCards = resultData && "linkedExistingCards" in resultData && typeof resultData.linkedExistingCards === "number"
        ? resultData.linkedExistingCards
        : 0;
      const existingUpdated = resultData && "existingUpdated" in resultData && typeof resultData.existingUpdated === "number"
        ? resultData.existingUpdated
        : 0;
      const existingKept = resultData && "existingKept" in resultData && typeof resultData.existingKept === "number"
        ? resultData.existingKept
        : 0;
      const ambiguousSkipped = resultData && "ambiguousSkipped" in resultData && typeof resultData.ambiguousSkipped === "number"
        ? resultData.ambiguousSkipped
        : 0;

      setRawJson("");
      setPreview(null);
      setEditableCards(null);
      setExternalManifest(null);
      setHasLocalEdits(false);
      setImageStates({});
      setExpandedPreviewRows({});
      setLinkExistingCardIds([]);
      setDuplicateDecisions({});
      setPosAcknowledgements({});

      if (cardsCreated > 0 || linkedExistingCards > 0 || existingUpdated > 0) {
        toast.success("Đã nhập flashcard", {
          description: `${cardsCreated} thẻ mới${existingUpdated ? ` · ${existingUpdated} thẻ cập nhật` : ""}${existingKept ? ` · ${existingKept} thẻ giữ nguyên` : ""}${ambiguousSkipped ? ` · ${ambiguousSkipped} cần xử lý thủ công` : ""}${linkedExistingCards > 0 ? ` · ${linkedExistingCards} từ đã có được liên kết` : ""}.`,
        });
      } else {
        toast.info("Không có thẻ mới", {
          description: `Không có nội dung được ghi. ${existingKept || skippedCount} từ hiện có được giữ nguyên.`,
        });
      }
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
    setEditableCards(null);
    setHasLocalEdits(false);
    setImageStates({});
    setExpandedPreviewRows({});
    setLinkExistingCardIds([]);
    setDuplicateDecisions({});
    setPosAcknowledgements({});
    setRequestError(null);
  };

  const changeTerms = (value: string) => {
    setRawTerms(value);
    // The manifest is a snapshot of the terms that were sent to the external
    // assistant. Editing the source list means the user must generate/copy a
    // new prompt before the pasted response can be treated as an External V3 batch.
    setExternalManifest(null);
    setIsPromptVisible(false);
    setLinkExistingCardIds([]);
    setDuplicateDecisions({});
    setPosAcknowledgements({});
    setRequestError(null);
  };

  const updateCard = (index: number, field: keyof PreviewCard, value: string | null) => {
    setEditableCards((cards) => cards?.map((card, cardIndex) => cardIndex === index ? { ...card, [field]: value } : card) ?? cards);
    setHasLocalEdits(true);
    setDuplicateDecisions({});
    setPosAcknowledgements({});
    setImageStates((states) => {
      const next = { ...states };
      delete next[index];
      return next;
    });
  };

  const validateEditedCards = () => {
    if (!editableCards) return;
    const updatedJson = serializePreviewCards(editableCards);
    setRawJson(updatedJson);
    void validateAndPreview(updatedJson);
  };

  const reorderCardsToManifest = () => {
    if (!editableCards || !externalManifest) return;
    const byTerm = new Map(editableCards.map((card) => [card.term, card]));
    const reordered = externalManifest.terms.map((term) => byTerm.get(term)).filter((card): card is PreviewCard => Boolean(card));
    if (reordered.length !== editableCards.length) return;
    setEditableCards(reordered);
    setHasLocalEdits(true);
    setDuplicateDecisions({});
    setPosAcknowledgements({});
  };

  const setDuplicateDecision = (flashcardId: string, decision: DuplicateDecision) => {
    setDuplicateDecisions((current) => ({ ...current, [flashcardId]: decision }));
  };

  const keepAllExisting = () => {
    const next: Record<string, DuplicateDecision> = {};
    for (const card of duplicateReviewCards) {
      if (card.existingCard) next[card.existingCard.id] = "keep";
    }
    setDuplicateDecisions(next);
    setPosAcknowledgements({});
  };

  const overwriteAllEligible = () => {
    const next: Record<string, DuplicateDecision> = {};
    for (const card of duplicateReviewCards) {
      if (!card.existingCard) continue;
      next[card.existingCard.id] = card.requiresIndividualOverwriteConfirmation ? "keep" : "overwrite";
    }
    setDuplicateDecisions(next);
  };

  return (
    <div className="wn-ai-flow">
      <section className="wn-ai-section" aria-labelledby="ai-vocabulary-title">
        <div className="wn-ai-section__header">
          <h3 id="ai-vocabulary-title">Từ vựng</h3>
          <p id="json-vocabulary-helper" aria-live="polite">
            {parsedTerms.error
              ? parsedTerms.error
              : `${parsedTerms.terms.length}/${EXTERNAL_AI_V3_PROMPT_TERM_LIMIT} từ${parsedTerms.duplicateCount ? ` · bỏ ${parsedTerms.duplicateCount} từ trùng` : ""}`}
          </p>
        </div>

        <label htmlFor="json-vocabulary-terms" className="wn-ai-label">
          Danh sách từ
          <textarea
            id="json-vocabulary-terms"
            value={rawTerms}
            onChange={(event) => changeTerms(event.target.value)}
            rows={4}
            className="wn-field wn-ai-textarea"
            aria-describedby="json-vocabulary-helper"
          />
        </label>

        <details className="wn-ai-context">
          <summary>Thêm ngữ cảnh</summary>
          <label htmlFor="json-vocabulary-context" className="wn-ai-label">
            Ngữ cảnh sử dụng
            <textarea
              id="json-vocabulary-context"
              value={sourceContext}
              onChange={(event) => {
                setSourceContext(event.target.value);
                setRequestError(null);
              }}
              rows={3}
              maxLength={4_000}
              className="wn-field wn-ai-textarea"
              aria-describedby="json-vocabulary-context-helper"
            />
            <span id="json-vocabulary-context-helper" className="wn-ai-field-note">
              Dùng để xác định nghĩa hoặc từ loại.
            </span>
          </label>
        </details>

        <div className="wn-ai-actions">
          <button
            type="button"
            disabled={parsedTerms.terms.length === 0 || Boolean(parsedTerms.error)}
            onClick={copyPrompt}
            className="wn-ai-button wn-ai-button--primary"
          >
            Tạo và sao chép prompt
          </button>
          <button
            type="button"
            disabled={parsedTerms.terms.length === 0 || Boolean(parsedTerms.error)}
            onClick={() => {
              if (!isPromptVisible) rememberManifest();
              setIsPromptVisible((visible) => !visible);
            }}
            className="wn-ai-text-button"
            aria-expanded={isPromptVisible}
          >
            {isPromptVisible ? "Ẩn prompt" : "Xem prompt"}
          </button>
        </div>

        {externalManifest ? (
          <p className="wn-ai-status" aria-live="polite">
            Prompt V3 sẵn sàng cho {externalManifest.terms.length} từ theo đúng thứ tự.
          </p>
        ) : null}

        {isPromptVisible ? (
          <label className="wn-ai-label wn-ai-prompt">
            Prompt
            <textarea
              readOnly
              rows={10}
              value={prompt}
              className="wn-ai-code-input"
            />
          </label>
        ) : null}
      </section>

      <section className="wn-ai-section" aria-labelledby="ai-json-title">
        <div className="wn-ai-section__header">
          <h3 id="ai-json-title">JSON import</h3>
        </div>

        <label htmlFor="json-flashcard-import" className="wn-ai-label">
          JSON flashcard
          <textarea
            id="json-flashcard-import"
            rows={8}
            value={rawJson}
            onChange={(event) => changeJson(event.target.value)}
            disabled={isValidating || isImporting}
            className="wn-ai-code-input"
          />
        </label>

        <div className="wn-ai-actions">
          <button
            type="button"
            onClick={() => void validateAndPreview()}
            disabled={isValidating || isImporting || !rawJson.trim()}
            className="wn-ai-button wn-ai-button--primary"
          >
            {isValidating ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Đang kiểm tra…</> : "Kiểm tra và xem trước"}
          </button>
        </div>
      </section>

      {requestError ? <ImportError errors={[requestError]} /> : null}
      {preview && !preview.valid ? <ImportError errors={preview.errors} /> : null}

      {preview ? (
        <section className="wn-ai-preview" aria-labelledby="ai-preview-title">
          <div className="wn-ai-section__header">
            <h3 id="ai-preview-title">Xem trước</h3>
            <p className={preview.valid ? "wn-ai-valid" : "wn-ai-invalid"}>
              {preview.valid ? "Dữ liệu hợp lệ" : "Cần sửa dữ liệu"}
            </p>
          </div>
          {isExternalV3 ? <p className="wn-ai-summary" aria-live="polite">
            {newCardCount} từ mới · {duplicateReviewCards.length} từ trùng{preview.errors.length ? ` · ${preview.errors.length} lỗi cần sửa` : ""}
          </p> : <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <PreviewStat label="Tổng thẻ" value={displayCards.length} />
            <PreviewStat label="Term mới" value={newCardCount} />
            <PreviewStat label="Đã có" value={preview.existingCards?.length ?? 0} />
            <PreviewStat label="Lỗi" value={preview.errors.length} />
          </div>}
          {preview.manifest ? <ManifestReport comparison={preview.manifest} onReorder={reorderCardsToManifest} /> : null}
          {preview.skippedCards && preview.skippedCards.length > 0 ? (
            <div className="wn-ai-warning">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5 flex-1">
                  <p className="font-extrabold">
                    Phát hiện {preview.skippedCards.length} term bị lặp ngay trong JSON import (không tạo bản sao):
                  </p>
                  <ul className="max-h-36 overflow-y-auto space-y-1 divide-y font-medium">
                    {preview.skippedCards.map((sc, i) => (
                      <li key={`${sc.term}-${i}`} className="pt-1 first:pt-0 flex items-center justify-between gap-2">
                        <span className="font-bold">“{sc.term}”</span>
                        <span className="text-[11px]">{sc.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
          {isExternalV3 && preview.existingCards && preview.existingCards.length > 0 ? (
            <ExternalAiV3DuplicateReview
              duplicates={duplicateReviewCards}
              newTerms={preview.newCards.map((card) => card.term)}
              decisions={duplicateDecisions}
              posAcknowledgements={posAcknowledgements}
              onDecision={setDuplicateDecision}
              onPartOfSpeechAcknowledgement={(flashcardId, acknowledged) => {
                setPosAcknowledgements((current) => ({ ...current, [flashcardId]: acknowledged }));
                if (!acknowledged) {
                  setDuplicateDecisions((current) => ({ ...current, [flashcardId]: "keep" }));
                }
              }}
              onKeepAll={keepAllExisting}
              onOverwriteAll={overwriteAllEligible}
            />
          ) : null}
          {!isExternalV3 && preview.existingCards && preview.existingCards.length > 0 ? (
            <div className="wn-ai-warning">
              <p className="font-extrabold">{preview.existingCards.length} term đã có trong WordNest. Chúng là kết quả hợp lệ và không tạo lịch học thứ hai.</p>
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto font-medium">
                {preview.existingCards.map((card, index) => {
                  const canLink = Boolean(card.existingCardId) &&
                    card.status !== "EXISTING_ALREADY_LINKED" &&
                    card.status !== "AMBIGUOUS_LEGACY_IDENTITY";
                  const selected = card.existingCardId ? linkExistingCardIds.includes(card.existingCardId) : false;
                  return <li key={`${card.term}-${index}`} className="wn-ai-existing-card">
                    <p><span className="font-extrabold">“{card.term}”</span> — {card.reason}</p>
                    {card.existingLocations?.map((location) => <a key={location.cardId} href={`/decks/${location.deckId}`} className="mt-1 inline-block font-bold underline underline-offset-2">
                      Mở card hiện có: {location.folderName ? `${location.folderName} → ` : ""}{location.deckName}
                    </a>)}
                    {card.contentConflictFields && card.contentConflictFields.length > 0 ? <p className="mt-1 wn-ai-danger-text">Nội dung khác card hiện có: {card.contentConflictFields.join(", ")}. Không ghi đè tự động.</p> : null}
                    {canLink && card.existingCardId ? <label className="mt-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => setLinkExistingCardIds((current) => event.target.checked
                          ? [...new Set([...current, card.existingCardId!])]
                          : current.filter((id) => id !== card.existingCardId))}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>Liên kết hồ sơ từ vựng hiện có với bộ này. Không thay đổi nội dung hoặc lịch sử học.</span>
                    </label> : null}
                  </li>;
                })}
              </ul>
            </div>
          ) : null}
          {pendingImages.length > 0 ? <p className="wn-ai-pending">Đang kiểm tra {pendingImages.length} ảnh trước khi cho phép import.</p> : null}
          {failedImages.length > 0 ? <ImportError errors={failedImages.map(({ card }) => `Ảnh của “${card.term}” không tải được. Hãy bỏ hoặc thay imageUrl.`)} /> : null}
          <div className="wn-ai-preview-table">
            <table>
              <thead><tr><th className="p-2">Term</th><th className="p-2">Meaning</th><th className="p-2">POS</th><th className="p-2">CEFR</th><th className="p-2">Image</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {displayCards.map((card, index) => {
                  const isExpanded = Boolean(expandedPreviewRows[index]);
                  const existingVocabulary = preview.existingCards?.find((existing) => existing.term === card.term);
                  const cardErrors = preview.errors.filter((error) => error.includes(`"${card.term}"`));
                  return <Fragment key={`${card.term}-${index}`}>
                    <tr>
                      <td className="p-2 font-bold"><div className="flex min-w-28 items-center justify-between gap-1"><span>{card.term}</span><button type="button" onClick={() => setExpandedPreviewRows((rows) => ({ ...rows, [index]: !isExpanded }))} aria-expanded={isExpanded} className="wn-ai-row-toggle">{isExpanded ? "Ẩn" : "Sửa"}<span className="wn-sr-only"> chi tiết {card.term}</span></button></div></td><td className="p-2">{card.meaningVi}</td><td className="p-2">{card.partOfSpeech || "—"}</td><td className="p-2">{card.cefr || "—"}</td>
                      <td className="p-2">{card.imageUrl ? <img src={card.imageUrl} alt="" className="h-8 w-8 rounded object-cover" onLoad={() => setImageStates((state) => ({ ...state, [index]: "loaded" }))} onError={() => setImageStates((state) => ({ ...state, [index]: "failed" }))} /> : "—"}</td>
                      <td className="p-2 font-bold">{existingVocabulary ? "Đã có trong WordNest" : cardErrors.length ? "Cần sửa" : card.imageUrl && !imageStates[index] ? "Checking image" : imageStates[index] === "failed" ? "Image failed" : preview.valid ? "Sẵn sàng" : "Cần sửa"}</td>
                    </tr>
                    {isExpanded ? <tr className="wn-ai-preview-table__detail"><td colSpan={6} className="p-3">{isExternalV3 ? <ExternalAiV3CardEditor card={card} index={index} errors={cardErrors} onChange={updateCard} /> : <dl className="grid gap-2 text-xs sm:grid-cols-2"><PreviewDetail label="IPA" value={card.ipa} /><PreviewDetail label="Definition" value={card.definitionEn} /><PreviewDetail label="Example (EN)" value={card.exampleEn} /><PreviewDetail label="Example (VI)" value={card.exampleVi} /><PreviewDetail label="Image URL" value={card.imageUrl} isUrl /></dl>}</td></tr> : null}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </div>
          {isExternalV3 && editableCards && displayCards.length > 0 && hasLocalEdits ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={validateEditedCards} disabled={isValidating || isImporting} className="wn-ai-button">
                Kiểm tra lại nội dung đã sửa
              </button>
              <p className="self-center wn-ai-pending">Các thay đổi thủ công cần được kiểm tra lại trước khi nhập.</p>
            </div>
          ) : null}
          {preview.valid ? (
            (isExternalV3 ? newCardCount + overwriteCount + keepExistingCount + ambiguousExistingCount > 0 : newCardCount + linkExistingCount > 0) ? (
              <div className={isExternalV3 ? "wn-external-ai-import-action" : "space-y-3"}>
                {isExternalV3 ? <p aria-live="polite">{newCardCount} thêm mới · {overwriteCount} ghi đè · {keepExistingCount} giữ nguyên{ambiguousExistingCount ? ` · ${ambiguousExistingCount} cần xử lý` : ""}</p> : null}
                <button
                  type="button"
                  onClick={() => void importCards()}
                  disabled={!canImport}
                  className="wn-ai-button wn-ai-button--primary w-full px-4 py-3 text-sm"
                >
                  {isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang áp dụng thay đổi...</> : isExternalV3 ? "Áp dụng thay đổi và nhập flashcard" : `Import ${newCardCount} term mới${linkExistingCount > 0 ? ` và liên kết ${linkExistingCount} term có sẵn` : ""}`}
                </button>
              </div>
            ) : (
              <div className="wn-ai-empty">
                {isExternalV3 ? "Không có term hợp lệ để xác nhận import." : "Không có term mới để nhập hoặc term hiện có được chọn để liên kết."}
              </div>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return <div className="wn-ai-stat"><p>{value}</p><p>{label}</p></div>;
}

function PreviewDetail({ label, value, isUrl = false }: { label: string; value: string | null | undefined; isUrl?: boolean }) {
  return <div className="wn-ai-detail"><dt>{label}</dt><dd>{value ? isUrl ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : value : "—"}</dd></div>;
}

function ManifestReport({ comparison, onReorder }: { comparison: ExternalAiV3ManifestComparison; onReorder: () => void }) {
  const onlyOrderDiffers = comparison.orderMismatches.length > 0 &&
    comparison.missingTerms.length === 0 &&
    comparison.unexpectedTerms.length === 0 &&
    comparison.duplicateTerms.length === 0 &&
    comparison.spellingChanges.length === 0 &&
    comparison.expectedCount === comparison.receivedCount;
  const messages = [
    comparison.expectedCount !== comparison.receivedCount ? `Cần ${comparison.expectedCount} term, nhận ${comparison.receivedCount}.` : null,
    ...comparison.missingTerms.map((term) => `Thiếu “${term}”.`),
    ...comparison.unexpectedTerms.map((term) => `Không thuộc batch: “${term}”.`),
    ...comparison.duplicateTerms.map((term) => `Trùng trong JSON: “${term}”.`),
    ...comparison.spellingChanges.map((change) => `Đổi chính tả: “${change.expected}” → “${change.received}”.`),
    comparison.orderMismatches.length > 0 ? "Thứ tự term không khớp manifest." : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <section aria-label="Kiểm tra manifest V3" className="wn-ai-manifest" data-valid={comparison.isExactMatch || undefined}>
      <p>{comparison.isExactMatch ? "Manifest V3 khớp chính xác: số lượng, term và thứ tự đều đúng." : "Manifest V3 phát hiện chênh lệch cần xử lý."}</p>
      {messages.length > 0 ? <ul className="mt-1.5 space-y-1 font-semibold">{messages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul> : null}
      {onlyOrderDiffers ? <button type="button" onClick={onReorder} className="wn-ai-button mt-3">Sắp xếp lại theo manifest</button> : null}
    </section>
  );
}

function ExternalAiV3CardEditor({
  card,
  index,
  errors,
  onChange,
}: {
  card: PreviewCard;
  index: number;
  errors: string[];
  onChange: (index: number, field: keyof PreviewCard, value: string | null) => void;
}) {
  const fieldId = (field: string) => `external-v3-card-${index}-${field}`;
  return (
    <fieldset className="wn-ai-editor">
      <legend className="sr-only">Chỉnh sửa flashcard {card.term}</legend>
      <p>Term được khóa theo manifest V3: <span>{card.term}</span></p>
      <label htmlFor={fieldId("meaningVi")}>Nghĩa tiếng Việt
        <input id={fieldId("meaningVi")} value={card.meaningVi} onChange={(event) => onChange(index, "meaningVi", event.target.value)} className="wn-field" />
      </label>
      <label htmlFor={fieldId("partOfSpeech")}>Từ loại
        <select id={fieldId("partOfSpeech")} value={card.partOfSpeech ?? ""} onChange={(event) => onChange(index, "partOfSpeech", event.target.value)} className="wn-field">
          <option value="">Chọn từ loại</option>
          {PART_OF_SPEECH_OPTIONS.map((partOfSpeech) => <option key={partOfSpeech} value={partOfSpeech}>{partOfSpeech}</option>)}
        </select>
      </label>
      <label className="wn-ai-editor__wide" htmlFor={fieldId("definitionEn")}>English definition
        <textarea id={fieldId("definitionEn")} rows={2} value={card.definitionEn ?? ""} onChange={(event) => onChange(index, "definitionEn", event.target.value)} className="wn-field" />
      </label>
      <label className="wn-ai-editor__wide" htmlFor={fieldId("exampleEn")}>English example
        <textarea id={fieldId("exampleEn")} rows={2} value={card.exampleEn ?? ""} onChange={(event) => onChange(index, "exampleEn", event.target.value)} className="wn-field" />
      </label>
      <label className="wn-ai-editor__wide" htmlFor={fieldId("exampleVi")}>Bản dịch ví dụ tiếng Việt
        <textarea id={fieldId("exampleVi")} rows={2} value={card.exampleVi ?? ""} onChange={(event) => onChange(index, "exampleVi", event.target.value)} className="wn-field" />
      </label>
      <label htmlFor={fieldId("ipa")}>IPA <span>(không bắt buộc)</span>
        <input id={fieldId("ipa")} value={card.ipa ?? ""} onChange={(event) => onChange(index, "ipa", event.target.value || null)} className="wn-field" />
      </label>
      <label htmlFor={fieldId("cefr")}>CEFR <span>(không bắt buộc)</span>
        <select id={fieldId("cefr")} value={card.cefr ?? ""} onChange={(event) => onChange(index, "cefr", event.target.value || null)} className="wn-field">
          <option value="">Không chắc / null</option>
          {CEFR_LEVELS.map((cefr) => <option key={cefr} value={cefr}>{cefr}</option>)}
        </select>
      </label>
      {errors.length > 0 ? <p role="alert" className="wn-ai-editor__wide wn-ai-inline-error">{errors.join(" ")}</p> : null}
    </fieldset>
  );
}

function ImportError({ errors }: { errors: string[] }) {
  return <div role="alert" className="wn-ai-alert"><div className="flex gap-2"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /><ul className="space-y-1">{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div></div>;
}
