import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieNames,crossSite,makePending,oidcConfig,safeReturnPath,seal,unseal
} from './staff-auth';

const environment = [
  'NODE_ENV','FISHER_STAFF_WEB_SESSION_KEY','FISHER_STAFF_AUTH_ALLOW_LOOPBACK_HTTP',
  'OIDC_ISSUER','FISHER_STAFF_OIDC_CLIENT_ID','FISHER_STAFF_OIDC_AUTHORIZATION_URL',
  'FISHER_STAFF_OIDC_TOKEN_URL','FISHER_STAFF_OIDC_REDIRECT_URI',
  'FISHER_STAFF_WEB_ORIGIN','FISHER_API_SERVER_URL'
] as const;
const saved=Object.fromEntries(environment.map(name=>[name,process.env[name]]));
describe('field staff session and PKCE policy',()=>{
  beforeEach(()=>{
    process.env.NODE_ENV='test';
    process.env.FISHER_STAFF_WEB_SESSION_KEY=Buffer.alloc(32,7).toString('base64url');
    process.env.FISHER_STAFF_AUTH_ALLOW_LOOPBACK_HTTP='synthetic-only';
  });
  afterEach(()=>{
    for(const name of environment){
      if(saved[name]===undefined)delete process.env[name];
      else process.env[name]=saved[name];
    }
  });
  it('refuses open redirects and control characters',()=>{
    expect(safeReturnPath('//evil.example')).toBe('/visits');
    expect(safeReturnPath('/\\evil')).toBe('/visits');
    expect(safeReturnPath('/page\nother')).toBe('/visits');
    expect(safeReturnPath('/visits?tab=assigned')).toBe('/visits?tab=assigned');
  });
  it('seals a bounded pending state and refuses tampering',()=>{
    const pending=makePending('/visits');
    const encoded=seal(pending);
    expect(unseal(encoded)).toEqual(pending);
    expect(unseal(encoded.slice(0,-1)+'x')).toBeNull();
    expect(unseal('untrusted.invalid.cookie')).toBeNull();
    expect(unseal('a'.repeat(10001))).toBeNull();
  });
  it('rejects expired, malformed and client-controlled sessions',()=>{
    const expired=seal({type:'session',accessToken:'test',subject:'synthetic',
      expires:Math.floor(Date.now()/1000)-1});
    expect(unseal(expired)).toBeNull();
    expect(unseal(undefined)).toBeNull();
    expect(cookieNames().session).toContain('fisher_field_staff_session');
  });
  it('fails closed on originless or cross-site state mutations',()=>{
    const local=new Request('https://staff.example.test/auth/logout',{
      method:'POST',headers:{origin:'https://staff.example.test'}});
    const bad=new Request('https://staff.example.test/auth/logout',{
      method:'POST',headers:{origin:'https://evil.example.test'}});
    expect(crossSite(local)).toBe(false);
    expect(crossSite(bad)).toBe(true);
    expect(crossSite(new Request('https://staff.example.test/auth/logout'))).toBe(true);
  });
  it('requires a complete, origin-matched OIDC configuration',()=>{
    expect(oidcConfig()).toBeNull();
    process.env.OIDC_ISSUER='https://idp.example.test';
    process.env.FISHER_STAFF_OIDC_CLIENT_ID='synthetic-client';
    process.env.FISHER_STAFF_OIDC_AUTHORIZATION_URL='https://idp.example.test/authorize';
    process.env.FISHER_STAFF_OIDC_TOKEN_URL='https://idp.example.test/token';
    process.env.FISHER_STAFF_OIDC_REDIRECT_URI='https://staff.example.test/auth/callback';
    process.env.FISHER_STAFF_WEB_ORIGIN='https://staff.example.test';
    process.env.FISHER_API_SERVER_URL='https://api.example.test';
    expect(oidcConfig()).not.toBeNull();
    process.env.FISHER_STAFF_OIDC_REDIRECT_URI='https://evil.example.test/auth/callback';
    expect(oidcConfig()).toBeNull();
    process.env.FISHER_STAFF_OIDC_REDIRECT_URI='http://staff.example.test/auth/callback';
    expect(oidcConfig()).toBeNull();
  });
});
