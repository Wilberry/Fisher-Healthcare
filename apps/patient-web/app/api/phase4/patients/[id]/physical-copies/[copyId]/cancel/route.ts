import {crossSiteRequest} from '../../../../../../../../lib/patient-auth';
import {patientApi} from '../../../../../../../../lib/patient-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function POST(request:Request,{params}:{
 params:Promise<{id:string;copyId:string}>
}){
 if(crossSiteRequest(request))return Response.json({error:'Invalid origin'},{status:403});
 const {id,copyId}=await params;
 if(!uuid.test(id)||!uuid.test(copyId))
   return Response.json({error:'Invalid request'},{status:400});
 const result=await patientApi('patients/'+id+'/physical-copies/'+copyId+'/cancel','POST',{});
 if(!result.ok)return Response.json({error:'Cancellation not confirmed'},{
   status:[401,403,409].includes(result.status)?result.status:503,
   headers:{'cache-control':'no-store'}});
 return Response.json(result.data,{headers:{'cache-control':'no-store'}});
}
