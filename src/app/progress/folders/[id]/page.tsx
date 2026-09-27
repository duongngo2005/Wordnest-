import { notFound } from "next/navigation";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { Header } from "@/components/ui/Header";
import { progressService } from "@/services/vocabulary";
import { getServerStudyTimezone } from "@/lib/study-timezone-server";

export const revalidate = 0;

interface FolderProgressPageProps {
  params: Promise<{ id: string }>;
}

export default async function FolderProgressPage({ params }: FolderProgressPageProps) {
  const { id } = await params;
  const timezone = await getServerStudyTimezone();
  const analytics = await progressService.getFolderAnalytics(id, timezone);
  if (!analytics) notFound();

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col">
      <Header />
      <main className="page-container wn-page flex-1">
        <ProgressDashboard analytics={analytics} />
      </main>
    </div>
  );
}
