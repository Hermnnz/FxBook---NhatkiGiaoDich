'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ThemeInitializer() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let active = true;
    async function load() {
      const client = createClient();
      const { data: auth } = await client.auth.getSession();
      const user = auth.session?.user;
      if (!user) {
        if (active) document.documentElement.classList.add('dark');
        return;
      }
      const { data } = await client.from('settings').select('theme').eq('user_id', user.id).maybeSingle();
      if (active) document.documentElement.classList.toggle('dark', data?.theme !== 'light');
    }
    void load();
    return () => { active = false; };
  }, []);
  return null;
}
