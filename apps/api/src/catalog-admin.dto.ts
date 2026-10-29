import { z } from 'zod/v3';
const uuid=z.string().uuid();
const code=z.string().regex(/^[A-Z0-9_-]{2,40}$/);
const money=z.number().int().min(0).max(2147483647);
export const testInput=z.object({
 code,name:z.string().trim().min(3).max(160),specimenType:z.enum(['blood','urine','saliva','stool','swab','other']),
 preparationText:z.string().trim().min(5).max(3000)
}).strict();
export const labInput=z.object({name:z.string().trim().min(3).max(160)}).strict();
export const zoneInput=z.object({
 code,name:z.string().trim().min(3).max(160),regularFeeKobo:money,premiumFeeKobo:money
}).strict();
export const offeringInput=z.object({
 labId:uuid,testId:uuid,priceKobo:money,turnaroundHours:z.number().int().min(1).max(2160)
}).strict();
export const slotInput=z.object({
 zoneId:uuid,labId:uuid,tier:z.enum(['regular','premium']),
 startsAt:z.string().datetime({offset:true}),
 endsAt:z.string().datetime({offset:true}),
 cutoffAt:z.string().datetime({offset:true}),
 capacity:z.number().int().min(1).max(10000)
}).strict().refine(v=>{
 const start=Date.parse(v.startsAt),end=Date.parse(v.endsAt),cutoff=Date.parse(v.cutoffAt);
 return Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(cutoff) && start<end && cutoff<=start && cutoff>Date.now() &&
   start>Date.now() && start<Date.now()+90*24*60*60*1000;
},{message:'Invalid slot dates or cutoff'});
export const approvalInput=z.object({
 evidenceReference:z.string().regex(/^[A-Za-z0-9._:-]{10,128}$/)
}).strict();
export const catalogType=z.enum(['test','laboratory','zone','offering','slot']);
export type CatalogType=z.infer<typeof catalogType>;
export type TestInput=z.infer<typeof testInput>;
export type LabInput=z.infer<typeof labInput>;
export type ZoneInput=z.infer<typeof zoneInput>;
export type OfferingInput=z.infer<typeof offeringInput>;
export type SlotInput=z.infer<typeof slotInput>;
