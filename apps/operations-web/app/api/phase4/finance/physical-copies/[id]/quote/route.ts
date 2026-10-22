import {forwardOperationsAction} from '../../../../../../../lib/operations-gateway';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return Response.json({error:'Invalid quote ID'},{status:400});
 return forwardOperationsAction(request,'finance/physical-copies/'+id+'/quote');
}
