import { NextResponse } from 'next/server';
const PATHS={availability:'availability/search',quotes:'quotes'} as const;
export async function phase2PublicPost(which:keyof typeof PATHS,req:Request){
 const base=process.env.FISHER_API_SERVER_URL;
 if(!base)return NextResponse.json({error:'Booking service not configured'},{status:503});
 let raw:string;
 try{raw=await req.text();}catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 if(raw.length>12000)return NextResponse.json({error:'Request exceeds permitted size'},{status:413});
 try{
  const root=new URL(base);
  if(!['https:','http:'].includes(root.protocol))throw new Error('Invalid protocol');
  const path=new URL('/api/v1/'+PATHS[which],root);
  const upstream=await fetch(path,{
   method:'POST',headers:{'content-type':'application/json'},
   body:raw,cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  const text=await upstream.text();
  if(text.length>50000)return NextResponse.json({error:'Response too large'},{status:502});
  return new Response(text,{status:upstream.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{return NextResponse.json({error:'Booking service unavailable'},{status:503});}
}
