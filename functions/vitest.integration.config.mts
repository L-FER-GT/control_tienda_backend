import { defineConfig } from "vitest/config";

// Requiere el emulador de Firestore (lo levanta "npm run test:integration" desde la raíz).
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
