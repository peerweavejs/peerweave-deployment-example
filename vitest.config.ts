import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    environment: "node",
    allowOnly: false,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: [
        "apps/server/src/**/*.ts",
        "apps/web/src/shared/ice.ts",
        "apps/server/src/turn-credentials.mjs",
      ],
      exclude: ["apps/server/src/main.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
    },
  },
});
