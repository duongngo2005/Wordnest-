"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { PronounceButton } from "../flashcards/PronounceButton";
import { extractSentenceContainingUsageWithBoundary } from "@/lib/story/story-context";
import type { ContextualTranslationResponse } from "@/lib/validation/story";
import type { StoryVocabulary, StoryVocabularyUsage } from "@/lib/story/story-vocabulary";
import { StoryNarrationControls } from "./StoryNarrationControls";
import type { DeckStoryWord } from "./StoryGeneratorModal";

export interface StoryData {
  id: string;
  deckId: string;
  title: string;
  content: string;
  cefr: string;
  length: string;
  topic: string;
  vocabulary: StoryVocabulary;
  createdAt: Date;
}

type TranslationPanel = {
  selectedText: string;
  canonicalTerm: string | null;
  source: "deck" | "ai";
  translation?: ContextualTranslationResponse;
  deckWord?: DeckStoryWord;
  contextualMeaning?: string;
  loading?: boolean;
  error?: string;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function TargetText({
  paragraph,
  usage,
  onClick,
}: {
  paragraph: string;
  usage: StoryVocabularyUsage[];
  onClick: (item: StoryVocabularyUsage) => void;
}) {
  const usableUsage = usage
    .filter((item) => item.usedAs.trim())
    .toSorted((first, second) => second.usedAs.length - first.usedAs.length);
  if (usableUsage.length === 0) return paragraph;

  const usageBySurface = new Map(usableUsage.map((item) => [normalize(item.usedAs), item]));
  const pattern = usableUsage.map((item) => escapeRegExp(item.usedAs.trim())).join("|");
  const parts = paragraph.split(new RegExp(`(\\b(?:${pattern})\\b)`, "gi"));

  return parts.map((part, index) => {
    const matchingUsage = usageBySurface.get(normalize(part));
    if (!matchingUsage) return part;
    return (
      <button
        key={`${matchingUsage.term}-${index}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick(matchingUsage);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className="wn-story-highlight"
        aria-label={`Xem nghĩa của ${matchingUsage.usedAs}`}
      >
        {part}
      </button>
    );
  });
}

function TranslationDetails({
  panel,
  deckId,
  onClose,
}: {
  panel: TranslationPanel;
  deckId: string;
  onClose: () => void;
}) {
  const translation = panel.translation;
  const meaning = translation?.meaningVi || panel.contextualMeaning || panel.deckWord?.meaningVi;
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleAddCard = async () => {
    if (!translation) return;
    setIsAddingCard(true);
    setAddCardError(null);
    try {
      const response = await fetch("/api/stories/add-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId,
          term: translation.selectedText,
          meaningVi: translation.meaningVi || translation.contextualMeaningVi,
          definitionEn: translation.definitionEn,
          ipa: translation.ipa || undefined,
          partOfSpeech: translation.partOfSpeech || undefined,
          cefr: translation.cefr || undefined,
          exampleEn: translation.exampleEn,
          exampleVi: translation.exampleVi,
        }),
      });
      const data = await response.json();
      if (!response.ok && !data.alreadyExists) {
        throw new Error(data.error || "Không thể thêm từ này vào deck.");
      }
      setCardAdded(true);
    } catch (err) {
      setAddCardError(err instanceof Error ? err.message : "Không thể thêm từ vào deck.");
    } finally {
      setIsAddingCard(false);
    }
  };

  const isFormDifferentFromCanonical =
    panel.canonicalTerm &&
    normalize(panel.canonicalTerm) !== normalize(panel.selectedText);

  return (
    <>
      {/* Mobile tap-away backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="wn-vocab-slip fixed inset-x-3 bottom-3 z-50 sm:bottom-6 sm:inset-x-auto sm:right-6 sm:w-[420px] max-w-[calc(100vw-1.5rem)] max-h-[82vh] overflow-y-auto p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-3 duration-200"
        aria-live="polite"
        aria-label="Nghĩa từ trong truyện"
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#DCD3C5] sm:hidden" />

        <div className="flex items-start justify-between gap-3 border-b border-[#221C16]/10 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border border-[#221C16] px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider ${
                  panel.source === "deck"
                    ? "bg-[#FEF3C7] text-[#8A5817]"
                    : "bg-[#DDF5F1] text-[#0F766E]"
                }`}
              >
                {panel.source === "deck" ? "Từ trong deck" : "Dịch theo ngữ cảnh AI"}
              </span>
              {panel.translation?.cefr || panel.deckWord?.cefr ? (
                <span className="rounded-md border border-[#221C16]/20 bg-[#FAF6EE] px-1.5 py-0.5 text-[10px] font-bold text-[#6B6258]">
                  {panel.translation?.cefr || panel.deckWord?.cefr}
                </span>
              ) : null}
            </div>

            <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <div>
                <h2 className="min-w-0 break-words text-xl font-black tracking-tight text-[#221C16] sm:text-2xl">
                  {panel.selectedText}
                </h2>
                {isFormDifferentFromCanonical ? (
                  <p className="mt-0.5 text-xs font-semibold text-[#8C8275]">
                    Từ gốc: <strong className="text-[#221C16]">{panel.canonicalTerm}</strong>
                  </p>
                ) : null}
              </div>
              <PronounceButton
                text={panel.selectedText}
                size="sm"
                variant="story"
                label="Phát âm"
                className="shrink-0"
              />
              {panel.deckWord?.ipa || translation?.ipa || panel.deckWord?.partOfSpeech || translation?.partOfSpeech ? (
                <div className="col-span-2 mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {panel.deckWord?.ipa || translation?.ipa ? (
                    <span className="font-mono text-xs font-bold text-[#8C8275]">
                      {translation?.ipa || panel.deckWord?.ipa}
                    </span>
                  ) : null}
                  {panel.deckWord?.partOfSpeech || translation?.partOfSpeech ? (
                    <span className="italic text-xs font-bold text-[#6B6258]">
                      ({translation?.partOfSpeech || panel.deckWord?.partOfSpeech})
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] text-[#221C16] shadow-[1.5px_1.5px_0_#221C16] hover:bg-[#FEE2E2] active:translate-y-0.5"
            aria-label="Đóng bảng nghĩa"
          >
            <X className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>

        {panel.loading ? (
          <div className="flex items-center gap-3 py-6 text-sm font-bold text-[#0F766E]">
            <Loader2 className="h-5 w-5 animate-spin text-[#0D9488]" />
            <span>Đang phân tích ngữ cảnh và dịch nghĩa từ này…</span>
          </div>
        ) : null}

        {panel.error ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-sm font-bold text-[#991B1B]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#B91C1C]" />
            <div>{panel.error}</div>
          </div>
        ) : null}

        {!panel.loading && !panel.error ? (
          <div className="mt-3 space-y-3 text-sm text-[#221C16]">
            {/* Nghĩa chính */}
            <div className="rounded-xl border border-[#221C16]/15 bg-[#FAF6EE] p-3.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-[#6B6258]">
                Nghĩa tiếng Việt
              </span>
              <p className="mt-0.5 text-base sm:text-lg font-black text-[#C85630]">
                {meaning || "Chưa có nghĩa cho từ này."}
              </p>
              {translation?.contextualMeaningVi && translation.contextualMeaningVi !== meaning ? (
                <p className="mt-1 text-xs font-bold text-[#8A5817]">
                  <span className="font-black">Trong câu:</span> {translation.contextualMeaningVi}
                </p>
              ) : null}
            </div>

            {/* Giải thích chi tiết */}
            {translation?.definitionVi ? (
              <p className="text-xs leading-relaxed text-[#4A4036]">
                <span className="font-black text-[#221C16]">Giải thích:</span> {translation.definitionVi}
              </p>
            ) : null}

            {/* Định nghĩa tiếng Anh */}
            {panel.deckWord?.definitionEn || translation?.definitionEn ? (
              <p className="text-xs leading-relaxed text-[#4A4036]">
                <span className="font-black text-[#221C16]">Định nghĩa (EN):</span>{" "}
                {translation?.definitionEn || panel.deckWord?.definitionEn}
              </p>
            ) : null}

            {/* Ví dụ & Câu dịch */}
            {translation?.exampleEn ? (
              <div className="border-t border-[#221C16]/10 pt-2.5 space-y-1">
                <p className="text-xs italic text-[#4A4036]">
                  &ldquo;{translation.exampleEn}&rdquo;
                </p>
                {translation.exampleVi ? (
                  <p className="text-xs font-bold text-[#6B6258]">&rarr; {translation.exampleVi}</p>
                ) : null}
              </div>
            ) : null}

            {/* Nút thêm từ vào deck nếu dịch bằng AI */}
            {panel.source === "ai" && translation ? (
              <div className="pt-2 border-t border-[#221C16]/10 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#8C8275]">
                  {cardAdded ? "Đã lưu vào bộ từ" : "Lưu từ này để ôn tập flashcard?"}
                </span>
                <button
                  type="button"
                  onClick={handleAddCard}
                  disabled={isAddingCard || cardAdded}
                  className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-[#221C16] px-3 py-1.5 text-xs font-black shadow-[1.5px_1.5px_0_#221C16] transition-transform active:translate-y-0.5 ${
                    cardAdded
                      ? "bg-[#DDF5F1] text-[#0F766E]"
                      : "bg-[#FEF3C7] text-[#8A5817] hover:bg-[#FDE68A]"
                  }`}
                >
                  {cardAdded ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>Đã lưu vào deck</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>{isAddingCard ? "Đang lưu..." : "Lưu vào deck"}</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}

            {addCardError ? (
              <p className="text-xs font-bold text-[#B91C1C]">{addCardError}</p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}

export function StoryReader({
  story,
  deckWords,
  storyActions,
  storyActionNotice,
  onDelete,
}: {
  story: StoryData;
  deckWords: DeckStoryWord[];
  storyActions?: ReactNode;
  storyActionNotice?: ReactNode;
  onDelete?: () => void;
}) {
  const paragraphs = story.content.split(/\n\n+/).filter(Boolean);
  const requestId = useRef(0);
  const [panel, setPanel] = useState<TranslationPanel | null>(null);

  const deckWordsByTerm = useMemo(
    () => new Map(deckWords.map((word) => [normalize(word.term), word])),
    [deckWords]
  );

  const contextualTranslations = useMemo(
    () =>
      new Map(
        story.vocabulary.contextualTranslations.map((item) => [
          `${normalize(item.term)}\u0000${normalize(item.usedAs)}`,
          item.meaningVi,
        ])
      ),
    [story.vocabulary.contextualTranslations]
  );

  // 1. Xem nghĩa từ mục tiêu trong deck
  const showDeckTranslation = (usage: StoryVocabularyUsage) => {
    const deckWord = deckWordsByTerm.get(normalize(usage.term));
    setPanel({
      selectedText: usage.usedAs,
      canonicalTerm: usage.term,
      source: "deck",
      deckWord,
      contextualMeaning:
        contextualTranslations.get(`${normalize(usage.term)}\u0000${normalize(usage.usedAs)}`) ||
        deckWord?.meaningVi,
    });
  };

  // 2. Dịch bất kỳ từ hoặc cụm từ nào
  const translateWordOrPhrase = async (rawText: string) => {
    const cleanText = rawText.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim();
    if (!cleanText || cleanText.length > 150 || !/[a-zA-Z]/.test(cleanText)) return;

    // Kiểm tra xem có trùng từ nào trong deck không
    const matchingDeckWord = deckWordsByTerm.get(normalize(cleanText));
    if (matchingDeckWord) {
      setPanel({
        selectedText: cleanText,
        canonicalTerm: matchingDeckWord.term,
        source: "deck",
        deckWord: matchingDeckWord,
        contextualMeaning:
          contextualTranslations.get(
            `${normalize(matchingDeckWord.term)}\u0000${normalize(cleanText)}`
          ) || matchingDeckWord.meaningVi,
      });
      return;
    }

    // Tìm câu ngữ cảnh linh hoạt
    let surroundingSentence = extractSentenceContainingUsageWithBoundary(story.content, cleanText);
    if (!surroundingSentence) {
      const sentences = story.content
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      surroundingSentence =
        sentences.find((sentence) =>
          sentence.toLowerCase().includes(cleanText.toLowerCase())
        ) || "";
    }
    if (!surroundingSentence) {
      const para = paragraphs.find((p) => p.toLowerCase().includes(cleanText.toLowerCase()));
      surroundingSentence = para || cleanText;
    }

    const context =
      paragraphs.find((p) => p.toLowerCase().includes(cleanText.toLowerCase())) ||
      surroundingSentence;

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setPanel({ selectedText: cleanText, canonicalTerm: null, source: "ai", loading: true });

    try {
      const response = await fetch("/api/stories/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          deckId: story.deckId,
          selectedText: cleanText,
          surroundingSentence,
          context,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.translation) {
        throw new Error(data?.error || "Không thể dịch từ này lúc này.");
      }
      if (requestId.current !== currentRequest) return;
      setPanel({
        selectedText: cleanText,
        canonicalTerm: null,
        source: "ai",
        translation: data.translation,
      });
    } catch (error) {
      if (requestId.current !== currentRequest) return;
      setPanel({
        selectedText: cleanText,
        canonicalTerm: null,
        source: "ai",
        error: error instanceof Error ? error.message : "Không thể dịch từ này lúc này.",
      });
    }
  };

  // 3. Xử lý khi click vào bất kỳ từ nào trong đoạn văn
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) return;

    // A. Bôi đen text
    const selection = window.getSelection();
    const selectedStr = selection?.toString().trim();
    if (selectedStr && selectedStr.length > 0 && selectedStr.length <= 100 && /[a-zA-Z]/.test(selectedStr)) {
      translateWordOrPhrase(selectedStr);
      return;
    }

    // B. Trích xuất từ tại vị trí click
    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (
      (
        document as unknown as {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        }
      ).caretPositionFromPoint
    ) {
      const pos = (
        document as unknown as {
          caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        }
      ).caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && pos.offsetNode) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const fullText = range.startContainer.textContent || "";
      const offset = range.startOffset;
      let start = offset;
      let end = offset;
      while (start > 0 && /[a-zA-Z0-9'-]/.test(fullText[start - 1])) start--;
      while (end < fullText.length && /[a-zA-Z0-9'-]/.test(fullText[end])) end++;
      const clickedWord = fullText
        .substring(start, end)
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
        .trim();
      if (clickedWord && clickedWord.length >= 2 && /[a-zA-Z]/.test(clickedWord)) {
        translateWordOrPhrase(clickedWord);
      }
    }
  };

  // 4. Double click
  const handleDoubleClick = () => {
    const selection = window.getSelection();
    const selectedStr = selection?.toString().trim();
    if (selectedStr && /[a-zA-Z]/.test(selectedStr)) {
      translateWordOrPhrase(selectedStr);
    }
  };

  return (
    <article
      className="wn-story-paper p-5 sm:p-8 md:p-10 relative"
      aria-labelledby="story-heading"
    >
      {/* Top Header Stamps: Clean publication / notebook style */}
      <header className="border-b-2 border-dashed border-[#DCD3C5] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="wn-story-stamp text-[#8A5817] border-[#8A5817]/40 bg-[#FEF3C7]">
              📖 {story.topic}
            </span>
            <span className="wn-story-stamp text-[#6B6258] border-[#6B6258]/30 bg-[#FAF6EE]">
              CEFR {story.cefr}
            </span>
            <span className="wn-story-stamp text-[#8C8275] border-[#DCD3C5] bg-[#FFFDF8]">
              {story.length === "short" ? "Ngắn" : story.length === "medium" ? "Vừa" : story.length === "long" ? "Dài" : story.length}
            </span>
          </div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#8C8275] hidden sm:inline-block">
            WordNest Study Archive
          </span>
        </div>

        {/* Story Title with Editorial Personality */}
        <div className="mt-3.5 flex flex-col gap-2">
          <h1
            id="story-heading"
            className="wn-story-title text-2xl sm:text-3xl md:text-4xl text-[#221C16] leading-tight"
          >
            {story.title}
          </h1>
        </div>

        {/* Reading Controls Bar: Visible reading actions, overflow destructive action */}
        <div className="mt-4 flex items-start justify-between gap-2.5 border-t border-dashed border-[#DCD3C5] pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <StoryNarrationControls content={story.content} />
            <PronounceButton text={story.title} size="sm" variant="story" label="Đọc tiêu đề" />
          </div>

          <div className="shrink-0 flex items-center gap-2 pt-0.5">
            {/* Overflow Menu for Secondary/Destructive Actions */}
            <details className="relative wn-menu-details">
              <summary
                aria-label="Tùy chọn truyện"
                className="wn-icon-button flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16] cursor-pointer list-none transition-transform active:translate-y-0.5"
              >
                <MoreHorizontal className="h-4 w-4 text-[#6B6258]" />
              </summary>
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              />
              <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-1.5 shadow-[3px_3px_0px_#221C16]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                    if (onDelete) onDelete();
                  }}
                  className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa truyện</span>
                </button>
              </div>
            </details>
          </div>
        </div>

        {storyActionNotice}
      </header>

      {/* Story Prose Body with Editorial Serif font */}
      <div
        className="wn-story-prose py-6 select-text cursor-text"
        onClick={handleContentClick}
        onDoubleClick={handleDoubleClick}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index}>
            <TargetText
              paragraph={paragraph}
              usage={story.vocabulary.usage}
              onClick={showDeckTranslation}
            />
          </p>
        ))}

        {/* End of story ornament / signature */}
        <div className="my-6 flex items-center justify-center gap-3 text-[#DCD3C5]" aria-hidden="true">
          <span className="h-px w-12 bg-[#DCD3C5]" />
          <span className="text-xs font-bold tracking-widest text-[#B5A998]">✦ ✦ ✦</span>
          <span className="h-px w-12 bg-[#DCD3C5]" />
        </div>
      </div>

      {/* Target Word Translation Panel (Floating/Bottom Sheet) */}
      {panel ? (
        <TranslationDetails panel={panel} deckId={story.deckId} onClose={() => setPanel(null)} />
      ) : null}
    </article>
  );
}
