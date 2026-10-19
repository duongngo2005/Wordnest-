import { Header } from "@/components/ui/Header";
import { GlobalTypingPractice, type TypingPracticeSource } from "@/components/practice/GlobalTypingPractice";

export const revalidate = 0;

export const metadata = {
  title: "Luyện gõ Việt → Anh | WordNest",
  description: "Luyện gõ active recall trên toàn bộ thư viện WordNest.",
};

export default async function GlobalTypingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const sourceParam = (await searchParams).source;
  const source: TypingPracticeSource = sourceParam === "due" ? "due" : "global";

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="page-container wn-page flex-1">
        <GlobalTypingPractice source={source} />
      </main>
    </div>
  );
}
