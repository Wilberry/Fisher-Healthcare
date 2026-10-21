import {readSession} from '../../../../../../lib/patient-auth';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unavailable=(status:number)=>Response.json(
 {error:status===401?'Sign in required':'Secure document unavailable'},
 {status,headers:{'cache-control':'no-store'}});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return unavailable(404);
 const session=await readSession();
 if(!session)return unavailable(401);
 const root=process.env.FISHER_API_SERVER_URL;
 if(!root)return unavailable(503);
 try{
  const api=new URL(root);
  if(!['https:','http:'].includes(api.protocol)||
    (process.env.NODE_ENV==='production'&&api.protocol!=='https:')||
    api.username||api.password||api.hash||api.pathname!=='/'||api.search)
    return unavailable(503);
  const target=new URL('/api/v1/results/'+id+'/document',api);
  const res=await fetch(target,{method:'GET',
    headers:{authorization:'Bearer '+session.accessToken},
    cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(res.status===401)return unavailable(401);
  if(!res.ok||res.headers.get('content-type')?.split(';')[0]!=='application/pdf')
    return unavailable(res.status===503?503:404);
  const size=Number(res.headers.get('content-length')||'0');
  if(!Number.isSafeInteger(size)||size>2*1024*1024)return unavailable(503);
  const bytes=await res.arrayBuffer();
  if(bytes.byteLength<1||bytes.byteLength>2*1024*1024)return unavailable(503);
  return new Response(bytes,{status:200,headers:{
    'content-type':'application/pdf','cache-control':'private, no-store',
    'content-disposition':'attachment; filename="fisher-laboratory-result.pdf"',
    'x-content-type-options':'nosniff','content-security-policy':'sandbox'
  }});
 }catch{return unavailable(503);}
}
