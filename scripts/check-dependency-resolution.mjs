#!/usr/bin/env node
// Check the exact lockfile graph against known fixed minimums before a costly
// full verification run. This is a safeguard, not a replacement for pnpm audit.
import { readFileSync } from 'node:fs';

const expectedOverrides = {
  multer: { spec: '^2.3.0', minimum: [2, 3, 0] },
  lodash: { spec: '^4.18.1', minimum: [4, 18, 0] },
  'js-yaml': { spec: '^4.3.2', minimum: [4, 3, 2] },
  postcss: { spec: '^8.5.18', minimum: [8, 5, 18] },
  vite: { spec: '^6.4.3', minimum: [6, 4, 3] }
};

function fail(message) {
  console.error(`Dependency resolution check failed: ${message}`);
  process.exitCode = 1;
}

function compare(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
if (manifest.packageManager !== 'pnpm@9.15.9') {
  fail('Unexpected pnpm version: review how security overrides are configured.');
}
const overrides = manifest.pnpm?.overrides ?? {};
for (const [name, { spec }] of Object.entries(expectedOverrides)) {
  if (overrides[name] !== spec) {
    fail(`Missing root pnpm.overrides entry for ${name}: expected ${spec}`);
  }
}

const lock = readFileSync('pnpm-lock.yaml', 'utf8');
const lines = lock.split(/\r?\n/);
const entries = new Map(Object.keys(expectedOverrides).map(name => [name, []]));
let inPackages = false;
let sawPackages = false;
let sawOverrides = false;
const effectiveOverrides = new Map();
let inOverrides = false;

for (const line of lines) {
  if (/^packages:\s*$/.test(line)) { inPackages = true; sawPackages = true; inOverrides = false; continue; }
  if (/^overrides:\s*$/.test(line)) { inOverrides = true; sawOverrides = true; inPackages = false; continue; }
  if (/^[^\s#][^:]*:/.test(line)) { inPackages = false; inOverrides = false; }

  if (inOverrides) {
    const match = /^  (['"]?)([\w-]+)\1:\s*(['"]?)([^\s'"]+)\3\s*$/.exec(line);
    if (match) effectiveOverrides.set(match[2], match[4]);
  }

  if (!inPackages || !line.startsWith('  ')) continue;
  // pnpm lockfile v9 package keys are top-level entries such as
  // `  multer@2.3.0:` or `  'vite@6.4.4(@types/node@22.0.0)':`.
  const match = /^  (['"]?)(.+)\1:\s*$/.exec(line);
  if (!match) continue;
  const key = match[2];
  for (const name of entries.keys()) {
    if (!key.startsWith(`${name}@`)) continue;
    const version = /^(\d+)\.(\d+)\.(\d+)(?:\D|$)/.exec(key.slice(name.length + 1));
    if (version) entries.get(name).push(version.slice(1).map(Number));
  }
}

if (!sawPackages || !sawOverrides) fail('Lockfile is missing packages or overrides section.');
for (const [name, { spec, minimum }] of Object.entries(expectedOverrides)) {
  if (effectiveOverrides.get(name) !== spec) {
    fail(`Lockfile did not resolve root override ${name}=${spec}; found ${effectiveOverrides.get(name) ?? 'none'}`);
  }
  const versions = entries.get(name);
  if (!versions.length) {
    fail(`No resolved ${name} version found in lockfile packages; check parser or install.`);
    continue;
  }
  for (const version of versions) {
    if (compare(version, minimum) < 0) {
      fail(`Insecure ${name}@${version.join('.')} is still resolved (minimum ${minimum.join('.')}).`);
    }
  }
  console.info(`${name}: ${[...new Set(versions.map(version => version.join('.')))].join(', ')}`);
}

if (process.exitCode) {
  console.error('Do not run the full acceptance suite until dependency resolution is corrected.');
} else {
  console.info('Selected patched minimum versions present; run full pnpm audit for remaining advisories.');
}
