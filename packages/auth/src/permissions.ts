import type { Principal, StaffRole } from './policy';
export type Capability =
  | 'orders:read' | 'orders:manage' | 'dispatch:manage'
  | 'specimens:collect' | 'specimens:transport' | 'labs:manage'
  | 'results:release' | 'finance:read' | 'finance:manage'
  | 'staff:manage' | 'audit:read';
const permissions: Record<StaffRole, readonly Capability[]> = {
 administrator:['orders:read','orders:manage','dispatch:manage','labs:manage','staff:manage','audit:read'],
 dispatcher:['orders:read','dispatch:manage'],
 support:['orders:read'],
 phlebotomist:['specimens:collect'],
 courier:['specimens:transport'],
 lab_coordinator:['orders:read','labs:manage'],
 finance:['finance:read','finance:manage'],
 result_release:['results:release']
};
export function hasCapability(principal:Principal, capability:Capability):boolean {
 return principal.staffRole!==undefined && permissions[principal.staffRole].includes(capability);
}
export function requireCapability(principal:Principal, capability:Capability):void {
 if(!hasCapability(principal,capability)) throw new Error('FORBIDDEN');
}
