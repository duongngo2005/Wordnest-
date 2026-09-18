"use client";

import React from "react";
import { FlashcardStatus } from "@prisma/client";

interface StatusBadgeProps {
  status: FlashcardStatus;
  onChange?: (newStatus: FlashcardStatus) => void;
  interactive?: boolean;
}

export function StatusBadge({
  status,
  onChange,
  interactive = false,
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
      label: "Đã thuộc (Known)",
      bg: "bg-[#DCFCE7]",
      text: "text-[#15803D]",
      border: "border-[#16A34A]",
    },
  };

  const current = config[status];

  if (!interactive || !onChange) {
    return (
      <span
        className={`brick-badge ${current.bg} ${current.text} ${current.border}`}
      >
        {current.label}
      </span>
    );
  }

  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as FlashcardStatus)}
      aria-label="Thay đổi trạng thái thẻ"
      className={`text-xs font-bold px-2 py-1 rounded-md border-2 border-[#221C16] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E06B43] ${current.bg} ${current.text}`}
    >
      <option value={FlashcardStatus.NEW}>Mới (New)</option>
      <option value={FlashcardStatus.LEARNING}>Đang học (Learning)</option>
      <option value={FlashcardStatus.KNOWN}>Đã thuộc (Known)</option>
    </select>
  );
}
