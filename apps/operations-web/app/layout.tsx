import '@fisher/ui/styles.css';
import { StaffSessionBoundary } from '../components/staff-session-boundary';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Fisher Operations' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body style={{fontFamily:'Arial, sans-serif',margin:0,background:'#f8fafc',color:'#241b50'}}><StaffSessionBoundary>{children}</StaffSessionBoundary></body></html>; }
