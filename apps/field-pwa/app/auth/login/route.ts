import { NextResponse,type NextRequest } from 'next/server';
import {challenge,cookieNames,cookieOptions,makePending,oidcConfig,seal} from '../../../lib/staff-auth';
export async function GET(request:NextRequest){
  try{
    const config=oidcConfig();
    if(!config||request.nextUrl.origin!==config.origin)
      return NextResponse.json({error:'Staff sign-in unavailable'},{status:503});
    const pending=makePending(request.nextUrl.searchParams.get('next')??'');
    const redirect=new URL(config.authorize);
    for(const [key,value] of Object.entries({
      response_type:'code',client_id:config.clientId,
      redirect_uri:config.redirect,scope:'openid profile email',
      state:pending.state,code_challenge:challenge(pending.verifier),
      code_challenge_method:'S256'
    }))redirect.searchParams.set(key,value);
    const response=NextResponse.redirect(redirect);
    response.cookies.set(cookieNames().pending,seal(pending),cookieOptions(600));
    return response;
  }catch{
    return NextResponse.json({error:'Staff sign-in unavailable'},{status:503});
  }
}
