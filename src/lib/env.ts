import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEYS: z.string().optional().default(""),
  GEMINI_API_KEYS_EXTRA: z.string().optional().default(""),
  GEMINI_API_KEYS_ADDITIONAL: z.string().optional().default(""),
  GEMINI_REQUEST_TIMEOUT_MS: z.string().optional().default("45000"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  AI_PROVIDER: z.enum(["gemini", "ollama"]).optional().default("gemini"),
  OLLAMA_BASE_URL: z.string().optional().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().optional().default("gemma3:4b"),
  UNSPLASH_ACCESS_KEY: z.string().optional().default(""),
  AZURE_SPEECH_KEY: z.string().optional().default(""),
  AZURE_SPEECH_REGION: z.string().optional().default(""),
  TTS_PROVIDER: z.enum(["auto", "azure", "kokoro"]).optional().default("auto"),
  KOKORO_TTS_BASE_URL: z.string().optional().default(""),
  TTS_CACHE_DIR: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_KEYS: process.env.GEMINI_API_KEYS,
  GEMINI_API_KEYS_EXTRA: process.env.GEMINI_API_KEYS_EXTRA,
  GEMINI_API_KEYS_ADDITIONAL: process.env.GEMINI_API_KEYS_ADDITIONAL,
  GEMINI_REQUEST_TIMEOUT_MS: process.env.GEMINI_REQUEST_TIMEOUT_MS,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,
  TTS_PROVIDER: process.env.TTS_PROVIDER,
  KOKORO_TTS_BASE_URL: process.env.KOKORO_TTS_BASE_URL,
  TTS_CACHE_DIR: process.env.TTS_CACHE_DIR,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  throw new Error("Invalid environment configuration. Please check your .env file.");
}

export const env = parsed.data;
