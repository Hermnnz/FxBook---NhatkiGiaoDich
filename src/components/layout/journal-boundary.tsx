'use client';

import { usePathname } from 'next/navigation';
import { JournalProvider } from '@/contexts/journal-context';

export function JournalBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicPage = pathname === '/login' || pathname === '/register' || pathname === '/setup' || pathname.startsWith('/auth/');
  if (publicPage) return <>{children}</>;
  return <JournalProvider>{children}</JournalProvider>;
}
