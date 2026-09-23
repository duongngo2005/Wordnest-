import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEYS: z.string().optional().default(""),
  GEMINI_API_KEYS_EXTRA: z.string().optional().default(""),
  GEMINI_API_KEYS_ADDITIONAL: z.string().optional().default(""),
  GEMINI_REQUEST_TIMEOUT_MS: z.string().optional().default("45000"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  UNSPLASH_ACCESS_KEY: z.string().optional().default(""),
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
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  throw new Error("Invalid environment configuration. Please check your .env file.");
}

export const env = parsed.data;
