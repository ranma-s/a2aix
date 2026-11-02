import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/conformance/**", "fixtures/**"],
    passWithNoTests: false,
  },
});
