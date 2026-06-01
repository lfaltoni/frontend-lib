import { defineConfig } from 'vitest/config';

// Minimal, isolated test config added for the account-disable / 401 auto-logout
// hardening. fsdk-ts previously had no test framework; see TRACER report.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
