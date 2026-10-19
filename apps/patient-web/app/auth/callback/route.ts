import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions, cookieNames, exchangeCode, loginConfig, unseal, seal, safeLocalRedirect, provisionPatientAccount } from '../../../lib/patient-auth';
export async function GET(request:NextRequest){
 const cfg=loginConfig();
 if(!cfg)return NextResponse.json({error:'Patient sign-in unavailable'},{status:503});
 const failed=()=>NextResponse.redirect(new URL('/account?auth=failed',cfg.origin));
 const encrypted=request.cookies.get(cookieNames().pending)?.value;
 const pending=unseal(encrypted);
 const state=request.nextUrl.searchParams.get('state');
 const code=request.nextUrl.searchParams.get('code');
 if(pending?.type!=='pending' || !state || state!==pending.state || !code || code.length>4096){
  const response=failed();
  response.cookies.delete(cookieNames().pending);
  return response;
 }
 try{
  const session=await exchangeCode(code,pending);
  await provisionPatientAccount(session.accessToken);
  const destination=new URL(safeLocalRedirect(pending.next),cfg.origin);
  const response=NextResponse.redirect(destination);
  response.cookies.delete(cookieNames().pending);
  response.cookies.set(cookieNames().session,seal(session),
   authCookieOptions(Math.max(1,Math.min(3600,session.expires-Math.floor(Date.now()/1000)))));
  return response;
 }catch{
  const response=failed();
  response.cookies.delete(cookieNames().pending);
  response.cookies.delete(cookieNames().session);
  return response;
 }
}
