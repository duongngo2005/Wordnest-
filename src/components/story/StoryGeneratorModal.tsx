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
  Eye,
  EyeOff,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { getStoryGenerationGuidance, STORY_LENGTH_OPTIONS } from "@/lib/story/story-options";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";
import { parseStoryResponseText } from "@/lib/story/story-content";
import {
  aiStoryResponseSchema,
  type AIStoryResponse,
  type StoryCefr,
  type StoryLength,
} from "@/lib/validation/story";
import { useAiTasks } from "@/components/ai/AiTaskProvider";
import {
  ContextualTargetPicker,
  type ContextualTargetWord,
} from "@/components/contextual/ContextualTargetPicker";
import { getSpeechPreferences, isCloudSpeechVoice } from "@/lib/speech-preferences";
import {
  resolveContextualTargetSelection,
  resolveStoryTargetTerms,
  toggleContextualTargetId,
  type ContextualTargetIntent,
} from "@/lib/contextual-target-selection";
import type { StoryData } from "./StoryReader";

export type DeckStoryWord = ContextualTargetWord & {
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
  weakWordIds?: string[];
  initialMode?: CreationMode;
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
        : data && typeof data === "object" && "message" in data
        ? String(data.message)
        : "Không thể hoàn tất yêu cầu. Hãy thử lại.";
    throw new Error(error);
  }
  return data as Record<string, unknown>;
}

/**
 * Robust client-side sanitizer and validator for AI story responses (supports TITLE/PASSAGE and JSON).
 */
function parseAndValidateStoryJson(rawStory: string): {
  success: boolean;
  data?: AIStoryResponse;
  error?: string;
} {
  const trimmed = rawStory.trim();
  if (!trimmed) {
    return { success: false, error: "Vui lòng dán nội dung truyện trước khi kiểm tra." };
  }

  try {
    const parsed = parseStoryResponseText(trimmed);
    const result = aiStoryResponseSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".");
      return {
        success: false,
        error: `Dữ liệu chưa đủ hoặc sai định dạng${field ? ` tại "${field}"` : ""}: ${issue.message}. Cần có tiêu đề và nội dung truyện.`,
      };
    }
    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Nội dung không hợp lệ. Vui lòng đảm bảo có 'TITLE:' và 'PASSAGE:' hoặc cấu trúc JSON hợp lệ.",
    };
  }
}


