/* eslint-disable @typescript-eslint/no-require-imports -- Node ESLint flat configuration. */
// Security review: replaces eslint-config-next, whose @next/next plugin pulls
// fast-glob -> micromatch -> unpatched braces. Retains React/Hooks/a11y checks
// and explicitly enforces internal Link navigation and key Next.js restrictions.
const base = require('../../eslint.config.cjs');
const react = require('eslint-plugin-react');
const hooks = require('eslint-plugin-react-hooks');
const accessibility = require('eslint-plugin-jsx-a11y');
const nextGuards = require('../../scripts/eslint-next-guards.cjs');

module.exports = [
  ...base,
  {
    ignores: ['**/.next/**', '**/out/**', '**/build/**', '**/next-env.d.ts']
  },
  {
    files: ['**/*.tsx', '**/*.jsx'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': hooks,
      'jsx-a11y': accessibility,
      'fisher-next': nextGuards
    },
    rules: {
      ...react.configs.recommended.rules,
      ...accessibility.configs.recommended.rules,
      'react/prop-types': 'off', // TypeScript performs prop validation.
      'react/react-in-jsx-scope': 'off', // Automatic JSX transform.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'fisher-next/no-internal-anchor': 'error',
      'fisher-next/no-img-element': 'warn',
      'fisher-next/no-sync-script': 'error'
    }
  }
];
