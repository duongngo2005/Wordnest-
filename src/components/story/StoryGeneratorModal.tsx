"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Clock,
  Eye,
  EyeOff,
  GraduationCap,
  Lightbulb,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { getStoryGenerationGuidance, STORY_LENGTH_OPTIONS } from "@/lib/story/story-options";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";
import {
  aiStoryResponseSchema,
  type AIStoryResponse,
  type StoryCefr,
  type StoryLength,
} from "@/lib/validation/story";
import type { StoryData } from "./StoryReader";

export type DeckStoryWord = {
  term: string;
  meaningVi: string;
  definitionEn: string | null;
  ipa: string | null;
  partOfSpeech: string | null;
  cefr: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
};

type CreationMode = "ai" | "prompt";
type ModalStep = "options" | "prompt_workspace";

type StoryGeneratorModalProps = {
  open: boolean;
  deck: { id: string; name: string };
  words: DeckStoryWord[];
  onClose: () => void;
  onStoryCreated: (story: StoryData) => void;
};

const CEFR_OPTIONS: StoryCefr[] = ["A1", "A2", "B1", "B2", "C1"];
const TOPIC_OPTIONS = ["Daily Life", "IT", "Travel", "Mystery", "Fantasy", "Random"];

function toStoryData(story: Record<string, unknown>): StoryData {
  return {
    id: String(story.id),
    deckId: String(story.deckId),
    title: String(story.title),
    content: String(story.content),
    cefr: String(story.cefr),
    length: String(story.length),
    topic: String(story.topic),
    vocabulary: normalizeStoryVocabulary(story.targetWords),
    createdAt: new Date(String(story.createdAt)),
  };
}

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object") {
    const error =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : "Không thể hoàn tất yêu cầu. Hãy thử lại.";
    throw new Error(error);
  }
  return data as Record<string, unknown>;
}

/**
 * Robust client-side JSON sanitizer and validator for AI responses.
 */
