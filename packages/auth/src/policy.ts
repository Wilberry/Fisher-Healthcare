export type StaffRole = 'administrator'|'dispatcher'|'support'|'phlebotomist'|'courier'|'lab_coordinator'|'finance'|'result_release';
export type Principal = {userId:string; staffRole?:StaffRole};
export type PatientGrant = {patientId:string;userId:string;canBook:boolean;canViewResults:boolean;verified:boolean;revoked:boolean};
export function canBookFor(principal:Principal, patientId:string, grants:readonly PatientGrant[]):boolean {
 return grants.some(g=>g.patientId===patientId&&g.userId===principal.userId&&g.verified&&!g.revoked&&g.canBook);
}
export function canReadResult(principal:Principal, patientId:string, released:boolean, grants:readonly PatientGrant[]):boolean {
 return released&&grants.some(g=>g.patientId===patientId&&g.userId===principal.userId&&g.verified&&!g.revoked&&g.canViewResults);
}
export function canPerformStaffAction(principal:Principal, roles:readonly StaffRole[]):boolean {return principal.staffRole!==undefined&&roles.includes(principal.staffRole);}
