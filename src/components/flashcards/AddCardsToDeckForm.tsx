"use client";

import { useState } from "react";
import { Braces, PenLine, Sparkles, X } from "lucide-react";
import { AiCardsToDeckForm } from "./AiCardsToDeckForm";
import { JsonFlashcardImport } from "./JsonFlashcardImport";
import { ManualCardsEditor } from "./ManualCardsEditor";

interface AddCardsToDeckFormProps {
  deckId: string;
  deckName: string;
  collectionName?: string | null;
  onClose: () => void;
  onCardsCreated: () => void;
}

type CreationMode = "manual" | "ai" | "json";

export function AddCardsToDeckForm({
  deckId,
  deckName,
  collectionName,
  onClose,
  onCardsCreated,
}: AddCardsToDeckFormProps) {
  const [mode, setMode] = useState<CreationMode>("manual");
  const methods: Array<{
    id: CreationMode;
    label: string;
    description: string;
    icon: typeof PenLine;
    badgeBg: string;
    iconColor: string;
  }> = [
    {
      id: "manual",
      label: "Thủ công",
      description: "Tự viết thẻ",
      icon: PenLine,
      badgeBg: "bg-[#FDEEE9]",
      iconColor: "text-[#E06B43]",
    },
    {
      id: "ai",
      label: "AI",
      description: "Gợi ý tự động",
      icon: Sparkles,
      badgeBg: "bg-[#FEF3C7]",
      iconColor: "text-[#D97706]",
    },
    {
      id: "json",
      label: "JSON",
      description: "Nhập dữ liệu ngoài",
      icon: Braces,
      badgeBg: "bg-[#DDF5F1]",
      iconColor: "text-[#0D9488]",
    },
  ];

  return (
    <section
      className="wn-primary-surface overflow-hidden"
      aria-label="Thêm thẻ"
    >
      {/* Warm paper header bar replacing the uniform yellow bar */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-[#DCD3C5] bg-[#F8F4EC] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] shadow-[1.5px_1.5px_0px_#221C16]">
            <PenLine className="h-3.5 w-3.5 text-[#E06B43]" strokeWidth={2.5} />
          </span>
          <h2 className="text-base font-black text-[#221C16]">Thêm thẻ mới</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thêm thẻ"
          className="wn-button wn-button-quiet wn-icon-button h-11 w-11 rounded-lg"
        >
          <X className="h-5 w-5 text-[#221C16]" />
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Cách thêm thẻ">
          {methods.map((method) => {
            const Icon = method.icon;
            const selected = mode === method.id;
            return (
              <button
                key={method.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(method.id)}
                className={`wn-method-card ${method.id === "json" ? "col-span-2 sm:col-span-1" : ""} ${
                  selected ? "!border-[#221C16] !bg-[#FFF8E8]" : "bg-[#FFFDF9]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#221C16] ${method.badgeBg} ${method.iconColor} shadow-[1.5px_1.5px_0px_#221C16]`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span>
                  <span className="block text-sm font-black text-[#221C16]">{method.label}</span>
                  <span className="mt-0.5 block text-xs font-bold text-[#6B6258]">{method.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Mode Body */}
        <div className="mt-4">
          {mode === "manual" ? (
            <ManualCardsEditor deckId={deckId} onSaved={onCardsCreated} />
          ) : null}
          {mode === "ai" ? (
            <AiCardsToDeckForm
              deckId={deckId}
              onSaved={onCardsCreated}
              onChooseManual={() => setMode("manual")}
              onChooseJson={() => setMode("json")}
            />
          ) : null}
          {mode === "json" ? (
            <JsonFlashcardImport
              deckId={deckId}
              deckName={deckName}
              collectionName={collectionName}
              onSaved={onCardsCreated}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
