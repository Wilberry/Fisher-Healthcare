import { afterEach, describe, expect, it } from 'vitest';
import { requirePhase3SyntheticMode } from './phase3-mode';

describe('Phase 3 mode fail-closed boundary', () => {
  const names = ['NODE_ENV','FISHER_PHASE3_OPERATION_MODE','FISHER_DISPOSABLE_DB_ACK','DATABASE_URL'] as const;
  const previous = Object.fromEntries(names.map(key => [key,process.env[key]]));
  afterEach(() => {
    for (const key of names) {
      const prior = previous[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  });
  function permit() {
    process.env.NODE_ENV = 'test';
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    process.env.FISHER_DISPOSABLE_DB_ACK = 'disposable-test-only';
    process.env.DATABASE_URL = 'postgresql://fisher:test@127.0.0.1:5483/fisher_test';
  }
  it('permits only explicitly acknowledged synthetic loopback database mode', () => {
    permit();
    expect(() => requirePhase3SyntheticMode()).not.toThrow();
  });
  it('rejects absent, unrecognized and production execution', () => {
    permit();
    delete process.env.FISHER_PHASE3_OPERATION_MODE;
    expect(() => requirePhase3SyntheticMode()).toThrow();
    permit();
    process.env.FISHER_PHASE3_OPERATION_MODE = 'enabled';
    expect(() => requirePhase3SyntheticMode()).toThrow();
    permit();
    process.env.NODE_ENV = 'production';
    expect(() => requirePhase3SyntheticMode()).toThrow();
  });
  it('rejects real databases and non-loopback destinations', () => {
    permit();
    delete process.env.FISHER_DISPOSABLE_DB_ACK;
    expect(() => requirePhase3SyntheticMode()).toThrow();
    permit();
    process.env.DATABASE_URL = 'postgresql://fisher:test@127.0.0.1:5432/production';
    expect(() => requirePhase3SyntheticMode()).toThrow();
    permit();
    process.env.DATABASE_URL = 'postgresql://fisher:test@db.example.test:5432/fisher_test';
    expect(() => requirePhase3SyntheticMode()).toThrow();
    permit();
    process.env.DATABASE_URL = 'not-a-database-url';
    expect(() => requirePhase3SyntheticMode()).toThrow();
  });
});
