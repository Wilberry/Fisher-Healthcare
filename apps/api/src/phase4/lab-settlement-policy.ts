import {BadRequestException} from '@nestjs/common';
import {isCanonicalUuid} from './result-policy';
const reference=/^SYN-[A-Z0-9-]{8,64}$/;
export function parsePayable(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new BadRequestException('Invalid laboratory payable');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==3||!isCanonicalUuid(v.resultId)||
   !Number.isSafeInteger(v.amountKobo)||
   (v.amountKobo as number)<=0||(v.amountKobo as number)>2147483647||
   typeof v.agreementReference!=='string'||!reference.test(v.agreementReference))
   throw new BadRequestException('Invalid laboratory payable');
 return {resultId:v.resultId as string,amountKobo:v.amountKobo as number,
   agreementReference:v.agreementReference as string};
}
export function parseSettlement(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new BadRequestException('Invalid settlement batch');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==3||
   !isCanonicalUuid(v.batchKey)||!isCanonicalUuid(v.labId)||
   !Array.isArray(v.payableIds)||v.payableIds.length<1||v.payableIds.length>50||
   !v.payableIds.every(isCanonicalUuid)||
   new Set(v.payableIds).size!==v.payableIds.length)
   throw new BadRequestException('Invalid settlement batch');
 return {batchKey:v.batchKey as string,labId:v.labId as string,
   payableIds:v.payableIds as string[]};
}
