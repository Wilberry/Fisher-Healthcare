import {crossSiteRequest} from '../../../../../../lib/patient-auth';
import {patientApi} from '../../../../../../lib/patient-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(crossSiteRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
 const {id}=await params;
 if(!uuid.test(id))return Response.json({error:'Invalid patient identifier'},{status:400});
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
  return Response.json({error:'JSON required'},{status:415});
 const body=await request.text().catch(()=>null);
 if(!body||body.length>128)return Response.json({error:'Invalid preference'},{status:400});
 let value:unknown;
 try{value=JSON.parse(body);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==1||!('enabled' in value)||typeof value.enabled!=='boolean')
    return Response.json({error:'Invalid preference'},{status:400});
 const upstream=await patientApi('patients/'+id+'/result-email-preference','POST',
   {enabled:value.enabled});
 if(!upstream.ok)return Response.json({error:'Preference not confirmed'},{
   status:upstream.status===401?401:upstream.status===403?403:503,
   headers:{'cache-control':'no-store'}});
 return Response.json({saved:true},{headers:{'cache-control':'no-store'}});
}
