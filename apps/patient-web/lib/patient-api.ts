import 'server-only';
import { readSession } from './patient-auth';
type Item=Record<string,unknown>;
export type PatientRecord={id:string;display_name:string;relationship:string;can_book:boolean;verified:boolean};
export type PatientBooking={id:string;status:string;tier:string;currency:string;total_kobo:number;created_at:string};
export type NotificationRecord={id:string;channel:string;template:string;status:string;booking_id:string;created_at:string};
export async function patientApi(path:string,method:'GET'|'POST'='GET',body?:unknown,key?:string){
 const session=await readSession();
 if(!session)return {ok:false as const,status:401 as number,data:null as unknown};
 const root=process.env.FISHER_API_SERVER_URL;
 if(!root)return {ok:false as const,status:503 as number,data:null as unknown};
 try {
  const origin=new URL(root);
  if(!['https:','http:'].includes(origin.protocol))throw new Error('API URL invalid');
  if(process.env.NODE_ENV==='production'&&origin.protocol!=='https:')throw new Error('Insecure API URL');
  const url=new URL('/api/v1/'+path,origin);
  if(url.origin!==origin.origin)throw new Error('Unexpected API origin');
  const headers:Record<string,string>={authorization:'Bearer '+session.accessToken};
  if(body!==undefined)headers['content-type']='application/json';
  if(key)headers['idempotency-key']=key;
  const result=await fetch(url,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
   cache:'no-store',signal:AbortSignal.timeout(8000)});
  const data:unknown=await result.json().catch(()=>null);
  return {ok:result.ok,status:result.status,data};
 }catch{return {ok:false as const,status:503,data:null as unknown};}
}
function asRecords(value:unknown):Item[]{
 if(!value||typeof value!=='object'||!('data' in value))return [];
 const d=(value as {data:unknown}).data;
 return Array.isArray(d)?d.filter((v):v is Item=>!!v&&typeof v==='object'&&!Array.isArray(v)):[];
}
export async function patientAccountData(){
 const session=await readSession();
 if(!session)return {signedIn:false as const,available:false as const,patients:[] as PatientRecord[],
  bookings:[] as PatientBooking[],notifications:[] as NotificationRecord[]};
 const [p,b,n]=await Promise.all([patientApi('patients'),patientApi('me/bookings'),patientApi('me/notifications')]);
 return {signedIn:true as const,available:p.ok&&b.ok&&n.ok,
  patients:asRecords(p.data).filter((v):v is PatientRecord=>
   typeof v.id==='string'&&typeof v.display_name==='string'&&typeof v.relationship==='string'&&
   typeof v.can_book==='boolean'&&typeof v.verified==='boolean'),
  bookings:asRecords(b.data).filter((v):v is PatientBooking=>
   typeof v.id==='string'&&typeof v.status==='string'&&typeof v.tier==='string'&&
   typeof v.currency==='string'&&typeof v.total_kobo==='number'&&typeof v.created_at==='string'),
  notifications:asRecords(n.data).filter((v):v is NotificationRecord=>
   typeof v.id==='string'&&typeof v.channel==='string'&&typeof v.template==='string'&&
   typeof v.status==='string'&&typeof v.booking_id==='string'&&typeof v.created_at==='string')
 };
}
