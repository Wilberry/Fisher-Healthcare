#!/usr/bin/env node
// Fail-closed bootstrap for a private, synthetic-only Render API. No migrations.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
function url(value,https=true){
 try{const u=new URL(value);return (https?u.protocol==='https:':u.protocol==='postgresql:'||u.protocol==='postgres:')&&!!u.hostname&&!u.username&&!u.password&&!u.hash&&!u.search;}catch{return false;}
}
export function validateRenderSyntheticRuntime(env){
 const failures=[];
 if(env.FISHER_RENDER_SYNTHETIC_ACK!=='private-synthetic-no-phi')failures.push('acknowledgment');
 if(env.NODE_ENV!=='production')failures.push('node-environment');
 if(env.FISHER_PHASE2_BOOKING_MODE!=='disabled'||env.FISHER_PHASE2_PAYMENT_MODE!=='disabled')failures.push('booking-payment-isolation');
 if(env.FISHER_API_BIND_HOST!=='0.0.0.0')failures.push('container-bind');
 if(!/^\d{2,5}$/.test(env.PORT||'10000')||Number(env.PORT||10000)>65535)failures.push('port');
 for(const key of ['OIDC_ISSUER','OIDC_JWKS_URI'])if(!url(env[key]))failures.push(key.toLowerCase());
 if(typeof env.OIDC_AUDIENCE!=='string'||!/^[-a-zA-Z0-9_:.\/]{3,160}$/.test(env.OIDC_AUDIENCE))failures.push('oidc-audience');
 if(!env.DATABASE_URL||!/^postgres(?:ql)?:\/\/[^\s]+$/.test(env.DATABASE_URL))failures.push('database-reference');
 for(const key of ['PAYSTACK_SECRET_KEY','RESEND_API_KEY','FISHER_PHASE2_EMAIL_MODE','FISHER_AUTH_ALLOW_LOOPBACK_HTTP'])
  if(env[key])failures.push('prohibited-'+key.toLowerCase());
 return {valid:failures.length===0,failures,scope:'private-synthetic-api',
  migrationAuthorized:false,productionClinicalAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=validateRenderSyntheticRuntime(process.env);
 if(!result.valid){
  console.error('Render synthetic API startup refused: '+result.failures.join(', '));
  process.exitCode=2;
 }else{
  const child=spawn(process.execPath,['apps/api/dist/main.js'],{stdio:'inherit',env:process.env});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
  child.on('error',()=>{console.error('API process could not start');process.exitCode=1;});
  child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
 }
}
