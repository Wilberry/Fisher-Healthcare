import {ServiceUnavailableException} from '@nestjs/common';

/** Phase 5 engineering posture is strictly synthetic, never a pilot activation switch. */
export function requirePhase5SyntheticMode():void{
 const deny=()=>{throw new ServiceUnavailableException('Synthetic readiness is unavailable');};
 if(process.env.NODE_ENV==='production'||
    process.env.FISHER_PHASE5_OPERATION_MODE!=='synthetic-only'||
    process.env.FISHER_DISPOSABLE_DB_ACK!=='disposable-test-only'||
    !process.env.DATABASE_URL)return deny();
 let url:URL;
 try{url=new URL(process.env.DATABASE_URL);}catch{return deny();}
 if(!['postgres:','postgresql:'].includes(url.protocol)||
    !['localhost','127.0.0.1'].includes(url.hostname)||
    url.pathname!=='/fisher_test'||url.username===''||
    url.search||url.hash)return deny();
}
