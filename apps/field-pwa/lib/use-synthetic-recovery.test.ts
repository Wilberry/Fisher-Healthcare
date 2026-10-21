import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchOfflineCapability} from './use-synthetic-recovery';

const scope='a'.repeat(64);
afterEach(()=>vi.unstubAllGlobals());

describe('synthetic offline context authorization boundary',()=>{
  it('accepts only a signed-in, enabled, canonical owner scope',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(
      Response.json({enabled:true,scope})));
    const context=await fetchOfflineCapability();
    expect(context?.scope).toBe(scope);
    expect(typeof context?.checkedAt).toBe('number');
  });
  it('treats verified expired or revoked permissions as unavailable',async()=>{
    for(const status of [401,403]){
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(
        Response.json({enabled:false},{status})));
      expect(await fetchOfflineCapability()).toBeNull();
    }
  });
  it('distinguishes provider outages and invalid responses from revocation',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(
      Response.json({error:'unavailable'},{status:503})));
    await expect(fetchOfflineCapability()).rejects.toThrow('unavailable');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(
      Response.json({enabled:false,scope})));
    await expect(fetchOfflineCapability()).rejects.toThrow('Invalid synthetic');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(
      Response.json({enabled:true,scope:'wrong'})));
    await expect(fetchOfflineCapability()).rejects.toThrow('Invalid synthetic');
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('connection lost')));
    await expect(fetchOfflineCapability()).rejects.toThrow('connection lost');
  });
});