function parseAndValidateStoryJson(rawStory: string): {
  success: boolean;
  data?: AIStoryResponse;
  error?: string;
} {
  const trimmed = rawStory.trim();
  if (!trimmed) {
    return { success: false, error: "Vui lòng dán JSON trước khi kiểm tra." };
  }

  // 1. Strip markdown code fences
  let cleaned = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // 2. Find first { and matching last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else {
    return {
      success: false,
      error: "Không tìm thấy cấu trúc JSON hợp lệ (cần bắt đầu bằng { và kết thúc bằng }).",
    };
  }

  // 3. Remove trailing commas outside strings
  let sanitized = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      sanitized += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      sanitized += char;
      continue;
    }
    if (char === ",") {
      let next = i + 1;
      while (/\s/.test(cleaned[next] || "")) next++;
      if (cleaned[next] === "}" || cleaned[next] === "]") continue;
    }
    sanitized += char;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch (err) {
    return {
      success: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : "Cú pháp không hợp lệ. Vui lòng kiểm tra lại dấu ngoặc kép và dấu phẩy."}`,
    };
  }

  const result = aiStoryResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return {
      success: false,
      error: `Dữ liệu JSON chưa đủ hoặc sai định dạng${field ? ` tại "${field}"` : ""}: ${issue.message}. JSON cần có "title" và "content".`,
    };
  }

  return { success: true, data: result.data };
}

export function StoryGeneratorModal({
  open,
  deck,
  words,
  onClose,
  onStoryCreated,
}: StoryGeneratorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<ModalStep>("options");
  const [mode, setMode] = useState<CreationMode>("prompt");
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [cefr, setCefr] = useState<StoryCefr>("B1");
  const [length, setLength] = useState<StoryLength>("medium");
  const [topicChoice, setTopicChoice] = useState("Daily Life");
  const [customTopic, setCustomTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [hasCopiedPrompt, setHasCopiedPrompt] = useState(false);
  const [rawStory, setRawStory] = useState("");
  const [validatedStory, setValidatedStory] = useState<AIStoryResponse | null>(null);
  const [validationSuccessMsg, setValidationSuccessMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [open]);

  const resetFormState = () => {
    setError(null);
    setStatus("");
    setValidationSuccessMsg(null);
    setValidatedStory(null);
  };

  const selectedWordSet = useMemo(() => new Set(selectedTerms), [selectedTerms]);
  const allWordsSelected = words.length > 0 && words.every((word) => selectedWordSet.has(word.term));
  const topic = topicChoice === "Custom" ? customTopic.trim() : topicChoice;
  const guidance = getStoryGenerationGuidance(length, selectedTerms.length);

  if (!open) return null;

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    resetFormState();
    onClose();
  };

  const toggleTerm = (term: string) => {
    setSelectedTerms((current) =>
      current.includes(term) ? current.filter((item) => item !== term) : [...current, term]
    );
    setError(null);
    setPrompt("");
    setValidatedStory(null);
    setValidationSuccessMsg(null);
  };

  const selectAllTerms = () => {
    setSelectedTerms(words.map((w) => w.term));
    setError(null);
    setPrompt("");
    setValidatedStory(null);
  };

  const deselectAllTerms = () => {
    setSelectedTerms([]);
    setError(null);
    setPrompt("");
    setValidatedStory(null);
  };

  const validateOptions = () => {
    if (selectedTerms.length === 0) {
      setError("Vui lòng chọn ít nhất một từ trong deck để bắt đầu câu chuyện.");
      return false;
    }
    if (!topic) {
      setError("Vui lòng chọn một chủ đề hoặc nhập chủ đề riêng của bạn.");
      return false;
    }
    return true;
  };

  const requestOptions = () => ({
    deckId: deck.id,
    targetWords: selectedTerms,
    cefr,
    length,
    topic,
  });

  const generateWithAi = async () => {
    if (!validateOptions()) return;
    setError(null);
    setStatus("AI đang sáng tác câu chuyện từ các từ đã chọn…");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestOptions()),
      });
      const data = await responseData(response);
      if (!data.story || typeof data.story !== "object") {
        throw new Error("Máy chủ chưa trả về truyện hợp lệ.");
      }
      onStoryCreated(toStoryData(data.story as Record<string, unknown>));
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo truyện. Hãy thử lại.");
    } finally {
      setStatus("");
      setIsSubmitting(false);
    }
  };

  const handleGeneratePromptAndSwitchStep = async () => {
    if (!validateOptions()) return;
    setError(null);
    setStatus("Đang đóng gói prompt từ các lựa chọn của bạn…");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stories/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestOptions()),
      });
      const data = await responseData(response);
      if (typeof data.prompt !== "string") {
        throw new Error("Máy chủ chưa trả về prompt hợp lệ.");
      }
      setPrompt(data.prompt);
      setStep("prompt_workspace");
      setShowPromptDetails(false);
      setStatus("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo prompt. Hãy thử lại.");
      setStatus("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPrompt = async () => {
    if (!prompt) return;

    let copied = false;

    // 1. Thử dùng Clipboard API (chỉ hoạt động ở Secure Context: HTTPS / localhost / Tailscale)
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(prompt);
        copied = true;
      } catch {
        // Tiếp tục thử fallback bên dưới khi ở insecure context (HTTP LAN)
      }
    }

    // 2. Fallback dùng execCommand("copy"):
    // CỰC KỲ QUAN TRỌNG: Modal là <dialog> mở bằng showModal(), khiến document.body bên ngoài bị inert!
    // Bắt buộc phải append textarea vào BÊN TRONG dialogRef.current để trình duyệt cho phép focus & select.
    if (!copied && typeof document !== "undefined") {
      try {
        const container = dialogRef.current || document.body;
        const tempField = document.createElement("textarea");
        tempField.value = prompt;
        tempField.setAttribute("aria-hidden", "true");
        // Không đặt readonly để tương thích với iOS WebKit; 16px tránh iOS Safari zoom
        tempField.style.position = "absolute";
        tempField.style.left = "-9999px";
        tempField.style.top = "0";
        tempField.style.width = "2px";
        tempField.style.height = "2px";
        tempField.style.fontSize = "16px";
        tempField.style.opacity = "0.01";
        tempField.style.pointerEvents = "none";

        container.appendChild(tempField);
        tempField.focus({ preventScroll: true });
        tempField.select();
        tempField.setSelectionRange(0, tempField.value.length);

        copied = document.execCommand("copy");
        container.removeChild(tempField);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setHasCopiedPrompt(true);
      setStatus("Đã sao chép prompt.");
      setTimeout(() => setHasCopiedPrompt(false), 2500);
    } else {
      // Trường hợp trình duyệt di động trên HTTP chặn cả execCommand,
      // tự động mở khung prompt và bôi đen để người dùng 1 chạm là chép được
      setShowPromptDetails(true);
      setStatus("Đã mở nội dung prompt bên dưới để bạn sao chép.");
      setTimeout(() => {
        if (promptTextareaRef.current) {
          promptTextareaRef.current.focus();
          promptTextareaRef.current.select();
        }
      }, 100);
    }
  };

  const handleValidateAndPreview = () => {
    setError(null);
    setValidationSuccessMsg(null);
    const result = parseAndValidateStoryJson(rawStory);
    if (!result.success || !result.data) {
      setError(result.error || "JSON không hợp lệ.");
      setValidatedStory(null);
      return;
    }
    setValidatedStory(result.data);
    setValidationSuccessMsg("JSON hợp lệ! Bạn có thể xem trước nội dung truyện bên dưới.");
  };

  const importValidatedStory = async () => {
    if (!validateOptions()) return;
    if (!rawStory.trim()) {
      setError("Vui lòng dán JSON do AI trả về trước khi lưu.");
      return;
    }
    setError(null);
    setStatus("Đang lưu truyện vào deck của bạn…");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestOptions(), rawStory }),
      });
      const data = await responseData(response);
      if (!data.story || typeof data.story !== "object") {
        throw new Error("Máy chủ chưa trả về truyện hợp lệ.");
      }
      onStoryCreated(toStoryData(data.story as Record<string, unknown>));
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể lưu truyện này. Hãy thử lại.");
    } finally {
      setStatus("");
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="story-generator-title"
      className="story-workbench m-auto max-h-[92dvh] w-[min(calc(100%_-_1rem),50rem)] overflow-hidden p-0 text-[#221C16] backdrop:bg-[#221C16]/45"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) closeDialog();
      }}
    >
      <div className="flex max-h-[92dvh] flex-col">
        {/* Retro Header with Animated Lego Studs */}
        <header className="story-workbench-header shrink-0 flex items-start justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <div className="story-workbench-studs" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="story-workbench-kicker">Story Brick Atelier · {deck.name}</p>
            <h2 id="story-generator-title" className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
              <span>Tạo truyện từ deck</span>
              {step === "prompt_workspace" ? (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#221C16] bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#8A5817] shadow-[1px_1px_0_#221C16]">
                  <WandSparkles className="h-3 w-3" /> Khung Prompt &amp; JSON
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-[#6B6258] sm:text-sm">
              {step === "options"
                ? "Lựa chọn các khối từ vựng và cấp độ để lắp ráp câu chuyện sinh động."
                : "Sao chép prompt cho chatbot bên ngoài rồi dán JSON kết quả để hoàn tất."}
            </p>
          </div>
          <button
            type="button"
            className="wn-button wn-button-quiet wn-icon-button shrink-0"
            onClick={closeDialog}
            disabled={isSubmitting}
            aria-label="Đóng tạo truyện"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Modal Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* STEP 1: OPTIONS VIEW */}
          {step === "options" ? (
            <>
              {/* Method Switcher */}
              <div className="grid grid-cols-2 gap-2.5" aria-label="Cách tạo truyện">
                <button
                  type="button"
                  aria-pressed={mode === "prompt"}
                  onClick={() => {
                    setMode("prompt");
                    setError(null);
                  }}
                  className={`story-workbench-method wn-method-card min-h-0 cursor-pointer p-3 transition-all ${
                    mode === "prompt"
                      ? "!bg-[#FEF3C7] !border-2 !border-[#221C16] !shadow-[3px_3px_0_#221C16]"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#F59E0B] text-white shadow-[1px_1px_0_#221C16]">
                      <Braces className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="block text-sm font-black text-[#221C16]">Prompt → JSON</span>
                      <span className="block text-[11px] font-bold text-[#6B6258]">Dùng ChatGPT, Claude, Gemini ngoài</span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={mode === "ai"}
                  onClick={() => {
                    setMode("ai");
                    setError(null);
                  }}
                  className={`story-workbench-method wn-method-card min-h-0 cursor-pointer p-3 transition-all ${
                    mode === "ai"
                      ? "!bg-[#FEF3C7] !border-2 !border-[#221C16] !shadow-[3px_3px_0_#221C16]"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#E06B43] text-white shadow-[1px_1px_0_#221C16]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="block text-sm font-black text-[#221C16]">Tạo bằng WordNest AI</span>
                      <span className="block text-[11px] font-bold text-[#6B6258]">Tạo trực tiếp qua API nội bộ</span>
                    </div>
                  </div>
                </button>
              </div>

              {mode === "prompt" && (selectedTerms.length === 0 || !topic) ? (
                <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] p-3 text-xs sm:text-sm font-bold text-[#8A5817]">
                  Chọn ít nhất một từ và chủ đề để mở prompt.
                </div>
              ) : null}

              {/* VOCABULARY SELECTION: Textarea-like Box */}
              <section className="space-y-2" aria-labelledby="story-vocab-label">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#221C16] bg-[#F59E0B] text-xs font-black text-[#221C16] shadow-[1px_1px_0_#221C16]">
                      1
                    </span>
                    <h3 id="story-vocab-label" className="text-sm font-black text-[#221C16] sm:text-base">
                      Chọn từ vựng đưa vào câu chuyện
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      aria-live="polite"
                      className="rounded-full border-[1.5px] border-[#8A5817] bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#8A5817]"
                    >
                      Đã chọn {selectedTerms.length}/{words.length}
                    </span>
                    <button
                      type="button"
                      onClick={selectAllTerms}
                      className="story-select-all-btn"
                      disabled={isSubmitting || words.length === 0 || allWordsSelected}
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllTerms}
                      className="story-select-all-btn"
                      disabled={isSubmitting || selectedTerms.length === 0}
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>

                {words.length === 0 ? (
                  <p className="story-workbench-empty p-4 text-center text-xs font-bold">
                    Deck này chưa có từ nào. Hãy thêm flashcard vào deck trước khi tạo truyện!
                  </p>
                ) : (
                  <div
                    className="story-vocab-tray"
                    role="group"
                    aria-label="Danh sách từ vựng cần chọn"
                  >
                    {words.map((word) => {
                      const isSelected = selectedWordSet.has(word.term);
                      return (
                        <button
                          key={word.term}
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => toggleTerm(word.term)}
                          disabled={isSubmitting}
                          className={`story-vocab-chip ${isSelected ? "is-selected" : ""}`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-[3px] border border-[#221C16] text-[10px] ${
                              isSelected ? "bg-[#C85630] text-white" : "bg-white"
                            }`}
                          >
                            {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                          </span>
                          <span className="font-extrabold tracking-tight">{word.term}</span>
                          {word.meaningVi ? (
                            <span className="text-xs text-[#6B6258] font-bold">({word.meaningVi})</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] font-bold text-[#8C8275]">
                  💡 Bấm trực tiếp vào các từ trên để chọn. Nghĩa tiếng Việt sẽ luôn sẵn sàng khi bạn đọc truyện.
                </p>
              </section>

              {/* 3 HORIZONTAL BLOCKS: Length, CEFR, Topic */}
              <div className="space-y-3 pt-1">
                {/* Block 1: Độ dài (Length) */}
                <fieldset className="story-horizontal-block flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 sm:max-w-[42%]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#0D9488] text-[11px] font-black text-white shadow-[1px_1px_0_#221C16]">
                        2
                      </span>
                      <legend className="text-sm font-black text-[#221C16] flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-[#0D9488]" /> Độ dài truyện
                      </legend>
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-[#C85630]">
                      {guidance.description}
                    </p>
                    <p className="text-[10px] text-[#6B6258] font-medium">
                      Tự thay đổi theo số từ bạn chọn, không khóa số từ cố định.
                    </p>
                  </div>

                  {/* Horizontal Options */}
                  <div className="flex flex-row flex-wrap items-center gap-2">
                    {(Object.keys(STORY_LENGTH_OPTIONS) as StoryLength[]).map((option) => {
                      const isSelected = length === option;
                      return (
                        <label
                          key={option}
                          className={`story-brick-pill ${isSelected ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="story-length-radio"
                            value={option}
                            checked={isSelected}
                            onChange={() => {
                              setLength(option);
                              setPrompt("");
                            }}
                            className="wn-sr-only"
                            disabled={isSubmitting}
                          />
                          <span className="text-xs font-black">
                            {STORY_LENGTH_OPTIONS[option].label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Block 2: Trình độ (CEFR) */}
                <fieldset className="story-horizontal-block flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 sm:max-w-[42%]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#0284C7] text-[11px] font-black text-white shadow-[1px_1px_0_#221C16]">
                        3
                      </span>
                      <legend className="text-sm font-black text-[#221C16] flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4 text-[#0284C7]" /> Trình độ CEFR
                      </legend>
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-[#6B6258]">
                      Độ khó cấu trúc câu và ngữ cảnh
                    </p>
                  </div>

                  {/* Horizontal Options */}
                  <div className="flex flex-row flex-wrap items-center gap-1.5">
                    {CEFR_OPTIONS.map((level) => {
                      const isSelected = cefr === level;
                      return (
                        <label
                          key={level}
                          className={`story-brick-pill min-w-[44px] ${isSelected ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="story-cefr-radio"
                            value={level}
                            aria-label={`CEFR ${level}`}
                            checked={isSelected}
                            onChange={() => {
                              setCefr(level);
                              setPrompt("");
                            }}
                            className="wn-sr-only"
                            disabled={isSubmitting}
                          />
                          <span className="text-xs font-black">
                            <span className="sr-only">CEFR </span>
                            {level}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Block 3: Chủ đề (Topic) */}
                <fieldset className="story-horizontal-block space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#F59E0B] text-[11px] font-black text-[#221C16] shadow-[1px_1px_0_#221C16]">
                      4
                    </span>
                    <legend className="text-sm font-black text-[#221C16] flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 text-[#F59E0B]" /> Chủ đề câu chuyện
                    </legend>
                  </div>

                  {/* Horizontal Options */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[...TOPIC_OPTIONS, "Custom"].map((option) => {
                      const isSelected = topicChoice === option;
                      const label = option === "Custom" ? "✍️ Tự nhập chủ đề" : option;
                      return (
                        <label
                          key={option}
                          className={`story-brick-pill rounded-full text-xs ${isSelected ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="story-topic-radio"
                            value={option}
                            checked={isSelected}
                            onChange={() => {
                              setTopicChoice(option);
                              setPrompt("");
                            }}
                            className="wn-sr-only"
                            disabled={isSubmitting}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {topicChoice === "Custom" ? (
                    <div className="pt-1.5">
                      <input
                        value={customTopic}
                        onChange={(e) => {
                          setCustomTopic(e.target.value);
                          setPrompt("");
                        }}
                        placeholder="Nhập chủ đề bạn muốn (ví dụ: A detective solving a mystery in London...)"
                        className="wn-field text-sm"
                        disabled={isSubmitting}
                      />
                    </div>
                  ) : null}
                </fieldset>
              </div>
            </>
          ) : (
            /* STEP 2: PROMPT WORKSPACE SUB-VIEW (Khung con Prompt & Dán JSON) */
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Back navigation & Context Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3 shadow-[2px_2px_0_#221C16]">
                <button
                  type="button"
                  onClick={() => {
                    setStep("options");
                    setError(null);
                    setValidationSuccessMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border-1.5 border-[#221C16] bg-[#FAF6EE] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[1px_1px_0_#221C16] hover:bg-[#FEF3C7] active:translate-y-0.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Quay lại tùy chọn</span>
                </button>

                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#6B6258]">
                  <span className="rounded-md border border-[#221C16]/20 bg-[#FAF6EE] px-2 py-0.5">
                    {selectedTerms.length} từ
                  </span>
                  <span>•</span>
                  <span className="rounded-md border border-[#221C16]/20 bg-[#FAF6EE] px-2 py-0.5">
                    CEFR {cefr}
                  </span>
                  <span>•</span>
                  <span className="rounded-md border border-[#221C16]/20 bg-[#FAF6EE] px-2 py-0.5">
                    {STORY_LENGTH_OPTIONS[length].label}
                  </span>
                  <span>•</span>
                  <span className="rounded-md border border-[#221C16]/20 bg-[#FAF6EE] px-2 py-0.5 truncate max-w-[150px]">
                    {topic}
                  </span>
                </div>
              </div>

              {/* PHẦN 1: PROMPT ĐƯỢC TẠO RA */}
              <section
                aria-labelledby="prompt-result-title"
                className="rounded-xl border-2 border-[#221C16] bg-[#FEF3C7] p-4 shadow-[3px_3px_0_#221C16] space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#F59E0B] text-white shadow-[1px_1px_0_#221C16]">
                      <WandSparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 id="prompt-result-title" className="text-base font-black text-[#221C16]">
                        1. Prompt đã sẵn sàng
                      </h3>
                      <p className="text-xs font-bold text-[#8A5817]">
                        Đã đóng gói yêu cầu và từ vựng thành prompt chuẩn cho chatbot.
                      </p>
                    </div>
                  </div>

                  {/* Actions for Prompt */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={copyPrompt}
                      className="wn-button wn-button-primary text-xs sm:text-sm !min-h-[36px]"
                    >
                      {hasCopiedPrompt ? (
                        <>
                          <Check className="h-4 w-4 stroke-[3]" />
                          <span>Đã sao chép!</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="h-4 w-4" />
                          <span>Sao chép prompt</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPromptDetails(!showPromptDetails)}
                      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-2.5 py-1.5 text-xs font-black text-[#221C16] shadow-[1.5px_1.5px_0_#221C16] hover:bg-[#FAF6EE] active:translate-y-0.5"
                    >
                      {showPromptDetails ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" />
                          <span>Ẩn prompt</span>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          <span>Xem prompt</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collapsible Prompt Content */}
                {showPromptDetails ? (
                  <div className="pt-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-black text-[#6B6258]">
                        Nội dung prompt (có thể chỉnh sửa hoặc sao chép thủ công):
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (promptTextareaRef.current) {
                            promptTextareaRef.current.focus();
                            promptTextareaRef.current.select();
                          }
                        }}
                        className="text-[11px] font-black text-[#8A5817] hover:underline"
                      >
                        Bôi đen toàn bộ
                      </button>
                    </div>
                    <textarea
                      ref={promptTextareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={8}
                      className="wn-field font-mono text-xs leading-relaxed resize-y !bg-[#FFFDF9]"
                      placeholder="Prompt..."
                    />
                  </div>
                ) : null}

                {/* 3-Step Playful Guide */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-[#221C16]/15">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#6B6258]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E06B43] text-[10px] font-black text-white">
                      1
                    </span>
                    <span>Sao chép prompt ở trên</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#6B6258]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[10px] font-black text-white">
                      2
                    </span>
                    <span>Dán vào ChatGPT / Claude</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#6B6258]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-[10px] font-black text-white">
                      3
                    </span>
                    <span>Dán JSON nhận được xuống dưới</span>
                  </div>
                </div>
              </section>

              {/* PHẦN 2: KHUNG GẮN JSON VÀ VALIDATE & PREVIEW */}
              <section
                aria-labelledby="json-input-title"
                className="rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 shadow-[3px_3px_0_#221C16] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#E06B43] text-white shadow-[1px_1px_0_#221C16]">
                      <Braces className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 id="json-input-title" className="text-base font-black text-[#221C16]">
                        2. Dán JSON do chatbot trả về
                      </h3>
                      <p className="text-xs font-bold text-[#6B6258]">
                        Hỗ trợ dán cả khối ```json; hệ thống sẽ tự tách và kiểm tra.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <textarea
                    aria-label="JSON AI trả về"
                    value={rawStory}
                    onChange={(e) => {
                      setRawStory(e.target.value);
                      setError(null);
                      setValidatedStory(null);
                      setValidationSuccessMsg(null);
                    }}
                    placeholder={`{\n  "title": "A Day in the Park",\n  "content": "Once upon a time...",\n  "usage": [\n    { "term": "${selectedTerms[0] || "example"}", "usedAs": "${selectedTerms[0] || "example"}" }\n  ]\n}`}
                    rows={8}
                    className="wn-field font-mono text-xs leading-relaxed resize-y !bg-[#FAF6EE]"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleValidateAndPreview}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-[#221C16] bg-[#E06B43] hover:bg-[#C85630] px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-[2px_2px_0_#221C16] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    disabled={isSubmitting || !rawStory.trim()}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Validate &amp; Preview</span>
                  </button>
                </div>

                {/* Validation Feedback Messages */}
                {validationSuccessMsg ? (
                  <div className="flex items-center gap-2 rounded-lg border-2 border-[#0D9488] bg-[#F0FDF4] p-3 text-xs sm:text-sm font-bold text-[#166534]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#166534]" />
                    <span>{validationSuccessMsg}</span>
                  </div>
                ) : null}

                {/* PREVIEW KHUNG TRUYỆN SAU KHI VALIDATE THÀNH CÔNG (Mở rộng & Font sans đồng bộ app) */}
                {validatedStory ? (
                  <div className="mt-5 rounded-2xl border-2 border-[#221C16] bg-[#FFF8E8] p-4 sm:p-6 shadow-[3px_3px_0_#221C16] space-y-4 animate-in fade-in duration-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-[#221C16]/20 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-md border-1.5 border-[#221C16] bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#8A5817] shadow-[1px_1px_0_#221C16]">
                          Bản xem trước
                        </span>
                        <h4 className="text-base sm:text-lg font-black text-[#221C16] tracking-tight">
                          {validatedStory.title}
                        </h4>
                      </div>
                      <span className="rounded-full border border-[#221C16]/20 bg-[#FAF6EE] px-2.5 py-0.5 text-xs font-bold text-[#6B6258]">
                        Đã tìm thấy {validatedStory.usage.length} từ mục tiêu
                      </span>
                    </div>

                    {/* Story Preview Content: Rộng rãi, font sans chuẩn app, đọc cực kỳ thoải mái */}
                    <div className="min-h-[220px] max-h-[380px] sm:max-h-[460px] overflow-y-auto rounded-xl border-2 border-[#221C16]/20 bg-[#FAF6EE] p-4 sm:p-6 text-sm sm:text-base leading-relaxed sm:leading-7 text-[#221C16]">
                      {validatedStory.content.split("\n\n").map((para, idx) => (
                        <p key={idx} className="mb-4 last:mb-0">
                          {para}
                        </p>
                      ))}
                    </div>

                    {/* Target words preview chips */}
                    {validatedStory.usage.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        <span className="block text-[11px] font-black text-[#6B6258] uppercase tracking-wider">
                          Từ vựng đã dùng trong truyện:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {validatedStory.usage.map((u, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-lg border-1.5 border-[#221C16] bg-[#FFD8C8] px-2.5 py-1 text-xs font-black text-[#7C2D12] shadow-[1px_1px_0_#221C16]"
                            >
                              <span>{u.term}</span>
                              {u.usedAs !== u.term ? (
                                <span className="text-[11px] font-bold text-[#9A3412]">({u.usedAs})</span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Nút thêm truyện nổi bật ở cuối bản xem trước */}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={importValidatedStory}
                        className="inline-flex items-center gap-2 rounded-xl border-2 border-[#221C16] bg-[#15803D] hover:bg-[#166534] px-5 py-2.5 text-sm font-black text-white shadow-[2px_2px_0_#221C16] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                        disabled={isSubmitting}
                      >
                        <BookOpen className="h-4 w-4" />
                        <span>{isSubmitting ? "Đang thêm..." : "Thêm truyện này vào deck"}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}

          {/* Status and Error banners */}
          {status ? (
            <p aria-live="polite" className="text-xs sm:text-sm font-black text-[#C85630]">
              {status}
            </p>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs sm:text-sm font-bold text-[#991B1B] shadow-[2px_2px_0_#B91C1C]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#B91C1C]" />
              <div className="flex-1">{error}</div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <footer className="story-workbench-footer shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-xs font-bold text-[#6B6258]">
            {step === "options"
              ? `Đang chọn ${selectedTerms.length} từ • ${guidance.description}`
              : `Khung tạo truyện • ${selectedTerms.length} từ đã chọn`}
          </p>

          <div className="flex items-center gap-2">
            {step === "options" ? (
              mode === "ai" ? (
                <button
                  type="button"
                  onClick={generateWithAi}
                  className="wn-button wn-button-primary"
                  disabled={isSubmitting || selectedTerms.length === 0}
                  aria-busy={isSubmitting}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{isSubmitting ? "AI đang viết…" : "Tạo truyện bằng AI"}</span>
                </button>
              ) : selectedTerms.length > 0 && topic ? (
                <button
                  type="button"
                  onClick={handleGeneratePromptAndSwitchStep}
                  className="wn-button wn-button-primary"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  <WandSparkles className="h-4 w-4" />
                  <span>{isSubmitting ? "Đang tạo prompt…" : "Tạo prompt"}</span>
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={closeDialog}
                className="wn-button wn-button-quiet text-xs"
                disabled={isSubmitting}
              >
                Hủy &amp; Đóng
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
