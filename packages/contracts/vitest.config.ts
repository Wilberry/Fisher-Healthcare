import { defineConfig } from 'vitest/config';

// Never discover previously compiled CommonJS tests from dist/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**']
  }
});
