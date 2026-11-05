import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The full suite executes real subprocesses, browsers and media tools in parallel;
    // Campaign/browser suites on small CI runners exceeded 60s. Use a deterministic ceiling
    // that is well above real execution time but still fails a genuine hang.
    testTimeout: 180000,
    hookTimeout: 120000,
    include: ['tests/**/*.test.ts'],
  },
});
