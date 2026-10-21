import {forwardFieldAction} from '../../../../../../../lib/staff-auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  if(!uuid.test(id))return Response.json({error:'Invalid handoff identifier'},{status:400});
  return forwardFieldAction(request,'field/assignments/'+id.toLowerCase()+'/handoff-offers');
}
