import { defineConfig } from 'vitest/config';

// Only execute authored TypeScript tests. Compiled CommonJS copies under dist/
// are production build artifacts, not additional Vitest test suites.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**']
  }
});
