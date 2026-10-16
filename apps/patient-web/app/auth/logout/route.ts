import { NextResponse, type NextRequest } from 'next/server';
import { cookieNames, crossSiteRequest } from '../../../lib/patient-auth';
export async function POST(request:NextRequest){
 if(crossSiteRequest(request))return NextResponse.json({error:'Origin verification failed'},{status:403});
 const response=NextResponse.redirect(new URL('/account',request.url),303);
 response.cookies.delete(cookieNames().session);
 response.cookies.delete(cookieNames().pending);
 return response;
}
