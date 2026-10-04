import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { LessonPageContainer } from "@/components/lesson/LessonPageContainer";
import { deckService, lessonService, practiceEvidenceService } from "@/services/vocabulary";

export const revalidate = 0;

export default async function DeckLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string | string[]; lessonId?: string | string[] }>;
}) {
  const { id } = await params;
  const { create, lessonId } = await searchParams;

  const [deck, lessons, weakCandidates] = await Promise.all([
    deckService.getDeckById(id),
    lessonService.getLessonsByDeckId(id),
    practiceEvidenceService.getFocusedPracticeCandidates(id, 20).catch(() => []),
  ]);

  if (!deck) notFound();

  const openGenerator = create === "ai";
  const selectedLessonId =
    typeof lessonId === "string" ? lessonId : Array.isArray(lessonId) ? lessonId[0] : undefined;

  const weakWordIds = weakCandidates.map((c) => c.card.id);

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container py-5 sm:py-8">
        <LessonPageContainer
          deck={{ id: deck.id, name: deck.name }}
          initialLessonId={selectedLessonId}
          deckWords={deck.cards.map((card) => ({
            id: card.id,
            term: card.term,
            meaningVi: card.meaningVi,
            partOfSpeech: card.partOfSpeech,
            cefr: card.cefr,
          }))}
          initialLessons={lessons.map((lesson) => ({
            id: lesson.id,
            deckId: lesson.deckId,
            title: lesson.title,
            content: lesson.content,
            cefr: lesson.cefr,
            targetWords: lesson.targetWords,
            createdAt: lesson.createdAt,
          }))}
          weakWordIds={weakWordIds}
          initialOpenGenerator={openGenerator}
        />
      </main>
    </div>
  );
}
