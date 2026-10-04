export type ModelProfile = "FAST" | "BALANCED" | "QUALITY";

export const MODEL_PROFILES: Record<ModelProfile, { model: string; description: string }> = {
  FAST: {
    model: "qwen3:4b",
    description: "Nhanh, nhẹ, phù hợp máy cấu hình thấp hoặc CPU",
  },
  BALANCED: {
    model: "qwen3:8b",
    description: "Cân bằng hoàn hảo giữa chất lượng viết truyện và tốc độ",
  },
  QUALITY: {
    model: "gemma3:12b",
    description: "Chất lượng ngôn ngữ tối đa nhưng cần VRAM GPU lớn",
  },
};

export const AI_CONFIG = {
  defaultProfile: "BALANCED" as ModelProfile,
  defaultModel: "qwen3:8b",

  // Context sizes
  defaultContextSize: 4096,
  flashcardContextSize: 4096,

  // Sampling parameters
  story: {
    temperature: 0.7,
    topP: 0.9,
    think: false,
    timeoutMs: 300_000, // 5 minutes upper bound for story generation
  },
  repair: {
    temperature: 0.4,
    topP: 0.9,
    think: false,
    timeoutMs: 180_000, // 3 minutes
  },
  translationBatch: {
    temperature: 0.2,
    topP: 0.9,
    numPredict: 1024,
    think: false,
    batchSize: 15,
    timeoutMs: 120_000, // 2 minutes per batch
  },
  flashcards: {
    temperature: 0.2,
    topP: 0.9,
    think: false,
    batchSize: 10,
    timeoutMs: 90_000,
  },
  contextualTranslation: {
    temperature: 0.2,
    topP: 0.9,
    think: false,
    timeoutMs: 45_000,
  },

  // Job queue settings
  job: {
    maxDurationMs: 15 * 60 * 1000, // 15 minutes overall job timeout
    maxRetries: 1, // At most 1 repair or 1 malformed output retry
  },
} as const;

export function getEffectiveModel(envModel?: string): string {
  if (envModel && envModel.trim()) {
    return envModel.trim();
  }
  return AI_CONFIG.defaultModel;
}
