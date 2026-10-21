import {BadRequestException} from '@nestjs/common';
import {isCanonicalUuid} from './result-policy';
export type RefundReason='cancelled_service'|'failed_collection'|
  'lab_rejection'|'duplicate_charge'|'manual_review';
const reasons:readonly string[]=['cancelled_service','failed_collection',
  'lab_rejection','duplicate_charge','manual_review'];
export type RefundRequest={
  paymentId:string;requestKey:string;amountKobo:number;reasonCode:RefundReason
};
export function parseRefundRequest(body:unknown):RefundRequest{
  if(!body||typeof body!=='object'||Array.isArray(body))
    throw new BadRequestException('Invalid refund request');
  const b=body as Record<string,unknown>;
  if(Object.keys(b).length!==4||!isCanonicalUuid(b.paymentId)||
     !isCanonicalUuid(b.requestKey)||!Number.isSafeInteger(b.amountKobo)||
     (b.amountKobo as number)<=0 || (b.amountKobo as number)>2147483647||
     typeof b.reasonCode!=='string'||!reasons.includes(b.reasonCode))
    throw new BadRequestException('Invalid refund request');
  return {paymentId:b.paymentId as string,requestKey:b.requestKey as string,
    amountKobo:b.amountKobo as number,reasonCode:b.reasonCode as RefundReason};
}
export function parseRefundReview(body:unknown):{decision:'approve'|'reject';note:string}{
  if(!body||typeof body!=='object'||Array.isArray(body))
    throw new BadRequestException('Invalid refund review');
  const b=body as Record<string,unknown>;
  if(Object.keys(b).length!==2||!(b.decision==='approve'||b.decision==='reject')||
     typeof b.note!=='string'||b.note.trim().length<10||b.note.length>240)
    throw new BadRequestException('Invalid refund review');
  return {decision:b.decision,note:b.note.trim()};
}
