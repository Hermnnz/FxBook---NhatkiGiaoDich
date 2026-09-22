'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Globe2, Moon } from 'lucide-react';

interface SessionDef {
  id: string;
  name: string;
  city: string;
  // Hours in UTC (0-24)
  openUtc: number;
  closeUtc: number;
  color: string;
  activeColor: string;
}

const SESSIONS: SessionDef[] = [
  {
    id: 'sydney',
    name: 'Sydney',
    city: 'Úc',
    openUtc: 22,
    closeUtc: 7, // crosses midnight: 22:00 -> 07:00
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    activeColor: 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    city: 'Châu Á',
    openUtc: 0,
    closeUtc: 9, // 00:00 -> 09:00
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    activeColor: 'bg-amber-500 text-black font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]',
  },
  {
    id: 'london',
    name: 'London',
    city: 'Châu Âu',
    openUtc: 8,
    closeUtc: 17, // 08:00 -> 17:00
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    activeColor: 'bg-blue-500 text-white font-bold shadow-[0_0_12px_rgba(59,130,246,0.4)]',
  },
  {
    id: 'newyork',
    name: 'New York',
    city: 'Mỹ',
    openUtc: 13,
    closeUtc: 22, // 13:00 -> 22:00
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    activeColor: 'bg-purple-500 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]',
  },
];

function isSessionActive(s: SessionDef, utcHour: number): boolean {
  if (s.openUtc > s.closeUtc) {
    // Crosses midnight (e.g. Sydney 22:00 -> 07:00)
    return utcHour >= s.openUtc || utcHour < s.closeUtc;
  }
  return utcHour >= s.openUtc && utcHour < s.closeUtc;
}

export function MarketSessionsClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initial = setTimeout(() => setNow(new Date()), 0);
    const interval = setInterval(() => {
      setNow(new Date());
    }, 10000); // update every 10 seconds
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  if (!now) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Đang đồng bộ giờ thị trường...
        </CardContent>
      </Card>
    );
  }

  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Weekend check: Closes Friday 22:00 UTC until Sunday 21:00 UTC
  const isWeekend =
    (dayOfWeek === 5 && utcHour >= 22) ||
    dayOfWeek === 6 ||
    (dayOfWeek === 0 && utcHour < 21);

  // Active sessions
  const activeSessions = isWeekend ? [] : SESSIONS.filter((s) => isSessionActive(s, Math.floor(utcHour)));
  const isOverlap = activeSessions.some((s) => s.id === 'london') && activeSessions.some((s) => s.id === 'newyork');

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-semibold tracking-tight">
            Phiên Thị Trường & Thời Gian Thực
          </CardTitle>
        </div>

        {/* Realtime clock display */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>UTC: {now.toISOString().slice(11, 16)}</span>
          </div>
          <div className="text-foreground font-semibold px-2 py-0.5 rounded bg-muted/60 border border-border/60">
            Local: {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Status banner */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isWeekend ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-xs px-2.5 py-1">
                <Moon className="w-3.5 h-3.5 mr-1.5" />
                Thị trường nghỉ cuối tuần (Mở lại 05:00 sáng thứ Hai)
              </Badge>
            ) : activeSessions.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs text-muted-foreground">Đang mở:</span>
                {activeSessions.map((s) => (
                  <Badge key={s.id} className={`${s.activeColor} text-xs px-2 py-0.5`}>
                    {s.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                Giao thời giữa các phiên
              </Badge>
            )}

            {isOverlap && (
              <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-[11px] px-2 py-0.5 shadow-sm">
                🔥 Trùng phiên London & New York (Thanh khoản đỉnh)
              </Badge>
            )}
          </div>
        </div>

        {/* 24-hour visual timeline */}
        <div className="space-y-1 pt-1">
          <div className="relative h-9 w-full bg-muted/30 rounded-lg overflow-hidden border border-border/60">
            {/* Session blocks */}
            {/* Sydney: 22:00 -> 07:00 (part 1: 22-24, part 2: 0-7) */}
            <div
              className="absolute top-1 h-3.5 rounded bg-emerald-500/30 border border-emerald-500/40 text-[9px] font-mono flex items-center px-1 text-emerald-300"
              style={{ left: `${(22 / 24) * 100}%`, width: `${(2 / 24) * 100}%` }}
              title="Sydney: 22:00 - 07:00 UTC"
            />
            <div
              className="absolute top-1 h-3.5 rounded bg-emerald-500/30 border border-emerald-500/40 text-[9px] font-mono flex items-center px-1 text-emerald-300"
              style={{ left: '0%', width: `${(7 / 24) * 100}%` }}
              title="Sydney: 22:00 - 07:00 UTC"
            >
              Sydney
            </div>

            {/* Tokyo: 00:00 -> 09:00 */}
            <div
              className="absolute top-4.5 h-3.5 rounded bg-amber-500/30 border border-amber-500/40 text-[9px] font-mono flex items-center px-1 text-amber-300"
              style={{ left: '0%', width: `${(9 / 24) * 100}%` }}
              title="Tokyo: 00:00 - 09:00 UTC"
            >
              Tokyo
            </div>

            {/* London: 08:00 -> 17:00 */}
            <div
              className="absolute top-1 h-3.5 rounded bg-blue-500/30 border border-blue-500/40 text-[9px] font-mono flex items-center px-1 text-blue-300"
              style={{ left: `${(8 / 24) * 100}%`, width: `${(9 / 24) * 100}%` }}
              title="London: 08:00 - 17:00 UTC"
            >
              London
            </div>

            {/* New York: 13:00 -> 22:00 */}
            <div
              className="absolute top-4.5 h-3.5 rounded bg-purple-500/30 border border-purple-500/40 text-[9px] font-mono flex items-center px-1 text-purple-300"
              style={{ left: `${(13 / 24) * 100}%`, width: `${(9 / 24) * 100}%` }}
              title="New York: 13:00 - 22:00 UTC"
            >
              New York
            </div>

            {/* Current UTC pointer (Red vertical line) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 shadow-[0_0_8px_rgba(244,63,94,1)] pointer-events-none"
              style={{ left: `${(utcHour / 24) * 100}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-rose-500 -ml-[3px] -top-1 absolute" />
            </div>
          </div>

          {/* Hour markers labels */}
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono px-1">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>24:00 UTC</span>
          </div>
        </div>

        {/* 4 Sessions Grid Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {SESSIONS.map((s) => {
            const active = isSessionActive(s, Math.floor(utcHour)) && !isWeekend;
            return (
              <div
                key={s.id}
                className={`p-2.5 rounded-lg border text-xs transition-all ${
                  active
                    ? 'bg-muted/60 border-primary/50 shadow-sm'
                    : 'bg-card/40 border-border/50 text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {s.name}
                    {active ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    ) : null}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{s.city}</span>
                </div>
                <div className="font-mono text-[11px] mt-1 text-muted-foreground">
                  {s.openUtc.toString().padStart(2, '0')}:00 - {s.closeUtc.toString().padStart(2, '0')}:00 UTC
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
