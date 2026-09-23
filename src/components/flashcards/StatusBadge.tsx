"use client";

import React from "react";
import { FlashcardStatus } from "@/lib/flashcards/status";

interface StatusBadgeProps {
  status: FlashcardStatus;
}

export function StatusBadge({
  status,
}: StatusBadgeProps) {
  const config = {
    [FlashcardStatus.NEW]: {
      label: "Mới (New)",
      bg: "bg-[#E0F2FE]",
      text: "text-[#0369A1]",
      border: "border-[#0284C7]",
    },
    [FlashcardStatus.LEARNING]: {
      label: "Đang học (Learning)",
      bg: "bg-[#FEF3C7]",
      text: "text-[#B45309]",
      border: "border-[#D97706]",
    },
    [FlashcardStatus.KNOWN]: {
      label: "Đang Review",
      bg: "bg-[#DCFCE7]",
      text: "text-[#15803D]",
      border: "border-[#16A34A]",
    },
  };

  const current = config[status];

  return (
    <span
      className={`brick-badge ${current.bg} ${current.text} ${current.border}`}
    >
      {current.label}
    </span>
  );
}
