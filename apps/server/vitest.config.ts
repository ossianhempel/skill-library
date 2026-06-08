import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@skill-library/storage": new URL("../../packages/storage/src/index.ts", import.meta.url).pathname,
      "@skill-library/validation": new URL("../../packages/validation/src/index.ts", import.meta.url).pathname,
      "@skill-library/domain": new URL("../../packages/domain/src/index.ts", import.meta.url).pathname
    }
  }
});
