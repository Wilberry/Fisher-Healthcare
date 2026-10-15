import type { Metadata } from 'next';
import '@fisher/ui/styles.css';
import './styles.css';
export const metadata: Metadata = { title: 'Fisher Healthcare', description: 'Sample collection, without the hospital wait.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
