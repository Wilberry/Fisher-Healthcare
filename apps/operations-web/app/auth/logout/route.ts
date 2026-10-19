import { NextResponse,type NextRequest } from 'next/server';
import {cookieNames,crossSite} from '../../../lib/staff-auth';
export async function POST(request:NextRequest){
  if(crossSite(request))return NextResponse.json({error:'Origin verification failed'},{status:403});
  const response=NextResponse.redirect(new URL('/',request.url),303);
  response.cookies.delete(cookieNames().pending);
  response.cookies.delete(cookieNames().session);
  return response;
}
