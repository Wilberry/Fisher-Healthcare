import { NextResponse, type NextRequest } from 'next/server';
import { crossSiteRequest } from '../../../../../lib/patient-auth';
import { patientApi } from '../../../../../lib/patient-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types=['test','laboratory','zone','offering','slot'] as const;
const creation:Record<string,string>={
 test:'tests',laboratory:'laboratories',zone:'zones',offering:'offerings',slot:'slots'
};
export async function POST(req:NextRequest,{params}:{params:Promise<{action:string}>}){
 if(crossSiteRequest(req))return NextResponse.json({error:'Invalid Origin'},{status:403});
 const {action}=await params;
 const length=Number(req.headers.get('content-length')??0);
 if(length>6000)return NextResponse.json({error:'Request too large'},{status:413});
 let data:unknown;
 try{const raw=await req.text();if(raw.length>6000)throw Error();data=JSON.parse(raw) as unknown;}
 catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 if(!data||typeof data!=='object'||Array.isArray(data))
  return NextResponse.json({error:'Invalid request'},{status:400});
 const body=data as Record<string,unknown>;
 const id=body.id, resourceType=body.resourceType;
 let route:string,payload:Record<string,unknown>;
 if(action==='catalog-create'){
  if(typeof resourceType!=='string'||!types.some(t=>t===resourceType)||!body.values||
    typeof body.values!=='object'||Array.isArray(body.values))
   return NextResponse.json({error:'Invalid catalogue input'},{status:400});
  route='ops/catalog/'+creation[resourceType];
  payload=body.values as Record<string,unknown>;
 }else{
  if(typeof id!=='string'||!uuid.test(id)||typeof body.evidenceReference!=='string'||
   !/^[A-Za-z0-9._:-]{10,128}$/.test(body.evidenceReference))
   return NextResponse.json({error:'Reviewed identifier required'},{status:400});
  payload={evidenceReference:body.evidenceReference};
  switch(action){
   case 'patient-approve':route='ops/patient-relationships/'+id+'/approve-booking';break;
   case 'address-approve':route='ops/patient-addresses/'+id+'/approve';break;
   case 'guest-assign':route='ops/guest-booking/requests/'+id+'/assign';break;
   case 'support-assign':route='ops/work-queue/support/'+id+'/assigned';break;
   case 'support-resolve':route='ops/work-queue/support/'+id+'/resolved';break;
   case 'payment-ack':route='ops/work-queue/payment-exceptions/'+id+'/acknowledge';break;
   case 'catalog-approve':
    if(typeof resourceType!=='string'||!types.some(t=>t===resourceType))
     return NextResponse.json({error:'Invalid catalogue type'},{status:400});
    route='ops/catalog/reviews/'+resourceType+'/'+id+'/approve';break;
   default:return NextResponse.json({error:'Unknown staff action'},{status:404});
  }
 }
 const result=await patientApi(route,'POST',payload);
 return NextResponse.json(result.data??{error:'Staff review unavailable'},{status:result.status,
  headers:{'cache-control':'no-store'}});
}
