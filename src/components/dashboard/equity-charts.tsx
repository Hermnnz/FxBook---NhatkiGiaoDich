'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { netProfit, sortTradesByTime } from '@/lib/calculations';
import { localDateKey } from '@/lib/phase5/readiness';
import { formatMoney } from '@/components/dashboard/format-money';
import type { Trade, Account } from '@/types';

interface EquityChartsProps {
  trades: Trade[];
  account?: Account | null;
}

export function EquityCharts({ trades, account }: EquityChartsProps) {
  const currency = account?.currency ?? 'USD';

  // Sorted trades by time
  const sortedTrades = useMemo(() => sortTradesByTime(trades), [trades]);

  // 1. Cumulative Equity Data
  const equityData = useMemo(() => {
    if (sortedTrades.length === 0) {
      // Empty state placeholders matching Dashboard_2.png
      return [
        { label: '0', cumPnl: 0 },
        { label: '0.2', cumPnl: 0 },
        { label: '0.4', cumPnl: 0 },
        { label: '0.6', cumPnl: 0 },
        { label: '0.8', cumPnl: 0 },
        { label: '1.0', cumPnl: 0 },
      ];
    }

    const data: Array<{ label: string; fullDate: string; netProfit: number; cumPnl: number }> = [];
    let running = 0;

    sortedTrades.forEach((t) => {
      const np = netProfit(t);
      running += np;
      const dateStr = t.close_time || t.date;
      const d = new Date(dateStr);
      const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

      data.push({
        label,
        fullDate: d.toLocaleString('vi-VN'),
        netProfit: np,
        cumPnl: Math.round(running * 100) / 100,
      });
    });

    return data;
  }, [sortedTrades]);

  // 2. Daily Net P&L Data
  const dailyData = useMemo(() => {
    if (sortedTrades.length === 0) {
      // Empty state placeholders matching Dashboard_2.png
      return [
        { displayDate: '0', pnl: 0 },
        { displayDate: '0.2', pnl: 0 },
        { displayDate: '0.4', pnl: 0 },
        { displayDate: '0.6', pnl: 0 },
        { displayDate: '0.8', pnl: 0 },
        { displayDate: '1.0', pnl: 0 },
      ];
    }

    const dayMap = new Map<string, { date: string; pnl: number; count: number }>();

    sortedTrades.forEach((t) => {
      const dateKey = localDateKey(new Date(t.close_time || t.date));
      const np = netProfit(t);

      const existing = dayMap.get(dateKey) || { date: dateKey, pnl: 0, count: 0 };
      existing.pnl += np;
      existing.count += 1;
      dayMap.set(dateKey, existing);
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        pnl: Math.round(d.pnl * 100) / 100,
        displayDate: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`,
      }));
  }, [sortedTrades]);

  const hasTrades = sortedTrades.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* 1. P&L TÍCH LŨY THEO NGÀY */}
      <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
        <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-2 border-b border-[#26282c]/40">
          P&L TÍCH LŨY THEO NGÀY
        </div>

        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="cumPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00e676" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#24262a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6e7681', fontSize: 10 }}
                axisLine={{ stroke: '#2c2e33' }}
                tickLine={false}
              />
              <YAxis
                domain={hasTrades ? ['auto', 'auto'] : [0, 1.0]}
                ticks={hasTrades ? undefined : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                tickFormatter={(val: number) => (hasTrades ? formatMoney(val, currency, 0) : val.toFixed(1).replace('.', ','))}
                tick={{ fill: '#6e7681', fontSize: 10 }}
                axisLine={{ stroke: '#2c2e33' }}
                tickLine={false}
              />
              {hasTrades && (
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-[#202226] border border-[#2c2e33] p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                        <div className="text-zinc-400 font-medium">{item.fullDate || item.label}</div>
                        <div className="font-bold font-mono text-[#00e676]">
                          Lũy kế: {formatMoney(item.cumPnl, currency, 2, true)}
                        </div>
                      </div>
                    );
                  }}
                />
              )}
              <ReferenceLine y={0} stroke="#484f58" strokeDasharray="2 2" />
              <Area
                type="monotone"
                dataKey="cumPnl"
                stroke="#00e676"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cumPnlGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. LỢI NHUẬN THEO NGÀY (Net/ngày) */}
      <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
        <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-2 border-b border-[#26282c]/40">
          LỢI NHUẬN THEO NGÀY (Net/ngày)
        </div>

        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#24262a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fill: '#6e7681', fontSize: 10 }}
                axisLine={{ stroke: '#2c2e33' }}
                tickLine={false}
              />
              <YAxis
                domain={hasTrades ? ['auto', 'auto'] : [0, 1.0]}
                ticks={hasTrades ? undefined : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                tickFormatter={(val: number) => (hasTrades ? formatMoney(val, currency, 0) : `+${val === 0 || val === 1 ? val : val.toFixed(1).replace('.', ',')}`)}
                tick={{ fill: '#6e7681', fontSize: 10 }}
                axisLine={{ stroke: '#2c2e33' }}
                tickLine={false}
              />
              {hasTrades && (
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-[#202226] border border-[#2c2e33] p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                        <div className="text-zinc-400 font-medium">{item.date}</div>
                        <div
                          className={`font-bold font-mono ${
                            item.pnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                          }`}
                        >
                          Net P&L: {formatMoney(item.pnl, currency, 2, true)}
                        </div>
                        <div className="text-[10px] text-zinc-500">Số lệnh: {item.count}</div>
                      </div>
                    );
                  }}
                />
              )}
              <ReferenceLine y={0} stroke="#484f58" strokeDasharray="2 2" />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {dailyData.map((entry, index) => (
                  <Cell
                    key={`daily-bar-${index}`}
                    fill={entry.pnl >= 0 ? '#00e676' : '#ff4757'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
