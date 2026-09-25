"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { speakEnglish, isSpeechSupported } from "@/lib/speech";
import { useToast } from "@/components/ui/ToastProvider";

interface PronounceButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "default" | "story" | "card";
  className?: string;
}

const emptySubscribe = () => () => {};

export function PronounceButton({
  text,
  label,
  size = "md",
  variant = "default",
  className = "",
}: PronounceButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { error } = useToast();

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setIsPlaying(false), 6000);
    return () => clearTimeout(timer);
  }, [isPlaying]);

  const supported = useSyncExternalStore(
    emptySubscribe,
    () => isSpeechSupported(),
    () => true
  );

  if (!supported) {
    return null;
  }

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);

    speakEnglish(
      text,
      () => setIsPlaying(true),
      () => setIsPlaying(false),
      () => {
        setIsPlaying(false);
        error("Không thể phát âm", {
          description: "Kiểm tra kết nối và âm lượng rồi thử lại.",
        });
      }
    );
  };

  const isSmall = size === "sm";
  const isStoryControl = variant === "story";
  const isCard = variant === "card";

  // Icon-only circular button for flashcard rows
  if (isCard) {
    return (
      <button
        type="button"
        onClick={handleSpeak}
        disabled={isPlaying}
        title={label || `Phát âm "${text}"`}
        aria-label={label || `Phát âm "${text}"`}
        aria-busy={isPlaying}
        data-speaking={isPlaying}
        className={`wn-audio-btn ${isPlaying ? "wn-audio-btn--speaking" : ""} focus:outline-none focus:ring-2 focus:ring-[#E06B43] ${className}`}
      >
        <Volume2
          className={`h-[0.9375rem] w-[0.9375rem] ${isPlaying ? "speaking-pulse text-[#92400E]" : "text-[#221C16]"}`}
          strokeWidth={2.5}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSpeak}
      disabled={isPlaying}
      title={label || `Phát âm "${text}"`}
      aria-label={label || `Phát âm "${text}"`}
      aria-busy={isPlaying}
      data-speaking={isPlaying}
      className={`inline-flex items-center justify-center gap-1.5 font-bold transition-all border-2 border-[#221C16] active:translate-y-0.5 select-none focus:outline-none focus:ring-2 focus:ring-[#E06B43] ${
        isPlaying
          ? isStoryControl
            ? "bg-[#FEF3C7] text-[#8A5817] border-[#C85630]"
            : "bg-[#FEF3C7] text-[#D97706] border-[#D97706]"
          : isStoryControl
            ? "bg-[#FEF3C7] text-[#8A5817] hover:bg-[#FDE68A]"
            : "bg-[#FFFDF9] text-[#221C16] hover:bg-[#FEF3C7]"
      } ${
        isStoryControl
          ? "min-h-9 rounded-lg px-3 py-1.5 text-xs shadow-[1.5px_1.5px_0px_#221C16]"
          : isSmall
          ? "px-2 py-1 rounded-md text-xs min-h-[32px]"
          : "px-3 py-1.5 rounded-lg text-xs sm:text-sm min-h-[40px] shadow-[2px_2px_0px_#221C16]"
      } ${className}`}
    >
      <Volume2
        className={`${isSmall ? "w-3.5 h-3.5" : "w-4 h-4"} ${
          isPlaying ? "speaking-pulse text-[#D97706]" : "text-[#221C16]"
        }`}
      />
      {label && <span>{isPlaying && !isStoryControl ? "Đang đọc..." : label}</span>}
    </button>
  );
}
