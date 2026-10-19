import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions, codeChallenge, cookieNames, loginConfig, makePending, safeLocalRedirect, seal } from '../../../lib/patient-auth';
export async function GET(request:NextRequest){
 try{
  const config=loginConfig();
  if(!config)return NextResponse.json({error:'Patient sign-in is not configured'},{status:503});
  const pending=makePending(safeLocalRedirect(request.nextUrl.searchParams.get('next')));
  const url=new URL(config.authorization);
  const params=url.searchParams;
  for(const [k,v] of Object.entries({response_type:'code',client_id:config.clientId,
    redirect_uri:config.redirectUri,scope:'openid profile email',state:pending.state,
    nonce:pending.nonce,code_challenge:codeChallenge(pending.verifier),code_challenge_method:'S256'}))
   params.set(k,v);
  const response=NextResponse.redirect(url);
  response.cookies.set(cookieNames().pending,seal(pending),authCookieOptions(600));
  return response;
 }catch{return NextResponse.json({error:'Patient sign-in unavailable'},{status:503});}
}
