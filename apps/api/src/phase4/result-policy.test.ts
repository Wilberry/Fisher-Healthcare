import {describe,it,expect} from 'vitest';
import {parseResultIntake,parseResultRelease,intakeFingerprint} from './result-policy';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fixture={orderItemId:id,specimenId:other,intakeKey:id,
  objectKey:'synthetic/results/'+id+'.pdf',
  documentSha256:'a'.repeat(64),
  validationReference:'SYN-VALIDATED-0001'};
describe('synthetic result intake and release envelopes',()=>{
  it('allows only opaque identifiers, private synthetic object keys and validation evidence',()=>{
    expect(parseResultIntake(fixture)).toEqual(fixture);
    expect(()=>parseResultIntake({...fixture,patientName:'forbidden'})).toThrow();
    expect(()=>parseResultIntake({...fixture,accessToken:'forbidden'})).toThrow();
    expect(()=>parseResultIntake({...fixture,objectKey:'https://public.example/result.pdf'})).toThrow();
    expect(()=>parseResultIntake({...fixture,objectKey:'../secrets.pdf'})).toThrow();
    expect(()=>parseResultIntake({...fixture,documentSha256:'not-a-checksum'})).toThrow();
    expect(()=>parseResultIntake({...fixture,validationReference:'clinical diagnosis'})).toThrow();
    expect(()=>parseResultIntake({...fixture,specimenId:other.toUpperCase()})).toThrow();
  });
  it('binds idempotent intakes to exactly the same specimen, test, object and validation',()=>{
    expect(intakeFingerprint(fixture)).toBe(intakeFingerprint({...fixture}));
    expect(intakeFingerprint(fixture)).not.toBe(intakeFingerprint({...fixture,orderItemId:other}));
    expect(intakeFingerprint(fixture)).not.toBe(intakeFingerprint({...fixture,documentSha256:'b'.repeat(64)}));
  });
  it('refuses client-supplied release actors or changes to result state',()=>{
    expect(parseResultRelease({releaseKey:id})).toEqual({releaseKey:id});
    expect(()=>parseResultRelease({releaseKey:id,actorId:other})).toThrow();
    expect(()=>parseResultRelease({releaseKey:other.toUpperCase()})).toThrow();
  });
});
