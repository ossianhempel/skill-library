import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite spins up a WASM Postgres per store; first-query/migration init can take
    // several seconds, and the default 5s limit flakes under the parallel package test
    // run (`pnpm -r test`). Give the PGlite-backed suites headroom.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
