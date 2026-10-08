import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { StoryPageContainer } from "@/components/story/StoryPageContainer";
import { deckService, practiceEvidenceService, storyService } from "@/services/vocabulary";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";

export const revalidate = 0;

export default async function DeckStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string | string[]; storyId?: string | string[] }>;
}) {
  const { id } = await params;
  const { create, storyId } = await searchParams;
  const [deck, stories, practiceEvidence] = await Promise.all([
    deckService.getDeckById(id),
    storyService.getStoriesByDeckId(id),
    practiceEvidenceService.getDeckPracticeEvidence(id),
  ]);
  if (!deck) notFound();
  const openAiGenerator = create === "ai";
  const selectedStoryId = typeof storyId === "string" ? storyId : Array.isArray(storyId) ? storyId[0] : undefined;

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container py-5 sm:py-8">
        <StoryPageContainer
          deck={{ id: deck.id, name: deck.name }}
          initialStoryId={selectedStoryId}
          deckWords={deck.cards.map((card) => ({
            id: card.id,
            term: card.term,
            meaningVi: card.meaningVi,
            definitionEn: card.definitionEn,
            ipa: card.ipa,
            partOfSpeech: card.partOfSpeech,
            cefr: card.cefr,
            exampleEn: card.exampleEn,
            exampleVi: card.exampleVi,
          }))}
          weakWordIds={practiceEvidence.needPracticeCards.map((item) => item.card.id)}
          initialStories={stories.map((story) => ({
            id: story.id,
            deckId: story.deckId,
            title: story.title,
            content: story.content,
            cefr: story.cefr,
            length: story.length,
            topic: story.topic,
            vocabulary: normalizeStoryVocabulary(story.targetWords),
            createdAt: story.createdAt,
          }))}
          initialGeneratorMode={openAiGenerator ? "ai" : undefined}
        />
      </main>
    </div>
  );
}
