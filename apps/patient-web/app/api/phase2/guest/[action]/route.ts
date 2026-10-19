import { NextResponse, type NextRequest } from 'next/server';
import { crossSiteRequest } from '../../../../../lib/patient-auth';
export async function POST(req:NextRequest,{params}:{params:Promise<{action:string}>}){
 if(crossSiteRequest(req))return NextResponse.json({error:'Origin required'},{status:403});
 const {action}=await params;
 if(!['start','verify'].includes(action))return NextResponse.json({error:'Not found'},{status:404});
 let data:unknown;
 try{
  if(Number(req.headers.get('content-length')??0)>1500)throw Error();
  const raw=await req.text();if(raw.length>1500)throw Error();
  data=JSON.parse(raw) as unknown;
 }catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 try{
  const root=process.env.FISHER_API_SERVER_URL;
  if(!root)throw Error();
  const origin=new URL(root);
  if((origin.protocol!=='https:' && !(process.env.NODE_ENV!=='production' &&
     origin.protocol==='http:' && ['localhost','127.0.0.1'].includes(origin.hostname))))
    throw Error();
  const uri=new URL('/api/v1/guest-booking/'+action,origin);
  const response=await fetch(uri,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(12000)});
  const result:unknown=await response.json().catch(()=>null);
  return NextResponse.json(result??{error:'Guest intake unavailable'},{status:response.status,
   headers:{'cache-control':'no-store'}});
 }catch{return NextResponse.json({error:'Guest verification service unavailable'},{status:503});}
}
