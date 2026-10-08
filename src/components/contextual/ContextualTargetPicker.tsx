"use client";

import { useMemo, useState } from "react";
import { Check, Search, Target } from "lucide-react";
import {
  CONTEXTUAL_TARGET_VISIBLE_RESULT_LIMIT,
  type ContextualTargetIntent,
} from "@/lib/contextual-target-selection";

export type ContextualTargetWord = {
  id: string;
  term: string;
  meaningVi: string;
  partOfSpeech?: string | null;
};

type ContextualTargetPickerProps = {
  idPrefix: string;
  words: readonly ContextualTargetWord[];
  weakWordIds?: readonly string[];
  selectedIds: readonly string[];
  intent: ContextualTargetIntent;
  maxSelectedIds?: number;
  overflowCount?: number;
  normalizationNotice?: string | null;
  disabled?: boolean;
  onIntentChange: (intent: ContextualTargetIntent) => void;
  onToggleWord: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

function intentDescription(intent: ContextualTargetIntent): string {
  if (intent === "general") return "Chọn một nhóm từ nhỏ để bắt đầu bài đọc.";
  if (intent === "weak") return "Dùng những từ bạn đang có bằng chứng cần luyện thêm.";
  return "Chọn chính xác những từ bạn muốn đưa vào bài.";
}

export function ContextualTargetPicker({
  idPrefix,
  words,
  weakWordIds = [],
  selectedIds,
  intent,
  maxSelectedIds,
  overflowCount = 0,
  normalizationNotice,
  disabled = false,
  onIntentChange,
  onToggleWord,
  onSelectAll,
  onClear,
}: ContextualTargetPickerProps) {
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const wordIds = useMemo(() => new Set(words.map((word) => word.id)), [words]);
  const weakIdSet = useMemo(
    () => new Set(weakWordIds.filter((id) => wordIds.has(id))),
    [weakWordIds, wordIds]
  );
  const weakCount = weakIdSet.size;

  const filteredWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return words;
    return words.filter((word) => {
      return (
        word.term.toLocaleLowerCase().includes(query) ||
        word.meaningVi.toLocaleLowerCase().includes(query) ||
        word.partOfSpeech?.toLocaleLowerCase().includes(query)
      );
    });
  }, [search, words]);
  const visibleWords = filteredWords.slice(0, CONTEXTUAL_TARGET_VISIBLE_RESULT_LIMIT);

  const selectedSummary =
    intent === "weak" && weakCount === 0
      ? "Hiện chưa có từ nào cần củng cố."
      : intent === "weak" && maxSelectedIds !== undefined && weakCount > maxSelectedIds
      ? `Đã chọn ${selectedIds.length}/${weakCount} từ cần luyện vì bài học hỗ trợ tối đa ${maxSelectedIds} từ.`
      : maxSelectedIds !== undefined && overflowCount > 0
      ? `Đã chọn ${selectedIds.length}/${selectedIds.length + overflowCount} từ; bài học hỗ trợ tối đa ${maxSelectedIds} từ.`
      : maxSelectedIds !== undefined
      ? `Đã chọn ${selectedIds.length}/${maxSelectedIds} từ.`
      : `Đã chọn ${selectedIds.length} từ.`;

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-black text-[#221C16]">1. Chọn từ vựng mục tiêu</legend>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cách chọn từ vựng">
        {(
          [
            ["general", "Chọn giúp tôi"],
            ["weak", "Củng cố từ cần luyện"],
            ["manual", "Tự chọn từ"],
          ] as const
        ).map(([candidateIntent, label]) => {
          const isWeakOption = candidateIntent === "weak";
          const isDisabled = disabled || (isWeakOption && weakCount === 0);
          const description = intentDescription(candidateIntent);
          return (
            <label
              key={candidateIntent}
              className={`block min-w-0 rounded-xl border-2 p-3 text-left transition-colors ${
                intent === candidateIntent
                  ? "border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]"
                  : "border-[#D8CEBE] bg-[#FFFDF9] hover:border-[#221C16]"
              } ${isDisabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                name={`${idPrefix}-target-intent`}
                value={candidateIntent}
                checked={intent === candidateIntent}
                disabled={isDisabled}
                onChange={() => onIntentChange(candidateIntent)}
                className="sr-only"
              />
              <span className="block text-xs font-black text-[#221C16]">{label}</span>
              <span className="mt-1 block text-[11px] leading-4 font-semibold text-[#6B6258]">
                {isWeakOption && weakCount === 0 ? "Hiện chưa có từ cần củng cố." : description}
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-xs font-semibold leading-5 text-[#6B6258]">{intentDescription(intent)}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-xs font-black text-[#8A5817]">
          {selectedSummary}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={disabled || words.length === 0}
            className="min-h-9 rounded-lg border border-[#221C16] bg-[#FFFDF9] px-2.5 py-1.5 hover:bg-[#F5EEDB] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || selectedIds.length === 0}
            className="min-h-9 rounded-lg border border-[#221C16] bg-[#FFFDF9] px-2.5 py-1.5 text-[#6B6258] hover:bg-[#F5EEDB] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bỏ chọn
          </button>
        </div>
      </div>

      {normalizationNotice ? (
        <p className="rounded-lg border border-[#B45309] bg-[#FEF3C7] px-3 py-2 text-xs font-semibold text-[#78350F]" role="status">
          {normalizationNotice}
        </p>
      ) : null}
      {words.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-[#D8CEBE] bg-[#FFFDF9] p-4 text-center text-xs font-semibold text-[#6B6258]">
          Cần thêm ít nhất một từ vào bộ thẻ trước.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor={`${idPrefix}-target-search`} className="mb-1.5 block text-xs font-black text-[#221C16]">
              Tìm từ trong bộ thẻ
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6258]" />
              <input
                id={`${idPrefix}-target-search`}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo từ, nghĩa hoặc từ loại"
                disabled={disabled}
                className="w-full rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] py-2 pl-9 pr-3 text-sm font-semibold placeholder:text-[#9A9187] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#6B6258]" aria-live="polite">
            <span>{search ? `${filteredWords.length} kết quả cho “${search}”` : `${words.length} từ trong bộ`}</span>
            {filteredWords.length > CONTEXTUAL_TARGET_VISIBLE_RESULT_LIMIT ? (
              <span>Hiển thị {CONTEXTUAL_TARGET_VISIBLE_RESULT_LIMIT}/{filteredWords.length}</span>
            ) : null}
          </div>

          {filteredWords.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[#D8CEBE] bg-[#FFFDF9] p-4 text-center text-xs font-semibold text-[#6B6258]">
              Không tìm thấy từ phù hợp.
              <button
                type="button"
                onClick={() => setSearch("")}
                className="ml-1 font-black text-[#92400E] underline"
              >
                Xóa tìm kiếm
              </button>
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2" aria-label="Danh sách từ vựng">
              {visibleWords.map((word) => {
                const isSelected = selectedSet.has(word.id);
                const isWeak = weakIdSet.has(word.id);
                return (
                  <label
                    key={word.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${
                      isSelected ? "bg-[#221C16] text-[#FFFDF9]" : "text-[#221C16] hover:bg-[#F5EEDB]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleWord(word.id)}
                      disabled={disabled}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected ? "border-white bg-[var(--accent)] text-[#221C16]" : "border-[#8C8275] bg-white"
                      }`}
                    >
                      {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{word.term}</span>
                    {word.meaningVi ? (
                      <span className={`max-w-32 truncate text-[11px] font-semibold ${isSelected ? "text-amber-200" : "text-[#6B6258]"}`}>
                        {word.meaningVi}
                      </span>
                    ) : null}
                    {isWeak ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-[#B45309]">
                        <Target aria-hidden="true" className="h-3 w-3" />
                        <span className="sr-only">Từ cần luyện thêm</span>
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
