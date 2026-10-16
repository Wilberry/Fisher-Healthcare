/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is required by this ESLint flat config. */
const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat({ baseDirectory: __dirname });
module.exports = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'] }
];
