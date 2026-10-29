import {pathToFileURL} from 'node:url';

export function localProbeBase(raw){
 let url;
 try{url=new URL(raw);}catch{throw new Error('Invalid synthetic target');}
 if(url.protocol!=='http:'||
    !['127.0.0.1','localhost'].includes(url.hostname)||
    !url.port||url.username||url.password||url.pathname!=='/'||
    url.search||url.hash)throw new Error('Only a loopback HTTP origin is permitted');
 return url.origin;
}
export function summarizeDurations(samples){
 if(!samples.length||samples.some(ms=>!Number.isFinite(ms)||ms<0))
  throw new Error('Invalid sample duration');
 const sorted=[...samples].sort((a,b)=>a-b);
 const at=Math.max(0,Math.ceil(0.95*sorted.length)-1);
 return {count:sorted.length,p95Ms:Math.round(sorted[at]),maxMs:Math.round(sorted.at(-1))};
}
export async function runLocalProbe(root,requestCount=20){
 if(!Number.isSafeInteger(requestCount)||requestCount<1||requestCount>40)
  throw new Error('Invalid bounded request count');
 const samples=[],checks=[];
 for(let i=0;i<requestCount;i+=4){
  const group=Array.from({length:Math.min(4,requestCount-i)},(_,j)=>i+j);
  const batch=await Promise.all(group.map(async index=>{
   const protectedCheck=index%2===1;
   const path=protectedCheck?'/api/v1/ops/pilot-readiness/snapshot':'/api/v1/health';
   const start=process.hrtime.bigint();
   const response=await fetch(root+path,{
    method:'GET',cache:'no-store',redirect:'manual',
    signal:AbortSignal.timeout(5000)
   });
   // Do not parse, log or retain any response body; only status and timing.
   await response.body?.cancel();
   const ms=Number(process.hrtime.bigint()-start)/1000000;
   const expected=protectedCheck?401:200;
   if(response.status!==expected)
    throw new Error('Synthetic local probe unexpected HTTP status');
   return {ms,protectedCheck};
  }));
  for(const item of batch){samples.push(item.ms);checks.push(item.protectedCheck);}
 }
 return {mode:'disposable-loopback-only',
  healthyResponses:checks.filter(v=>!v).length,
  unauthorizedResponses:checks.filter(Boolean).length,
  ...summarizeDurations(samples),
  latencyIsAnApprovedSla:false,pilotAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.FISHER_PHASE5_LOAD_ACK!=='synthetic-loopback'){
  console.error('Explicit FISHER_PHASE5_LOAD_ACK=synthetic-loopback required');
  process.exitCode=2;
 }else{
  try{
   const root=localProbeBase(process.argv[2]||'');
   const result=await runLocalProbe(root);
   console.log(JSON.stringify(result));
  }catch{
   console.error('Synthetic health/denial baseline probe failed');
   process.exitCode=2;
  }
 }
}
