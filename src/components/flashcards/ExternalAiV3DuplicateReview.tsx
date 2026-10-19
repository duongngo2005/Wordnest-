"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

export interface DuplicateReviewLocation {
  cardId: string;
  deckId: string;
  deckName: string;
  folderName?: string;
}

export interface DuplicateReviewCandidate {
  id: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  partOfSpeech: string | null;
  ipa: string | null;
  definitionEn: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  cefr: string | null;
  imageUrl: string | null;
  contentVersion: string;
  reviewCount: number;
  fsrsState: number;
  fsrsRepetitions: number;
  locations: DuplicateReviewLocation[];
}

export interface DuplicateReviewIncomingCard {
  term: string;
  meaningVi?: string;
  partOfSpeech?: string | null;
  ipa?: string | null;
  definitionEn?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  cefr?: string | null;
  imageUrl?: string | null;
}

export interface DuplicateReviewCard {
  term: string;
  normalizedTerm: string;
  reason: string;
  status?: "EXISTING_NOT_LINKED" | "EXISTING_ALREADY_LINKED" | "CONTENT_CONFLICT" | "AMBIGUOUS_LEGACY_IDENTITY" | "DUPLICATE_WITHIN_IMPORT";
  existingCardId?: string;
  existingLocations?: DuplicateReviewLocation[];
  contentConflictFields?: string[];
  existingCard?: DuplicateReviewCandidate;
  existingCandidates?: DuplicateReviewCandidate[];
  effectiveIncomingCard?: DuplicateReviewIncomingCard;
  requiresIndividualOverwriteConfirmation?: boolean;
}

export type DuplicateDecision = "keep" | "overwrite";

const comparisonFields: Array<{ key: keyof DuplicateReviewIncomingCard; label: string }> = [
  { key: "meaningVi", label: "Nghĩa tiếng Việt" },
  { key: "partOfSpeech", label: "Từ loại" },
  { key: "ipa", label: "IPA" },
  { key: "definitionEn", label: "English definition" },
  { key: "exampleEn", label: "English example" },
  { key: "exampleVi", label: "Vietnamese example" },
  { key: "cefr", label: "CEFR" },
];

function displayValue(value: string | null | undefined) {
  return value?.trim() || "—";
}

export function getEffectiveChangedFields(existing: DuplicateReviewCandidate, incoming: DuplicateReviewIncomingCard) {
  return comparisonFields.filter(({ key }) => {
    const currentValue = existing[key as keyof DuplicateReviewCandidate];
    const current = typeof currentValue === "string" || currentValue === null ? currentValue : undefined;
    return displayValue(current) !== displayValue(incoming[key]);
  });
}

function Locations({ locations }: { locations: DuplicateReviewLocation[] }) {
  if (locations.length === 0) return <p className="wn-duplicate-muted">Chưa thuộc Deck nào.</p>;
  return <ul className="wn-duplicate-decks">{locations.map((location) => <li key={`${location.cardId}-${location.deckId}`}>{location.folderName ? `${location.folderName} / ` : ""}{location.deckName}</li>)}</ul>;
}

function CardColumn({
  title,
  card,
  fields,
  changedKeys,
}: {
  title: string;
  card: DuplicateReviewCandidate | DuplicateReviewIncomingCard;
  fields: typeof comparisonFields;
  changedKeys: Set<keyof DuplicateReviewIncomingCard>;
}) {
  return <section className="wn-duplicate-card" aria-label={title}>
    <h4>{title}</h4>
    {fields.length > 0 ? <dl>
      {fields.map(({ key, label }) => {
        const rawValue = card[key as keyof typeof card];
        const value = typeof rawValue === "string" || rawValue === null || rawValue === undefined ? rawValue : undefined;
        const changed = changedKeys.has(key);
        return <div className={changed ? "is-changed" : undefined} key={key}>
          <dt>{label}</dt>
          <dd data-primary={key === "meaningVi" || undefined}>{displayValue(value)}</dd>
        </div>;
      })}
    </dl> : <p className="wn-duplicate-muted">Không có trường nội dung nào thay đổi.</p>}
  </section>;
}

