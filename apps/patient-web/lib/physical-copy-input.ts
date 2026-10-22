const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parsePhysicalCopyRequest(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==3||typeof v.resultId!=='string'||!uuid.test(v.resultId)||
   typeof v.addressId!=='string'||!uuid.test(v.addressId)||
   typeof v.requestKey!=='string'||!uuid.test(v.requestKey))return null;
 return {resultId:v.resultId,addressId:v.addressId,requestKey:v.requestKey};
}
