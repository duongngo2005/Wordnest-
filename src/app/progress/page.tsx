import { Header } from "@/components/ui/Header";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { progressService } from "@/services/vocabulary";
import { getServerStudyTimezone } from "@/lib/study-timezone-server";

export const revalidate = 0;

export const metadata = {
  title: "Tiến độ | WordNest",
  description: "Hoạt động ôn tập và luyện từ vựng trên WordNest.",
};

export default async function ProgressPage() {
  const timezone = await getServerStudyTimezone();
  const analytics = await progressService.getGlobalAnalytics(timezone);

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col">
      <Header />
      <main className="page-container wn-page flex-1">
        <ProgressDashboard analytics={analytics} />
      </main>
    </div>
  );
}
