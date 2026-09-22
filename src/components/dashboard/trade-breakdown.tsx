'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { netProfit, sortTradesByTime } from '@/lib/calculations';
import { formatMoney } from '@/components/dashboard/format-money';
import type { Trade } from '@/types';

interface TradeBreakdownProps {
  trades: Trade[];
  currency?: string;
}

interface GroupStat {
  key: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
}

function calculateGroupStats(items: { key: string; trade: Trade }[]): GroupStat[] {
  const map = new Map<string, { trades: Trade[] }>();

  items.forEach(({ key, trade }) => {
    const existing = map.get(key) || { trades: [] };
    existing.trades.push(trade);
    map.set(key, existing);
  });

  const result: GroupStat[] = [];
  map.forEach(({ trades }, key) => {
    let wins = 0;
    let losses = 0;
    let netPnl = 0;

    trades.forEach((t) => {
      const np = netProfit(t);
      netPnl += np;
      if (np > 0) wins++;
      else if (np < 0) losses++;
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    result.push({
      key,
      totalTrades,
      wins,
      losses,
      winRate,
      netPnl: Math.round(netPnl * 100) / 100,
    });
  });

  return result.sort((a, b) => b.netPnl - a.netPnl);
}

export function TradeBreakdown({ trades, currency = 'USD' }: TradeBreakdownProps) {
  // Sorted trades
  const sortedTrades = useMemo(() => sortTradesByTime(trades), [trades]);

  // 1. By Setup
  const setupStats = useMemo(() => {
    const valid = trades.filter((t) => t.setup);
    return calculateGroupStats(valid.map((t) => ({ key: t.setup || 'Chưa gắn', trade: t })));
  }, [trades]);

  // 2. By Symbol
  const symbolStats = useMemo(() => {
    return calculateGroupStats(trades.map((t) => ({ key: t.symbol, trade: t })));
  }, [trades]);

  // 3. By Timeframe
  const timeframeStats = useMemo(() => {
    const valid = trades.filter((t) => t.timeframe);
    return calculateGroupStats(valid.map((t) => ({ key: t.timeframe || 'Chưa gắn', trade: t })));
  }, [trades]);

  // 4. By Direction (Buy / Sell)
  const directionStats = useMemo(() => {
    return calculateGroupStats(trades.map((t) => ({ key: t.direction.toUpperCase(), trade: t })));
  }, [trades]);

  // 5. By Session
  const sessionStats = useMemo(() => {
    const valid = trades.filter((t) => t.session);
    return calculateGroupStats(valid.map((t) => ({ key: t.session || 'Chưa gắn', trade: t })));
  }, [trades]);

  // Actual vs Theoretical P&L
  const theorySummary = useMemo(() => {
    let actualTotal = 0;
    let theoryTotal = 0;

    trades.forEach((t) => {
      actualTotal += netProfit(t);
      if (t.theoretical_profit != null) {
        theoryTotal += t.theoretical_profit;
      } else {
        theoryTotal += netProfit(t);
      }
    });

    return {
      theoryTotal: Math.round(theoryTotal * 100) / 100,
      actualTotal: Math.round(actualTotal * 100) / 100,
      diff: Math.round((actualTotal - theoryTotal) * 100) / 100,
    };
  }, [trades]);

  // Theoretical Chart Series
  const theoryChartData = useMemo(() => {
    if (sortedTrades.length === 0) {
      return [
        { label: '0', actual: 0, theory: 0 },
        { label: '0.2', actual: 0, theory: 0 },
        { label: '0.4', actual: 0, theory: 0 },
        { label: '0.6', actual: 0, theory: 0 },
        { label: '0.8', actual: 0, theory: 0 },
        { label: '1.0', actual: 0, theory: 0 },
      ];
    }

    let runActual = 0;
    let runTheory = 0;
    return sortedTrades.map((t) => {
      runActual += netProfit(t);
      runTheory += t.theoretical_profit != null ? t.theoretical_profit : netProfit(t);
      const d = new Date(t.close_time || t.date);
      const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      return {
        label,
        actual: Math.round(runActual * 100) / 100,
        theory: Math.round(runTheory * 100) / 100,
      };
    });
  }, [sortedTrades]);

  // Empty placeholder ticks for dual-axis charts (-0,10 to 0,10)
  const emptyDualAxisData: GroupStat[] = useMemo(
    () => [{ key: '', netPnl: 0, totalTrades: 0, wins: 0, losses: 0, winRate: 0 }],
    []
  );

  const hasTrades = trades.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* LEFT COLUMN: Vertical Breakdown Sidebar (Col span 3) */}
      <div className="lg:col-span-3 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl divide-y divide-[#26282c]/60 overflow-hidden flex flex-col justify-between h-full">
        {/* 1. SETUP */}
        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-emerald-400 uppercase tracking-wider">SETUP</span>
              <div className="text-[10px] text-zinc-500 font-semibold space-x-2">
                <span>TÊN</span>
                <span>PROFIT</span>
                <span>WIN%</span>
              </div>
            </div>
            {setupStats.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {setupStats.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200 truncate max-w-[100px]">{s.key}</span>
                    <div className="flex items-center gap-2">
                      <span className={s.netPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'}>
                        {formatMoney(s.netPnl, currency, 0, true)}
                      </span>
                      <span className="text-zinc-400">{s.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2. SYMBOL */}
        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              SYMBOL
            </div>
            {symbolStats.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {symbolStats.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200">{s.key}</span>
                    <div className="flex items-center gap-2">
                      <span className={s.netPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'}>
                        {formatMoney(s.netPnl, currency, 0, true)}
                      </span>
                      <span className="text-zinc-400">{s.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. TIME FRAME */}
        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              TIME FRAME
            </div>
            {timeframeStats.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {timeframeStats.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200">{s.key}</span>
                    <div className="flex items-center gap-2">
                      <span className={s.netPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'}>
                        {formatMoney(s.netPnl, currency, 0, true)}
                      </span>
                      <span className="text-zinc-400">{s.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. BUY / SELL */}
        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              BUY / SELL
            </div>
            {directionStats.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {directionStats.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200">{s.key}</span>
                    <div className="flex items-center gap-2">
                      <span className={s.netPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'}>
                        {formatMoney(s.netPnl, currency, 0, true)}
                      </span>
                      <span className="text-zinc-400">{s.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. THEO PHIÊN */}
        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              THEO PHIÊN
            </div>
            {sessionStats.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-2">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {sessionStats.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200">{s.key}</span>
                    <div className="flex items-center gap-2">
                      <span className={s.netPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'}>
                        {formatMoney(s.netPnl, currency, 0, true)}
                      </span>
                      <span className="text-zinc-400">{s.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT AREA: Charts Grid (Col span 9) */}
      <div className="lg:col-span-9 space-y-4">
        {/* ROW 1: P&L Theo Setup & P&L Theo Symbol */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* P&L Theo Setup */}
          <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-[#26282c]/40">
              <span className="text-xs font-bold text-zinc-300">P&L Theo Setup</span>
              <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-400" />
                  Số lệnh
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-300" />
                  Net profit
                </span>
              </div>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={setupStats.length > 0 ? setupStats : emptyDualAxisData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke="#24262a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tick={{ fill: '#6e7681', fontSize: 10 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={setupStats.length > 0 ? ['auto', 'auto'] : [-0.1, 0.1]}
                    ticks={setupStats.length > 0 ? undefined : [-0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06, 0.08, 0.1]}
                    tickFormatter={(v: number) => (setupStats.length > 0 ? formatMoney(v, currency, 0) : v.toFixed(2).replace('.', ','))}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={setupStats.length > 0 ? [0, 'auto'] : [0, 1.0]}
                    ticks={setupStats.length > 0 ? undefined : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="#484f58" />
                  <Bar yAxisId="left" dataKey="netPnl" fill="#00e676" radius={[3, 3, 0, 0]}>
                    {setupStats.map((entry, index) => (
                      <Cell key={`setup-${index}`} fill={entry.netPnl >= 0 ? '#00e676' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* P&L Theo Symbol */}
          <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-[#26282c]/40">
              <span className="text-xs font-bold text-zinc-300">P&L Theo Symbol</span>
              <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-400" />
                  Số lệnh
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-300" />
                  Net profit
                </span>
              </div>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={symbolStats.length > 0 ? symbolStats : emptyDualAxisData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke="#24262a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tick={{ fill: '#6e7681', fontSize: 10 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={symbolStats.length > 0 ? ['auto', 'auto'] : [-0.1, 0.1]}
                    ticks={symbolStats.length > 0 ? undefined : [-0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06, 0.08, 0.1]}
                    tickFormatter={(v: number) => (symbolStats.length > 0 ? formatMoney(v, currency, 0) : v.toFixed(2).replace('.', ','))}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={symbolStats.length > 0 ? [0, 'auto'] : [0, 1.0]}
                    ticks={symbolStats.length > 0 ? undefined : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="#484f58" />
                  <Bar yAxisId="left" dataKey="netPnl" fill="#00e676" radius={[3, 3, 0, 0]}>
                    {symbolStats.map((entry, index) => (
                      <Cell key={`sym-${index}`} fill={entry.netPnl >= 0 ? '#00e676' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ROW 2: P&L Timeframe, P&L Theo Phiên, P&L Long / Short (3-col) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* P&L Timeframe */}
          <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-bold text-zinc-300 pb-2 border-b border-[#26282c]/40">
              P&L Timeframe
            </div>
            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={timeframeStats.length > 0 ? timeframeStats : emptyDualAxisData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#24262a" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={timeframeStats.length > 0 ? ['auto', 'auto'] : [-0.1, 0.1]}
                    ticks={timeframeStats.length > 0 ? undefined : [-0.1, -0.06, -0.02, 0, 0.02, 0.06, 0.1]}
                    tickFormatter={(v: number) => v.toFixed(2).replace('.', ',')}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    tick={{ fill: '#6e7681', fontSize: 10 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <ReferenceLine x={0} stroke="#484f58" />
                  <Bar dataKey="netPnl" fill="#00e676" radius={[0, 3, 3, 0]}>
                    {timeframeStats.map((entry, index) => (
                      <Cell key={`tf-${index}`} fill={entry.netPnl >= 0 ? '#00e676' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* P&L Theo Phiên */}
          <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-bold text-zinc-300 pb-2 border-b border-[#26282c]/40">
              P&L Theo Phiên
            </div>
            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sessionStats.length > 0 ? sessionStats : emptyDualAxisData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#24262a" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={sessionStats.length > 0 ? ['auto', 'auto'] : [-0.1, 0.1]}
                    ticks={sessionStats.length > 0 ? undefined : [-0.1, -0.06, -0.02, 0, 0.02, 0.06, 0.1]}
                    tickFormatter={(v: number) => v.toFixed(2).replace('.', ',')}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    tick={{ fill: '#6e7681', fontSize: 10 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <ReferenceLine x={0} stroke="#484f58" />
                  <Bar dataKey="netPnl" fill="#00e676" radius={[0, 3, 3, 0]}>
                    {sessionStats.map((entry, index) => (
                      <Cell key={`sess-${index}`} fill={entry.netPnl >= 0 ? '#00e676' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* P&L Long / Short */}
          <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-bold text-zinc-300 pb-2 border-b border-[#26282c]/40">
              P&L Long / Short
            </div>
            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={directionStats.length > 0 ? directionStats : emptyDualAxisData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#24262a" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={directionStats.length > 0 ? ['auto', 'auto'] : [-0.1, 0.1]}
                    ticks={directionStats.length > 0 ? undefined : [-0.1, -0.06, -0.02, 0, 0.02, 0.06, 0.1]}
                    tickFormatter={(v: number) => v.toFixed(2).replace('.', ',')}
                    tick={{ fill: '#6e7681', fontSize: 9 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    tick={{ fill: '#6e7681', fontSize: 10 }}
                    axisLine={{ stroke: '#2c2e33' }}
                    tickLine={false}
                  />
                  <ReferenceLine x={0} stroke="#484f58" />
                  <Bar dataKey="netPnl" fill="#00e676" radius={[0, 3, 3, 0]}>
                    {directionStats.map((entry, index) => (
                      <Cell key={`dir-${index}`} fill={entry.netPnl >= 0 ? '#00e676' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ROW 3: P&L THỰC TẾ - LÝ THUYẾT (Full width) */}
        <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#26282c]/40 gap-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              P&L THỰC TẾ - LÝ THUYẾT
            </span>

            {/* Metric counters: Lý Thuyết, Thực tế, Chênh lệch */}
            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-white">
                  {formatMoney(theorySummary.theoryTotal, currency, 0, true)}
                </div>
                <div className="text-[10px] text-zinc-500">Lý Thuyết</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-white">
                  {formatMoney(theorySummary.actualTotal, currency, 0, true)}
                </div>
                <div className="text-[10px] text-zinc-500">Thực tế</div>
              </div>
              <div className="text-right">
                <div
                  className={`text-sm font-bold font-mono ${
                    theorySummary.diff >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                  }`}
                >
                  {formatMoney(theorySummary.diff, currency, 0, true)}
                </div>
                <div className="text-[10px] text-zinc-500">Chênh lệch</div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 py-2 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400" />
              Thực tế
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-rose-500" />
              Lý thuyết
            </span>
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={theoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  tickFormatter={(v: number) => (hasTrades ? formatMoney(v, currency, 0) : v.toFixed(1).replace('.', ','))}
                  tick={{ fill: '#6e7681', fontSize: 9 }}
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
                          <div className="text-zinc-400 font-medium">{item.label}</div>
                          <div className="text-amber-400 font-mono">
                            Thực tế: {formatMoney(item.actual, currency, 2, true)}
                          </div>
                          <div className="text-rose-400 font-mono">
                            Lý thuyết: {formatMoney(item.theory, currency, 2, true)}
                          </div>
                        </div>
                      );
                    }}
                  />
                )}
                <Line type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="theory" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
