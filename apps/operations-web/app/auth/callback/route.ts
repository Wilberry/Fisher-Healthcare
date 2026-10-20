import { NextResponse,type NextRequest } from 'next/server';
import {cookieNames,cookieOptions,exchangeCode,oidcConfig,safeReturnPath,seal,unseal} from '../../../lib/staff-auth';
export async function GET(request:NextRequest){
  const config=oidcConfig();
  if(!config||request.nextUrl.origin!==config.origin)
    return NextResponse.json({error:'Staff sign-in unavailable'},{status:503});
  const failed=()=>{
    const response=NextResponse.redirect(new URL('/?staff_auth=failed',config.origin));
    response.cookies.set(cookieNames().pending,'',{
    ...cookieOptions(0),expires:new Date(0)
  });
    response.cookies.set(cookieNames().session,'',{
    ...cookieOptions(0),expires:new Date(0)
  });
    return response;
  };
  const pending=unseal(request.cookies.get(cookieNames().pending)?.value);
  const state=request.nextUrl.searchParams.get('state');
  const code=request.nextUrl.searchParams.get('code');
  if(pending?.type!=='pending'||!state||state!==pending.state||
    !code||code.length>4096)return failed();
  try{
    const session=await exchangeCode(code,pending);
    const response=NextResponse.redirect(new URL(safeReturnPath(pending.next),config.origin));
    response.cookies.set(cookieNames().pending,'',{
    ...cookieOptions(0),expires:new Date(0)
  });
    response.cookies.set(cookieNames().session,seal(session),
      cookieOptions(Math.max(1,Math.min(3600,session.expires-Math.floor(Date.now()/1000)))));
    return response;
  }catch{return failed();}
}
