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
  const methods: Array<{ id: CreationMode; label: string; description: string; icon: typeof PenLine }> = [
    { id: "manual", label: "Thủ công", description: "Một thẻ", icon: PenLine },
    { id: "ai", label: "AI", description: "Tạo tự động", icon: Sparkles },
    { id: "json", label: "JSON", description: "AI bên ngoài", icon: Braces },
  ];

  return (
    <section
      className="wn-primary-surface overflow-hidden"
      aria-label="Thêm thẻ"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b-2 border-[#221C16] bg-[#FEF3C7] px-4 py-2.5 sm:px-5">
        <h2 className="text-base font-black text-[#221C16]">Thêm thẻ mới</h2>
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Cách thêm thẻ">
          {methods.map((method) => {
            const Icon = method.icon;
            const selected = mode === method.id;
            return (
              <button
                key={method.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(method.id)}
                className={`wn-method-card ${method.id === "json" ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#221C16] bg-[#FFFDF9] text-[#E06B43]">
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
