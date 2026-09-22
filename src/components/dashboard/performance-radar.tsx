'use client';

import { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { calcPerformanceScore, calcStats, calcMaxDrawdown, sortTradesByTime } from '@/lib/calculations';
import type { Trade, Account } from '@/types';

interface PerformanceRadarProps {
  trades: Trade[];
  account?: Account | null;
}

export function PerformanceRadar({ trades, account }: PerformanceRadarProps) {
  const chronologicalTrades = useMemo(() => sortTradesByTime(trades), [trades]);
  const stats = useMemo(() => calcStats(chronologicalTrades), [chronologicalTrades]);
  const mdd = useMemo(
    () => calcMaxDrawdown(chronologicalTrades, account?.initial_balance ?? 0),
    [chronologicalTrades, account]
  );

  const score = useMemo(
    () => calcPerformanceScore(stats, mdd.maxDrawdownPct, trades),
    [stats, mdd, trades]
  );

  const radarData = useMemo(() => {
    return [
      { subject: 'Profit Factor', score: score.profitability, fullMark: 100 },
      { subject: 'Avg Win/Loss', score: score.riskManagement, fullMark: 100 },
      { subject: 'Max Drawdown', score: score.consistency, fullMark: 100 },
      { subject: 'Win Rate', score: score.discipline, fullMark: 100 },
      { subject: 'Recovery', score: score.tradeQuality, fullMark: 100 },
      { subject: 'Consistency', score: score.psychology, fullMark: 100 },
    ];
  }, [score]);

  const winRate = stats.totalTrades > 0 ? stats.winRate : 0;
  const strokeDashoffset = 283 - (283 * winRate) / 100;

  return (
    <div className="h-full border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl flex flex-col justify-between p-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#26282c]/40">
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
          ĐIỂM HIỆU SUẤT
        </span>
        <span className="text-sm font-bold text-[#00e676] font-mono">
          {score.overall.toFixed(0)} / 100
        </span>
      </div>

      {/* 6-Axis Radar Chart */}
      <div className="h-64 w-full my-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
            <PolarGrid stroke="#2c2e33" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: '#80868b', fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Điểm"
              dataKey="score"
              stroke="#ff4757"
              fill="#ff4757"
              fillOpacity={0.25}
              dot={{ r: 3, fill: '#ff4757' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Win Rate Donut Gauge */}
      <div className="flex flex-col items-center justify-center pt-2 border-t border-[#26282c]/60">
        <div className="relative flex items-center justify-center w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#24262a"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={winRate >= 50 ? '#00e676' : '#ff4757'}
              strokeWidth="8"
              strokeDasharray="283"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold font-mono text-white">
              {winRate.toFixed(0)}
            </span>
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              WIN RATE%
            </span>
          </div>
        </div>

        {/* 3 Count Stats Underneath */}
        <div className="grid grid-cols-3 w-full text-center mt-4 pt-3 border-t border-[#26282c]/60">
          <div>
            <div className="text-sm font-bold font-mono text-white">
              {stats.totalTrades}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Tổng lệnh</div>
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-[#00e676]">
              {stats.wins}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Lệnh thắng</div>
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-rose-400">
              {stats.losses}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">Lệnh thua</div>
          </div>
        </div>
      </div>
    </div>
  );
}
