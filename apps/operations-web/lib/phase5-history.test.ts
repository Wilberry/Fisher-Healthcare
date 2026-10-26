import {describe,it,expect} from 'vitest';
import {parsePhase5History} from './phase5-history';
const good={
 code:'custody_incidents',event_type:'opened',observed_count:2,
 recorded_at:'2026-10-26T18:42:00.000Z'
};
describe('private Phase 5 alert history presentation',()=>{
 it('projects only four permitted fields, dropping actor IDs and arbitrary details',()=>{
  const parsed=parsePhase5History([{...good,actor_id:'do-not-display',
    patient_name:'private',metadata:{secret:true}}]);
  expect(parsed).toEqual([{code:'custody_incidents',eventType:'opened',
    count:2,at:'2026-10-26T18:42:00.000Z'}]);
  expect(JSON.stringify(parsed)).not.toContain('do-not-display');
  expect(JSON.stringify(parsed)).not.toContain('private');
 });
 it('rejects invalid event codes, dates and inconsistent counts',()=>{
  const bad=[
   {...good,code:'patient_123'},
   {...good,event_type:'not_a_transition'},
   {...good,observed_count:-1},
   {...good,event_type:'resolved'},
   {...good,recorded_at:'arbitrary clinical notes'},
   {...good,recorded_at:'2030-99-99T01:00:00.000Z'}
  ];
  expect(parsePhase5History(bad)).toEqual([]);
 });
 it('retains no more than 30 aggregate history events',()=>{
  expect(parsePhase5History(Array.from({length:50},()=>({...good}))))
   .toHaveLength(30);
 });
});
