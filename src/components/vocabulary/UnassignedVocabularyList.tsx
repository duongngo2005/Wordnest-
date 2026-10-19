"use client";

import { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";

type UnassignedVocabularyCard = {
  id: string;
  term: string;
  meaningVi: string;
  partOfSpeech: string | null;
  state: number;
  reps: number;
};

type DeckOption = {
  id: string;
  name: string;
};

export function UnassignedVocabularyList({
  initialCards,
  deckOptions,
}: {
  initialCards: UnassignedVocabularyCard[];
  deckOptions: DeckOption[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [query, setQuery] = useState("");
  const [targetDeckByCard, setTargetDeckByCard] = useState<Record<string, string>>({});
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return cards;
    return cards.filter((card) =>
      card.term.toLocaleLowerCase().includes(normalizedQuery) ||
      card.meaningVi.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [cards, query]);

  const linkCard = async (card: UnassignedVocabularyCard) => {
    const deckId = targetDeckByCard[card.id];
    if (!deckId) {
      setError(`Chọn Deck để liên kết “${card.term}”.`);
      return;
    }

    setError(null);
    setStatus("");
    setLinkingCardId(card.id);
    try {
      const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}/cards/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: card.id }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "Không thể liên kết hồ sơ từ vựng. Hãy thử lại.";
        throw new Error(message);
      }

      const deckName = deckOptions.find((deck) => deck.id === deckId)?.name ?? "Deck đã chọn";
      setCards((current) => current.filter((currentCard) => currentCard.id !== card.id));
      setStatus(`Đã liên kết “${card.term}” với ${deckName}. Lịch FSRS và lịch sử học không thay đổi.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Không thể liên kết hồ sơ từ vựng. Hãy thử lại.");
    } finally {
      setLinkingCardId(null);
    }
  };

  if (cards.length === 0) {
    return (
      <section className="rounded-xl border-2 border-dashed border-[#C9BFB1] bg-[#FAF6EE] p-8 text-center text-sm font-bold text-[#6B6258]">
        Không còn từ vựng chưa phân loại.
      </section>
    );
  }

  return (
    <section aria-labelledby="unassigned-list-title" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="unassigned-list-title" className="text-base font-black text-[#221C16]">Hồ sơ chưa có nguồn Deck</h2>
          <p className="mt-1 text-xs font-semibold text-[#6B6258]">{visibleCards.length}/{cards.length} từ đang hiển thị</p>
        </div>
        <label className="block sm:w-80">
          <span className="mb-1 block text-xs font-bold text-[#4A4036]">Tìm theo term hoặc nghĩa</span>
          <span className="flex items-center gap-2 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-2 shadow-[2px_2px_0px_#221C16] focus-within:ring-2 focus-within:ring-[var(--accent)]">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6B6258]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: accomplish"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#221C16] outline-none"
            />
          </span>
        </label>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">{status}</div>
      {error ? <p role="alert" className="rounded-lg border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-sm font-bold text-[#991B1B]">{error}</p> : null}

      {visibleCards.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[#C9BFB1] bg-[#FAF6EE] p-8 text-center">
          <p className="text-sm font-bold text-[#6B6258]">Không có từ nào khớp với “{query.trim()}”.</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-black text-[var(--accent)] underline underline-offset-4">Xóa tìm kiếm</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[2px_2px_0px_#221C16]">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-[#EAE3D2] text-xs uppercase tracking-wide text-[#4A4036]">
              <tr>
                <th scope="col" className="p-3">Term</th>
                <th scope="col" className="p-3">Nghĩa</th>
                <th scope="col" className="p-3">Tiến độ</th>
                <th scope="col" className="p-3">Liên kết nguồn</th>
              </tr>
            </thead>
            <tbody>
              {visibleCards.map((card) => {
                const selectId = `unassigned-target-${card.id}`;
                const isLinking = linkingCardId === card.id;
                return (
                  <tr key={card.id} className="border-t border-[#DCD3C5] align-top">
                    <td className="p-3 font-black text-[#221C16]">
                      <span className="block">{card.term}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-[#6B6258]">{card.partOfSpeech ?? "Chưa có từ loại"}</span>
                    </td>
                    <td className="p-3 font-semibold text-[#4A4036]">{card.meaningVi}</td>
                    <td className="p-3 text-xs font-semibold text-[#6B6258]">
                      {card.state === 0 ? "Mới, chưa ôn" : `${card.reps} lượt ôn theo FSRS`}
                    </td>
                    <td className="p-3">
                      {deckOptions.length === 0 ? (
                        <p className="text-xs font-bold text-[#6B6258]">Tạo Deck trước khi liên kết nguồn.</p>
                      ) : (
                        <div className="flex min-w-80 items-end gap-2">
                          <label htmlFor={selectId} className="min-w-0 flex-1">
                            <span className="mb-1 block text-xs font-bold text-[#4A4036]">Deck đích cho {card.term}</span>
                            <select
                              id={selectId}
                              value={targetDeckByCard[card.id] ?? ""}
                              onChange={(event) => setTargetDeckByCard((current) => ({ ...current, [card.id]: event.target.value }))}
                              disabled={isLinking}
                              className="w-full rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-2 py-2 text-sm font-semibold text-[#221C16] disabled:cursor-wait disabled:opacity-70"
                            >
                              <option value="">Chọn Deck…</option>
                              {deckOptions.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void linkCard(card)}
                            disabled={isLinking}
                            aria-busy={isLinking}
                            className="brick-button-primary min-h-10 shrink-0 px-3 py-2 text-xs font-black disabled:cursor-wait disabled:opacity-70"
                          >
                            <Link2 aria-hidden="true" className="h-4 w-4" />
                            <span>{isLinking ? "Đang liên kết" : "Liên kết"}</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
