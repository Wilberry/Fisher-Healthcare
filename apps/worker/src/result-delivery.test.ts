import {afterEach,describe,expect,it,vi} from 'vitest';
import {stagingResultEmailSettings,dispatchResultEmail} from './result-delivery';
afterEach(()=>vi.unstubAllEnvs());
describe('result availability notification',()=>{
  it('is disabled without synthetic acknowledgment, allowlist and HTTPS portal',()=>{
    expect(stagingResultEmailSettings()).toBeNull();
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','staging');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('RESEND_API_KEY','synthetic-test-key');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_FROM','alerts@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST','test@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    expect(stagingResultEmailSettings()?.allowed).toEqual(['test@example.test']);
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','http://fisher.example.test/');
    expect(stagingResultEmailSettings()).toBeNull();
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    vi.stubEnv('NODE_ENV','production');
    expect(stagingResultEmailSettings()).toBeNull();
  });
  it('makes no network or database calls when the email worker is disabled',async()=>{
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','');
    const query=vi.fn();const send=vi.fn();
    const didSend=await dispatchResultEmail({query} as never,send as never);
    expect(didSend).toBe(false);expect(query).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
