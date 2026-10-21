import { ServiceUnavailableException } from '@nestjs/common';

/** Phase 4 remains restricted to a disposable, synthetic local database. */
export function requirePhase4SyntheticMode():void{
  const denied=()=>{throw new ServiceUnavailableException('Phase 4 operations are not enabled');};
  if(process.env.NODE_ENV==='production' ||
    process.env.FISHER_PHASE4_OPERATION_MODE!=='synthetic-only' ||
    process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only' ||
    !process.env.DATABASE_URL)denied();
  let url:URL;
  try{url=new URL(process.env.DATABASE_URL!);}catch{return denied();}
  if(!['postgresql:','postgres:'].includes(url.protocol) ||
    !['127.0.0.1','localhost'].includes(url.hostname) ||
    url.pathname!=='/fisher_test')denied();
}
