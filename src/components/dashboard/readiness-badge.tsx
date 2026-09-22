'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { localDateKey, scoreReadiness, type ReadinessBand } from '@/lib/phase5/readiness';
import type { ReadinessCheck } from '@/types';

type TodayReadiness = Pick<ReadinessCheck,
  'physical_score' | 'mental_score' | 'market_score' | 'discipline_score' | 'plan_score'
>;

export function useTodayReadiness() {
  const [readiness, setReadiness] = useState<{ score: number; band: ReadinessBand } | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    let active = true;
    const client = createClient();

    async function loadToday() {
      const { data, error } = await client
        .from('readiness_checks')
        .select('physical_score,mental_score,market_score,discipline_score,plan_score')
        .eq('date', localDateKey())
        .maybeSingle();

      if (!active || error) return;
      if (!data) {
        setReadiness(null);
        return;
      }

      const check = data as TodayReadiness;
      setReadiness(scoreReadiness({
        health: check.physical_score,
        emotion: check.mental_score,
        focus: check.market_score,
        streak: check.discipline_score,
        plan: check.plan_score,
      }));
    }

    void loadToday();
    window.addEventListener('focus', loadToday);
    return () => {
      active = false;
      window.removeEventListener('focus', loadToday);
    };
  }, []);

  return readiness;
}

export function ReadinessBadge() {
  const readiness = useTodayReadiness();
  const colors = readiness?.band === 'green'
    ? 'border-emerald-500/40 text-emerald-400'
    : readiness?.band === 'yellow'
      ? 'border-amber-500/40 text-amber-400'
      : readiness?.band === 'red'
        ? 'border-rose-500/40 text-rose-400'
        : 'border-border text-muted-foreground';

  return <Link href="/readiness" aria-label="Xem trạng thái sẵn sàng giao dịch hôm nay">
    <Badge variant="outline" className={`${colors} cursor-pointer text-xs`}>Sẵn sàng: {readiness ? `${readiness.score}/100` : 'Chưa kiểm tra'}</Badge>
  </Link>;
}
