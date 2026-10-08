"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { BookOpen, Sparkles, X, ArrowRight, Wand2 } from "lucide-react";

interface ReadingHubModalProps {
  open: boolean;
  deckId: string;
  deckName: string;
  onClose: () => void;
  onOpenLessonGenerator?: () => void;
}

export function ReadingHubModal({
  open,
  deckId,
  deckName,
  onClose,
  onOpenLessonGenerator,
}: ReadingHubModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (dialog.open) {
        dialog.close();
      }
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reading-hub-title"
      className="wn-reading-hub-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-5 sm:p-6 shadow-[6px_6px_0px_#221C16] space-y-5 toast-enter"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-[#DCD3C5] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FEF08A] shadow-[2px_2px_0px_#221C16]">
              <BookOpen className="h-5 w-5 text-[#B45309]" strokeWidth={2.5} />
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#6B6258]">
                Không gian đọc &amp; ngữ cảnh
              </span>
              <h2
                id="reading-hub-title"
                className="text-lg sm:text-xl font-black text-[#221C16]"
              >
                Học từ qua ngữ cảnh thực tế
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ Đọc & Ngữ cảnh"
            ref={closeButtonRef}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] text-[#6B6258] shadow-[1.5px_1.5px_0px_#221C16] hover:bg-[#F4EFE6] active:translate-y-0.5 cursor-pointer"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-xs sm:text-sm font-semibold text-[#6B6258] leading-relaxed">
          Chọn cách học từ qua một bài đọc. Bộ từ: <strong className="text-[#221C16]">&ldquo;{deckName}&rdquo;</strong>.
        </p>

        {/* 2 Hub Pathways */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Card 1: Story */}
          <div className="flex flex-col justify-between rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-4 shadow-[2px_2px_0px_#221C16] hover:shadow-[3px_3px_0px_#221C16] transition-all">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#CCFBF1] shadow-[1px_1px_0px_#221C16]">
                  <BookOpen className="h-4 w-4 text-[#0F766E]" strokeWidth={2.5} />
                </span>
                <h3 className="font-black text-sm text-[#221C16]">Truyện</h3>
              </div>
              <p className="text-xs font-semibold text-[#6B6258] leading-relaxed">
                Đọc nội dung linh hoạt, khám phá từ trong ngữ cảnh, nghe và luyện tập sau khi đọc.
              </p>
            </div>

            <div className="mt-4 space-y-2 pt-2 border-t border-dashed border-[#DCD3C5]">
              <Link
                href={`/decks/${deckId}/story`}
                onClick={onClose}
                className="brick-button-secondary w-full justify-center px-3 py-2 text-xs font-black"
              >
                <span>Xem danh sách truyện</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
              <Link
                href={`/decks/${deckId}/story?create=ai`}
                onClick={onClose}
                className="brick-button-primary w-full justify-center px-3 py-2 text-xs font-black"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                <span>Tạo truyện AI mới</span>
              </Link>
            </div>
          </div>

          {/* Card 2: Lesson */}
          <div className="flex flex-col justify-between rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-4 shadow-[2px_2px_0px_#221C16] hover:shadow-[3px_3px_0px_#221C16] transition-all">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] shadow-[1px_1px_0px_#221C16]">
                  <Sparkles className="h-4 w-4 text-[#B45309]" strokeWidth={2.5} />
                </span>
                <h3 className="font-black text-sm text-[#221C16]">Bài học</h3>
              </div>
              <p className="text-xs font-semibold text-[#6B6258] leading-relaxed">
                Bài đọc ngắn, tập trung vào nhóm từ đã chọn và cách dùng chúng trong ngữ cảnh.
              </p>
            </div>

            <div className="mt-4 space-y-2 pt-2 border-t border-dashed border-[#DCD3C5]">
              <Link
                href={`/decks/${deckId}/lesson`}
                onClick={onClose}
                className="brick-button-secondary w-full justify-center px-3 py-2 text-xs font-black"
              >
                <span>Xem bài học đã có</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
              {onOpenLessonGenerator ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLessonGenerator();
                  }}
                  className="brick-button-primary w-full justify-center px-3 py-2 text-xs font-black cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  <span>Tạo bài học AI mới</span>
                </button>
              ) : (
                <Link
                  href={`/decks/${deckId}/lesson?create=ai`}
                  onClick={onClose}
                  className="brick-button-primary w-full justify-center px-3 py-2 text-xs font-black"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  <span>Tạo bài học AI mới</span>
                </Link>
              )}
            </div>
          </div>
        </div>
    </dialog>
  );
}
