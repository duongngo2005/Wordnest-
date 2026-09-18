"use client";

import React, { useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { speakEnglish } from "@/lib/speech";

interface PronounceButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

const emptySubscribe = () => () => {};

export function PronounceButton({
  text,
  label,
  size = "md",
  className = "",
}: PronounceButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => true
  );

  if (!supported) {
    return null;
  }

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;

    speakEnglish(
      text,
      () => setIsPlaying(true),
      () => setIsPlaying(false),
      () => setIsPlaying(false)
    );
  };

  const isSmall = size === "sm";

  return (
    <button
      type="button"
      onClick={handleSpeak}
      disabled={isPlaying}
      title={label || `Phát âm "${text}"`}
      aria-label={label || `Phát âm "${text}"`}
      className={`inline-flex items-center justify-center gap-1.5 font-bold transition-all border-2 border-[#221C16] active:translate-y-0.5 select-none focus:outline-none focus:ring-2 focus:ring-[#E06B43] ${
        isPlaying
          ? "bg-[#FEF3C7] text-[#D97706] border-[#D97706]"
          : "bg-[#FFFDF9] text-[#221C16] hover:bg-[#FEF3C7]"
      } ${
        isSmall
          ? "px-2 py-1 rounded-md text-xs min-h-[32px]"
          : "px-3 py-1.5 rounded-lg text-xs sm:text-sm min-h-[40px] shadow-[2px_2px_0px_#221C16]"
      } ${className}`}
    >
      <Volume2
        className={`${isSmall ? "w-3.5 h-3.5" : "w-4 h-4"} ${
          isPlaying ? "speaking-pulse text-[#D97706]" : "text-[#221C16]"
        }`}
      />
      {label && <span>{isPlaying ? "Đang đọc..." : label}</span>}
    </button>
  );
}
