import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./vitest.db",
    },
    globalSetup: "./tests/vitest-global-setup.ts",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
