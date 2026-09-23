import Link from "next/link";
import { Menu, Plus, Settings } from "lucide-react";
import { WordNestMascot } from "./Mascot";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#221C16]/10 bg-[#FAF6EE]/95 backdrop-blur">
      <div className="page-container flex h-14 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
          <WordNestMascot size={34} mood="reading" />
          <span className="text-xl font-black tracking-tight text-[#221C16]">Word<span className="text-[#D75F39]">Nest</span></span>
        </Link>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-1">
          <Link href="/#add-vocabulary" className="brick-button-primary gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Plus className="h-4 w-4" /><span>Thêm từ</span>
          </Link>
          <details className="relative">
            <summary role="button" aria-label="Thêm tùy chọn" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-[#4A4036] hover:bg-[#F1E9DB] focus:outline-none focus:ring-2 focus:ring-[#E06B43]">
              <Menu className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[#221C16]/15 bg-[#FFFDF9] p-1.5 shadow-lg">
              <Link href="/progress" className="block rounded-lg px-3 py-2 text-sm font-semibold text-[#221C16] hover:bg-[#F6F0E6]">Tiến độ</Link>
              <Link href="/import" className="block rounded-lg px-3 py-2 text-sm font-semibold text-[#221C16] hover:bg-[#F6F0E6]">Nhập JSON</Link>
              <Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#221C16] hover:bg-[#F6F0E6]"><Settings className="h-4 w-4" /> Cài đặt</Link>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
