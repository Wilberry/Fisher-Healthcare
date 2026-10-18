import { defineConfig } from 'vitest/config';

// Test authored source files only. Turbo builds dist/ before running Vitest;
// compiled CommonJS test artifacts are not valid Vitest ESM suites.
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx'
    ]
  }
});
