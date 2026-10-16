export type TestPreview={id:string;code:string;name:string;specimen_type:string;starting_from_kobo:number};
export type LabPreview={id:string;name:string;active_offerings:number};
export type ZonePreview={id:string;code:string;name:string};
export type SlotPreview={id:string;startsAt:string;endsAt:string;remaining:number};
export type QuotedPrice={quoteId:string;expiresAt:string;items:{testId:string;name:string;priceKobo:number}[];
 testsTotalKobo:number;logisticsFeeKobo:number;totalKobo:number;currency:'NGN'};
function record(v:unknown):v is Record<string,unknown>{return !!v && typeof v==='object' && !Array.isArray(v);}
async function request(path:string):Promise<unknown>{
 const base=process.env.FISHER_API_SERVER_URL;
 if(!base)return null;
 let url:URL;
 try{
  url=new URL(path,base.endsWith('/')?base:base+'/');
  const target=new URL(base);
  if(!['http:','https:'].includes(target.protocol) || url.origin!==target.origin)return null;
 }catch{return null;}
 try{
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)return null;
  return await r.json() as unknown;
 }catch{return null;}
}
async function list(path:string):Promise<Record<string,unknown>[]>{
 const response=await request(path);
 return record(response) && Array.isArray(response.data)?
  response.data.filter(record):[];
}
export async function tests(search=''):Promise<TestPreview[]>{
 const items=await list('api/v1/catalog/tests?search='+encodeURIComponent(search.slice(0,100)));
 return items.filter(v=>typeof v.id==='string' && typeof v.name==='string' &&
   typeof v.code==='string' && typeof v.specimen_type==='string' &&
   typeof v.starting_from_kobo==='number').map(v=>({
    id:v.id as string,code:v.code as string,name:v.name as string,
    specimen_type:v.specimen_type as string,starting_from_kobo:v.starting_from_kobo as number
   }));
}
export async function labs():Promise<LabPreview[]>{
 const items=await list('api/v1/catalog/labs');
 return items.filter(v=>typeof v.id==='string' && typeof v.name==='string')
 .map(v=>({id:v.id as string,name:v.name as string,active_offerings:Number(v.active_offerings??0)}));
}
export async function zones():Promise<ZonePreview[]>{
 const items=await list('api/v1/service-zones');
 return items.filter(v=>typeof v.id==='string' && typeof v.name==='string' && typeof v.code==='string')
 .map(v=>({id:v.id as string,name:v.name as string,code:v.code as string}));
}
export async function testDetail(id:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))return null;
 const result=await request('api/v1/catalog/tests/'+encodeURIComponent(id));
 if(!record(result)||!record(result.data)||typeof result.data.name!=='string')return null;
 return result.data;
}
export function naira(kobo:number){
 return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(kobo/100);
}
