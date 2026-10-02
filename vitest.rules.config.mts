import { defineConfig } from "vitest/config";

// Las pruebas de reglas comparten el emulador: se ejecutan en serie.
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
