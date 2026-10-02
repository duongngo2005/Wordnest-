"use client";

/* eslint-disable @next/next/no-img-element -- card image URLs are user-provided and not configured for Next/Image. */

import { Image as ImageIcon, RotateCcw, Sparkles } from "lucide-react";
import { PronounceButton } from "@/components/flashcards/PronounceButton";
import { CefrBadge } from "@/components/flashcards/CefrBadge";
import type { PracticeCardSessionItem } from "./flashcard-practice-session";

interface PracticeFlashcardProps {
  item: PracticeCardSessionItem;
  isRevealed: boolean;
  onReveal: () => void;
  onRate: (remembered: boolean) => void;
}

function PracticeCardHeader({ direction }: Pick<PracticeCardSessionItem, "direction">) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-[#DCD3C5] pb-3">
      <span className="font-mono text-[11px] font-black uppercase tracking-wider text-[#6B6258]">
        Câu hỏi
      </span>
      <span className="brick-badge bg-[#FAF6EE] font-mono text-[10px] font-black text-[#6B6258]">
        {direction === "en_vi" ? "EN → VI" : "VI → EN"}
      </span>
    </div>
  );
}

function PracticeFront({ item, onReveal }: Pick<PracticeFlashcardProps, "item" | "onReveal">) {
  const { card, direction } = item;
  const isEnglishPrompt = direction === "en_vi";

  return (
    <article
      className="brick-card flex min-h-[22.5rem] flex-col bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:min-h-[27.5rem] sm:p-7"
      data-testid="practice-card"
      data-card-id={card.id}
      data-direction={direction}
    >
      <div className="flex items-center justify-between gap-3">
        <PracticeCardHeader direction={direction} />
        {isEnglishPrompt ? <PronounceButton text={card.term} size="md" /> : null}
      </div>

      <div className="my-auto py-8 text-center">
        {isEnglishPrompt ? (
          <div className="space-y-4">
            {card.cefr ? (
              <div className="flex justify-center">
                <CefrBadge level={card.cefr} size="md" showPrefix />
              </div>
            ) : null}
            <h1 className="break-words text-3xl font-black tracking-tight text-[#221C16] sm:text-4xl md:text-5xl">
              {card.term}
            </h1>
          </div>
        ) : (
          <div className="space-y-3">
            {card.cefr ? (
              <div className="flex justify-center">
                <CefrBadge level={card.cefr} size="md" showPrefix />
              </div>
            ) : null}
            <h1 className="break-words text-2xl font-black tracking-tight text-[#221C16] sm:text-3xl md:text-4xl">
              {card.meaningVi}
            </h1>
            {card.partOfSpeech ? (
              <p className="font-mono text-xs font-bold uppercase tracking-wide text-[#9A3412]">
                {card.partOfSpeech}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-[#DCD3C5] pt-4">
        <button
          type="button"
          onClick={onReveal}
          className="brick-button-secondary w-full min-h-[48px] px-4 py-3.5 text-base font-black"
        >
          Hiện đáp án
        </button>
        <p className="mt-2 hidden select-none text-center text-[11px] font-semibold text-[#6B6258] sm:block">
          Nhấn <kbd className="rounded border border-[#DCD3C5] bg-[#FAF6EE] px-1.5 py-0.5 font-mono font-bold text-[#221C16]">Space</kbd> để xem đáp án
        </p>
      </div>
    </article>
  );
}

function PracticeBack({ item, onRate }: Pick<PracticeFlashcardProps, "item" | "onRate">) {
  const { card, direction } = item;
  const imageAttribution = [card.imageAuthor, card.imageSource].filter(Boolean).join(" · ");
  const hasExample = Boolean(card.exampleEn || card.exampleVi);

  return (
    <article
      className="brick-card flex min-h-[22.5rem] flex-col bg-[#FFFDF9] p-5 shadow-[4px_4px_0px_#221C16] sm:min-h-[27.5rem] sm:p-7"
      data-testid="practice-card"
      data-card-id={card.id}
      data-direction={direction}
    >
      <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#DCD3C5] pb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="break-words text-2xl font-black tracking-tight text-[#221C16] sm:text-3xl">
              {card.term}
            </h1>
            {card.cefr ? <CefrBadge level={card.cefr} size="sm" /> : null}
          </div>
          {card.ipa || card.partOfSpeech ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6B6258]">
              {card.ipa ? <span className="font-mono font-semibold">{card.ipa}</span> : null}
              {card.partOfSpeech ? <span className="font-semibold italic">{card.partOfSpeech}</span> : null}
            </p>
          ) : null}
        </div>
        <PronounceButton text={card.term} size="md" />
      </div>

      <div className="space-y-3.5 py-5">
        <section className="rounded-xl border-2 border-[#221C16] bg-[#FEF8ED] p-3.5 shadow-[2px_2px_0px_#221C16]">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#9A3412]">Nghĩa tiếng Việt</p>
          <p className="mt-1 break-words text-lg font-black text-[#221C16] sm:text-xl">{card.meaningVi}</p>
          {card.definitionEn ? (
            <p className="mt-2 text-xs font-medium italic leading-relaxed text-[#6B6258] sm:text-sm">
              {card.definitionEn}
            </p>
          ) : null}
        </section>

        {hasExample ? (
          <section className="rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">Ví dụ</p>
            {card.exampleEn ? (
              <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#221C16]">
                &ldquo;{card.exampleEn}&rdquo;
              </p>
            ) : null}
            {card.exampleVi ? (
              <p className="mt-1 break-words text-xs font-medium leading-relaxed text-[#6B6258]">
                {card.exampleEn ? "→ " : ""}{card.exampleVi}
              </p>
            ) : null}
          </section>
        ) : null}

        {card.imageUrl ? (
          <figure className="overflow-hidden rounded-xl border-2 border-[#221C16] bg-[#F4EFE6] shadow-[2px_2px_0px_#221C16]">
            <div className="flex max-h-64 items-center justify-center bg-[#F4EFE6]">
              <img
                src={card.imageUrl}
                alt={`Minh họa cho ${card.term}`}
                className="max-h-64 w-full object-cover"
                data-testid="practice-back-image"
                loading="lazy"
              />
            </div>
            {imageAttribution ? (
              <figcaption className="flex items-center gap-1.5 border-t border-[#DCD3C5] bg-[#FFFDF9] px-2.5 py-2 text-[10px] font-semibold text-[#6B6258]">
                <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>{imageAttribution}</span>
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>

      <div className="mt-auto border-t border-dashed border-[#DCD3C5] pt-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onRate(false)}
            className="brick-button-secondary min-h-[52px] px-3 py-3 text-sm font-black text-[#7C2D12]"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            <span>Chưa nhớ</span>
            <kbd aria-hidden="true" className="hidden rounded border border-current/30 px-1 font-mono text-[10px] sm:inline">1</kbd>
          </button>
          <button
            type="button"
            onClick={() => onRate(true)}
            className="brick-button-primary min-h-[52px] !bg-[#9A3412] px-3 py-3 text-sm font-black hover:!bg-[#7C2D12]"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            <span>Đã nhớ</span>
            <kbd aria-hidden="true" className="hidden rounded border border-white/40 px-1 font-mono text-[10px] sm:inline">2</kbd>
          </button>
        </div>
        <p className="mt-2 hidden select-none text-center text-[11px] font-semibold text-[#6B6258] sm:block">
          Phím <kbd className="font-mono font-bold text-[#221C16]">1</kbd> Chưa nhớ · <kbd className="font-mono font-bold text-[#221C16]">2</kbd> Đã nhớ
        </p>
      </div>
    </article>
  );
}

export function PracticeFlashcard({ item, isRevealed, onReveal, onRate }: PracticeFlashcardProps) {
  return isRevealed ? <PracticeBack item={item} onRate={onRate} /> : <PracticeFront item={item} onReveal={onReveal} />;
}
