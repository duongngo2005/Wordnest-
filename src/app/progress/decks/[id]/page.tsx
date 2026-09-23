import { notFound } from "next/navigation";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { Header } from "@/components/ui/Header";
import { progressService } from "@/services/vocabulary";

export const revalidate = 0;

interface DeckProgressPageProps {
  params: Promise<{ id: string }>;
}

export default async function DeckProgressPage({ params }: DeckProgressPageProps) {
  const { id } = await params;
  const analytics = await progressService.getDeckAnalytics(id);
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
