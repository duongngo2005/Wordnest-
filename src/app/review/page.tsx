import { Header } from "@/components/ui/Header";
import { StudyMode } from "@/components/study/StudyMode";
import { fsrsService } from "@/services/fsrs";

export const revalidate = 0;

export const metadata = {
  title: "Ôn tập | WordNest",
  description: "Ôn các thẻ đến hạn trên tất cả bộ từ.",
};

export default async function GlobalReviewPage() {
  // Progress only promises a review queue. New cards stay in their deck flow.
  const reviewQueue = await fsrsService.getReviewQueue({ newLimit: 0 });

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col">
      <Header />
      <main className="page-container wn-page flex-1">
        <StudyMode
          deckId="global-review"
          deckName="Tất cả bộ từ"
          initialCards={reviewQueue.queue}
          mode="scheduled-review"
          backHref="/progress"
          backLabel="Quay lại tiến độ"
        />
      </main>
    </div>
  );
}
