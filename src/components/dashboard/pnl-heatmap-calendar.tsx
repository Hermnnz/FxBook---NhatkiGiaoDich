'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Tooltip,
} from 'recharts';
import { calcRMultiple, netProfit, sortTradesByTime, sortTradesDescending } from '@/lib/calculations';
import { localDateKey } from '@/lib/phase5/readiness';
import { formatMoney } from '@/components/dashboard/format-money';
import type { Account, Trade } from '@/types';

interface PnLHeatmapCalendarProps {
  trades: Trade[];
  account?: Account | null;
  currency?: string;
  displayMonth?: string;
  onSelectDate?: (dateStr: string) => void;
}

export function PnLHeatmapCalendar({ trades, account, currency = 'USD', displayMonth = 'all', onSelectDate }: PnLHeatmapCalendarProps) {
  const [currentDate] = useState(() => new Date());
  const latestTrade = useMemo(() => sortTradesByTime(trades).at(-1), [trades]);
  const baseDate = latestTrade ? new Date(latestTrade.close_time || latestTrade.date) : currentDate;

  const year = displayMonth === 'all' ? baseDate.getFullYear() : Number(displayMonth.slice(0, 4));
  const month = displayMonth === 'all' ? baseDate.getMonth() : Number(displayMonth.slice(5, 7)) - 1; // 0-11
  const monthStr = (month + 1).toString().padStart(2, '0');
  const monthYearLabel = `${monthStr}/${year}`;

  // Map of YYYY-MM-DD -> { pnl: number, count: number }
  const tradeMap = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>();
    trades.forEach((t) => {
      const dateKey = localDateKey(new Date(t.close_time || t.date));
      const np = netProfit(t);
      const cur = map.get(dateKey) || { pnl: 0, count: 0 };
      cur.pnl += np;
      cur.count += 1;
      map.set(dateKey, cur);
    });
    return map;
  }, [trades]);

  // Calendar generation for current month (Sunday-first matching Dashboard_3.png)
  const calendarWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Day of week: 0 = Sun, 1 = Mon ... 6 = Sat
    const startDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();

    const weeks: Array<Array<{ day: number | null; dateStr: string | null; pnl: number; count: number }>> = [];
    let currentWeek: Array<{ day: number | null; dateStr: string | null; pnl: number; count: number }> = [];

    // Empty slots before first day
    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push({ day: null, dateStr: null, pnl: 0, count: 0 });
    }

    // Fill days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = day.toString().padStart(2, '0');
      const dateKey = `${year}-${monthStr}-${dStr}`;

      const data = tradeMap.get(dateKey) || { pnl: 0, count: 0 };
      currentWeek.push({ day, dateStr: dateKey, pnl: data.pnl, count: data.count });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Trailing empty slots
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: null, dateStr: null, pnl: 0, count: 0 });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year, month, monthStr, tradeMap]);

  // Monthly stats
  const monthStats = useMemo(() => {
    let totalPnl = 0;
    let tradingDays = 0;
    calendarWeeks.forEach((week) => {
      week.forEach((cell) => {
        if (cell.count > 0) {
          totalPnl += cell.pnl;
          tradingDays += 1;
        }
      });
    });
    return { totalPnl, tradingDays };
  }, [calendarWeeks]);

  // Recent 5 trades (newest trades on top)
  const recentTrades = useMemo(() => {
    return sortTradesDescending(trades).slice(0, 5);
  }, [trades]);

  // Day of week profit & loss data (Mon to Sun)
  const dayOfWeekData = useMemo(() => {
    const days = [
      { name: 'MON', dayIdx: 1, profit: 0, loss: 0 },
      { name: 'TUE', dayIdx: 2, profit: 0, loss: 0 },
      { name: 'WED', dayIdx: 3, profit: 0, loss: 0 },
      { name: 'THU', dayIdx: 4, profit: 0, loss: 0 },
      { name: 'FRI', dayIdx: 5, profit: 0, loss: 0 },
      { name: 'SAT', dayIdx: 6, profit: 0, loss: 0 },
      { name: 'SUN', dayIdx: 0, profit: 0, loss: 0 },
    ];

    if (trades.length === 0) {
      return days.map((d) => ({ name: d.name, profit: 0, loss: 0 }));
    }

    trades.forEach((t) => {
      const d = new Date(t.close_time || t.date);
      const dayIdx = d.getDay();
      const np = netProfit(t);
      const item = days.find((x) => x.dayIdx === dayIdx);
      if (item) {
        if (np >= 0) item.profit += np;
        else item.loss += Math.abs(np);
      }
    });

    return days;
  }, [trades]);

  // R-Multiple stats
  const rValues = useMemo(() => account ? trades
    .map((trade) => ({ value: calcRMultiple(trade, account), estimated: trade.risk_amount == null }))
    .filter((item): item is { value: number; estimated: boolean } => item.value !== null) : [], [trades, account]);
  const rDistribution = useMemo(() => {
    const buckets = [
      { name: '<-2R', count: 0 }, { name: '-2…-1R', count: 0 },
      { name: '-1…0R', count: 0 }, { name: '0…1R', count: 0 },
      { name: '1…2R', count: 0 }, { name: '2…3R', count: 0 },
      { name: '≥3R', count: 0 },
    ];
    for (const { value } of rValues) {
      const index = value < -2 ? 0 : value < -1 ? 1 : value < 0 ? 2 : value < 1 ? 3 : value < 2 ? 4 : value < 3 ? 5 : 6;
      buckets[index].count++;
    }
    return buckets;
  }, [rValues]);
  const estimatedRCount = rValues.filter((item) => item.estimated).length;

  return (
    <div className="space-y-4">
      {/* ROW 1: Heatmap Calendar & Recent Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LỊCH HEATMAP P&L (Col span 7) */}
        <div className="lg:col-span-7 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#26282c]/40">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              LỊCH HEATMAP P&L
            </span>

            <div className="flex items-center gap-5">
              <div className="text-right">
                <div
                  className={`text-sm font-bold font-mono ${
                    monthStats.totalPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                  }`}
                >
                  {formatMoney(monthStats.totalPnl, currency, 0, true)}
                </div>
                <div className="text-[10px] text-zinc-500">Tổng P&L tháng</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-white">
                  {monthStats.tradingDays}
                </div>
                <div className="text-[10px] text-zinc-500">Ngày giao dịch</div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-xs font-semibold text-zinc-400 mb-2">
            {monthYearLabel}
          </div>

          {/* Calendar Grid */}
          <div className="w-full">
            {/* Day of Week Headers */}
            <div className="grid grid-cols-8 gap-1.5 pb-2 text-center text-[11px] font-bold">
              <div className="text-zinc-500"></div>
              <div className="text-rose-400">SUN</div>
              <div className="text-zinc-400">MON</div>
              <div className="text-zinc-400">TUE</div>
              <div className="text-zinc-400">WED</div>
              <div className="text-zinc-400">THU</div>
              <div className="text-zinc-400">FRI</div>
              <div className="text-zinc-400">SAT</div>
            </div>

            {/* Weeks */}
            <div className="space-y-1.5">
              {calendarWeeks.map((week, wIdx) => (
                <div key={`cal-week-${wIdx}`} className="grid grid-cols-8 gap-1.5 items-center">
                  <div className="text-[11px] font-mono text-zinc-500 text-center">
                    W {wIdx + 1}
                  </div>
                  {week.map((cell, dIdx) => {
                    if (!cell.day) {
                      return (
                        <div
                          key={`empty-${wIdx}-${dIdx}`}
                          className="h-10 rounded-lg bg-[#141517]/40 border border-transparent"
                        />
                      );
                    }

                    const hasTrades = cell.count > 0;
                    const isWin = cell.pnl >= 0;

                    let bgClass = 'bg-[#202226] border-[#292c31] text-zinc-400 hover:border-zinc-500';
                    if (hasTrades) {
                      if (isWin) {
                        bgClass = 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400';
                      } else {
                        bgClass = 'bg-rose-950/40 border-rose-500/50 text-rose-400';
                      }
                    }

                    return (
                      <button
                        type="button"
                        key={`day-${cell.day}`}
                        onClick={() => cell.dateStr && onSelectDate?.(cell.dateStr)}
                        className={`h-10 rounded-lg border flex flex-col items-center justify-center p-1 transition-colors cursor-pointer ${bgClass}`}
                      >
                        <span className="text-[11px] font-mono font-medium">
                          {cell.day.toString().padStart(2, '0')}
                        </span>
                        {hasTrades && (
                          <span className="text-[9px] font-mono font-bold leading-tight">
                            {formatMoney(cell.pnl, currency, 0, true)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LỆNH GẦN NHẤT (Col span 5) */}
        <div className="lg:col-span-5 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col">
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-3 border-b border-[#26282c]/40">
            LỆNH GẦN NHẤT
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {recentTrades.length === 0 ? (
              <div className="text-center py-16 text-zinc-500 text-xs italic">
                Không có lệnh nào
              </div>
            ) : (
              <div className="divide-y divide-[#26282c]/60 space-y-1">
                {recentTrades.map((trade) => {
                  const np = netProfit(trade);
                  const isBuy = trade.direction.toLowerCase() === 'buy';
                  const dateStr = new Date(trade.close_time || trade.date).toLocaleDateString('vi-VN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div key={trade.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono">{trade.symbol}</span>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              isBuy ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                            }`}
                          >
                            {trade.direction}
                          </span>
                          <span className="text-zinc-500 font-mono">{trade.volume} lot</span>
                        </div>
                        <div className="text-[10px] text-zinc-500">{dateStr}</div>
                      </div>

                      <div
                        className={`font-mono font-bold text-sm ${
                          np >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                        }`}
                      >
                        {formatMoney(np, currency, 2, true)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: Day of Week P&L & R-Multiple Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LỢI NHUẬN THEO NGÀY TRONG TUẦN */}
        <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#26282c]/40">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              LỢI NHUẬN THEO NGÀY TRONG TUẦN
            </span>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00e676]" />
                Lợi nhuận
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4757]" />
                Thua lỗ
              </span>
            </div>
          </div>

          <div className="h-56 w-full pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke="#24262a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#6e7681', fontSize: 10 }}
                  axisLine={{ stroke: '#2c2e33' }}
                  tickLine={false}
                />
                <YAxis
                  domain={trades.length > 0 ? ['auto', 'auto'] : [0, 1.0]}
                  ticks={trades.length > 0 ? undefined : [0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                  tickFormatter={(val: number) => (trades.length > 0 ? formatMoney(val, currency, 0) : val.toFixed(1).replace('.', ','))}
                  tick={{ fill: '#6e7681', fontSize: 10 }}
                  axisLine={{ stroke: '#2c2e33' }}
                  tickLine={false}
                />
                {trades.length > 0 && (
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="bg-[#202226] border border-[#2c2e33] p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                          <div className="text-zinc-400 font-bold">{item.name}</div>
                          <div className="text-[#00e676]">
                            Lợi nhuận: {formatMoney(item.profit, currency, 2)}
                          </div>
                          <div className="text-rose-400">
                            Thua lỗ: -{formatMoney(item.loss, currency, 2)}
                          </div>
                        </div>
                      );
                    }}
                  />
                )}
                <Bar dataKey="profit" fill="#00e676" radius={[3, 3, 0, 0]} />
                <Bar dataKey="loss" fill="#ff4757" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PHÂN PHỐI R-MULTIPLE */}
        <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-1 text-[11px] font-bold">
              <span className="text-rose-400">← LỆNH THUA</span>
              <span className="text-[#00e676]">LỆNH THẮNG →</span>
            </div>
            <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-3 border-b border-[#26282c]/40">
              PHÂN PHỐI R-MULTIPLE
            </div>
          </div>

          <div className="h-56 w-full flex flex-col items-center justify-center text-center px-4 space-y-2">
            {rValues.length >= 3 ? (
              <>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rDistribution} margin={{ top: 8, right: 4, left: -30, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => [`${value} lệnh`, 'Số lệnh']} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {rDistribution.map((bucket, index) => <Cell key={bucket.name} fill={index < 3 ? '#ff4757' : '#00e676'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-zinc-500">{rValues.length} lệnh có R{estimatedRCount > 0 ? ` · ${estimatedRCount} R ước tính theo vốn đầu` : ''}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                  Chưa đủ dữ liệu R. Ghi rủi ro thực tế tại Stop Loss hoặc đặt tỷ lệ rủi ro của tài khoản để có R ước tính.
                </p>
                <p className="text-xs text-zinc-500">Cần ≥3 lệnh có R.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
