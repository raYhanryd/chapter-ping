import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/worker/**/*.test.ts", "tests/client/**/*.test.ts", "tests/client/**/*.test.tsx"],
    reporters: ["default"],
    testTimeout: 30_000,
  },
});