function HistoricalCandidates({ candidates }: { candidates: DuplicateReviewCandidate[] }) {
  return <section className="wn-duplicate-candidates" aria-label="Flashcard lịch sử cần phân biệt">
    <h4>Các flashcard lịch sử cần phân biệt</h4>
    {candidates.map((candidate) => <article key={candidate.id}>
      <p><strong>{candidate.term}</strong> · {candidate.meaningVi} · {candidate.partOfSpeech ?? "—"}</p>
      <Locations locations={candidate.locations} />
    </article>)}
  </section>;
}

function DuplicateComparison({
  duplicate,
  posAcknowledgements,
  onPartOfSpeechAcknowledgement,
}: {
  duplicate: DuplicateReviewCard;
  posAcknowledgements: Record<string, boolean>;
  onPartOfSpeechAcknowledgement: (flashcardId: string, acknowledged: boolean) => void;
}) {
  const [showAllFields, setShowAllFields] = useState(false);

  if (!duplicate.existingCard || !duplicate.effectiveIncomingCard) {
    return <div className="wn-duplicate-comparison wn-duplicate-comparison--manual" role="status">
      <AlertCircle aria-hidden="true" />
      <div>
        <p><strong>Không thể ghi đè tự động.</strong> {duplicate.reason}</p>
        {duplicate.existingCandidates?.length ? <HistoricalCandidates candidates={duplicate.existingCandidates} /> : null}
      </div>
    </div>;
  }

  const existing = duplicate.existingCard;
  const incoming = duplicate.effectiveIncomingCard;
  const changedFields = getEffectiveChangedFields(existing, incoming);
  const changedKeys = new Set(changedFields.map(({ key }) => key));
  const fields = showAllFields ? comparisonFields : changedFields;
  const requiresAcknowledgement = Boolean(duplicate.requiresIndividualOverwriteConfirmation && !posAcknowledgements[existing.id]);

  return <div className="wn-duplicate-comparison">
    <details className="wn-duplicate-deck-details">
      <summary>Xem {existing.locations.length} Deck đang dùng thẻ này</summary>
      <Locations locations={existing.locations} />
    </details>
    {duplicate.requiresIndividualOverwriteConfirmation ? <label className="wn-duplicate-pos-check">
      <input type="checkbox" checked={Boolean(posAcknowledgements[existing.id])} onChange={(event) => onPartOfSpeechAcknowledgement(existing.id, event.target.checked)} />
      <span>Tôi hiểu từ loại thay đổi từ “{existing.partOfSpeech}” sang “{incoming.partOfSpeech}”.</span>
    </label> : null}
    <div className="wn-duplicate-controls"><button type="button" onClick={() => setShowAllFields((visible) => !visible)} aria-pressed={showAllFields} className="wn-duplicate-text-button">
      {showAllFields ? "Chỉ xem thay đổi" : `Xem đủ ${comparisonFields.length} trường`}
    </button></div>
    {requiresAcknowledgement ? <p className="wn-duplicate-inline-note">Cần xác nhận thay đổi từ loại trước khi có thể ghi đè.</p> : null}
    <div className="wn-duplicate-cards">
      <CardColumn title="Flashcard hiện có" card={existing} fields={fields} changedKeys={changedKeys} />
      <CardColumn title="Flashcard AI mới" card={incoming} fields={fields} changedKeys={changedKeys} />
    </div>
  </div>;
}

