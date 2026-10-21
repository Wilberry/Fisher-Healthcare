import {crossSite,oidcConfig,readStaffSession,verifyActiveStaff,StaffSessionError} from './staff-auth';

// Deliberately narrow mutation set. Never accept a browser-selected upstream host.
const allow = [
  /^ops\/assignments$/,
  /^ops\/exceptions\/[0-9a-f-]{36}\/resolve$/,
  /^ops\/lab-manifests$/,
  /^ops\/lab-manifests\/[0-9a-f-]{36}\/receipt$/,
  /^ops\/labs\/access-requests$/,
  /^ops\/labs\/access-requests\/[0-9a-f-]{36}\/approve$/,
  /^ops\/labs\/access-requests\/[0-9a-f-]{36}\/reject$/,
  /^ops\/labs\/access\/[0-9a-f-]{36}\/staff\/[0-9a-f-]{36}\/revoke$/,
  /^ops\/results\/intake$/,
  /^ops\/results\/[0-9a-f-]{36}\/release$/,
  /^finance\/reconciliation\/runs$/,
  /^finance\/refunds$/,
  /^finance\/refunds\/[0-9a-f-]{36}\/review$/,
  /^finance\/lab-payables$/,
  /^finance\/lab-settlements$/,
  /^finance\/lab-settlements\/[0-9a-f-]{36}\/review$/,
  /^finance\/physical-copies\/[0-9a-f-]{36}\/quote$/
] as const;

const response = (status:number,error:string) =>
  Response.json({error},{status,headers:{'cache-control':'no-store'}});
export async function forwardOperationsAction(request:Request,path:string):Promise<Response>{
  if(crossSite(request))return response(403,'Origin verification failed');
  if(!allow.some(p=>p.test(path)))return response(404,'Unknown operation');
  if(request.method!=='POST')return response(405,'Method not allowed');
  if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
    return response(415,'JSON required');
  const declared=Number(request.headers.get('content-length')??'0');
  if(!Number.isFinite(declared)||declared>16384||declared<0)
    return response(413,'Payload too large');
  const session=await readStaffSession(),config=oidcConfig();
  if(!session)return response(401,'Staff sign-in required');
  if(!config)return response(503,'Operations service unavailable');
  let payload:string;
  try{
    payload=await request.text();
    if(Buffer.byteLength(payload,'utf8')>16384)return response(413,'Payload too large');
    const parsed:unknown=JSON.parse(payload);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return response(400,'Invalid operational command');
  }catch{return response(400,'Invalid JSON');}
  try{
    const subject=await verifyActiveStaff(session.accessToken,config.api);
    if(subject!==session.subject)return response(401,'Staff identity changed');
    const upstream=await fetch(new URL('/api/v1/'+path,config.api),{
      method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer '+session.accessToken,
        'content-type':'application/json'},body:payload
    });
    if(!upstream.ok){
      const status=[400,401,403,404,409,413,422,503].includes(upstream.status)?
        upstream.status:503;
      return response(status,status===409?'State conflict; refresh and review before retrying':
        'Operational command rejected');
    }
    const result:unknown=await upstream.json();
    return Response.json(result,{headers:{'cache-control':'no-store'}});
  }catch(error){
    if(error instanceof StaffSessionError){
      if(error.reason==='reauth_required')return response(401,'Staff session expired; sign in again');
      if(error.reason==='access_denied')return response(403,'Staff permission denied');
    }
    return response(503,'Operations service unavailable');
  }
}
