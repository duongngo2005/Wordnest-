"use client";

import Link from "next/link";
import { BookOpen, ChartNoAxesCombined, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { WordNestMascot } from "./Mascot";
import { playUISound } from "@/lib/ui-sound";

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="wn-global-header sticky top-0 z-40 border-b-2 border-[#221C16] bg-[#FAF6EE]/95 backdrop-blur-md">
      <div className="page-container flex min-h-[48px] items-center justify-between gap-2 py-2">
        <Link
          href="/"
          onClick={() => playUISound("softTap")}
          className="flex min-w-0 items-center gap-1.5 sm:gap-2 rounded-xl p-1 transition-transform active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06B43]"
        >
          <span className="flex-shrink-0">
            <WordNestMascot size={32} mood="reading" />
          </span>
          <span className="truncate text-lg sm:text-xl font-black tracking-tight text-[#221C16]">
            Word<span className="text-[#E06B43]">Nest</span>
          </span>
        </Link>

        <nav aria-label="Điều hướng chính" className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/"
            onClick={() => playUISound("softTap")}
            aria-label="Thư viện"
            aria-current={isCurrent(pathname, "/") ? "page" : undefined}
            className={`wn-nav-link gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-extrabold ${
              isCurrent(pathname, "/") ? "border-2 border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]" : ""
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0 text-[#E06B43]" aria-hidden="true" strokeWidth={2.5} />
            <span className="wn-nav-label">Thư viện</span>
          </Link>
          <Link
            href="/progress"
            onClick={() => playUISound("softTap")}
            aria-label="Tiến độ"
            aria-current={isCurrent(pathname, "/progress") ? "page" : undefined}
            className={`wn-nav-link gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-extrabold ${
              isCurrent(pathname, "/progress") ? "border-2 border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]" : ""
            }`}
          >
            <ChartNoAxesCombined className="h-4 w-4 shrink-0 text-[#0284C7]" aria-hidden="true" strokeWidth={2.5} />
            <span className="wn-nav-label">Tiến độ</span>
          </Link>
          <Link
            href="/settings"
            onClick={() => playUISound("softTap")}
            aria-label="Cài đặt"
            aria-current={isCurrent(pathname, "/settings") ? "page" : undefined}
            className={`wn-nav-link wn-icon-button h-11 w-11 ${
              isCurrent(pathname, "/settings") ? "border-2 border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]" : ""
            }`}
          >
            <Settings className="h-4 w-4 shrink-0 text-[#6B6258]" aria-hidden="true" strokeWidth={2.5} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
