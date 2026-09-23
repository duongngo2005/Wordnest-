import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { StudyMode } from "@/components/study/StudyMode";
import { folderService } from "@/services/vocabulary";
import { fsrsService } from "@/services/fsrs";

export const revalidate = 0;

interface FolderReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function FolderReviewPage({ params }: FolderReviewPageProps) {
  const { id } = await params;
  const folder = await folderService.getFolder(id);
  if (!folder) notFound();
  const reviewQueue = await fsrsService.getReviewQueue({ folderId: id });

  return (
    <div className="min-h-screen bg-[#FAF6EE] selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="px-4 py-4 sm:py-6">
        <StudyMode
          deckId={folder.id}
          deckName={folder.name}
          initialCards={reviewQueue.queue}
          mode="scheduled-review"
          backHref={`/folders/${folder.id}`}
          backLabel="Quay lại collection"
        />
      </main>
    </div>
  );
}
