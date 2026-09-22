'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSubscriptionStatus } from './subscription';

/** UI hint only. Database RLS remains the authority for write access. */
export function useJournalWritable(): boolean {
  const [writable, setWritable] = useState(true);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let alive = true;
    async function load() {
      try {
        const client = createClient();
        const { data: auth } = await client.auth.getUser();
        if (!auth.user) return;
        const { data, error } = await client.from('subscriptions').select('user_id,trial_started_at,trial_ends_at,paid_until').eq('user_id', auth.user.id).maybeSingle();
        if (alive) setWritable(!error && !!data && getSubscriptionStatus(data).state !== 'expired');
      } catch {
        if (alive) setWritable(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);
  return writable;
}
