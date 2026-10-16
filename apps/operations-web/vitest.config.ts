import { defineConfig } from 'vitest/config';

// Next.js uses the automatic JSX runtime. Match that transformation in Vitest,
// rather than compiling TSX to classic React.createElement without React in scope.
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: { environment: 'node' }
});
