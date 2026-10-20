import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Phase3OfflineSyncController } from './offline-sync.controller';
import { Phase3CustodyController } from './custody.controller';
import { CustodyConflict } from './custody';
import type { Phase3CustodyService } from './custody.service';

const id = '00000000-0000-4000-8000-000000000001';
const event = '00000000-0000-4000-8000-000000000002';
const request = {
  identity: {
    subject:'synthetic-collector',
    issuer:'https://identity.fisher.test',
    authenticationMethods:['mfa']
  }
};
function mockApply() {
  const apply = vi.fn();
  const service = { apply } as unknown as Phase3CustodyService;
  return { apply, offline: new Phase3OfflineSyncController(service),
    direct: new Phase3CustodyController(service) };
}
describe('offline custody API rejects unsafe client authority', () => {
  it('rejects forged dispatch and recipient acknowledgment before calling a service', async () => {
    const {apply,offline,direct} = mockApply();
    await expect(offline.sync(request as never,{events:[
      {specimenId:id,eventId:event,action:'dispatch',expectedVersion:2,
        recipientId:id,recipientAcknowledged:true}
    ]})).rejects.toThrow('Invalid event');
    await expect(offline.sync(request as never,{events:[
      {specimenId:id,eventId:event,action:'collect',expectedVersion:0,
        recipientAcknowledged:true}
    ]})).rejects.toThrow('Invalid event');
    await expect(direct.apply(request as never,id,{
      eventId:event,action:'receive_at_lab',expectedVersion:3
    })).rejects.toThrow('Invalid event');
    expect(apply).not.toHaveBeenCalled();
  });
  it('rejects barcodes, patient data and duplicate IDs atomically before mutation',async()=>{
    const {apply,offline}=mockApply();
    const allowed={specimenId:id,eventId:event,action:'collect',expectedVersion:0};
    await expect(offline.sync(request as never,{events:[
      {...allowed,observedBarcode:'synthetic-label'}
    ]})).rejects.toThrow('Unexpected offline custody fields');
    await expect(offline.sync(request as never,{events:[
      {...allowed,patientName:'forbidden'}
    ]})).rejects.toThrow('Unexpected offline custody fields');
    await expect(offline.sync(request as never,{events:[
      allowed,{...allowed,action:'package',eventId:event.toUpperCase()}
    ]})).rejects.toThrow('Duplicate offline custody event ID');
    expect(apply).not.toHaveBeenCalled();
  });
  it('accepts only collection-scoped actions, returning conflict outcomes independently', async () => {
    const {apply,offline} = mockApply();
    apply.mockRejectedValueOnce(new CustodyConflict('STALE_VERSION'))
      .mockResolvedValueOnce({ data:{state:'collected',version:1} })
      .mockRejectedValueOnce(new ConflictException('EVENT_ID_REUSED'));
    const result = await offline.sync(request as never,{events:[
      {specimenId:id,eventId:event,action:'collect',expectedVersion:0},
      {specimenId:id,eventId:'00000000-0000-4000-8000-000000000003',
        action:'collect',expectedVersion:0},
      {specimenId:id,eventId:'00000000-0000-4000-8000-000000000004',
        action:'package',expectedVersion:1}
    ]});
    expect(result.data.outcomes.map(x=>x.accepted)).toEqual([false,true,false]);
    expect(result.data.outcomes[0]?.code).toBe('STALE_VERSION');
    expect(result.data.outcomes[2]?.code).toBe('CONFLICT_REQUIRES_REVIEW');
    expect(apply).toHaveBeenCalledTimes(3);
  });
  it('fails closed for staff-scope changes, instead of continuing to process a batch', async () => {
    const {apply,offline} = mockApply();
    apply.mockRejectedValueOnce(new ForbiddenException('Staff action denied'));
    await expect(offline.sync(request as never,{events:[
      {specimenId:id,eventId:event,action:'collect',expectedVersion:0},
      {specimenId:id,eventId:'00000000-0000-4000-8000-000000000003',
        action:'package',expectedVersion:1}
    ]})).rejects.toThrow('Staff action denied');
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
