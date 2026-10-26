import {forwardOperationsAction} from '../../../../../../../lib/operations-gateway';
const codes=new Set(['custody_incidents','outbox_dead_letters','result_email_failures']);
export async function POST(request:Request,{params}:{
 params:Promise<{code:string}>
}){
 const {code}=await params;
 if(!codes.has(code))return Response.json({error:'Unknown synthetic alert'},{status:400});
 return forwardOperationsAction(request,'ops/pilot-readiness/alerts/'+code+'/acknowledge');
}
