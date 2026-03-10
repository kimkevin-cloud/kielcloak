import { defineConfig } from "vitest/config";

// Integration test config: only runs tests under tests/integration
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: ["default"],
  },
});
