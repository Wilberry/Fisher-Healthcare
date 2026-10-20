import { NextResponse,type NextRequest } from 'next/server';
import {cookieNames,cookieOptions,crossSite} from '../../../lib/staff-auth';
export async function POST(request:NextRequest){
  if(crossSite(request))return NextResponse.json({error:'Origin verification failed'},{status:403});
  const response=NextResponse.redirect(new URL('/signed-out',request.url),303);
  response.cookies.set(cookieNames().pending,'',{
    ...cookieOptions(0),expires:new Date(0)
  });
  response.cookies.set(cookieNames().session,'',{
    ...cookieOptions(0),expires:new Date(0)
  });
  response.headers.set('Clear-Site-Data','"storage"');
  response.headers.set('Cache-Control','no-store');
  return response;
}
