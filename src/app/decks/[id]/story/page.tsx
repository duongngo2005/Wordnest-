import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { StoryPageContainer } from "@/components/story/StoryPageContainer";
import { deckService, storyService } from "@/services/vocabulary";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";

export const revalidate = 0;

export default async function DeckStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deck, stories] = await Promise.all([deckService.getDeckById(id), storyService.getStoriesByDeckId(id)]);
  if (!deck) notFound();

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container py-5 sm:py-8">
        <StoryPageContainer
          deck={{ id: deck.id, name: deck.name }}
          deckWords={deck.cards.map((card) => ({
            term: card.term,
            meaningVi: card.meaningVi,
            definitionEn: card.definitionEn,
            ipa: card.ipa,
            partOfSpeech: card.partOfSpeech,
            cefr: card.cefr,
            exampleEn: card.exampleEn,
            exampleVi: card.exampleVi,
          }))}
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
        />
      </main>
    </div>
  );
}
