import { NextResponse, type NextRequest } from 'next/server';
import { crossSiteRequest } from '../../../../../../../lib/patient-auth';
import { patientApi } from '../../../../../../../lib/patient-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req:NextRequest,{params}:{
 params:Promise<{id:string;action:string}>}){
 if(crossSiteRequest(req))return NextResponse.json({error:'Invalid request origin'},{status:403});
 const {id,action}=await params;
 if(!uuid.test(id) || !['cancel','reschedule','reconcile'].includes(action))
  return NextResponse.json({error:'Not found'},{status:404});
 if(Number(req.headers.get('content-length')??0)>1000)return NextResponse.json({error:'Request too large'},{status:413});
 let body:unknown={};
 try{const raw=await req.text();if(raw.length>1000)throw Error();
  if(raw.length)body=JSON.parse(raw) as unknown;
 }catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid request'},{status:400});
 const payload=body as Record<string,unknown>;
 const key=req.headers.get('idempotency-key')??undefined;
 if(action==='reschedule'&&(!key||!/^[A-Za-z0-9_-]{8,128}$/.test(key)))
  return NextResponse.json({error:'Idempotency key required'},{status:400});
 if(action==='reschedule'&&(!uuid.test(String(payload.slotId??''))||Object.keys(payload).length!==1))
  return NextResponse.json({error:'Invalid collection slot'},{status:400});
 if(action!=='reschedule'&&Object.keys(payload).length)
  return NextResponse.json({error:'Unexpected payload'},{status:400});
 const route=action==='reconcile'?'payments/'+id+'/reconcile':'bookings/'+id+'/'+action;
 const result=await patientApi(route,'POST',body,key);
 return NextResponse.json(result.data??{error:'Action unavailable'},{status:result.status,
  headers:{'cache-control':'no-store'}});
}
