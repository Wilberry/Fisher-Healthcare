import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

type Pending = { type:'pending'; state:string; nonce:string; verifier:string; next:string; expires:number };
export type PatientSession = { type:'session'; accessToken:string; subject:string; expires:number };
type Sealed = Pending|PatientSession;
const prefix=process.env.NODE_ENV==='production'?'__Host-':'';
const PENDING=prefix+'fisher_oidc_pending', SESSION=prefix+'fisher_patient_session';
const context=Buffer.from('fisher.patient.web.session.v1');
const unix=()=>Math.floor(Date.now()/1000);

export function loginConfig(){
 const issuer=process.env.OIDC_ISSUER;
 const jwks=process.env.OIDC_JWKS_URI;
 const audience=process.env.OIDC_AUDIENCE;
 const clientId=process.env.FISHER_OIDC_CLIENT_ID;
 const authorization=process.env.FISHER_OIDC_AUTHORIZATION_URL;
 const token=process.env.FISHER_OIDC_TOKEN_URL;
 const redirectUri=process.env.FISHER_OIDC_REDIRECT_URI;
 if(!issuer||!jwks||!audience||!clientId||!authorization||!token||!redirectUri) return null;
 let urls:URL[];
 try{urls=[issuer,jwks,authorization,token,redirectUri].map(v=>new URL(v));}
 catch{return null;}
 const local=process.env.NODE_ENV!=='production' &&
  process.env.FISHER_AUTH_ALLOW_LOOPBACK_HTTP==='synthetic-only';
 if(urls.some(u=>u.protocol!=='https:' &&
  !(local && u.protocol==='http:' && ['127.0.0.1','localhost'].includes(u.hostname))))
  return null;
 const configuredOrigin=process.env.FISHER_WEB_ORIGIN;
 if(!configuredOrigin)return null;
 try{
  if(new URL(redirectUri).origin!==new URL(configuredOrigin).origin||
   new URL(redirectUri).pathname!=='/auth/callback')return null;
 }catch{return null;}
 return {issuer,jwks,audience,clientId,authorization,token,redirectUri,origin:configuredOrigin};
}
function secret():Buffer{
 const encoded=process.env.FISHER_WEB_SESSION_KEY;
 if(!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded))throw new Error('Web session encryption unavailable');
 const key=Buffer.from(encoded,'base64url');
 if(key.length!==32)throw new Error('Web session key must contain 32 bytes');
 return key;
}
export function seal(value:Sealed):string{
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret(),nonce);
 cipher.setAAD(context);
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [nonce.toString('base64url'),data.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
export function unseal(raw:string|undefined):Sealed|null{
 if(!raw || raw.length>10000) return null;
 try{
  const parts=raw.split('.');
  if(parts.length!==3)return null;
  const [a,b,c]=parts;
  if(!a||!b||!c)return null;
  const iv=Buffer.from(a,'base64url'),tag=Buffer.from(c,'base64url');
  if(iv.length!==12||tag.length!==16)return null;
  const decipher=createDecipheriv('aes-256-gcm',secret(),iv);
  decipher.setAAD(context);decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(Buffer.from(b,'base64url')),decipher.final()]);
  const parsed:unknown=JSON.parse(plain.toString('utf8'));
  if(!parsed||typeof parsed!=='object')return null;
  const p=parsed as Record<string,unknown>;
  if(p.type==='pending' && typeof p.state==='string' && p.state.length===43 &&
   typeof p.nonce==='string'&&p.nonce.length===43 &&
   typeof p.verifier==='string'&&p.verifier.length===43 &&
   typeof p.next==='string'&&typeof p.expires==='number'&&p.expires>unix())
   return parsed as Pending;
  if(p.type==='session'&&typeof p.accessToken==='string'&&typeof p.subject==='string'&&
   typeof p.expires==='number'&&p.expires>unix()+15) return parsed as PatientSession;
  return null;
 }catch{return null;}
}
export function cookieNames(){return {pending:PENDING,session:SESSION};}
export function safeLocalRedirect(value:string|null|undefined):string{
 if(!value || !value.startsWith('/')||value.startsWith('//')||value.includes('\\')||
  [...value].some(char=>char.charCodeAt(0)<32))return '/account';
 return value.slice(0,300);
}
export function makePending(next:string):Pending{
 return {type:'pending',state:randomBytes(32).toString('base64url'),
  nonce:randomBytes(32).toString('base64url'),verifier:randomBytes(32).toString('base64url'),
  next:safeLocalRedirect(next),expires:unix()+600};
}
export function codeChallenge(verifier:string){
 return createHash('sha256').update(verifier).digest('base64url');
}
export function authCookieOptions(maxAge:number){
 return {httpOnly:true,secure:process.env.NODE_ENV==='production',
  sameSite:'lax' as const,path:'/',maxAge};
}
export async function readSession():Promise<PatientSession|null>{
 const store=await cookies();
 const payload=unseal(store.get(SESSION)?.value);
 return payload?.type==='session'?payload:null;
}
export async function exchangeCode(code:string,pending:Pending):Promise<PatientSession>{
 const config=loginConfig();
 if(!config)throw new Error('OIDC login not configured');
 const req=new URLSearchParams({grant_type:'authorization_code',code,
  redirect_uri:config.redirectUri,client_id:config.clientId,code_verifier:pending.verifier});
 if(process.env.FISHER_OIDC_CLIENT_SECRET)req.set('client_secret',process.env.FISHER_OIDC_CLIENT_SECRET);
 const result=await fetch(config.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:req,cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!result.ok)throw new Error('OIDC token exchange rejected');
 const body:unknown=await result.json();
 if(!body || typeof body!=='object')throw new Error('Invalid OIDC token response');
 const response=body as Record<string,unknown>;
 if(typeof response.id_token!=='string'||typeof response.access_token!=='string'||
   response.token_type!=='Bearer')throw new Error('OIDC response missing required tokens');
 const jwks=createRemoteJWKSet(new URL(config.jwks));
 const options={issuer:config.issuer,algorithms:['RS256','ES256']};
 const id=await jwtVerify(response.id_token,jwks,{...options,audience:config.clientId});
 const access=await jwtVerify(response.access_token,jwks,{...options,audience:config.audience});
 if(id.payload.nonce!==pending.nonce || !id.payload.sub || id.payload.sub!==access.payload.sub ||
  typeof access.payload.exp!=='number' || typeof access.payload.iat!=='number' ||
  access.payload.exp-access.payload.iat>3600 || access.payload.exp<=unix()+20)
  throw new Error('OIDC signed claims invalid');
 return {type:'session',accessToken:response.access_token,subject:id.payload.sub,
  expires:Math.min(access.payload.exp,unix()+3600)};
}
export function crossSiteRequest(request:Request):boolean{
 const origin=request.headers.get('origin');
 return !origin || origin!==new URL(request.url).origin;
}

export async function provisionPatientAccount(accessToken:string):Promise<void>{
 const root=process.env.FISHER_API_SERVER_URL;
 if(!root)throw new Error('API server unavailable');
 const base=new URL(root);
 if(!['http:','https:'].includes(base.protocol))throw new Error('API URL invalid');
 if(process.env.NODE_ENV==='production' && base.protocol!=='https:')throw new Error('Secure API required');
 const url=new URL('/api/v1/me/bootstrap',base);
 const result=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+accessToken},
  cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!result.ok)throw new Error('Patient account provisioning unavailable');
}
