import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { UnassignedVocabularyList } from "@/components/vocabulary/UnassignedVocabularyList";
import { deckService, folderService } from "@/services/vocabulary";

export const revalidate = 0;

/**
 * Canonical vocabulary can intentionally have no source Deck after a source
 * is deleted. This view keeps those cards discoverable without inventing a
 * replacement Deck or modifying their learning state.
 */
export default async function UnassignedVocabularyPage() {
  const [cards, deckOptions] = await Promise.all([
    folderService.getUnassignedVocabulary(),
    deckService.getDeckOptions(1_000),
  ]);

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container wn-page wn-stack">
        <Link href="/" className="w-fit text-xs font-black text-[var(--accent)] underline underline-offset-4">
          ← Thư viện
        </Link>
        <section className="brick-card bg-[#FFFDF9] p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-wider text-[#8A5817]">Vocabulary registry</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#221C16]">Từ vựng chưa phân loại</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[#6B6258]">
            Những hồ sơ này không còn thuộc Deck nào nhưng vẫn giữ nguyên lịch ôn FSRS và lịch sử học. Hãy liên kết chúng với một Deck qua luồng import hoặc quản lý nguồn phù hợp.
          </p>
        </section>

        <UnassignedVocabularyList
          initialCards={cards.map((card) => ({
            id: card.id,
            term: card.term,
            meaningVi: card.meaningVi,
            partOfSpeech: card.partOfSpeech,
            state: card.state,
            reps: card.reps,
          }))}
          deckOptions={deckOptions}
        />
      </main>
    </div>
  );
}
