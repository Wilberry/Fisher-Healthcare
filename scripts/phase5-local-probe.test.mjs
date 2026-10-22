import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {localProbeBase,summarizeDurations,runLocalProbe} from './phase5-local-probe.mjs';

describe('bounded and non-sensitive Phase 5 local probe',()=>{
 it('rejects remote, public or credential-bearing targets',()=>{
  for(const url of [
   'https://api.example.test:4000/',
   'http://192.168.1.2:4000/',
   'http://user:pass@localhost:4000/',
   'http://localhost:4000/path',
   'http://localhost:4000/?token=secret',
   'http://localhost:4000/#key',
   'http://localhost/'
  ])assert.throws(()=>localProbeBase(url));
  assert.equal(localProbeBase('http://127.0.0.1:4000/'),'http://127.0.0.1:4000');
 });
 it('measures p95 without an invented clinical latency SLA',()=>{
  assert.deepEqual(summarizeDurations([10,30,20,40]),{
   count:4,p95Ms:40,maxMs:40});
  assert.throws(()=>summarizeDurations([]));
  assert.throws(()=>runLocalProbe('http://localhost:4000',41));
 });
});
