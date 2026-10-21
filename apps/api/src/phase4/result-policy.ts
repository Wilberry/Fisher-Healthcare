import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const checksum=/^[0-9a-f]{64}$/;
const documentKey=/^synthetic\/results\/[0-9a-f]{8}-[0-9a-f-]{27}\.pdf$/;
const validation=/^SYN-[A-Z0-9-]{8,64}$/;

export interface ResultIntakeInput{
  orderItemId:string;specimenId:string;intakeKey:string;
  objectKey:string;documentSha256:string;validationReference:string
}
export function isCanonicalUuid(value:unknown):value is string{
  return typeof value==='string'&&uuid.test(value);
}
export function parseResultIntake(raw:unknown):ResultIntakeInput{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new BadRequestException('Invalid result intake');
  const value=raw as Record<string,unknown>;
  const keys=['orderItemId','specimenId','intakeKey','objectKey',
    'documentSha256','validationReference'];
  if(Object.keys(value).length!==keys.length ||
    Object.keys(value).some(key=>!keys.includes(key)))
    throw new BadRequestException('Invalid result intake fields');
  if(!isCanonicalUuid(value.orderItemId)||!isCanonicalUuid(value.specimenId)||
     !isCanonicalUuid(value.intakeKey)||
     typeof value.objectKey!=='string'||!documentKey.test(value.objectKey)||
     typeof value.documentSha256!=='string'||!checksum.test(value.documentSha256)||
     typeof value.validationReference!=='string'||!validation.test(value.validationReference))
    throw new BadRequestException('Invalid result intake');
  return value as unknown as ResultIntakeInput;
}
export function parseResultRelease(raw:unknown):{releaseKey:string}{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid release');
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).length!==1||!isCanonicalUuid(b.releaseKey))
    throw new BadRequestException('Invalid release');
  return {releaseKey:b.releaseKey};
}
export function intakeFingerprint(v:ResultIntakeInput):string{
  return createHash('sha256').update(JSON.stringify([
    v.orderItemId,v.specimenId,v.objectKey,
    v.documentSha256,v.validationReference
  ])).digest('hex');
}
