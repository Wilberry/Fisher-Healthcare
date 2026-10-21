import {afterEach,describe,expect,it,vi} from 'vitest';
import {requirePhase4SyntheticMode} from './phase4-mode';
afterEach(()=>vi.unstubAllEnvs());
describe('Phase 4 synthetic-only execution gate',()=>{
  it('denies by default',()=>{
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','');
    expect(()=>requirePhase4SyntheticMode()).toThrow();
  });
  it('requires explicit flag, disposable acknowledgment and local fisher_test DB',()=>{
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    expect(()=>requirePhase4SyntheticMode()).not.toThrow();
    vi.stubEnv('DATABASE_URL','postgres://tester@remote.example/fisher_test');
    expect(()=>requirePhase4SyntheticMode()).toThrow();
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/production');
    expect(()=>requirePhase4SyntheticMode()).toThrow();
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('NODE_ENV','production');
    expect(()=>requirePhase4SyntheticMode()).toThrow();
  });
});
