import {describe,it,expect} from 'vitest';
import {users,patients,patientRelationships,orders,specimens,results,payments,custodyEvents} from './schema';
describe('domain schema declarations',()=>{
 it('declares required core entities',()=>{for(const entity of [users,patients,patientRelationships,orders,specimens,results,payments,custodyEvents]) expect(entity).toBeDefined()});
 it('keeps booking and result grants independent',()=>{expect(patientRelationships.canBook).toBeDefined();expect(patientRelationships.canViewResults).toBeDefined()});
 it('tracks released results separately from stored documents',()=>{expect(results.releasedAt).toBeDefined();expect(results.objectKey).toBeDefined()});
});
