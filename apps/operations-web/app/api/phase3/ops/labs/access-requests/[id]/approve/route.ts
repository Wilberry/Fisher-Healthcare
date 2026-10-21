import {forwardOperationsAction} from '../../../../../../../../lib/operations-gateway';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const params=await context.params;
  if(![params.id].every(value=>uuid.test(value)))
    return Response.json({error:'Invalid identifier'},{status:400});
  return forwardOperationsAction(request,`ops/labs/access-requests/${params.id.toLowerCase()}/approve`);
}
