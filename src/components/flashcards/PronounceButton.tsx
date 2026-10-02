"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { speakEnglish, isSpeechSupported } from "@/lib/speech";
import { useToast } from "@/components/ui/ToastProvider";

interface PronounceButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "story" | "card" | "menu-item";
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
  const { error, info } = useToast();

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
      },
      { onCloudFallback: () => info("Đang dùng giọng hệ thống.") }
    );
  };

  const accessibleLabel = label || `Phát âm "${text}"`;

  // Menu item layout for dropdown menus
  if (variant === "menu-item") {
    return (
      <button
        type="button"
        onClick={handleSpeak}
        disabled={isPlaying}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        aria-busy={isPlaying}
        className={`wn-button wn-button-quiet w-full justify-start text-xs font-bold ${
          isPlaying ? "bg-[#FEF3C7] text-[#D97706]" : ""
        } ${className}`}
      >
        <Volume2
          className={`h-3.5 w-3.5 ${
            isPlaying ? "speaking-pulse text-[#D97706]" : "text-[#221C16]"
          }`}
          strokeWidth={2.3}
        />
        <span>{isPlaying ? "Đang đọc..." : label || "Đọc"}</span>
      </button>
    );
  }

  // Speaker icon button with WordNest warm retro vibe
  const sizeClasses: Record<string, string> = {
    sm: "wn-audio-btn--sm",
    md: "wn-audio-btn--md",
    lg: "wn-audio-btn--lg",
  };

  const iconSizes: Record<string, string> = {
    sm: "h-[1.125rem] w-[1.125rem]",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <button
      type="button"
      onClick={handleSpeak}
      disabled={isPlaying}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      aria-busy={isPlaying}
      data-speaking={isPlaying}
      className={`wn-audio-btn ${sizeClasses[size] || ""} ${
        isPlaying ? "wn-audio-btn--speaking" : ""
      } focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${className}`}
    >
      <Volume2
        className={`wn-audio-btn__icon ${iconSizes[size] || "h-5 w-5"} ${
          isPlaying ? "speaking-pulse text-[var(--accent-strong)]" : "text-[#221C16]"
        }`}
        strokeWidth={2.4}
      />
    </button>
  );
}
