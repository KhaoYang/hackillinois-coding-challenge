import { defineConfig } from "vitest/config";

// Keep tests in a predictable Node.js environment. Database integration tests
// share one in-memory MongoDB instance, so file-level parallelism is disabled to
// prevent one test file from clearing another file's data.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 10_000,
  },
});
