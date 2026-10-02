"use client";

import React from "react";

interface CefrBadgeProps {
  level: string | null | undefined;
  size?: "sm" | "md";
  showPrefix?: boolean;
  className?: string;
}

export function getCefrColor(level: string): { bg: string; text: string } {
  const normalized = level.trim().toUpperCase();
  if (normalized.startsWith("A")) {
    // Beginner / Elementary: Soft mint green
    return { bg: "bg-[#DCFCE7]", text: "text-[#166534]" };
  }
  if (normalized.startsWith("B")) {
    // Intermediate: Warm amber sun
    return { bg: "bg-[#FEF3C7]", text: "text-[#92400E]" };
  }
  if (normalized.startsWith("C")) {
    // Advanced / Proficient: Brick rose
    return { bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" };
  }
  return { bg: "bg-[#F4EFE6]", text: "text-[#6B6258]" };
}

export function CefrBadge({
  level,
  size = "md",
  showPrefix = false,
  className = "",
}: CefrBadgeProps) {
  if (!level || !level.trim()) return null;

  const normalized = level.trim().toUpperCase();
  const colors = getCefrColor(normalized);
  const sizeClasses =
    size === "sm"
      ? "px-1.5 py-0.5 text-[10px] shadow-[1px_1px_0px_#221C16]"
      : "px-2.5 py-0.5 text-xs shadow-[1.5px_1.5px_0px_#221C16]";

  return (
    <span
      data-testid="cefr-badge"
      className={`inline-flex items-center gap-1 rounded-full border-1.5 border-[#221C16] font-mono font-black uppercase tracking-wider ${colors.bg} ${colors.text} ${sizeClasses} ${className}`}
    >
      {showPrefix ? (
        <span className="text-[9px] font-bold opacity-80 select-none">CEFR</span>
      ) : null}
      <span>{normalized}</span>
    </span>
  );
}
