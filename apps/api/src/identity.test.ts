import { describe, expect, it } from 'vitest';
import { bearerToken } from './identity';
describe('authorization header parsing', () => {
 it('accepts one bearer token',()=>expect(bearerToken('Bearer abc.def.sig')).toBe('abc.def.sig'));
 it('rejects missing tokens',()=>expect(()=>bearerToken(undefined)).toThrow());
 it('rejects malformed authorization schemes',()=>expect(()=>bearerToken('Basic abc')).toThrow());
 it('rejects multiple credentials',()=>expect(()=>bearerToken('Bearer abc, Bearer def')).toThrow());
});
