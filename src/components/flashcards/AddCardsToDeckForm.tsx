"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { JsonFlashcardImport } from "./JsonFlashcardImport";
import { ManualCardsEditor } from "./ManualCardsEditor";

interface AddCardsToDeckFormProps {
  deckId: string;
  deckName: string;
  collectionName?: string | null;
  onClose: () => void;
  onCardsCreated: () => void;
}

type CreationMode = "manual" | "json";

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
  }> = [
    {
      id: "manual",
      label: "Thủ công",
    },
    {
      id: "json",
      label: "AI JSON",
    },
  ];

  return (
    <section
      className="wn-add-cards-dialog"
      aria-labelledby="add-cards-title"
    >
      <div className="wn-add-cards-dialog__header">
        <h2 id="add-cards-title">Thêm thẻ mới</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thêm thẻ"
          className="wn-dialog-close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="wn-add-cards-dialog__body">
        <fieldset className="wn-method-switch">
          <legend className="wn-sr-only">Cách thêm thẻ</legend>
          {methods.map((method) => {
            const selected = mode === method.id;
            return (
              <button
                key={method.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(method.id)}
                className="wn-method-switch__option"
              >
                {method.label}
              </button>
            );
          })}
        </fieldset>

        <div className="wn-add-cards-dialog__content">
          <div hidden={mode !== "manual"}>
            <ManualCardsEditor deckId={deckId} onSaved={onCardsCreated} />
          </div>
          <div hidden={mode !== "json"}>
            <JsonFlashcardImport
              deckId={deckId}
              deckName={deckName}
              collectionName={collectionName}
              onSaved={onCardsCreated}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