export function StoryGeneratorModal({
  open,
  deck,
  words,
  weakWordIds = [],
  initialMode = "prompt",
  onClose,
  onStoryCreated,
}: StoryGeneratorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<ModalStep>("options");
  const [mode, setMode] = useState<CreationMode>(initialMode);
  const deckCardIds = useMemo(() => words.map((word) => word.id), [words]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>(() =>
    resolveContextualTargetSelection({
      intent: "general",
      deckCardIds: words.map((word) => word.id),
    }).selectedIds
  );
  const [targetIntent, setTargetIntent] = useState<ContextualTargetIntent>("general");
  const [cefr, setCefr] = useState<StoryCefr>("B1");
  const [length, setLength] = useState<StoryLength>("medium");
  const [topicChoice, setTopicChoice] = useState("Daily Life");
  const [customTopic, setCustomTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [hasCopiedPrompt, setHasCopiedPrompt] = useState(false);
  const { refreshJobs, cancelJob } = useAiTasks();
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [rawStory, setRawStory] = useState("");
  const [validatedStory, setValidatedStory] = useState<AIStoryResponse | null>(null);
  const [validationSuccessMsg, setValidationSuccessMsg] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      if (dialog?.open) dialog.close();
      openerRef.current?.focus();
    };
  }, [open]);

  const resetFormState = () => {
    setError(null);
    setStatus("");
    setSubmittedJobId(null);
    setValidationSuccessMsg(null);
    setValidatedStory(null);
  };

  const selectedTerms = useMemo(
    () => resolveStoryTargetTerms(words, selectedWordIds),
    [selectedWordIds, words]
  );
  const topic = topicChoice === "Custom" ? customTopic.trim() : topicChoice;
  const guidance = getStoryGenerationGuidance(length, selectedTerms.length);

  if (!open) return null;

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    resetFormState();
    onClose();
  };

  const resetStoryDraft = () => {
    setError(null);
    setPrompt("");
    setValidatedStory(null);
    setValidationSuccessMsg(null);
  };

  const applyTargetIntent = (intent: ContextualTargetIntent) => {
    const selection = resolveContextualTargetSelection({
      intent,
      deckCardIds,
      weakCardIds: weakWordIds,
      manualIds: selectedWordIds,
    });
    setSelectedWordIds(selection.selectedIds);
    setTargetIntent(intent);
    resetStoryDraft();
  };

  const toggleTargetWord = (id: string) => {
    setSelectedWordIds(
      toggleContextualTargetId({
        selectedIds: selectedWordIds,
        targetId: id,
        deckCardIds,
      }).selectedIds
    );
    setTargetIntent("manual");
    resetStoryDraft();
  };

  const selectAllTargets = () => {
    setSelectedWordIds(
      resolveContextualTargetSelection({
        intent: "manual",
        deckCardIds,
        manualIds: deckCardIds,
      }).selectedIds
    );
    setTargetIntent("manual");
    resetStoryDraft();
  };

  const clearTargets = () => {
    setSelectedWordIds([]);
    setTargetIntent("manual");
    resetStoryDraft();
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

  const requestOptions = () => {
    const voiceURI = getSpeechPreferences().voiceURI;
    return {
      deckId: deck.id,
      targetWords: selectedTerms,
      cefr,
      length,
      topic,
      narrationVoiceId: isCloudSpeechVoice(voiceURI) ? voiceURI : undefined,
    };
  };

  const generateWithAi = async () => {
    if (!validateOptions()) return;
    setError(null);
    setStatus("Đang gửi yêu cầu tạo truyện...");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/ai/story-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestOptions()),
      });
      const data = await responseData(response);
      if (!data.jobId) {
        throw new Error(String(data.error || "Không thể tạo tác vụ AI."));
      }
      setSubmittedJobId(String(data.jobId));
      await refreshJobs();
      setStatus("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo tác vụ AI. Hãy thử lại.");
    } finally {
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
      setError(result.error || "Nội dung truyện không hợp lệ.");
      setValidatedStory(null);
      return;
    }
    setValidatedStory(result.data);
    setValidationSuccessMsg("Nội dung hợp lệ! Bạn có thể xem trước nội dung truyện bên dưới.");
  };

  const importValidatedStory = async () => {
    if (!validateOptions()) return;
    if (!rawStory.trim()) {
      setError("Vui lòng dán kết quả do AI tạo trước khi lưu.");
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
      className="story-workbench m-auto max-h-[90dvh] w-[min(calc(100%_-_1rem),50rem)] overflow-hidden p-0 text-[#221C16] backdrop:bg-[#221C16]/45"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) closeDialog();
      }}
    >
      <div className="flex max-h-[90dvh] flex-col">
        {/* Retro Header with Animated Lego Studs */}
        <header className="story-workbench-header shrink-0 flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
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
          </div>
          <button
            ref={closeButtonRef}
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {/* STEP 1: OPTIONS VIEW */}
          {step === "options" ? (
            <>
              {/* Method Switcher */}
              <div className="grid grid-cols-2 gap-2" aria-label="Cách tạo truyện">
                <button
                  type="button"
                  aria-pressed={mode === "prompt"}
                  onClick={() => {
                    setMode("prompt");
                    setError(null);
                  }}
                  className={`story-workbench-method wn-method-card min-h-[4rem] cursor-pointer p-2.5 transition-all ${
                    mode === "prompt"
                      ? "!bg-[#FEF3C7] !border-2 !border-[#221C16] !shadow-[3px_3px_0_#221C16]"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-[#221C16] bg-[#F59E0B] text-white shadow-[1px_1px_0_#221C16]">
                      <Braces className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-black text-[#221C16]">Prompt → JSON</span>
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
                  className={`story-workbench-method wn-method-card min-h-[4rem] cursor-pointer p-2.5 transition-all ${
                    mode === "ai"
                      ? "!bg-[#FEF3C7] !border-2 !border-[#221C16] !shadow-[3px_3px_0_#221C16]"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-[#221C16] bg-[var(--accent)] text-white shadow-[1px_1px_0_#221C16]">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-black text-[#221C16]">Tạo bằng WordNest AI</span>
                    </div>
                  </div>
                </button>
              </div>

              <ContextualTargetPicker
                idPrefix="story"
                words={words}
                weakWordIds={weakWordIds}
                selectedIds={selectedWordIds}
                intent={targetIntent}
                disabled={isSubmitting}
                onIntentChange={applyTargetIntent}
                onToggleWord={toggleTargetWord}
                onSelectAll={selectAllTargets}
                onClear={clearTargets}
              />

              {/* 3 HORIZONTAL BLOCKS: Length, CEFR, Topic */}
              <div className="space-y-2.5">
                {/* Block 1: Độ dài (Length) */}
                <fieldset className="story-horizontal-block flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <legend className="flex items-center gap-2 text-sm font-black text-[#221C16]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#F59E0B] text-[11px] font-black text-[#221C16] shadow-[1px_1px_0_#221C16]">
                      2
                    </span>
                    Độ dài truyện
                  </legend>

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
                <fieldset className="story-horizontal-block flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <legend className="flex items-center gap-2 text-sm font-black text-[#221C16]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#F59E0B] text-[11px] font-black text-[#221C16] shadow-[1px_1px_0_#221C16]">
                      3
                    </span>
                    Trình độ CEFR
                  </legend>

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
                  <legend className="flex items-center gap-2 text-sm font-black text-[#221C16]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border-1.5 border-[#221C16] bg-[#F59E0B] text-[11px] font-black text-[#221C16] shadow-[1px_1px_0_#221C16]">
                      4
                    </span>
                    Chủ đề (tuỳ chọn)
                  </legend>

                  {/* Horizontal Options */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[...TOPIC_OPTIONS, "Custom"].map((option) => {
                      const isSelected = topicChoice === option;
                      const label = option === "Custom" ? "Tự nhập chủ đề" : option;
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
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-black text-white">
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
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[var(--accent)] text-white shadow-[1px_1px_0_#221C16]">
                      <Braces className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 id="json-input-title" className="text-base font-black text-[#221C16]">
                        2. Dán kết quả do chatbot trả về
                      </h3>
                      <p className="text-xs font-bold text-[#6B6258]">
                        Hỗ trợ định dạng TITLE: ... PASSAGE: ... hoặc JSON; hệ thống sẽ tự nhận diện và phân tích từ vựng.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <textarea
                    aria-label="Nội dung truyện AI trả về"
                    value={rawStory}
                    onChange={(e) => {
                      setRawStory(e.target.value);
                      setError(null);
                      setValidatedStory(null);
                      setValidationSuccessMsg(null);
                    }}
                    placeholder={`TITLE:\nA Morning at the Studio\n\nPASSAGE:\nClara arrived twenty minutes before opening time. She had to allocate her hours carefully between the new catalog and the upcoming review...`}
                    rows={8}
                    className="wn-field font-mono text-xs leading-relaxed resize-y !bg-[#FAF6EE]"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleValidateAndPreview}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-[#221C16] bg-[var(--accent)] hover:bg-[var(--accent-strong)] px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-[2px_2px_0_#221C16] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                              className="inline-flex items-center gap-1 rounded-lg border-1.5 border-[#221C16] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[#7C2D12] shadow-[1px_1px_0_#221C16]"
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

          {submittedJobId ? (
            <div className="rounded-2xl border-2 border-[#221C16] bg-[#FEF3C7] p-4 text-[#221C16] space-y-3 shadow-[3px_3px_0px_#221C16]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--accent)]" />
                <h3 className="text-sm sm:text-base font-black">Đã bắt đầu tạo truyện trên nền</h3>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-[#6B6258] leading-relaxed">
                AI đang viết truyện cho bạn ({selectedTerms.length} từ · {cefr} · {length}) trong tiến trình nền độc lập. Bạn có thể đóng cửa sổ này ngay lập tức để tiếp tục học tập. Khi hoàn thành, thông báo sẽ xuất hiện để bạn mở truyện.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="wn-button wn-button-primary text-xs"
                >
                  Ẩn và tiếp tục học
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (submittedJobId) {
                      await cancelJob(submittedJobId);
                      setSubmittedJobId(null);
                    }
                  }}
                  className="rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-extrabold text-[#B91C1C] hover:bg-[#FEE2E2]"
                >
                  Hủy tác vụ
                </button>
              </div>
            </div>
          ) : null}

          {/* Status and Error banners */}
          {status ? (
            <p aria-live="polite" className="text-xs sm:text-sm font-black text-[var(--accent-strong)]">
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
        <footer className="story-workbench-footer shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
          <p className="text-xs font-bold text-[#6B6258]">
            {step === "options"
              ? `${selectedTerms.length} từ · ~${guidance.minWords}–${guidance.maxWords} từ`
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
