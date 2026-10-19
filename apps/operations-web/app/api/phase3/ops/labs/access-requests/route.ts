import {forwardOperationsAction} from '../../../../../../../lib/operations-gateway';
export async function POST(request:Request){
  return forwardOperationsAction(request,`ops/labs/access-requests`);
}
