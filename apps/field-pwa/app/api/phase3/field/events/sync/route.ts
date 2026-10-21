import {forwardFieldAction} from '../../../../../../lib/staff-auth';
export async function POST(request:Request){
  return forwardFieldAction(request,'field/events/sync');
}
