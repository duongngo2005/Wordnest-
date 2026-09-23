import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      GEMINI_API_KEY: "",
      GEMINI_API_KEYS: "",
      GEMINI_API_KEYS_EXTRA: "",
      OPENROUTER_API_KEY: "",
    },
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
