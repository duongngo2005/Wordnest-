"use client";

import React, { useState, useRef } from "react";
import { StoryTranslatePopup } from "./StoryTranslatePopup";
import { ContextualTranslationResponse } from "@/lib/validation/story";
import { PronounceButton } from "../flashcards/PronounceButton";
import {
  Compass,
  GraduationCap,
  Clock,
  BookOpen,
  Sparkles,
  MousePointerClick,
} from "lucide-react";

export interface StoryData {
  id: string;
  deckId: string;
  title: string;
  content: string;
  cefr: string;
  length: string;
  topic: string;
  targetWords: string[];
  createdAt: Date;
}

interface StoryReaderProps {
  story: StoryData;
  onCardAdded?: () => void;
}

export function StoryReader({ story, onCardAdded }: StoryReaderProps) {
  const [translation, setTranslation] = useState<ContextualTranslationResponse | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const storyContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Helper to locate the complete sentence containing a word or phrase within content.
   */
  const extractSentence = (fullText: string, target: string): string => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return "";

    // Split text into sentences using common punctuation boundaries
    const sentences = fullText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(cleanTarget.toLowerCase())) {
        return sentence;
      }
    }

    return target;
  };

  /**
   * Triggers the contextual translation API.
   */
  const triggerTranslation = async (word: string, sentence: string) => {
    const trimmed = word.trim();
    if (!trimmed || trimmed.length < 2) return;

    setIsPopupOpen(true);
    setIsTranslating(true);
    setTranslation(null);

    try {
      const res = await fetch("/api/stories/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId: story.deckId,
          selectedText: trimmed,
          surroundingSentence: sentence,
          context: story.title,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể dịch");
      }

      setTranslation(data.translation);
    } catch (err) {
      console.error("Contextual translation failed:", err);
      // Fallback object so user can still see and add card
      setTranslation({
        selectedText: trimmed,
        meaningVi: `Ý nghĩa của "${trimmed}"`,
        contextualMeaningVi: `Nghĩa trong câu: "${trimmed}"`,
        ipa: null,
        partOfSpeech: trimmed.includes(" ") ? "phrase" : "noun",
        definitionEn: `Meaning of "${trimmed}" in this context.`,
        exampleEn: sentence,
        exampleVi: `Dịch câu ví dụ: ${sentence}`,
        cefr: story.cefr,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  /**
   * Handles text selection via mouse / touch anywhere in the story.
   */
  const handleTextSelection = () => {
    if (typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const rawSelected = selection.toString().trim();
    // Only process reasonable vocabulary selections (under 60 chars)
    if (rawSelected && rawSelected.length >= 2 && rawSelected.length <= 60) {
      // Find sentence from anchorNode
      let sentence = "";
      const textNode = selection.anchorNode?.textContent || story.content;
      sentence = extractSentence(textNode, rawSelected) || extractSentence(story.content, rawSelected);

      triggerTranslation(rawSelected, sentence);
    }
  };

  /**
   * Highlight target words inside story paragraphs with interactive clickable chips.
   */
  const renderParagraph = (paragraph: string, pIndex: number) => {
    const targetWords = Array.isArray(story.targetWords) ? story.targetWords : [];

    if (targetWords.length === 0) {
      return (
        <p key={pIndex} className="text-base sm:text-lg leading-relaxed text-[#221C16]">
          {paragraph}
        </p>
      );
    }

    // Create regex matching any of the target words case-insensitively
    // Escape special regex characters in words
    const escaped = targetWords
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const regex = new RegExp(`\\b(${escaped})\\b`, "gi");

    const parts = paragraph.split(regex);

    return (
      <p
        key={pIndex}
        className="text-base sm:text-lg leading-loose text-[#221C16] font-medium"
      >
        {parts.map((part, index) => {
          const isTarget = targetWords.some(
            (w) => w.toLowerCase() === part.toLowerCase()
          );

          if (isTarget) {
            return (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const sentence = extractSentence(paragraph, part);
                  triggerTranslation(part, sentence);
                }}
                className="inline-flex items-center mx-0.5 px-2 py-0.5 rounded-lg bg-[#FEF3C7] text-[#92400E] font-black border-2 border-[#221C16] shadow-[1.5px_1.5px_0px_#221C16] hover:bg-[#FDE68A] hover:-translate-y-0.5 active:translate-y-0.5 transition-all cursor-pointer select-none"
                title={`Bấm để xem nghĩa của "${part}" trong ngữ cảnh`}
              >
                <Sparkles className="w-3 h-3 text-[#E06B43] mr-1" />
                <span>{part}</span>
              </button>
            );
          }

          return <span key={index}>{part}</span>;
        })}
      </p>
    );
  };

  const paragraphs = story.content.split("\n\n").filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Story Card Container */}
      <article
        ref={storyContainerRef}
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection}
        className="brick-card p-5 sm:p-8 bg-[#FFFDF9] space-y-6 shadow-[6px_6px_0px_#221C16]"
      >
        {/* Story Header */}
        <div className="space-y-3 pb-5 border-b-2 border-[#221C16]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="brick-badge bg-[#E06B43] text-white">
              <Compass className="w-3 h-3 mr-1" />
              {story.topic}
            </span>
            <span className="brick-badge bg-[#FAF6EE] text-[#221C16]">
              <GraduationCap className="w-3 h-3 mr-1" />
              CEFR {story.cefr}
            </span>
            <span className="brick-badge bg-[#FAF6EE] text-[#6B6258]">
              <Clock className="w-3 h-3 mr-1" />
              {story.length}
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              {story.title}
            </h1>
            <PronounceButton text={story.title} size="sm" label="Đọc tiêu đề" />
          </div>

          {/* Interactive User Hint */}
          <div className="flex items-center gap-2 text-xs font-bold text-[#6B6258] bg-[#FAF6EE] px-3 py-2 rounded-xl border border-[#221C16]/20">
            <MousePointerClick className="w-4 h-4 text-[#E06B43] shrink-0" />
            <span>
              <strong>Mẹo học:</strong> Bấm vào các từ in đậm <span className="bg-[#FEF3C7] px-1.5 py-0.5 rounded border border-[#221C16]/40 text-[#92400E]">màu vàng</span> hoặc <strong>bôi đen bất kỳ từ/cụm từ nào</strong> trong văn bản để xem nghĩa ngữ cảnh & thêm vào Flashcards!
            </span>
          </div>
        </div>

        {/* Story Body Paragraphs */}
        <div className="space-y-4 font-serif selection:bg-[#FDE68A] selection:text-[#221C16]">
          {paragraphs.map((para, i) => renderParagraph(para, i))}
        </div>

        {/* Target Words Summary Chips */}
        {story.targetWords && story.targetWords.length > 0 && (
          <div className="pt-4 border-t-2 border-[#221C16] space-y-2">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#6B6258] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Từ vựng mục tiêu trong bài ({story.targetWords.length}):</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {story.targetWords.map((word, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const sentence = extractSentence(story.content, word);
                    triggerTranslation(word, sentence);
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] hover:bg-[#FEF3C7] text-[#221C16] shadow-[1.5px_1.5px_0px_#221C16] transition-all"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Translation Popup */}
      {isPopupOpen && (
        <StoryTranslatePopup
          deckId={story.deckId}
          translation={translation}
          isLoading={isTranslating}
          onClose={() => setIsPopupOpen(false)}
          onCardAdded={onCardAdded}
        />
      )}
    </div>
  );
}
