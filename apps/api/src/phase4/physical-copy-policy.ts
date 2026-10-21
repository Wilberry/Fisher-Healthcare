import {BadRequestException} from '@nestjs/common';
import {isCanonicalUuid} from './result-policy';

export function parsePhysicalCopyRequest(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new BadRequestException('Invalid physical-copy request');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).length!==3||!isCanonicalUuid(v.resultId)||
    !isCanonicalUuid(v.addressId)||!isCanonicalUuid(v.requestKey))
    throw new BadRequestException('Invalid physical-copy request');
  return {resultId:v.resultId,addressId:v.addressId,requestKey:v.requestKey};
}
export function parsePhysicalCopyQuote(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new BadRequestException('Invalid physical-copy quote');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).length!==1||!Number.isSafeInteger(v.amountKobo)||
    (v.amountKobo as number)<1||(v.amountKobo as number)>2000000)
    throw new BadRequestException('Invalid physical-copy quote');
  return {amountKobo:v.amountKobo as number};
}
