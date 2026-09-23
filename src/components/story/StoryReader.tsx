import { BookOpen, Clock, Compass, Volume2 } from "lucide-react";
import { PronounceButton } from "../flashcards/PronounceButton";
import { StoryNarrationControls } from "./StoryNarrationControls";
import type { StoryVocabulary } from "@/lib/story/story-vocabulary";

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

/** Historical Story reader. It deliberately performs no AI lookups or active practice. */
export function StoryReader({ story }: { story: StoryData }) {
  const paragraphs = story.content.split(/\n\n+/).filter(Boolean);

  return (
    <article className="surface-card p-4 sm:p-7">
      <header className="border-b border-[#221C16]/12 pb-5">
        <div className="flex flex-wrap gap-2 text-xs font-bold text-[#6B6258]">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F5EEDD] px-2.5 py-1 text-[#8A5817]"><Compass className="h-3.5 w-3.5" /> {story.topic}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F0EA] px-2.5 py-1"><BookOpen className="h-3.5 w-3.5" /> CEFR {story.cefr}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F0EA] px-2.5 py-1"><Clock className="h-3.5 w-3.5" /> {story.length}</span>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#A64B2B]">Truyện đã lưu</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#221C16] sm:text-3xl">{story.title}</h1>
          </div>
          <PronounceButton text={story.title} size="sm" label="Đọc tiêu đề" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[#6B6258]">
          <StoryNarrationControls content={story.content} />
          <span className="inline-flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" /> Bản lưu chỉ để đọc; tra nghĩa AI và Story Cloze đang được tạm dừng.</span>
        </div>
      </header>

      <div className="space-y-4 py-6 font-serif text-base leading-8 text-[#2F2923] sm:text-lg sm:leading-9">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>

      {story.vocabulary.requestedTerms.length > 0 ? (
        <footer className="border-t border-[#221C16]/12 pt-4">
          <p className="text-xs font-bold text-[#6B6258]">Từ mục tiêu đã lưu</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {story.vocabulary.requestedTerms.map((term) => <span key={term} className="rounded-lg bg-[#F5EEDD] px-2.5 py-1 text-xs font-bold text-[#4A4036]">{term}</span>)}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
