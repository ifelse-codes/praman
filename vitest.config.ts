import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The full suite executes real subprocesses, browsers and media tools in parallel;
    // Vitest's 5s default produced observed timeout flakes. Use a deterministic ceiling
    // that is well above real execution time but still fails a genuine hang.
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.ts'],
  },
});