export function ExternalAiV3DuplicateReview({
  duplicates,
  newTerms,
  decisions,
  posAcknowledgements,
  onDecision,
  onPartOfSpeechAcknowledgement,
  onKeepAll,
  onOverwriteAll,
}: {
  duplicates: DuplicateReviewCard[];
  newTerms: string[];
  decisions: Record<string, DuplicateDecision>;
  posAcknowledgements: Record<string, boolean>;
  onDecision: (flashcardId: string, decision: DuplicateDecision) => void;
  onPartOfSpeechAcknowledgement: (flashcardId: string, acknowledged: boolean) => void;
  onKeepAll: () => void;
  onOverwriteAll: () => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const reviewableDuplicates = duplicates.filter((duplicate) => Boolean(duplicate.existingCard && duplicate.effectiveIncomingCard));
  const overwriteCount = reviewableDuplicates.filter((duplicate) => duplicate.existingCard && decisions[duplicate.existingCard.id] === "overwrite").length;
  const keepCount = reviewableDuplicates.length - overwriteCount;
  const manualCount = duplicates.length - reviewableDuplicates.length;
  const acknowledgementCount = reviewableDuplicates.filter((duplicate) => duplicate.requiresIndividualOverwriteConfirmation).length;
  const hasSharedVocabulary = reviewableDuplicates.some((duplicate) => (duplicate.existingCard?.locations.length ?? 0) > 1);

  return <section className="wn-external-ai-review" aria-labelledby="external-ai-duplicate-review-title">
    <header className="wn-duplicate-header">
      <div>
        <h3 id="external-ai-duplicate-review-title">Đối soát flashcard trùng</h3>
        <p aria-live="polite" aria-atomic="true">{newTerms.length} từ mới · {duplicates.length} từ trùng · {overwriteCount} ghi đè · {keepCount} giữ nguyên{manualCount ? ` · ${manualCount} cần xử lý` : ""}</p>
      </div>
      <div className="wn-duplicate-bulk-actions" aria-label="Thao tác hàng loạt">
        <button type="button" onClick={onKeepAll} className="wn-duplicate-action wn-duplicate-action--primary">Giữ nguyên tất cả</button>
        <button type="button" onClick={onOverwriteAll} className="wn-duplicate-action">Ghi đè tất cả</button>
      </div>
    </header>
    <p className="wn-duplicate-intro">Flashcard trùng giữ nguyên lịch sử học; ghi đè chỉ cập nhật nội dung.</p>
    {hasSharedVocabulary ? <p className="wn-duplicate-inline-note" role="status">Một số thẻ đang dùng ở nhiều Deck; ghi đè sẽ cập nhật nội dung ở mọi Deck đó.</p> : null}
    {acknowledgementCount > 0 ? <p className="wn-duplicate-inline-note" role="status">{acknowledgementCount} từ đổi từ loại cần xác nhận riêng; nút “Ghi đè tất cả” sẽ giữ nguyên các từ này.</p> : null}

    <div className="wn-duplicate-list">
      {duplicates.map((duplicate, index) => {
        const key = duplicate.existingCard ? `card:${duplicate.existingCard.id}` : `manual:${duplicate.normalizedTerm}:${index}`;
        const expanded = expandedKey === key;
        const existing = duplicate.existingCard;
        const decision = existing ? decisions[existing.id] ?? "keep" : null;
        const requiresAcknowledgement = Boolean(existing && duplicate.requiresIndividualOverwriteConfirmation && !posAcknowledgements[existing.id]);
        return <article className="wn-duplicate-row" aria-label={`Đối soát ${duplicate.term}`} key={key}>
          <div className="wn-duplicate-row__main">
            <button type="button" className="wn-duplicate-expand" aria-expanded={expanded} aria-controls={`duplicate-panel-${index}`} onClick={() => setExpandedKey((current) => current === key ? null : key)}>
              <strong>{duplicate.term}</strong><span>{requiresAcknowledgement ? "Xác nhận đổi từ loại" : expanded ? "Ẩn so sánh" : "Xem so sánh"}</span>
            </button>
            {existing ? <fieldset className="wn-duplicate-row__decision">
              <legend className="wn-sr-only">Quyết định cho {duplicate.term}</legend>
              <label className={decision === "keep" ? "is-selected" : undefined}><input type="radio" name={`duplicate-row-decision-${existing.id}`} checked={decision === "keep"} onChange={() => onDecision(existing.id, "keep")} />Giữ cũ</label>
              <label className={`${decision === "overwrite" ? "is-selected" : ""}${requiresAcknowledgement ? " is-disabled" : ""}`.trim()}><input type="radio" name={`duplicate-row-decision-${existing.id}`} checked={decision === "overwrite"} disabled={requiresAcknowledgement} onChange={() => onDecision(existing.id, "overwrite")} />Ghi đè</label>
            </fieldset> : <span className="wn-duplicate-manual">Cần xử lý</span>}
          </div>
          <div id={`duplicate-panel-${index}`} hidden={!expanded} className="wn-duplicate-panel">
            {expanded ? <DuplicateComparison duplicate={duplicate} posAcknowledgements={posAcknowledgements} onPartOfSpeechAcknowledgement={onPartOfSpeechAcknowledgement} /> : null}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
