import {afterEach,describe,expect,it,vi} from 'vitest';
import {requirePhase5SyntheticMode} from './mode';
import {classifyOperationalPosture,POSTURE_KEYS} from './posture';
afterEach(()=>vi.unstubAllEnvs());
describe('Phase 5 synthetic-only and clinical authorization boundary',()=>{
 it('refuses activation without explicit disposable local test scope',()=>{
  vi.stubEnv('FISHER_PHASE5_OPERATION_MODE','');
  expect(()=>requirePhase5SyntheticMode()).toThrow();
  vi.stubEnv('NODE_ENV','test');
  vi.stubEnv('FISHER_PHASE5_OPERATION_MODE','synthetic-only');
  vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
  vi.stubEnv('DATABASE_URL','postgres://tester@127.0.0.1:5432/fisher_test');
  expect(()=>requirePhase5SyntheticMode()).not.toThrow();
  vi.stubEnv('DATABASE_URL','postgres://tester@remote.example/fisher_test');
  expect(()=>requirePhase5SyntheticMode()).toThrow();
  vi.stubEnv('DATABASE_URL','postgres://tester@127.0.0.1:5432/fisher_production');
  expect(()=>requirePhase5SyntheticMode()).toThrow();
  vi.stubEnv('DATABASE_URL','postgres://tester@127.0.0.1:5432/fisher_test');
  vi.stubEnv('NODE_ENV','production');
  expect(()=>requirePhase5SyntheticMode()).toThrow();
 });
 it('accepts only nonnegative bounded numeric aggregate measurements',()=>{
  const counts=Object.fromEntries(POSTURE_KEYS.map(key=>[key,0]));
  const status=classifyOperationalPosture(counts);
  expect(status).toMatchObject({operationalState:'observed',
    pilotActivationAuthorized:false,clinicalSignoffRecorded:false,
    privacySignoffRecorded:false,productionReleaseAuthorized:false});
  expect(classifyOperationalPosture({...counts,outboxDeadLetters:1}).operationalState)
    .toBe('attention_required');
  expect(()=>classifyOperationalPosture({...counts,openCustodyIncidents:-1})).toThrow();
  expect(()=>classifyOperationalPosture({...counts,resultEmailFailed:'unknown'})).toThrow();
  expect(()=>classifyOperationalPosture({...counts,refundReviewPending:NaN})).toThrow();
  expect(status).not.toHaveProperty('patientId');
  expect(status).not.toHaveProperty('resultId');
 });
});
