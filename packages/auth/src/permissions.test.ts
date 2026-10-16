import {describe,it,expect} from 'vitest';
import {hasCapability,requireCapability} from './permissions';
describe('staff capabilities',()=>{
 it('does not automatically grant clinical access to administrators',()=>{expect(hasCapability({userId:'admin',staffRole:'administrator'},'results:release')).toBe(false)});
 it('restricts courier to specimen transport',()=>{expect(hasCapability({userId:'courier',staffRole:'courier'},'specimens:transport')).toBe(true);expect(hasCapability({userId:'courier',staffRole:'courier'},'finance:read')).toBe(false)});
 it('rejects principals without staff role',()=>{expect(()=>requireCapability({userId:'anonymous'},'staff:manage')).toThrow('FORBIDDEN')});
 it('isolates support case management from clinical results and finance',()=>{
  expect(hasCapability({userId:'support',staffRole:'support'},'support:manage')).toBe(true);
  expect(hasCapability({userId:'support',staffRole:'support'},'finance:manage')).toBe(false);
  expect(hasCapability({userId:'support',staffRole:'support'},'results:release')).toBe(false);
  expect(hasCapability({userId:'finance',staffRole:'finance'},'support:manage')).toBe(false);
 });
 it('allows dedicated result release role',()=>{expect(hasCapability({userId:'clinician',staffRole:'result_release'},'results:release')).toBe(true)});
});
