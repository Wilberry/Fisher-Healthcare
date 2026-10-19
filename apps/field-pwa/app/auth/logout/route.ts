import { NextResponse,type NextRequest } from 'next/server';
import {cookieNames,crossSite} from '../../../lib/staff-auth';
export async function POST(request:NextRequest){
  if(crossSite(request))return NextResponse.json({error:'Origin verification failed'},{status:403});
  const response=NextResponse.redirect(new URL('/signed-out',request.url),303);
  response.cookies.delete(cookieNames().pending);
  response.cookies.delete(cookieNames().session);
  // Browser-level cleanup supplements the signed-out page fallback, including
  // navigation without client JavaScript. No other origin is affected.
  response.headers.set('Clear-Site-Data','"storage"');
  response.headers.set('Cache-Control','no-store');
  return response;
}
