import { describe, expect, it } from 'vitest';
import { bearerToken,requireStaffMfa } from './identity';
describe('authorization header parsing', () => {
 it('accepts one bearer token',()=>expect(bearerToken('Bearer abc.def.sig')).toBe('abc.def.sig'));
 it('rejects missing tokens',()=>expect(()=>bearerToken(undefined)).toThrow());
 it('rejects malformed authorization schemes',()=>expect(()=>bearerToken('Basic abc')).toThrow());
 it('rejects multiple credentials',()=>expect(()=>bearerToken('Bearer abc, Bearer def')).toThrow());
});

describe('signed staff MFA claim enforcement',()=>{
  const principal=(methods:readonly string[])=>({
    subject:'synthetic-field-staff',issuer:'https://idp.fisher.test',
    authenticationMethods:methods
  });
  it('rejects absent, empty, or non-MFA authentication methods',()=>{
    expect(()=>requireStaffMfa(principal([]))).toThrow('multi-factor');
    expect(()=>requireStaffMfa(principal(['pwd']))).toThrow('multi-factor');
    expect(()=>requireStaffMfa(principal(['otp','sms']))).toThrow('multi-factor');
    expect(()=>requireStaffMfa(principal(['MFA']))).toThrow('multi-factor');
  });
  it('accepts only an explicit MFA claim established by verified API identity',()=>{
    expect(()=>requireStaffMfa(principal(['pwd','mfa']))).not.toThrow();
  });
});
