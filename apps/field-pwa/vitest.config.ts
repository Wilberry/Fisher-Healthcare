import { defineConfig } from 'vitest/config';

// Next.js uses the automatic JSX runtime. Match that transformation in Vitest,
// rather than compiling TSX to classic React.createElement without React in scope.
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'node',
    // Exclude Next.js generated output and execute authored app tests only.
    include: [
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'app/**/*.spec.ts',
      'app/**/*.spec.tsx',
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx'
    ]
  }
});
