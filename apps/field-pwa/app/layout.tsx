import '@fisher/ui/styles.css';
import { StaffSessionBoundary } from '../components/staff-session-boundary';
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body style={{fontFamily:'Arial,sans-serif',margin:0,padding:24}}><StaffSessionBoundary>{children}</StaffSessionBoundary></body></html>; }
