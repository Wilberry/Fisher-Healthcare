import { afterEach, describe, expect, it } from 'vitest';
import { requirePhase3SyntheticMode } from './phase3-mode';

describe('Phase 3 mode fail-closed boundary', () => {
  const savedMode = process.env.FISHER_PHASE3_OPERATION_MODE;
  const savedNode = process.env.NODE_ENV;
  afterEach(() => {
    if (savedMode === undefined) delete process.env.FISHER_PHASE3_OPERATION_MODE;
    else process.env.FISHER_PHASE3_OPERATION_MODE = savedMode;
    if (savedNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNode;
  });
  it('denies absent, unrecognized and production mode', () => {
    delete process.env.FISHER_PHASE3_OPERATION_MODE;
    process.env.NODE_ENV = 'test';
    expect(() => requirePhase3SyntheticMode()).toThrow('Phase 3 operations are not enabled');
    process.env.FISHER_PHASE3_OPERATION_MODE = 'enabled';
    expect(() => requirePhase3SyntheticMode()).toThrow();
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    process.env.NODE_ENV = 'production';
    expect(() => requirePhase3SyntheticMode()).toThrow();
  });
  it('permits only explicit non-production synthetic mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.FISHER_PHASE3_OPERATION_MODE = 'synthetic-only';
    expect(() => requirePhase3SyntheticMode()).not.toThrow();
  });
});
