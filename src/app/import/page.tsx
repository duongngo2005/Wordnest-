import Link from "next/link";
import { ArrowLeft, Braces, FileWarning } from "lucide-react";
import { Header } from "@/components/ui/Header";

export default function ImportPage() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container py-8 sm:py-12">
        <section className="mx-auto max-w-xl space-y-5">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B6258] hover:text-[#221C16]"><ArrowLeft className="h-4 w-4" /> Về thư viện</Link>
          <div className="surface-card p-5 sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8EFFA] text-[#315F9E]"><Braces className="h-5 w-5" /></div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-[#221C16]">Nhập JSON</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6258]">
              JSON Import vẫn có sẵn trong từng bộ từ: mở bộ từ, chọn <strong>Thêm từ</strong>, rồi chọn <strong>Nhập JSON</strong>. Dữ liệu được kiểm tra và xem trước trước khi lưu.
            </p>
          </div>
          <div className="flex gap-3 rounded-xl border border-[#D8B87B] bg-[#FFF7E7] p-4 text-sm leading-6 text-[#6B6258]">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-[#A56A16]" />
            <p>Nhập PDF, DOCX, TXT và CSV đã được ngừng hỗ trợ. Flashcard và dữ liệu lịch sử đã tạo trước đây không bị thay đổi.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
