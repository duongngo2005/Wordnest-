"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import { WordNestMascot } from "@/components/ui/Mascot";
import {
  DEFAULT_MASCOT_ID,
  getMascotId,
  saveMascotId,
  subscribeToMascotId,
  type MascotId,
} from "@/lib/mascot-preferences";

const MASCOT_OPTIONS: ReadonlyArray<{
  id: MascotId;
  name: string;
  description: string;
  colorName: string;
  previewColor: string;
}> = [
  {
    id: "nesty",
    name: "Nesty",
    description: "Chú chim WordNest quen thuộc.",
    colorName: "Cam đất",
    previewColor: "#B54727",
  },
  {
    id: "dino",
    name: "Dino",
    description: "Khủng long xanh từ Page Mascot.",
    colorName: "Xanh lá",
    previewColor: "#27843D",
  },
  {
    id: "knight",
    name: "Knight",
    description: "Hiệp sĩ giáp thép từ Page Mascot.",
    colorName: "Xanh thép",
    previewColor: "#1D4ED8",
  },
];

const MASCOT_SELECTION_NAMES: Record<MascotId, string> = {
  nesty: "Nesty và bảng màu cam đất",
  dino: "Dino và bảng màu xanh lá",
  knight: "Knight và bảng màu xanh thép",
};

export function MascotSettingsPanel() {
  const mascotId = useSyncExternalStore(subscribeToMascotId, getMascotId, () => DEFAULT_MASCOT_ID);
  const [status, setStatus] = useState("");

  const chooseMascot = (nextMascotId: MascotId) => {
    if (nextMascotId === mascotId) return;

    const wasPersisted = saveMascotId(nextMascotId);
    const selectionName = MASCOT_SELECTION_NAMES[nextMascotId];

    setStatus(
      wasPersisted
        ? `Đã chọn ${selectionName}. Lựa chọn sẽ được giữ lại trên thiết bị này.`
        : `Đã chọn ${selectionName} cho phiên này. Trình duyệt đang chặn việc lưu lựa chọn.`
    );
  };

  const activeSelection = MASCOT_SELECTION_NAMES[mascotId];

  return (
    <section className="brick-card overflow-hidden bg-[#FFFDF9]" aria-labelledby="mascot-settings-heading">
      <div className="border-b-2 border-[#221C16] bg-[var(--accent-soft)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[2px_2px_0px_#221C16]" aria-hidden="true">
            <Palette className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} />
          </span>
          <div>
            <h2 id="mascot-settings-heading" className="text-base font-black text-[#221C16]">
              Linh vật &amp; màu sắc
            </h2>
            <p className="mt-0.5 text-xs font-semibold leading-relaxed text-[#6B6258]">
              Đổi linh vật để thay điểm nhấn của WordNest — nút chính, viền chọn và vòng focus sẽ đi cùng màu.
            </p>
          </div>
        </div>
      </div>

      <fieldset className="p-4 sm:p-5">
        <legend className="sr-only">Chọn linh vật WordNest</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {MASCOT_OPTIONS.map((option) => {
            const isSelected = mascotId === option.id;

            return (
              <div key={option.id} className="wn-mascot-option">
                <input
                  id={`mascot-${option.id}`}
                  className="wn-mascot-option__input"
                  type="radio"
                  name="mascot"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => chooseMascot(option.id)}
                />
                <label htmlFor={`mascot-${option.id}`} className="wn-mascot-option__body">
                  <WordNestMascot mascot={option.id} mood="happy" size={72} ariaHidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-[#221C16]">{option.name}</span>
                      {isSelected ? (
                        <Check className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold leading-relaxed text-[#6B6258]">
                      {option.description}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--accent-strong)]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.previewColor }} aria-hidden="true" />
                      {option.colorName}
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs font-semibold text-[#6B6258]">
          Dino và Knight nhìn theo con trỏ và phản ứng khi chạm ở phần đầu Cài đặt; các minh hoạ trong nội dung giữ yên để không làm gián đoạn việc học. Lựa chọn được lưu trên thiết bị này.
        </p>
        <p className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink-2)]" role="status" aria-atomic="true">
          {status || `Đang dùng ${activeSelection}.`}
        </p>
      </fieldset>
    </section>
  );
}
