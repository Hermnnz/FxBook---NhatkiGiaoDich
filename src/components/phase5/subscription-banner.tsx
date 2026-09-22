'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getSubscriptionStatus, type SubscriptionStatus } from '@/lib/phase5/subscription';

export function SubscriptionBanner() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [issue, setIssue] = useState('');
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    let alive = true;
    async function load() {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return;
      const { data, error } = await client.from('subscriptions').select('*').eq('user_id', auth.user.id).maybeSingle();
      if (!alive) return;
      if (error || !data) setIssue('Thiếu cấu hình thời hạn. Kiểm tra migration 002/003.');
      else setStatus(getSubscriptionStatus(data));
    }
    void load();
    return () => { alive = false; };
  }, []);
  if (issue) return <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">{issue}</div>;
  if (!status || status.state === 'active' || status.state === 'trial' && status.daysLeft > 7) return null;
  return <div className={`rounded-lg border p-3 text-sm ${status.state === 'expired' ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
    {status.state === 'expired' ? 'Thời gian dùng thử đã kết thúc. Dữ liệu ở chế độ chỉ đọc.' : `Thời gian dùng thử còn ${status.daysLeft} ngày.`} <Link className="font-semibold underline" href="/settings">Xem tài khoản</Link>
  </div>;
}
