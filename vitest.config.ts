import { defineConfig } from "vitest/config";

// Unit test config: runs everything except the integration folder
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    reporters: ["default"],
  },
});
