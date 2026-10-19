import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cookieNames,crossSite,makePending,oidcConfig,safeReturnPath,seal,unseal,
  verifyActiveStaff,StaffSessionError
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
    vi.unstubAllGlobals();
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
  it('rejects originless field POSTs before reading credentials or contacting an API',async()=>{
    const {forwardFieldAction}=await import('./staff-auth');
    const request=new Request('https://staff.example.test/api/phase3/field/events/sync',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({events:[]})
    });
    const response=await forwardFieldAction(request,'field/events/sync');
    expect(response.status).toBe(403);
  });
  it('classifies expired, revoked and unavailable staff authorization distinctly',async()=>{
    const originalFetch=vi.fn().mockResolvedValue(
      Response.json({error:'expired'},{status:401}));
    vi.stubGlobal('fetch',originalFetch);
    await expect(verifyActiveStaff('synthetic','https://api.example.test'))
      .rejects.toMatchObject({reason:'reauth_required'});
    originalFetch.mockResolvedValue(Response.json({error:'forbidden'},{status:403}));
    await expect(verifyActiveStaff('synthetic','https://api.example.test'))
      .rejects.toMatchObject({reason:'access_denied'});
    originalFetch.mockResolvedValue(Response.json({error:'unavailable'},{status:503}));
    await expect(verifyActiveStaff('synthetic','https://api.example.test'))
      .rejects.toMatchObject({reason:'service_unavailable'});
    originalFetch.mockRejectedValue(new Error('offline'));
    await expect(verifyActiveStaff('synthetic','https://api.example.test'))
      .rejects.toBeInstanceOf(StaffSessionError);
  });
  it('rejects forged Host/Origin pairs against the configured staff origin',()=>{
    process.env.FISHER_STAFF_WEB_ORIGIN='https://staff.example.test';
    const attacker=new Request('https://evil.example.test/auth/logout',{
      method:'POST',headers:{origin:'https://evil.example.test'}});
    const valid=new Request('https://staff.example.test/auth/logout',{
      method:'POST',headers:{origin:'https://staff.example.test'}});
    expect(crossSite(attacker)).toBe(true);
    expect(crossSite(valid)).toBe(false);
  });
  it('rejects missing staff capabilities even with an authenticated principal',async()=>{
    const mocked=vi.fn()
      .mockResolvedValueOnce(Response.json({subject:'synthetic',authenticated:true}))
      .mockResolvedValueOnce(Response.json({capabilities:[]}));
    vi.stubGlobal('fetch',mocked);
    await expect(verifyActiveStaff('token','https://api.example.test'))
      .rejects.toMatchObject({reason:'access_denied'});
    expect(mocked).toHaveBeenCalledTimes(2);
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
