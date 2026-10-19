import { createCipheriv,createDecipheriv,createHash,createHmac,randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
export type StaffSession={type:'session';accessToken:string;subject:string;expires:number};
type Pending={type:'pending';state:string;verifier:string;next:string;expires:number};
type Sealed=StaffSession|Pending;
const scope='field';
const ctx=Buffer.from('fisher.staff.'+scope+'.session.v1');
const hostPrefix=process.env.NODE_ENV==='production'?'__Host-':'';
const pendingName=hostPrefix+'fisher_'+scope+'_oidc_pending';
const sessionName=hostPrefix+'fisher_'+scope+'_staff_session';
const now=()=>Math.floor(Date.now()/1000);
const allowedCaps=scope==='operations'?['dispatch:manage','labs:manage','staff:manage']:
  ['specimens:collect','specimens:transport'];
export function safeReturnPath(raw:string|null|undefined):string {
  const fallback=scope==='operations'?'/dispatch':'/visits';
  if(!raw||raw.length>300||!raw.startsWith('/')||raw.startsWith('//')||
     raw.includes('\\')||[...raw].some(ch=>ch.charCodeAt(0)<32))return fallback;
  return raw;
}
function tokenKey():Buffer {
  const raw=process.env.FISHER_STAFF_WEB_SESSION_KEY;
  if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))throw new Error('Staff session key not configured');
  const key=Buffer.from(raw,'base64url');
  if(key.length!==32)throw new Error('Invalid staff session key');
  return key;
}
export function seal(payload:Sealed):string {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',tokenKey(),iv);
  cipher.setAAD(ctx);
  const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return [iv.toString('base64url'),data.toString('base64url'),
    cipher.getAuthTag().toString('base64url')].join('.');
}
export function unseal(raw:string|undefined):Sealed|null {
  if(!raw||raw.length>10000)return null;
  try{
    const parts=raw.split('.');
    if(parts.length!==3)return null;
    const [ivText,data,tagText]=parts;
    if(!ivText||!data||!tagText)return null;
    const iv=Buffer.from(ivText,'base64url'),tag=Buffer.from(tagText,'base64url');
    if(iv.length!==12||tag.length!==16)return null;
    const decipher=createDecipheriv('aes-256-gcm',tokenKey(),iv);
    decipher.setAAD(ctx);decipher.setAuthTag(tag);
    const plaintext=Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]);
    const p:unknown=JSON.parse(plaintext.toString('utf8'));
    if(!p||typeof p!=='object')return null;
    const v=p as Record<string,unknown>;
    if(v.type==='pending'&&typeof v.state==='string'&&v.state.length===43&&
       typeof v.verifier==='string'&&v.verifier.length===43&&
       typeof v.next==='string'&&v.next.length<=300&&typeof v.expires==='number'&&
       v.expires>now())return p as Pending;
    if(v.type==='session'&&typeof v.subject==='string'&&v.subject.length>0&&
       typeof v.accessToken==='string'&&v.accessToken.length>0&&v.accessToken.length<8000&&
       typeof v.expires==='number'&&v.expires>now()+10)return p as StaffSession;
    return null;
  }catch{return null;}
}
export function cookieNames(){return {pending:pendingName,session:sessionName};}
export function cookieOptions(age:number){
  return {httpOnly:true,secure:process.env.NODE_ENV==='production',
    sameSite:'lax' as const,path:'/',maxAge:age};
}
function permittedUrl(value:string):URL|null{
  try{
    const url=new URL(value);
    if(url.username||url.password||url.hash)return null;
    if(url.protocol==='https:')return url;
    if(process.env.NODE_ENV!=='production'&&
      process.env.FISHER_STAFF_AUTH_ALLOW_LOOPBACK_HTTP==='synthetic-only'&&
      url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))return url;
    return null;
  }catch{return null;}
}
export function oidcConfig(){
  const issuer=process.env.OIDC_ISSUER,clientId=process.env.FISHER_STAFF_OIDC_CLIENT_ID,
    authorize=process.env.FISHER_STAFF_OIDC_AUTHORIZATION_URL,
    token=process.env.FISHER_STAFF_OIDC_TOKEN_URL,
    redirect=process.env.FISHER_STAFF_OIDC_REDIRECT_URI,
    origin=process.env.FISHER_STAFF_WEB_ORIGIN,
    api=process.env.FISHER_API_SERVER_URL;
  if(!issuer||!clientId||!authorize||!token||!redirect||!origin||!api)return null;
  const urls=[issuer,authorize,token,redirect,origin,api].map(permittedUrl);
  if(urls.some(url=>!url))return null;
  const redirectUrl=urls[3]!,webUrl=urls[4]!,apiUrl=urls[5]!;
  if(redirectUrl.origin!==webUrl.origin||redirectUrl.pathname!=='/auth/callback'||
     webUrl.pathname!=='/'||webUrl.search||apiUrl.pathname!=='/'||
     apiUrl.search)return null;
  return {issuer,clientId,authorize,token,redirect,origin:webUrl.origin,api:apiUrl.origin};
}
export function makePending(next:string):Pending{
  return {type:'pending',state:randomBytes(32).toString('base64url'),
    verifier:randomBytes(32).toString('base64url'),next:safeReturnPath(next),
    expires:now()+600};
}
export function challenge(verifier:string):string{
  return createHash('sha256').update(verifier).digest('base64url');
}
export function crossSite(request:Request):boolean{
  const origin=request.headers.get('origin');
  const requested=new URL(request.url).origin;
  const configured=process.env.FISHER_STAFF_WEB_ORIGIN;
  if(!configured&&process.env.NODE_ENV==='production')return true;
  if(configured){
    try{
      const trusted=new URL(configured);
      const loopback=process.env.NODE_ENV!=='production'&&
        process.env.FISHER_STAFF_AUTH_ALLOW_LOOPBACK_HTTP==='synthetic-only'&&
        trusted.protocol==='http:'&&['127.0.0.1','localhost'].includes(trusted.hostname);
      if(trusted.origin!==configured||(!loopback&&trusted.protocol!=='https:'))
        return true;
      return !origin||origin!==trusted.origin||requested!==trusted.origin;
    }catch{return true;}
  }
  return !origin||origin!==requested;
}
export async function readStaffSession():Promise<StaffSession|null>{
  const cookieStore=await cookies();
  const payload=unseal(cookieStore.get(sessionName)?.value);
  return payload?.type==='session'?payload:null;
}
export class StaffSessionError extends Error {
  constructor(readonly reason:'reauth_required'|'access_denied'|'service_unavailable') {
    super(reason);
    this.name='StaffSessionError';
  }
}
export async function verifyActiveStaff(accessToken:string,api:string):Promise<string>{
  const auth={authorization:'Bearer '+accessToken};
  const urls=['/api/v1/identity/session','/api/v1/access/staff/capabilities'];
  let values:Response[];
  try {
    values=await Promise.all(urls.map(path=>fetch(new URL(path,api),{
      headers:auth,cache:'no-store',signal:AbortSignal.timeout(8000)
    })));
  } catch {throw new StaffSessionError('service_unavailable');}
  if(values.some(v=>v.status===401))throw new StaffSessionError('reauth_required');
  if(values.some(v=>v.status===403))throw new StaffSessionError('access_denied');
  if(values.some(v=>!v.ok))throw new StaffSessionError('service_unavailable');
  const principal:unknown=await values[0]!.json();
  const permissions:unknown=await values[1]!.json();
  if(!principal||typeof principal!=='object'||!('subject' in principal)||
     typeof principal.subject!=='string'||!principal.subject||
     !('authenticated' in principal)||principal.authenticated!==true)
    throw new StaffSessionError('reauth_required');
  if(!permissions||typeof permissions!=='object'||!('capabilities' in permissions)||
    !Array.isArray(permissions.capabilities)||
    !permissions.capabilities.some(cap=>typeof cap==='string'&&allowedCaps.includes(cap)))
    throw new StaffSessionError('access_denied');
  return principal.subject;
}
export async function exchangeCode(code:string,pending:Pending):Promise<StaffSession>{
  const config=oidcConfig();
  if(!config)throw new Error('Staff SSO is not configured');
  const params=new URLSearchParams({
    grant_type:'authorization_code',code,redirect_uri:config.redirect,
    client_id:config.clientId,code_verifier:pending.verifier
  });
  const secret=process.env.FISHER_STAFF_OIDC_CLIENT_SECRET;
  if(secret)params.set('client_secret',secret);
  const exchanged=await fetch(config.token,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:params,cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!exchanged.ok)throw new Error('Staff token exchange failed');
  const raw:unknown=await exchanged.json();
  if(!raw||typeof raw!=='object')throw new Error('Invalid staff token response');
  const parsed=raw as Record<string,unknown>;
  if(typeof parsed.access_token!=='string'||parsed.access_token.length>8000||
     parsed.token_type!=='Bearer'||typeof parsed.expires_in!=='number'||
     !Number.isSafeInteger(parsed.expires_in)||parsed.expires_in<30||
     parsed.expires_in>3600)throw new Error('Invalid staff access token');
  // Identity and MFA are verified by the signed-JWT API, never by trusting
  // a browser-supplied role or an unverified ID-token payload.
  const subject=await verifyActiveStaff(parsed.access_token,config.api);
  return {type:'session',accessToken:parsed.access_token,
    subject,expires:now()+Math.min(3600,parsed.expires_in)};
}
export type StaffApiState='signed_out'|'authorized'|'access_denied'|'reauth_required'|'service_unavailable';
export async function staffApi(path:string){
  const absent=(state:StaffApiState,signedIn:boolean)=>({
    signedIn,authorized:false as const,state,
    records:[] as Record<string,unknown>[]
  });
  const session=await readStaffSession(),cfg=oidcConfig();
  if(!session)return absent('signed_out',false);
  if(!cfg)return absent('service_unavailable',true);
  try{
    const subject=await verifyActiveStaff(session.accessToken,cfg.api);
    if(subject!==session.subject)throw new StaffSessionError('reauth_required');
    if(!/^(?:ops|field)\/[a-zA-Z0-9/_-]+$/.test(path))
      throw new StaffSessionError('access_denied');
    const url=new URL('/api/v1/'+path,cfg.api);
    const response=await fetch(url,{headers:{authorization:'Bearer '+session.accessToken},
      cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(response.status===401)return absent('reauth_required',false);
    if(response.status===403)return absent('access_denied',true);
    if(!response.ok)return absent('service_unavailable',true);
    const data:unknown=await response.json();
    const rows=data&&typeof data==='object'&&'data' in data &&
      Array.isArray(data.data)?data.data:[];
    return {signedIn:true as const,authorized:true as const,state:'authorized' as const,
      records:rows.filter((entry):entry is Record<string,unknown> =>
        !!entry&&typeof entry==='object'&&!Array.isArray(entry))};
  }catch(error){
    if(error instanceof StaffSessionError)
      return absent(error.reason,error.reason!=='reauth_required');
    return absent('service_unavailable',true);
  }
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type FieldSpecimen={id:string;status:string;custodyVersion:number};
export type FieldAssignment={
  id:string;status:string;eventVersion:number;
  collectionWindowStart:string;specimens:FieldSpecimen[]
};
export async function staffAssignmentDetail(id:string):Promise<{
  authorized:boolean;assignment:FieldAssignment|null
}>{
  if(!uuid.test(id))return {authorized:false,assignment:null};
  const session=await readStaffSession(),cfg=oidcConfig();
  if(!session||!cfg)return {authorized:false,assignment:null};
  try{
    const subject=await verifyActiveStaff(session.accessToken,cfg.api);
    if(subject!==session.subject)throw new Error('Session principal mismatch');
    const url=new URL('/api/v1/field/assignments/'+id,cfg.api);
    const response=await fetch(url,{headers:{authorization:'Bearer '+session.accessToken},
      cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return {authorized:false,assignment:null};
    const raw:unknown=await response.json();
    if(!raw||typeof raw!=='object'||!('data' in raw)||
       !raw.data||typeof raw.data!=='object')return {authorized:false,assignment:null};
    const d=raw.data as Record<string,unknown>;
    if(d.id!==id||typeof d.status!=='string'||
       typeof d.event_version!=='number'||!Number.isSafeInteger(d.event_version)||
       !Array.isArray(d.specimens))
      return {authorized:false,assignment:null};
    const specimens:FieldSpecimen[]=d.specimens.filter(
      (entry):entry is Record<string,unknown>=>!!entry&&typeof entry==='object'&&!Array.isArray(entry)
    ).filter(entry=>typeof entry.id==='string'&&uuid.test(entry.id)&&
      typeof entry.status==='string'&&typeof entry.custody_version==='number'&&
      Number.isSafeInteger(entry.custody_version)).map(entry=>({
        id:entry.id as string,status:entry.status as string,
        custodyVersion:entry.custody_version as number
      }));
    return {authorized:true,assignment:{
      id,status:d.status,eventVersion:d.event_version as number,
      collectionWindowStart:typeof d.collection_window_start==='string'?
        d.collection_window_start:'',
      specimens
    }};
  }catch{return {authorized:false,assignment:null};}
}
export async function forwardFieldAction(request:Request,path:string):Promise<Response>{
  // The browser never receives a bearer token, and cannot choose arbitrary
  // upstream URLs, operations endpoints or clinical-result APIs.
  const allowed=[
    /^field\/assignments\/[0-9a-f-]{36}\/events$/,
    /^field\/specimens\/[0-9a-f-]{36}\/label-check$/,
    /^field\/specimens\/[0-9a-f-]{36}\/events$/,
    /^field\/specimens\/[0-9a-f-]{36}\/incident$/,
    /^field\/assignments\/[0-9a-f-]{36}\/handoff-offers$/,
    /^field\/handoff-offers\/[0-9a-f-]{36}\/ack$/,
    /^field\/events\/sync$/
  ];
  const reject=(status:number,error:string)=>Response.json({error},{status,
    headers:{'cache-control':'no-store'}});
  if(crossSite(request))return reject(403,'Origin verification failed');
  if(!allowed.some(pattern=>pattern.test(path)))return reject(404,'Unknown field action');
  if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
    return reject(415,'JSON required');
  const declared=Number(request.headers.get('content-length')??'0');
  if(!Number.isFinite(declared)||declared<0||declared>16384)
    return reject(413,'Payload too large');
  const session=await readStaffSession(),cfg=oidcConfig();
  if(!session)return reject(401,'Staff sign-in required');
  if(!cfg)return reject(503,'Staff service unavailable');
  let raw:string;
  try{
    raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>16384)return reject(413,'Payload too large');
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return reject(400,'Invalid field action');
  }catch{return reject(400,'Invalid JSON');}
  try{
    const subject=await verifyActiveStaff(session.accessToken,cfg.api);
    if(subject!==session.subject)return reject(401,'Staff identity changed');
    const result=await fetch(new URL('/api/v1/'+path,cfg.api),{
      method:'POST',headers:{
        authorization:'Bearer '+session.accessToken,
        'content-type':'application/json'
      },body:raw,cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if(!result.ok){
      const status=[400,401,403,404,409,413,422,503].includes(result.status)?
        result.status:503;
      return reject(status,status===409?'Field state conflict requires review':
        'Field action rejected');
    }
    const content:unknown=await result.json();
    return Response.json(content,{status:200,headers:{'cache-control':'no-store'}});
  }catch(error){
    if(error instanceof StaffSessionError){
      if(error.reason==='reauth_required')return reject(401,'Staff session expired; sign in again');
      if(error.reason==='access_denied')return reject(403,'Field staff permission denied');
    }
    return reject(503,'Field service unavailable');
  }
}


/**
 * Handoff IDs and the frozen specimen set are verified by the assigned courier
 * API. No expected barcode, patient contact or lab result is returned.
 */
export async function staffCourierHandoff(id:string):Promise<{
  authorized:boolean;id:string;status:string;
  specimens:{id:string;status:string}[]
}>{
  const denied={authorized:false,id:'',status:'',specimens:[]};
  const re=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!re.test(id))return denied;
  const session=await readStaffSession(),cfg=oidcConfig();
  if(!session||!cfg)return denied;
  try{
    const principal=await verifyActiveStaff(session.accessToken,cfg.api);
    if(principal!==session.subject)return denied;
    const response=await fetch(new URL('/api/v1/field/handoff-offers/'+id.toLowerCase(),cfg.api),{
      headers:{authorization:'Bearer '+session.accessToken},
      cache:'no-store',signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return denied;
    const raw:unknown=await response.json();
    if(!raw||typeof raw!=='object'||!('data' in raw)||!raw.data||
       typeof raw.data!=='object'||Array.isArray(raw.data))return denied;
    const value=raw.data as Record<string,unknown>;
    if(value.id!==id.toLowerCase()||typeof value.status!=='string'||
       !Array.isArray(value.specimens))return denied;
    const specimens=value.specimens.filter(
      (item):item is Record<string,unknown> =>
        !!item&&typeof item==='object'&&!Array.isArray(item)
    ).filter(item=>typeof item.specimen_id==='string'&&re.test(item.specimen_id)&&
      typeof item.status==='string').map(item=>({
      id:item.specimen_id as string,status:item.status as string
    }));
    return {authorized:true,id:id.toLowerCase(),status:value.status,specimens};
  }catch{return denied;}
}


/**
 * Synthetic-only browser queue ownership. No role, name, token or subject is
 * exposed in the response. The HMAC is stable across same-user reauthentication.
 */
export async function offlineStaffContext():Promise<{
  status:200|401|503;scope?:string
}>{
  if(process.env.NODE_ENV==='production'||
     process.env.FISHER_PHASE3_OFFLINE_DEMO_MODE!=='synthetic-only')
    return {status:503};
  const session=await readStaffSession(),cfg=oidcConfig();
  if(!session)return {status:401};
  if(!cfg)return {status:503};
  try{
    const subject=await verifyActiveStaff(session.accessToken,cfg.api);
    if(subject!==session.subject)return {status:401};
    const scope=createHmac('sha256',tokenKey())
      .update('fisher:phase3:synthetic:field:owner:v1:'+subject).digest('hex');
    return {status:200,scope};
  }catch(error){
    if(error instanceof StaffSessionError&&
       ['reauth_required','access_denied'].includes(error.reason))
      return {status:401};
    return {status:503};
  }
}
