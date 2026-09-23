import type { Metadata } from "next";
import { Header } from "@/components/ui/Header";
import { WordNestMascot } from "@/components/ui/Mascot";
import { SpeechSettingsPanel } from "@/components/settings/SpeechSettingsPanel";

export const metadata: Metadata = {
  title: "Cài đặt | WordNest",
  description: "Tùy chỉnh giọng đọc và tốc độ phát âm tiếng Anh trên WordNest.",
};

export default function SettingsPage() {
  return (
    <div className="app-shell">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:py-8">
        <section className="brick-card flex items-center justify-between gap-4 overflow-hidden bg-[#FFFDF9] p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#221C16] sm:text-3xl">
              Cài đặt
            </h1>
            <p className="mt-1 text-xs font-bold text-[#6B6258] sm:text-sm">
              Giọng đọc và tốc độ
            </p>
          </div>
          <WordNestMascot mood="reading" size={72} />
        </section>

        <SpeechSettingsPanel />
      </main>
    </div>
  );
}
