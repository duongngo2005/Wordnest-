import React from "react";
import Link from "next/link";
import { WordNestMascot } from "./Mascot";

export function Header() {
  return (
    <header className="w-full bg-[#FAF6EE] border-b-[2.5px] border-[#221C16] sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-[#E06B43] rounded-lg"
        >
          <div className="transition-transform group-hover:scale-105">
            <WordNestMascot size={44} mood="reading" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#221C16]">
                Word<span className="text-[#E06B43]">Nest</span>
              </span>
              <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-[#221C16] leading-none">
                MVP
              </span>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-[#6B6258] -mt-0.5">
              Turn words into stories.
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xs sm:text-sm font-bold text-[#221C16] px-3 py-1.5 rounded-lg border-2 border-transparent hover:border-[#221C16] hover:bg-[#FEF3C7] transition-all"
          >
            Tạo thẻ mới
          </Link>
        </nav>
      </div>
    </header>
  );
}
