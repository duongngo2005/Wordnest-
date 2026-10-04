import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OLLAMA_BASE_URL: z.string().optional().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().optional().default("qwen3:8b"),
  LOCAL_AI_MODEL: z.string().optional(),
  UNSPLASH_ACCESS_KEY: z.string().optional().default(""),
  KOKORO_TTS_BASE_URL: z.string().url().default("http://127.0.0.1:8000"),
  TTS_CACHE_DIR: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL,
  LOCAL_AI_MODEL: process.env.LOCAL_AI_MODEL,
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
  KOKORO_TTS_BASE_URL: process.env.KOKORO_TTS_BASE_URL,
  TTS_CACHE_DIR: process.env.TTS_CACHE_DIR,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  throw new Error("Invalid environment configuration. Please check your .env file.");
}

export const env = parsed.data;
