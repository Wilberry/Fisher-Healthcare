import {offlineStaffContext} from '../../../../../lib/staff-auth';
export const dynamic='force-dynamic';
export async function GET(){
  const context=await offlineStaffContext();
  return Response.json(context.status===200?{enabled:true,scope:context.scope}:
    {enabled:false,error:context.status===401?'Staff sign-in required':
      'Synthetic offline recovery unavailable'},{
    status:context.status,
    headers:{'cache-control':'no-store','pragma':'no-cache'}
  });
}
