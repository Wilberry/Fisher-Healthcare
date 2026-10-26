import {describe,it,expect} from 'vitest';
import {ALERT_CODES,actionForAlert,isAlertCode,validateAlertCounts} from './alerts.policy';
describe('Phase 5 finite synthetic alert policy',()=>{
 it('accepts only three predefined non-identifying signal names',()=>{
  expect(ALERT_CODES).toHaveLength(3);
  expect(isAlertCode('custody_incidents')).toBe(true);
  expect(isAlertCode('patient_123')).toBe(false);
  expect(isAlertCode('__proto__')).toBe(false);
 });
 it('fails closed on missing, negative, nonnumeric or oversized counts',()=>{
  const zero=Object.fromEntries(ALERT_CODES.map(k=>[k,0]));
  expect(validateAlertCounts(zero)).toEqual(zero);
  for(const value of [-1,'1',NaN,1.1,2147483648]){
    expect(()=>validateAlertCounts({...zero,outbox_dead_letters:value})).toThrow();
  }
  expect(()=>validateAlertCounts({custody_incidents:0})).toThrow();
 });
 it('preserves a valid acknowledgment and reopens only resolved alerts',()=>{
  expect(actionForAlert(1,'open')).toBe('open');
  expect(actionForAlert(1,'acknowledged')).toBe('steady');
  expect(actionForAlert(1,'resolved')).toBe('reopen');
  expect(actionForAlert(0,'open')).toBe('resolve');
  expect(actionForAlert(0,'acknowledged')).toBe('resolve');
  expect(actionForAlert(0,'resolved')).toBe('steady');
 });
});
