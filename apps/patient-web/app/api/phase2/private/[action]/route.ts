import { NextResponse, type NextRequest } from 'next/server';
import { crossSiteRequest } from '../../../../../lib/patient-auth';
import { patientApi } from '../../../../../lib/patient-api';
const routes:Record<string,string>={draft:'booking-drafts',commit:'bookings',checkout:'payments/checkout',patient:'patients'};
export async function POST(request:NextRequest,{params}:{params:Promise<{action:string}>}){
 if(crossSiteRequest(request))return NextResponse.json({error:'Invalid request origin'},{status:403});
 const {action}=await params;
 const path=routes[action];
 if(!path)return NextResponse.json({error:'Not found'},{status:404});
 const len=Number(request.headers.get('content-length')??0);
 if(len>12000)return NextResponse.json({error:'Request too large'},{status:413});
 let raw='';
 try{raw=await request.text();}catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 if(raw.length>12000)return NextResponse.json({error:'Request too large'},{status:413});
 let body:unknown;
 try{body=JSON.parse(raw) as unknown;}
 catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 const key=request.headers.get('idempotency-key')??undefined;
 if((action==='commit' || action==='checkout') && (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)))
  return NextResponse.json({error:'Idempotency key required'},{status:400});
 const reply=await patientApi(path,'POST',body,key);
 return NextResponse.json(reply.data??{error:'Unable to complete this operation'},{status:reply.status,
  headers:{'cache-control':'no-store'}});
}
