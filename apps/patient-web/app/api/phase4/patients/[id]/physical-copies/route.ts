import {crossSiteRequest} from '../../../../../../lib/patient-auth';
import {patientApi} from '../../../../../../lib/patient-api';
import {parsePhysicalCopyRequest} from '../../../../../../lib/physical-copy-input';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(crossSiteRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
 const {id}=await params;
 if(!uuid.test(id))return Response.json({error:'Invalid patient ID'},{status:400});
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
   return Response.json({error:'JSON required'},{status:415});
 const text=await request.text().catch(()=>null);
 if(!text||text.length>512)return Response.json({error:'Invalid request'},{status:400});
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 const value=parsePhysicalCopyRequest(raw);
 if(!value)return Response.json({error:'Invalid request'},{status:400});
 const result=await patientApi('patients/'+id+'/physical-copies','POST',value);
 if(!result.ok)return Response.json({error:'Request not confirmed'},{
   status:[401,403,409].includes(result.status)?result.status:503,
   headers:{'cache-control':'no-store'}});
 return Response.json(result.data,{headers:{'cache-control':'no-store'}});
}
