#!/usr/bin/env node
// An allowlisted check for Next.js-generated edits between local verification rounds.
// It never rewrites files or silently accepts arbitrary source changes.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const APPS = ['patient-web', 'operations-web', 'field-pwa'];
const tracked = APPS.flatMap(app => [
  `apps/${app}/next-env.d.ts`,
  `apps/${app}/tsconfig.json`
]);
const allowedCompilerAdditions = {
  allowJs: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  isolatedModules: true,
  incremental: true,
  jsx: 'preserve',
  noEmit: true,
  skipLibCheck: true,
  module: 'esnext',
  moduleResolution: 'node',
  plugins: [{ name: 'next' }]
};
const approvedInclude = new Set([
  '.next/types/**/*.ts',
  '.next/dev/types/**/*.ts',
  '.next/types/**/*.d.ts',
  '.next/dev/types/**/*.d.ts'
]);

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function fail(path, message) {
  throw new Error(`Unexpected generated-file change in ${path}: ${message}`);
}
function gitVersion(path) {
  return execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
}
function checkTsconfig(path) {
  const before = JSON.parse(gitVersion(path));
  const after = JSON.parse(readFileSync(path, 'utf8'));
  const originalOptions = before.compilerOptions ?? {};
  const generatedOptions = after.compilerOptions ?? {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'compilerOptions' || key === 'include') continue;
    if (!equal(before[key], after[key])) fail(path, `top-level property ${key} changed`);
  }
  for (const [key, value] of Object.entries(originalOptions)) {
    if (!equal(value, generatedOptions[key])) {
      fail(path, `existing compiler option ${key} changed`);
    }
  }
  for (const [key, value] of Object.entries(generatedOptions)) {
    if (Object.hasOwn(originalOptions, key)) continue;
    if (!Object.hasOwn(allowedCompilerAdditions, key)
      || !equal(value, allowedCompilerAdditions[key])) {
      fail(path, `unrecognized new compiler option ${key}`);
    }
  }
  const oldIncludes = before.include ?? [];
  const newIncludes = after.include ?? [];
  if (!Array.isArray(oldIncludes) || !Array.isArray(newIncludes)) {
    fail(path, 'include must remain an array');
  }
  if (oldIncludes.some(pattern => !newIncludes.includes(pattern))) {
    fail(path, 'existing source include removed');
  }
  if (newIncludes.some(pattern => !oldIncludes.includes(pattern) && !approvedInclude.has(pattern))) {
    fail(path, 'unexpected source include added');
  }
}
function checkNextEnv(path) {
  const originalLines = gitVersion(path).split(/\r?\n/).filter(Boolean);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of originalLines) {
    if (!lines.includes(line)) fail(path, 'original Next type reference removed');
  }
  for (const line of lines) {
    if (originalLines.includes(line)) continue;
    if (/^\/\/\/ <reference types="next(?:\/[a-z0-9\/-]+)?" \/>$/.test(line)) continue;
    if (/^\/\/\/ <reference path="\.\/\.next\/(?:dev\/)?types\/[a-z0-9-]+\.d\.ts" \/>$/.test(line)) continue;
    if (/^\/\/ NOTE: This file should not be edited\.?$/.test(line)) continue;
    if (/^\/\/ see https:\/\/nextjs\.org\/docs\/.*$/.test(line)) continue;
    if (/^import ["']\.\/\.next\/(?:dev\/)?types\/[a-z0-9-]+\.d\.ts["'];?$/.test(line)) continue;
    fail(path, 'unexpected contents beyond generated Next type references');
  }
}

try {
  const modified = execFileSync('git', ['diff', '--name-only', '--', ...tracked], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  for (const path of modified) {
    if (!tracked.includes(path)) fail(path, 'path not allowlisted');
    if (path.endsWith('/tsconfig.json')) checkTsconfig(path);
    else checkNextEnv(path);
  }
  if (modified.length > 0) {
    console.info(`Verified ${modified.length} Next.js-generated file(s) against committed configuration. Original changes remain untouched.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unrecognized generated-file validation error');
  process.exitCode = 1;
}
