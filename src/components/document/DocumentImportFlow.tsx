"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ExtractedVocabularyItem } from "@/lib/validation/document";
import { WordNestMascot } from "../ui/Mascot";
import { PronounceButton } from "../flashcards/PronounceButton";
import {
  Upload,
  FileText,
  CheckSquare,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Search,
  AlertCircle,
  CheckCircle2,
  FolderPlus,
} from "lucide-react";

interface DocumentImportFlowProps {
  existingDecks: {
    id: string;
    name: string;
  }[];
}

export function DocumentImportFlow({ existingDecks }: DocumentImportFlowProps) {
  const router = useRouter();

  // Mode & File State
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Extracted Data State
  const [extractedData, setExtractedData] = useState<{
    filename: string;
    fileType: string;
    wordCount: number;
    characterCount: number;
    items: ExtractedVocabularyItem[];
  } | null>(null);

  // Preview & Selection State
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [targetDeckOption, setTargetDeckOption] = useState<"new" | "existing">("new");
  const [newDeckName, setNewDeckName] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    existingDecks[0]?.id || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCefr, setSelectedCefr] = useState<string>("ALL");

  // Card Generation State
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    const validExts = [".pdf", ".docx", ".txt"];
    const hasValidExt = validExts.some((ext) =>
      selectedFile.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExt) {
      setExtractError("Định dạng file không hỗ trợ. Vui lòng chọn file .pdf, .docx, hoặc .txt.");
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setExtractError("Kích thước file vượt quá 15MB. Vui lòng chọn file nhỏ hơn.");
      return;
    }

    setFile(selectedFile);
    setExtractError(null);
  };

  // Extract Vocabulary from Document
  const handleExtract = async () => {
    setExtractError(null);
    setIsExtracting(true);

    const formData = new FormData();
    if (inputMode === "file") {
      if (!file) {
        setExtractError("Vui lòng chọn một file tài liệu.");
        setIsExtracting(false);
        return;
      }
      formData.append("file", file);
    } else {
      if (!pastedText.trim() || pastedText.trim().length < 20) {
        setExtractError("Vui lòng dán đoạn văn bản có ít nhất 20 ký tự.");
        setIsExtracting(false);
        return;
      }
      formData.append("text", pastedText.trim());
    }

    try {
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể trích xuất từ vựng từ tài liệu.");
      }

      setExtractedData(data);
      // Pre-select top 15 terms by default
      const initialSelection = new Set<string>();
      const topCount = Math.min(15, data.items.length);
      for (let i = 0; i < topCount; i++) {
        initialSelection.add(data.items[i].term);
      }
      setSelectedTerms(initialSelection);

      // Default new deck name from document filename
      const baseName = data.filename.replace(/\.[^/.]+$/, "");
      setNewDeckName(`Từ vựng: ${baseName}`);
    } catch (err) {
      console.error("Extraction error:", err);
      setExtractError(
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi đọc tài liệu."
      );
    } finally {
      setIsExtracting(false);
    }
  };

  // Toggle selection for single term
  const handleToggleTerm = (term: string) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) {
        next.delete(term);
      } else {
        next.add(term);
      }
      return next;
    });
  };

  // Quick selection actions
  const handleSelectAll = () => {
    if (!extractedData) return;
    const all = new Set(extractedData.items.map((i) => i.term));
    setSelectedTerms(all);
  };

  const handleDeselectAll = () => {
    setSelectedTerms(new Set());
  };

  const handleSelectTop = (count: number) => {
    if (!extractedData) return;
    const top = new Set<string>();
    const limit = Math.min(count, extractedData.items.length);
    for (let i = 0; i < limit; i++) {
      top.add(extractedData.items[i].term);
    }
    setSelectedTerms(top);
  };

  // Reset to re-upload
  const handleReset = () => {
    setExtractedData(null);
    setFile(null);
    setPastedText("");
    setSelectedTerms(new Set());
    setExtractError(null);
    setGenerationError(null);
  };

  // Generate Flashcards from selected preview items
  const handleGenerateCards = async () => {
    if (!extractedData || selectedTerms.size === 0) return;

    setIsGeneratingCards(true);
    setGenerationError(null);

    const itemsToSubmit = extractedData.items
      .filter((item) => selectedTerms.has(item.term))
      .map((item) => ({
        term: item.term,
        meaning: item.meaning,
        cefr: item.cefr,
        originalSentence: item.originalSentence,
      }));

    const payload = {
      deckId: targetDeckOption === "existing" ? selectedDeckId : undefined,
      deckName: targetDeckOption === "new" ? newDeckName : undefined,
      items: itemsToSubmit,
    };

    try {
      const res = await fetch("/api/documents/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tạo bộ thẻ từ vựng.");
      }

      // Redirect to deck view page
      router.push(`/decks/${data.data.deckId}`);
    } catch (err) {
      console.error("Card generation failed:", err);
      setGenerationError(
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo bộ thẻ."
      );
      setIsGeneratingCards(false);
    }
  };

  // Filter items in preview
  const filteredItems = extractedData
    ? extractedData.items.filter((item) => {
        const matchesSearch =
          searchQuery.trim() === "" ||
          item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.meaning.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCefr =
          selectedCefr === "ALL" || item.cefr === selectedCefr;

        return matchesSearch && matchesCefr;
      })
    : [];

  // ==========================================
  // VIEW 1: UPLOAD & INPUT STEP
  // ==========================================
  if (!extractedData) {
    return (
      <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto">
        {/* Banner */}
        <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] space-y-4 text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] px-3 py-1 rounded-full border border-[#221C16]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Phase 4: Nhập tài liệu</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              Biến tài liệu thành bộ thẻ từ vựng
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-[#6B6258] max-w-md">
              Tải lên tài liệu PDF, Word (DOCX) hoặc TXT. AI sẽ đọc hiểu, tự động lọc từ vựng quan trọng và cho bạn xem trước để chọn lọc trước khi tạo thẻ!
            </p>
          </div>

          <div className="shrink-0 flex justify-center">
            <WordNestMascot mood="reading" size={96} />
          </div>
        </div>

        {/* Input Mode Selector */}
        <div className="flex items-center justify-center gap-2 p-1.5 bg-[#EAE3D2] rounded-xl border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16]">
          <button
            onClick={() => setInputMode("file")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
              inputMode === "file"
                ? "bg-[#FAF6EE] text-[#221C16] border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16]"
                : "text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Tải file (PDF / DOCX / TXT)</span>
          </button>

          <button
            onClick={() => setInputMode("text")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
              inputMode === "text"
                ? "bg-[#FAF6EE] text-[#221C16] border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16]"
                : "text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Dán văn bản trực tiếp</span>
          </button>
        </div>

        {/* Upload Container */}
        <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] space-y-5">
          {inputMode === "file" ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 sm:p-10 rounded-2xl border-3 border-dashed text-center cursor-pointer transition-all ${
                isDragging
                  ? "bg-[#FEF3C7] border-[#E06B43] scale-[1.01]"
                  : file
                  ? "bg-[#F0FDF4] border-[#16A34A]"
                  : "bg-[#FAF6EE] border-[#221C16] hover:bg-[#FEF3C7]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-white border-2 border-[#221C16] shadow-[3px_3px_0px_#221C16] flex items-center justify-center">
                    {file ? (
                      <CheckCircle2 className="w-7 h-7 text-[#16A34A]" />
                    ) : (
                      <Upload className="w-7 h-7 text-[#E06B43]" />
                    )}
                  </div>
                </div>

                {file ? (
                  <div className="space-y-1">
                    <p className="text-base font-black text-[#15803D]">
                      Đã chọn: {file.name}
                    </p>
                    <p className="text-xs text-[#6B6258] font-bold">
                      {(file.size / 1024).toFixed(1)} KB • Nhấn để đổi file khác
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-base font-black text-[#221C16]">
                      Kéo thả file vào đây hoặc bấm để tải lên
                    </p>
                    <p className="text-xs font-semibold text-[#6B6258]">
                      Hỗ trợ định dạng PDF (.pdf), Word (.docx), Văn bản (.txt) tối đa 15MB
                    </p>
                  </div>
                )}

                {/* Formats Pills */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    PDF
                  </span>
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                    DOCX
                  </span>
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                    TXT
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="pasted-doc-text"
                className="text-xs font-black uppercase tracking-wider text-[#221C16] block"
              >
                Dán nội dung bài đọc / bài báo tiếng Anh:
              </label>
              <textarea
                id="pasted-doc-text"
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste an article, essay, or book chapter in English here... WordNest AI will extract the most valuable words for you."
                className="w-full p-4 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] text-sm font-medium text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05)]"
              />
              <p className="text-[11px] text-[#6B6258] font-semibold text-right">
                {pastedText.trim().split(/\s+/).filter(Boolean).length} từ • {pastedText.length} ký tự
              </p>
            </div>
          )}

          {extractError && (
            <div className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded-xl p-3.5 text-xs sm:text-sm font-bold text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{extractError}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleExtract}
              disabled={isExtracting || (inputMode === "file" && !file) || (inputMode === "text" && !pastedText.trim())}
              className="brick-button-primary w-full py-3.5 text-sm sm:text-base font-black gap-2 shadow-[3px_3px_0px_#221C16] disabled:opacity-60"
            >
              {isExtracting ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Đang đọc hiểu & trích xuất từ vựng bằng AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Đọc tài liệu & Xem trước từ vựng ➔</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: VOCABULARY PREVIEW & SELECTION STEP
  // ==========================================
  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-24">
      {/* Top Preview Summary Card */}
      <div className="brick-card p-6 sm:p-7 bg-[#FFFDF9] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#15803D] bg-[#DCFCE7] px-2.5 py-0.5 rounded-full border border-[#15803D]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Xem trước từ vựng (Vocabulary Preview)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#221C16] tracking-tight">
              Tài liệu: {extractedData.filename}
            </h1>
            <p className="text-xs text-[#6B6258] font-semibold">
              Đã trích xuất <strong className="text-[#221C16]">{extractedData.items.length}</strong> từ vựng quan trọng từ văn bản ({extractedData.wordCount} từ).
            </p>
          </div>

          <button
            onClick={handleReset}
            className="brick-button-secondary text-xs px-3 py-2 shrink-0 self-start sm:self-auto gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Chọn tài liệu khác</span>
          </button>
        </div>

        {/* Target Deck Selection Settings */}
        <div className="pt-4 border-t-2 border-[#221C16] space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#221C16] flex items-center gap-1.5">
            <FolderPlus className="w-3.5 h-3.5 text-[#E06B43]" />
            <span>Lưu từ vựng vào đâu?</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option A: Create New Deck */}
            <div
              onClick={() => setTargetDeckOption("new")}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5 ${
                targetDeckOption === "new"
                  ? "bg-[#FEF3C7] border-[#221C16] shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#FAF6EE] border-gray-300 opacity-80"
              }`}
            >
              <input
                type="radio"
                name="deck-option"
                checked={targetDeckOption === "new"}
                onChange={() => setTargetDeckOption("new")}
                className="mt-1"
              />
              <div className="space-y-1 w-full">
                <span className="text-xs font-black text-[#221C16] block">
                  Tạo bộ thẻ mới
                </span>
                {targetDeckOption === "new" && (
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Nhập tên bộ thẻ..."
                    className="w-full p-2 rounded-lg border-2 border-[#221C16] bg-white text-xs font-bold text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                  />
                )}
              </div>
            </div>

            {/* Option B: Add to Existing Deck */}
            <div
              onClick={() => setTargetDeckOption("existing")}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5 ${
                targetDeckOption === "existing"
                  ? "bg-[#FEF3C7] border-[#221C16] shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#FAF6EE] border-gray-300 opacity-80"
              }`}
            >
              <input
                type="radio"
                name="deck-option"
                checked={targetDeckOption === "existing"}
                onChange={() => setTargetDeckOption("existing")}
                className="mt-1"
                disabled={existingDecks.length === 0}
              />
              <div className="space-y-1 w-full">
                <span className="text-xs font-black text-[#221C16] block">
                  Thêm vào bộ thẻ đã có ({existingDecks.length})
                </span>
                {targetDeckOption === "existing" && (
                  <select
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    className="w-full p-2 rounded-lg border-2 border-[#221C16] bg-white text-xs font-bold text-[#221C16] focus:outline-none"
                  >
                    {existingDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Selection Toolbar: Select All, Top 10, Top 20, Top 50 */}
        <div className="pt-3 border-t border-black/10 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-black text-[#6B6258] mr-1">
              Chọn nhanh:
            </span>
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#221C16] hover:bg-[#FEF3C7] text-[#221C16]"
            >
              Chọn tất cả
            </button>
            <button
              onClick={handleDeselectAll}
              className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#221C16] hover:bg-gray-100 text-[#6B6258]"
            >
              Bỏ chọn
            </button>
            <button
              onClick={() => handleSelectTop(10)}
              className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#FEF3C7] border border-[#221C16] hover:bg-[#FDE68A] text-[#92400E]"
            >
              Top 10
            </button>
            <button
              onClick={() => handleSelectTop(20)}
              className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#FEF3C7] border border-[#221C16] hover:bg-[#FDE68A] text-[#92400E]"
            >
              Top 20
            </button>
            <button
              onClick={() => handleSelectTop(50)}
              className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#FEF3C7] border border-[#221C16] hover:bg-[#FDE68A] text-[#92400E]"
            >
              Top 50
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-extrabold text-[#E06B43]">
            <span>Đã chọn:</span>
            <span className="text-sm font-black px-2 py-0.5 rounded bg-[#FEF3C7] border border-[#221C16] text-[#221C16]">
              {selectedTerms.size} / {extractedData.items.length} từ
            </span>
          </div>
        </div>

        {/* Search & CEFR Filters */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6258]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm từ hoặc nghĩa trong danh sách..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border-2 border-[#221C16] bg-[#FAF6EE] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {["ALL", "A1", "A2", "B1", "B2", "C1"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedCefr(lvl)}
                className={`text-[11px] font-black px-2 py-1 rounded-lg border transition-all ${
                  selectedCefr === lvl
                    ? "bg-[#221C16] text-white border-[#221C16]"
                    : "bg-[#FAF6EE] text-[#6B6258] border-gray-300 hover:border-[#221C16]"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {generationError && (
        <div className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded-xl p-3.5 text-xs sm:text-sm font-bold text-[#991B1B] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
          <span>{generationError}</span>
        </div>
      )}

      {/* Vocabulary Items List */}
      <div className="space-y-3">
        {filteredItems.map((item, index) => {
          const isSelected = selectedTerms.has(item.term);

          return (
            <div
              key={`${item.term}_${index}`}
              onClick={() => handleToggleTerm(item.term)}
              className={`brick-card p-4 sm:p-5 cursor-pointer transition-all select-none ${
                isSelected
                  ? "bg-[#FFFDF9] border-[#E06B43] shadow-[3px_3px_0px_#E06B43]"
                  : "bg-white/60 border-gray-300 opacity-70 hover:opacity-100 hover:border-[#221C16]"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* Custom Checkbox */}
                <div className="pt-0.5 shrink-0">
                  {isSelected ? (
                    <div className="w-5 h-5 rounded bg-[#E06B43] border-2 border-[#221C16] flex items-center justify-center text-white">
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded bg-white border-2 border-[#221C16]" />
                  )}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg font-black text-[#221C16]">
                        {item.term}
                      </span>
                      <PronounceButton text={item.term} size="sm" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#221C16]">
                        {item.cefr}
                      </span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#FAF6EE] text-[#6B6258] border border-gray-300">
                        {item.frequency} lần
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm font-bold text-[#15803D]">
                    {item.meaning}
                  </p>

                  {/* Original Sentence Excerpt */}
                  {item.originalSentence && (
                    <div className="bg-[#FAF6EE] p-2.5 rounded-lg border border-black/10 text-xs text-[#4A4036] italic">
                      &ldquo;{item.originalSentence}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="brick-card p-8 bg-[#FFFDF9] text-center space-y-2">
            <p className="text-sm font-bold text-[#6B6258]">
              Không tìm thấy từ vựng nào khớp với bộ lọc & tìm kiếm.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCefr("ALL");
              }}
              className="brick-button-secondary text-xs px-3 py-1.5"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar for Flashcard Generation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#FAF6EE] border-t-[2.5px] border-[#221C16] p-3 sm:p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.06)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs sm:text-sm font-black text-[#221C16]">
              Đã chọn: <strong className="text-[#E06B43]">{selectedTerms.size}</strong> từ vựng
            </span>
            <p className="text-[11px] font-semibold text-[#6B6258] hidden sm:block">
              Đích đến: {targetDeckOption === "new" ? newDeckName || "Bộ thẻ mới" : "Bộ thẻ đã có"}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReset}
              className="brick-button-secondary px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold"
            >
              Hủy
            </button>

            <button
              onClick={handleGenerateCards}
              disabled={isGeneratingCards || selectedTerms.size === 0}
              className="brick-button-primary px-5 sm:px-7 py-2.5 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] disabled:opacity-50"
            >
              {isGeneratingCards ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Đang tạo {selectedTerms.size} flashcards...</span>
                </>
              ) : (
                <>
                  <span>Tạo {selectedTerms.size} thẻ từ vựng</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
