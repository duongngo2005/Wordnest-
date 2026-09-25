"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  BookMarked,
  Check,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { PronounceButton } from "../flashcards/PronounceButton";
import { extractSentenceContainingUsageWithBoundary } from "@/lib/story/story-context";
import { panelVariants } from "@/lib/motion-tokens";
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
  sentence?: string;
  trailIndex?: number;
  trailTotal?: number;
  loading?: boolean;
  error?: string;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useMobileStorySheet() {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia("(max-width: 639px)");
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false
  );
}

function useBottomSheetDrag(onClose: () => void) {
  const startYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    startYRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    startYRef.current = event.clientY;
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events in tests do not always own a browser pointer.
    }
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    setDragOffset(Math.max(0, event.clientY - startYRef.current));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const offset = Math.max(0, event.clientY - startYRef.current);
    if (offset >= 88) {
      onClose();
      return;
    }
    reset();
  }, [onClose, reset]);

  return {
    dragOffset,
    isDragging,
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset },
  };
}

function TargetText({
  paragraph,
  usage,
  activeUsageIndex,
  onClick,
}: {
  paragraph: string;
  usage: StoryVocabularyUsage[];
  activeUsageIndex: number | null;
  onClick: (item: StoryVocabularyUsage, usageIndex: number, trigger: HTMLButtonElement) => void;
}) {
  const usableUsage = usage
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.usedAs.trim())
    .toSorted((first, second) => second.item.usedAs.length - first.item.usedAs.length);
  if (usableUsage.length === 0) return paragraph;

  const usageBySurface = new Map(usableUsage.map((entry) => [normalize(entry.item.usedAs), entry]));
  const pattern = usableUsage.map(({ item }) => escapeRegExp(item.usedAs.trim())).join("|");
  const parts = paragraph.split(new RegExp(`(\\b(?:${pattern})\\b)`, "gi"));

  return parts.map((part, index) => {
    const matching = usageBySurface.get(normalize(part));
    if (!matching) return part;
    const isActive = activeUsageIndex === matching.index;
    const formIsDifferent = normalize(matching.item.term) !== normalize(matching.item.usedAs);
    return (
      <button
        key={`${matching.item.term}-${index}`}
        type="button"
        data-story-target-index={matching.index}
        onClick={(event) => {
          event.stopPropagation();
          if (window.getSelection()?.toString().trim()) return;
          onClick(matching.item, matching.index, event.currentTarget);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={`wn-story-highlight ${isActive ? "wn-story-highlight--active" : ""}`}
        aria-pressed={isActive}
        aria-label={formIsDifferent ? `Xem nghĩa của ${matching.item.usedAs}, dạng của ${matching.item.term}` : `Xem nghĩa của ${matching.item.usedAs}`}
      >
        {part}
      </button>
    );
  });
}

function VocabularyNoteContent({
  panel,
  deckId,
  onClose,
  closeButtonRef,
}: {
  panel: TranslationPanel;
  deckId: string;
  onClose: () => void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const translation = panel.translation;
  const meaning = translation?.meaningVi || panel.contextualMeaning || panel.deckWord?.meaningVi;
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);
  const formIsDifferent = panel.canonicalTerm && normalize(panel.canonicalTerm) !== normalize(panel.selectedText);

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
      if (!response.ok && !data.alreadyExists) throw new Error(data.error || "Không thể thêm từ này vào deck.");
      setCardAdded(true);
    } catch (error) {
      setAddCardError(error instanceof Error ? error.message : "Không thể thêm từ vào deck.");
    } finally {
      setIsAddingCard(false);
    }
  };

  const ipa = panel.deckWord?.ipa || translation?.ipa;
  const partOfSpeech = panel.deckWord?.partOfSpeech || translation?.partOfSpeech;

  return (
    <div className="wn-vocab-note-content">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-[#221C16]/12 pb-3">
        <div className="min-w-0">
          {panel.trailIndex !== undefined && panel.trailTotal ? <p className="wn-story-kicker">Từ trong bài · {panel.trailIndex + 1} / {panel.trailTotal}</p> : null}
          <h2 id="story-vocabulary-note-title" className="mt-1 break-words font-[family-name:var(--font-story-display)] text-[1.7rem] font-semibold leading-none tracking-[-0.025em] text-[#221C16] sm:text-[2rem]">
            {panel.selectedText}
          </h2>
          {formIsDifferent ? <p className="mt-1 text-xs font-semibold text-[#756A5D]">Dạng của: <strong className="text-[#221C16]">{panel.canonicalTerm}</strong></p> : null}
          {ipa || partOfSpeech ? <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#756A5D]">{ipa ? <span className="font-mono font-semibold">{ipa}</span> : null}{partOfSpeech ? <span className="italic">{partOfSpeech}</span> : null}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PronounceButton text={panel.selectedText} size="sm" variant="story" label="Phát âm" className="min-h-11" />
          <button ref={closeButtonRef} type="button" onClick={onClose} className="wn-story-icon-control" aria-label="Đóng bảng nghĩa">
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {panel.loading ? <div className="flex items-center gap-3 py-7 text-sm font-semibold text-[#5D594F]" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-[#B96A25]" aria-hidden="true" /><span>Đang tra nghĩa theo ngữ cảnh…</span></div> : null}
      {panel.error ? <div role="alert" className="mt-4 flex items-start gap-2 border-l-2 border-[#B91C1C] bg-[#FFF0EC] px-3 py-3 text-sm font-semibold text-[#8E2B1E]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{panel.error}</p></div> : null}

      {!panel.loading && !panel.error ? (
        <div className="mt-4 space-y-4 text-sm text-[#302820]">
          <section className="wn-vocab-meaning-slip" aria-label="Nghĩa trong ngữ cảnh">
            <p className="wn-story-kicker">Nghĩa trong câu</p>
            <p className="mt-1 text-base font-semibold leading-relaxed text-[#9E4D20]">{meaning || "Chưa có nghĩa cho từ này."}</p>
            {translation?.contextualMeaningVi && translation.contextualMeaningVi !== meaning ? <p className="mt-2 text-xs leading-relaxed text-[#6A5848]">{translation.contextualMeaningVi}</p> : null}
          </section>
          {panel.sentence ? <blockquote className="border-l border-dashed border-[#C9BFAE] pl-3 text-sm italic leading-6 text-[#5D5247]">“{panel.sentence}”</blockquote> : null}
          {panel.source === "ai" && translation?.definitionVi ? <p className="text-xs leading-6 text-[#5D5247]"><span className="font-bold text-[#302820]">Ghi chú:</span> {translation.definitionVi}</p> : null}
          {panel.source === "ai" && translation ? (
            <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#C9BFAE] pt-3">
              <p className="text-xs leading-5 text-[#756A5D]">{cardAdded ? "Đã lưu vào bộ từ." : "Lưu từ mới này để ôn bằng flashcard?"}</p>
              <button type="button" onClick={handleAddCard} disabled={isAddingCard || cardAdded} aria-busy={isAddingCard} className="wn-button wn-button-secondary shrink-0 px-3 py-2 text-xs">
                {cardAdded ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                {cardAdded ? "Đã lưu" : isAddingCard ? "Đang lưu…" : "Lưu vào deck"}
              </button>
            </div>
          ) : null}
          {addCardError ? <p role="alert" className="text-xs font-semibold text-[#A63222]">{addCardError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MobileVocabularySheet({ panel, deckId, onClose }: { panel: TranslationPanel; deckId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dragOffset, isDragging, dragHandleProps } = useBottomSheetDrag(onClose);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="wn-vocab-sheet" aria-label="Nghĩa từ trong truyện" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`wn-vocab-sheet__surface ${isDragging ? "wn-vocab-sheet__surface--dragging" : ""}`} style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}>
        <div className="wn-vocab-sheet__drag-area" aria-hidden="true" {...dragHandleProps}><div className="wn-vocab-sheet__handle" /></div>
        <VocabularyNoteContent key={panel.selectedText} panel={panel} deckId={deckId} onClose={onClose} closeButtonRef={closeButtonRef} />
      </div>
    </dialog>
  );
}

function VocabularyDetails({ panel, deckId, onClose }: { panel: TranslationPanel; deckId: string; onClose: () => void }) {
  const isMobile = useMobileStorySheet();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => { window.removeEventListener("keydown", handleKeyDown); window.cancelAnimationFrame(frame); };
  }, [isMobile, onClose]);
  if (isMobile) return <MobileVocabularySheet panel={panel} deckId={deckId} onClose={onClose} />;
  return (
    <motion.aside className="wn-vocab-slip fixed bottom-6 right-6 z-50 max-h-[min(43rem,calc(100dvh-3rem))] w-[25rem] max-w-[calc(100vw-3rem)] overflow-y-auto p-5" aria-label="Nghĩa từ trong truyện" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.18 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
      <VocabularyNoteContent key={panel.selectedText} panel={panel} deckId={deckId} onClose={onClose} closeButtonRef={closeButtonRef} />
    </motion.aside>
  );
}

function MobileVocabularyTrail({ usage, selectedIndex, onSelect, onClose }: { usage: StoryVocabularyUsage[]; selectedIndex: number | null; onSelect: (item: StoryVocabularyUsage, index: number) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dragOffset, isDragging, dragHandleProps } = useBottomSheetDrag(onClose);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => { window.cancelAnimationFrame(frame); if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={dialogRef} className="wn-vocab-sheet" aria-labelledby="story-vocabulary-trail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`wn-vocab-sheet__surface ${isDragging ? "wn-vocab-sheet__surface--dragging" : ""}`} style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}>
        <div className="wn-vocab-sheet__drag-area" aria-hidden="true" {...dragHandleProps}><div className="wn-vocab-sheet__handle" /></div>
        <div className="flex items-start justify-between gap-3 border-b border-[#221C16]/12 pb-3">
          <div><p className="wn-story-kicker">Vocabulary trail</p><h2 id="story-vocabulary-trail-title" className="mt-1 font-[family-name:var(--font-story-display)] text-2xl font-semibold tracking-tight text-[#221C16]">Từ trong bài · {usage.length}</h2></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="wn-story-icon-control" aria-label="Đóng danh sách từ trong bài"><X className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} /></button>
        </div>
        <ol className="mt-3 divide-y divide-dashed divide-[#D8CEBE]">
          {usage.map((item, index) => <li key={`${item.term}-${item.usedAs}-${index}`}><button type="button" className={`wn-vocab-trail-row ${selectedIndex === index ? "wn-vocab-trail-row--active" : ""}`} onClick={() => onSelect(item, index)}><span className="min-w-0 text-left"><strong>{item.usedAs}</strong>{normalize(item.term) !== normalize(item.usedAs) ? <small>Dạng của {item.term}</small> : null}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /></button></li>)}
        </ol>
      </div>
    </dialog>
  );
}

function OverflowMenu({ title, onDelete }: { title: string; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("pointerdown", closeOnOutsidePress); window.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((current) => !current)} className="wn-story-icon-control" aria-label="Tùy chọn truyện" aria-expanded={open}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button>
      <AnimatePresence>{open ? <motion.div className="wn-story-overflow" initial={panelVariants.hidden} animate={panelVariants.visible} exit={panelVariants.exit}>
        <PronounceButton text={title} size="sm" variant="story" label="Đọc tiêu đề" className="w-full justify-start" />
        {onDelete ? <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="wn-button wn-button-quiet wn-button-danger w-full justify-start text-xs font-bold"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Xóa truyện</button> : null}
      </motion.div> : null}</AnimatePresence>
    </div>
  );
}

export function StoryReader({
  story,
  deckWords,
  storyActionNotice,
  onDelete,
  readingMode = false,
  onReadingModeChange,
}: {
  story: StoryData;
  deckWords: DeckStoryWord[];
  storyActions?: ReactNode;
  storyActionNotice?: ReactNode;
  onDelete?: () => void;
  readingMode?: boolean;
  onReadingModeChange?: (readingMode: boolean) => void;
}) {
  const paragraphs = useMemo(() => story.content.split(/\n\n+/).filter(Boolean), [story.content]);
  const requestId = useRef(0);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState<TranslationPanel | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);
  const [mobileTrailOpen, setMobileTrailOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const isMobile = useMobileStorySheet();
  const selectedUsageIndex = panel?.trailIndex ?? null;
  const deckWordsByTerm = useMemo(() => new Map(deckWords.map((word) => [normalize(word.term), word])), [deckWords]);
  const contextualTranslations = useMemo(() => new Map(story.vocabulary.contextualTranslations.map((item) => [`${normalize(item.term)}\u0000${normalize(item.usedAs)}`, item.meaningVi])), [story.vocabulary.contextualTranslations]);
  const sentenceForUsage = useCallback((usage: StoryVocabularyUsage) => extractSentenceContainingUsageWithBoundary(story.content, usage.usedAs) || undefined, [story.content]);

  const showDeckTranslation = useCallback((usage: StoryVocabularyUsage, usageIndex?: number, trigger?: HTMLElement) => {
    if (trigger) lastTriggerRef.current = trigger;
    const deckWord = deckWordsByTerm.get(normalize(usage.term));
    setPanel({ selectedText: usage.usedAs, canonicalTerm: usage.term, source: "deck", deckWord, sentence: sentenceForUsage(usage), trailIndex: usageIndex, trailTotal: usageIndex === undefined ? undefined : story.vocabulary.usage.length, contextualMeaning: contextualTranslations.get(`${normalize(usage.term)}\u0000${normalize(usage.usedAs)}`) || deckWord?.meaningVi });
  }, [contextualTranslations, deckWordsByTerm, sentenceForUsage, story.vocabulary.usage.length]);

  const closeVocabulary = useCallback(() => {
    setPanel(null);
    setMobileTrailOpen(false);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }, []);
  const scrollToUsage = useCallback((usageIndex: number) => {
    const target = document.querySelector<HTMLElement>(`[data-story-target-index="${usageIndex}"]`);
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [reduceMotion]);
  const selectTrailUsage = useCallback((usage: StoryVocabularyUsage, usageIndex: number) => {
    setTrailOpen(false);
    setMobileTrailOpen(false);
    scrollToUsage(usageIndex);
    showDeckTranslation(usage, usageIndex);
  }, [scrollToUsage, showDeckTranslation]);

  const translateWordOrPhrase = async (rawText: string) => {
    const cleanText = rawText.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim();
    if (!cleanText || cleanText.length > 150 || !/[a-zA-Z]/.test(cleanText)) return;
    const matchingDeckWord = deckWordsByTerm.get(normalize(cleanText));
    if (matchingDeckWord) {
      setPanel({ selectedText: cleanText, canonicalTerm: matchingDeckWord.term, source: "deck", deckWord: matchingDeckWord, sentence: extractSentenceContainingUsageWithBoundary(story.content, cleanText) || undefined, contextualMeaning: contextualTranslations.get(`${normalize(matchingDeckWord.term)}\u0000${normalize(cleanText)}`) || matchingDeckWord.meaningVi });
      return;
    }
    let surroundingSentence = extractSentenceContainingUsageWithBoundary(story.content, cleanText);
    if (!surroundingSentence) {
      const sentences = story.content.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
      surroundingSentence = sentences.find((sentence) => sentence.toLowerCase().includes(cleanText.toLowerCase())) || "";
    }
    if (!surroundingSentence) surroundingSentence = paragraphs.find((paragraph) => paragraph.toLowerCase().includes(cleanText.toLowerCase())) || cleanText;
    const context = paragraphs.find((paragraph) => paragraph.toLowerCase().includes(cleanText.toLowerCase())) || surroundingSentence;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setPanel({ selectedText: cleanText, canonicalTerm: null, source: "ai", sentence: surroundingSentence, loading: true });
    try {
      const response = await fetch("/api/stories/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: story.id, deckId: story.deckId, selectedText: cleanText, surroundingSentence, context }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.translation) throw new Error(data?.error || "Không thể dịch từ này lúc này.");
      if (requestId.current !== currentRequest) return;
      setPanel({ selectedText: cleanText, canonicalTerm: null, source: "ai", sentence: surroundingSentence, translation: data.translation });
    } catch (error) {
      if (requestId.current !== currentRequest) return;
      setPanel({ selectedText: cleanText, canonicalTerm: null, source: "ai", sentence: surroundingSentence, error: error instanceof Error ? error.message : "Không thể dịch từ này lúc này." });
    }
  };

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText && selectedText.length <= 100 && /[a-zA-Z]/.test(selectedText)) { void translateWordOrPhrase(selectedText); return; }
    let range: Range | null = null;
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
    else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (position?.offsetNode) { range = document.createRange(); range.setStart(position.offsetNode, position.offset); range.collapse(true); }
    }
    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
      const fullText = range.startContainer.textContent || "";
      let start = range.startOffset;
      let end = range.startOffset;
      while (start > 0 && /[a-zA-Z0-9'-]/.test(fullText[start - 1])) start--;
      while (end < fullText.length && /[a-zA-Z0-9'-]/.test(fullText[end])) end++;
      const clickedWord = fullText.substring(start, end).replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim();
      if (clickedWord && clickedWord.length >= 2 && /[a-zA-Z]/.test(clickedWord)) void translateWordOrPhrase(clickedWord);
    }
  };
  const handleDoubleClick = () => {
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText && /[a-zA-Z]/.test(selectedText)) void translateWordOrPhrase(selectedText);
  };

  const vocabularyCount = story.vocabulary.usage.length;
  const openTrail = (trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    if (isMobile) setMobileTrailOpen(true);
    else setTrailOpen((current) => !current);
  };

  return (
    <article className={`wn-story-paper relative ${readingMode ? "wn-story-paper--reading" : ""}`} aria-labelledby="story-heading">
      <header className={`wn-story-reader-header ${readingMode ? "wn-story-reader-header--reading" : ""}`}>
        {readingMode ? (
          <div className="wn-story-reading-toolbar">
            <div className="min-w-0"><p className="wn-story-kicker">Chế độ đọc</p><h1 id="story-heading" className="truncate font-[family-name:var(--font-story-display)] text-xl font-semibold tracking-[-0.02em] text-[#221C16] sm:text-2xl">{story.title}</h1></div>
            <div className="flex shrink-0 items-center gap-1.5"><StoryNarrationControls content={story.content} compact />{vocabularyCount ? <button type="button" onClick={(event) => openTrail(event.currentTarget)} className="wn-story-icon-control" aria-label={`Từ trong bài, ${vocabularyCount} từ`}><BookMarked className="h-4 w-4" aria-hidden="true" /></button> : null}<button type="button" onClick={() => onReadingModeChange?.(false)} className="wn-story-icon-control" aria-label="Thoát chế độ đọc"><Minimize2 className="h-4 w-4" aria-hidden="true" /></button></div>
          </div>
        ) : (
          <>
            <div className="wn-story-masthead"><span>WordNest · Reading file</span><span aria-hidden="true">✦</span><span>{vocabularyCount} từ mục tiêu</span></div>
            <div className="mt-3"><h1 id="story-heading" className="wn-story-title text-[#221C16]">{story.title}</h1><div className="wn-story-metadata mt-3" aria-label="Thông tin truyện"><span>{story.topic}</span><span aria-hidden="true">•</span><span>CEFR {story.cefr}</span><span aria-hidden="true">•</span><span>{story.length === "short" ? "Ngắn" : story.length === "medium" ? "Vừa" : story.length === "long" ? "Dài" : story.length}</span></div></div>
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-dashed border-[#CFC2AF] pt-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5"><StoryNarrationControls content={story.content} />{vocabularyCount ? <button type="button" onClick={(event) => openTrail(event.currentTarget)} className="wn-story-secondary-control" aria-expanded={isMobile ? mobileTrailOpen : trailOpen} aria-controls={isMobile ? "story-vocabulary-trail-title" : "story-vocabulary-trail"}><BookMarked className="h-4 w-4" aria-hidden="true" /><span>Từ trong bài <b>· {vocabularyCount}</b></span></button> : null}<button type="button" onClick={() => onReadingModeChange?.(true)} className="wn-story-secondary-control wn-story-reading-toggle" aria-label="Chế độ đọc" aria-pressed={readingMode}><Maximize2 className="h-4 w-4" aria-hidden="true" /><span>Chế độ đọc</span></button></div>
              <OverflowMenu title={story.title} onDelete={onDelete} />
            </div>
          </>
        )}
        {storyActionNotice}
        {!isMobile && trailOpen && vocabularyCount ? <motion.section id="story-vocabulary-trail" className="wn-story-trail-popover" role="dialog" aria-modal="false" aria-labelledby="story-vocabulary-trail-title" initial={reduceMotion ? { opacity: 0 } : panelVariants.hidden} animate={reduceMotion ? { opacity: 1 } : panelVariants.visible} exit={reduceMotion ? { opacity: 0 } : panelVariants.exit}>
          <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[#CFC2AF] pb-2"><h2 id="story-vocabulary-trail-title" className="font-[family-name:var(--font-story-display)] text-xl font-semibold tracking-tight text-[#221C16]">Từ trong bài</h2><span className="wn-story-kicker">{vocabularyCount} mục</span></div>
          <ol className="mt-2 divide-y divide-dashed divide-[#D8CEBE]">{story.vocabulary.usage.map((usage, index) => <li key={`${usage.term}-${usage.usedAs}-${index}`}><button type="button" className={`wn-vocab-trail-row ${selectedUsageIndex === index ? "wn-vocab-trail-row--active" : ""}`} onClick={() => selectTrailUsage(usage, index)}><span className="min-w-0 text-left"><strong>{usage.usedAs}</strong>{normalize(usage.term) !== normalize(usage.usedAs) ? <small>Dạng của {usage.term}</small> : null}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /></button></li>)}</ol>
        </motion.section> : null}
      </header>

      <div className="wn-story-prose select-text cursor-text" onClick={handleContentClick} onDoubleClick={handleDoubleClick}>
        {paragraphs.map((paragraph, index) => <p key={index}><TargetText paragraph={paragraph} usage={story.vocabulary.usage} activeUsageIndex={selectedUsageIndex} onClick={(usage, usageIndex, trigger) => showDeckTranslation(usage, usageIndex, trigger)} /></p>)}
        <div className="wn-story-endmark" aria-hidden="true"><span /><b>✦</b><span /></div>
      </div>

      <AnimatePresence>{panel ? <VocabularyDetails panel={panel} deckId={story.deckId} onClose={closeVocabulary} /> : null}</AnimatePresence>
      {isMobile && mobileTrailOpen && vocabularyCount ? <MobileVocabularyTrail usage={story.vocabulary.usage} selectedIndex={selectedUsageIndex} onSelect={selectTrailUsage} onClose={closeVocabulary} /> : null}
    </article>
  );
}
