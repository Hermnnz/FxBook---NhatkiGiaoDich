'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { createClient } from '@/lib/supabase/client';

export function Phase5Shell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const client = createClient();
      client.auth.getUser().then(async ({ data }) => {
        if (!data.user) { router.replace('/login'); return; }
        setEmail(data.user.email ?? null);
      });
    }
  }, [router]);
  return <div className="flex min-h-screen bg-background text-foreground">
    <Sidebar userEmail={email} />
    <div className="min-w-0 flex-1">
      <header className="border-b border-border px-6 py-5"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">{children}</main>
    </div>
  </div>;
}
