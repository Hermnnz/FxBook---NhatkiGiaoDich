'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useJournalData } from '@/contexts/journal-context';
import {
  calcStats,
  calcMaxDrawdown,
  calcRMultiples,
  calcSharpeLikeRatio,
  calcRecoveryFactor,
  sortTradesByTime,
} from '@/lib/calculations';
import { localDateKey } from '@/lib/phase5/readiness';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import type { Trade } from '@/types';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { TradeFormModal } from '@/components/trades/trade-form-modal';
import { MarketSessionsClock } from '@/components/dashboard/market-sessions-clock';
import { PerformanceRadar } from '@/components/dashboard/performance-radar';
import { EquityCharts } from '@/components/dashboard/equity-charts';
import { PnLHeatmapCalendar } from '@/components/dashboard/pnl-heatmap-calendar';
import { TradeBreakdown } from '@/components/dashboard/trade-breakdown';
import { PsychologyScorecard } from '@/components/dashboard/psychology-scorecard';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { formatMoney } from '@/components/dashboard/format-money';
import { useTodayReadiness } from '@/components/dashboard/readiness-badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2 } from 'lucide-react';

function weekOfMonth(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const mondayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return Math.floor((day + mondayOffset - 1) / 7) + 1;
}

export default function DashboardPage() {
  const canWrite = useJournalWritable();
  const readiness = useTodayReadiness();
  const {
    accounts,
    trades,
    transactions,
    userEmail,
    selectedAccountId,
    setSelectedAccountId,
    balances,
    loading,
    refreshData,
  } = useJournalData();

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedWeek, setSelectedWeek] = useState<string>('all');

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  function handleAccountSelect(id: string) {
    setSelectedAccountId(id);
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const activeAccountId = activeAccount?.id;
  const initialBalance = activeAccount?.initial_balance ?? 0;
  const accountRiskPct = activeAccount?.risk_pct ?? 1.0;
  const activeBalance = activeAccount
    ? (balances[activeAccount.id] ?? activeAccount.initial_balance)
    : 0;
  const currency = activeAccount?.currency ?? 'USD';

  // Filter trades for active account
  const allAccountTrades = activeAccountId ? trades.filter((t) => t.account_id === activeAccountId) : [];
  const availableMonths = [...new Set(allAccountTrades.map((trade) =>
    localDateKey(new Date(trade.close_time || trade.date)).slice(0, 7),
  ))].sort().reverse();
  const availableWeeks = selectedMonth === 'all' ? [] : [...new Set(allAccountTrades
    .map((trade) => localDateKey(new Date(trade.close_time || trade.date)))
    .filter((dateKey) => dateKey.startsWith(selectedMonth))
    .map(weekOfMonth))].sort((a, b) => a - b);
  const accountTrades = allAccountTrades.filter((trade) => {
    if (selectedMonth === 'all') return true;
    const dateKey = localDateKey(new Date(trade.close_time || trade.date));
    if (!dateKey.startsWith(selectedMonth)) return false;
    return selectedWeek === 'all' || weekOfMonth(dateKey) === Number(selectedWeek);
  });
  const chronologicalTrades = sortTradesByTime(accountTrades);

  // Calculate statistics using shared calculations engine
  const stats = calcStats(chronologicalTrades);
  const mdd = calcMaxDrawdown(chronologicalTrades, initialBalance);

  // Additional financial ratios
  const netDepositWithdrawal = transactions.filter((tx) => tx.account_id === activeAccountId).reduce((acc, tx) =>
    tx.type === 'deposit' ? acc + tx.amount : acc - tx.amount, 0);

  const recoveryFactor = calcRecoveryFactor(stats.totalPnl, mdd.maxDrawdownUsd);
  const allRMultiples = activeAccount ? calcRMultiples(accountTrades, activeAccount) : [];
  const rMultiples = allRMultiples.filter((r): r is number => r !== null);
  const estimatedRCount = accountTrades.filter((trade, index) =>
    trade.risk_amount == null && allRMultiples[index] !== null,
  ).length;
  const sharpe = calcSharpeLikeRatio(rMultiples);

  const riskPerTradeUsd = (activeBalance * accountRiskPct) / 100;

  const pnlPercent = initialBalance > 0 ? (stats.totalPnl / initialBalance) * 100 : 0;

  const expectancy = stats.totalTrades > 0 ? stats.totalPnl / stats.totalTrades : 0;

  // Contextual greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return '🌤️ Chào buổi sáng!';
    if (hour >= 11 && hour < 14) return '☀️ Chào buổi trưa!';
    if (hour >= 14 && hour < 18) return '⛅ Chào buổi chiều!';
    return '🌙 Chào buổi tối!';
  }, []);

  return (
    <div className="flex min-h-screen bg-[#111214] text-zinc-100">
      <Sidebar userEmail={userEmail} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-4 md:p-6 space-y-6 flex-1 max-w-[1700px] w-full mx-auto">
          {/* Top Header / Filter Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#26282c]/60">
            <div>
              <div className="text-xs font-semibold text-[#00e676] mb-0.5">{greeting}</div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>TRADING JOURNAL</span>
                <span className="text-[#ff4757]">_ Tổng quan</span>
              </h1>
              <p className="text-xs text-zinc-400">
                Nhật ký giao dịch · Theo dõi hiệu suất giao dịch toàn diện
              </p>
            </div>

            {/* Dropdown Filters & CTA Button */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Account Dropdown */}
              <select
                value={activeAccount?.id ?? ''}
                onChange={(e) => handleAccountSelect(e.target.value)}
                className="bg-[#1e2022] border border-[#2d3034] text-zinc-200 text-xs rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-[#00e676]"
              >
                {accounts.length === 0 ? (
                  <option value="">Tất cả tài khoản</option>
                ) : (
                  accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))
                )}
              </select>

              {/* Month Dropdown */}
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setSelectedWeek('all'); }}
                className="bg-[#1e2022] border border-[#2d3034] text-zinc-200 text-xs rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-[#00e676]"
              >
                <option value="all">Tất cả tháng</option>
                {availableMonths.map((month) => <option key={month} value={month}>{month.slice(5, 7)}/{month.slice(0, 4)}</option>)}
              </select>

              {/* Week Dropdown */}
              <select
                value={selectedMonth === 'all' ? 'all' : selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                disabled={selectedMonth === 'all'}
                className="bg-[#1e2022] border border-[#2d3034] text-zinc-200 text-xs rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-[#00e676]"
              >
                <option value="all">Tất cả tuần</option>
                {availableWeeks.map((week) => <option key={week} value={week}>Tuần {week}</option>)}
              </select>

              {/* Primary CTA + Thêm Lệnh */}
              <Button
                disabled={!activeAccount || !canWrite}
                onClick={() => {
                  setEditingTrade(null);
                  setFormModalOpen(true);
                }}
                className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.35)]"
              >
                + Thêm Lệnh
              </Button>
            </div>
          </div>

          {/* 1. Market Sessions Realtime Clock */}
          <MarketSessionsClock />

          {loading && accounts.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-[#00e676]" />
              Đang tải dữ liệu dashboard...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-[#26282c] bg-[#18191c] p-10 text-center space-y-3">
              <h2 className="text-lg font-bold">Tạo tài khoản giao dịch đầu tiên</h2>
              <p className="text-sm text-zinc-400">Bạn cần một tài khoản để ghi lệnh và xem thống kê.</p>
              <Link href="/accounts" className="inline-flex rounded-md bg-[#00e676] px-4 py-2 text-sm font-semibold text-zinc-950">Quản lý tài khoản</Link>
            </div>
          ) : (
            <>
              {/* 2. KPI Cards (Row 1: 6 cards, Row 2: 3 cards) */}
              {/* 2. KPI Cards (Row 1: 6 cards, Row 2: 3 cards) */}
              <div className="space-y-3">
                {/* Row 1: 6 Core Ratio Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* NET PROFIT */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      NET PROFIT
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        stats.totalPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(stats.totalPnl, currency, 0, true)}
                    </div>
                    <div className="text-[10px] text-[#00e676] font-mono">
                      {pnlPercent >= 0 ? `+${pnlPercent.toFixed(0)}%` : `${pnlPercent.toFixed(0)}%`}
                    </div>
                  </div>

                  {/* SHARPE-LIKE RATIO */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      SHARPE-LIKE RATIO
                    </div>
                    <div className="text-xl font-bold font-mono text-zinc-300">
                      {stats.totalTrades < 5 || sharpe === null ? '—' : sharpe.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500">mean(R) / stddev(R){estimatedRCount > 0 ? ` · ${estimatedRCount} R ước tính` : ''}</div>
                  </div>

                  {/* PROFIT FACTOR */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      PROFIT FACTOR
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        stats.totalTrades > 0 && stats.profitFactor >= 1.5 ? 'text-[#00e676]' : 'text-[#ff4757]'
                      }`}
                    >
                      {stats.totalTrades > 0 ? (stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)) : '0.00'}
                    </div>
                    <div className="text-[10px] text-zinc-500">Gross Win / Gross Loss</div>
                  </div>

                  {/* MAX DRAWDOWN */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      MAX DRAWDOWN
                    </div>
                    <div className="text-xl font-bold font-mono text-[#ff4757]">
                      {formatMoney(mdd.maxDrawdownUsd, currency, 0)}
                    </div>
                    <div className="text-[10px] text-[#ff4757] font-mono">
                      -{mdd.maxDrawdownPct.toFixed(0)}%
                    </div>
                  </div>

                  {/* RECOVERY FACTOR */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      RECOVERY FACTOR
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        Number(recoveryFactor) > 0 ? 'text-[#00e676]' : 'text-[#ff4757]'
                      }`}
                    >
                      {recoveryFactor.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Net Profit / Max DD</div>
                  </div>

                  {/* EXPECTANCY */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      KỲ VỌNG TB MỖI LỆNH
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        expectancy >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(expectancy, currency, 0, true)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Expectancy / Trade</div>
                  </div>
                </div>

                {/* Row 2: Balance, Deposits, & Readiness Banner */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* TIỀN NẠP/RÚT */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      TIỀN NẠP/RÚT
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        netDepositWithdrawal >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(netDepositWithdrawal, currency, 0, true)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Dòng tiền nạp - rút</div>
                  </div>

                  {/* SỐ DƯ TÀI KHOẢN */}
                  <div className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 space-y-1 rounded-xl text-center flex flex-col items-center justify-center">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                      SỐ DƯ TÀI KHOẢN
                    </div>
                    <div className="text-xl font-bold font-mono text-white">
                      {formatMoney(activeBalance, currency, 0)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Vốn đầu: {formatMoney(activeAccount?.initial_balance ?? 0, currency, 0)}
                    </div>
                  </div>

                  {/* TRẠNG THÁI HÔM NAY (Card leading to /readiness) */}
                  <Link
                    href="/readiness"
                    className="border border-[#26282c] bg-[#18191c] text-zinc-100 p-3.5 flex items-center justify-between rounded-xl hover:border-amber-500/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                        ?
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase">
                          TRẠNG THÁI HÔM NAY
                        </div>
                        <div className="text-xs font-semibold text-amber-400">
                          {readiness ? `${readiness.score}/100 · ${readiness.band === 'green' ? 'Sẵn sàng' : readiness.band === 'yellow' ? 'Cần thận trọng' : 'Nên dừng giao dịch'}` : 'Chưa tự kiểm tra hôm nay'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </Link>
                </div>
              </div>

              {/* 3. Section: THỐNG KÊ & HIỆU SUẤT */}
              <div className="space-y-3 pt-4">
                <h2 className="text-sm font-bold text-[#00e676] uppercase tracking-wider">
                  THỐNG KÊ & HIỆU SUẤT
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Radar Chart + Win Rate circle */}
                  <div className="lg:col-span-1">
                    <PerformanceRadar trades={accountTrades} account={activeAccount} />
                  </div>

                  {/* Right Column: Key metrics grid + Financial Charts */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Row of 6 stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">TỔNG LỢI NHUẬN</div>
                        <div className="text-sm font-bold font-mono text-[#00e676] mt-0.5">
                          {formatMoney(stats.grossWin, currency, 1, false)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">TỔNG THUA LỖ</div>
                        <div className="text-sm font-bold font-mono text-[#ff4757] mt-0.5">
                          {formatMoney(-stats.grossLoss, currency, 1)}
                        </div>
                      </div>
                      <div title="Phí ròng: số dương là chi phí; số âm là khoản swap/hoàn phí được cộng vào kết quả." className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">PHÍ RÒNG / SWAP</div>
                        <div className="text-sm font-bold font-mono text-zinc-200 mt-0.5">
                          {formatMoney(
                            accountTrades.reduce((sum, t) => sum + (t.fee || 0), 0),
                            currency,
                            1
                          )}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">NET PROFIT</div>
                        <div
                          className={`text-sm font-bold font-mono mt-0.5 ${
                            stats.totalPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                          }`}
                        >
                          {formatMoney(stats.totalPnl, currency, 1, true)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">RỦI RO/LỆNH ({currency})</div>
                        <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                          {formatMoney(riskPerTradeUsd, currency, 2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-medium">RỦI RO/LỆNH (%)</div>
                        <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                          {(activeAccount?.risk_pct ?? 1.0).toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* Row of Avg W/L, Big Win/Loss, Streaks */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {/* Avg W/L with split bar */}
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] space-y-2 text-center flex flex-col justify-center">
                        <div className="flex justify-between text-[10px] text-zinc-500 font-medium">
                          <span>Avg W/L</span>
                          <span>—</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-800 flex overflow-hidden">
                          <div
                            className="bg-[#00e676] h-full"
                            style={{
                              width: `${
                                stats.avgWin + stats.avgLoss > 0
                                  ? (stats.avgWin / (stats.avgWin + stats.avgLoss)) * 100
                                  : 50
                              }%`,
                            }}
                          />
                          <div
                            className="bg-[#ff4757] h-full"
                            style={{
                              width: `${
                                stats.avgWin + stats.avgLoss > 0
                                  ? (stats.avgLoss / (stats.avgWin + stats.avgLoss)) * 100
                                  : 50
                              }%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-[#00e676]">+{formatMoney(stats.avgWin, currency, 1)}</span>
                          <span className="text-[#ff4757]">
                            {formatMoney(-stats.avgLoss, currency, 1)}
                          </span>
                        </div>
                      </div>

                      {/* Big Win */}
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 font-medium">Big Win</div>
                        <div className="text-sm font-bold font-mono text-[#00e676] mt-1">
                          {formatMoney(stats.largestWin, currency, 1, false)}
                        </div>
                      </div>

                      {/* Big Loss */}
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 font-medium">Big Loss</div>
                        <div className="text-sm font-bold font-mono text-[#ff4757] mt-1">
                          {formatMoney(-stats.largestLoss, currency, 1)}
                        </div>
                      </div>

                      {/* Streaks */}
                      <div className="p-3 rounded-xl bg-[#18191c] border border-[#26282c] text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] text-zinc-500 font-medium">Chuỗi thắng/thua</div>
                        <div className="text-sm font-bold font-mono mt-1">
                          <span className="text-[#00e676]">{stats.maxWinStreak}</span>
                          <span className="text-zinc-500 mx-1">/</span>
                          <span className="text-[#ff4757]">{stats.maxLossStreak}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Charts (Equity Curve & Daily Net) */}
                    <EquityCharts trades={accountTrades} account={activeAccount} />
                  </div>
                </div>
              </div>

              {/* 4. Section: Heatmap P&L Calendar & Recent Trades */}
              <div className="pt-4">
                <PnLHeatmapCalendar trades={accountTrades} account={activeAccount} currency={currency} displayMonth={selectedMonth} />
              </div>

              {/* 5. Section: CHẤT LƯỢNG GIAO DỊCH */}
              <div className="space-y-3 pt-4">
                <h2 className="text-sm font-bold text-[#00e676] uppercase tracking-wider">
                  CHẤT LƯỢNG GIAO DỊCH
                </h2>
                <TradeBreakdown trades={accountTrades} currency={currency} />
              </div>

              {/* 6. Section: THANG ĐIỂM THỰC THI LỆNH */}
              <div className="space-y-3 pt-4">
                <h2 className="text-sm font-bold text-[#00e676] uppercase tracking-wider">
                  THANG ĐIỂM THỰC THI LỆNH
                </h2>
                <PsychologyScorecard trades={accountTrades} currency={currency} />
              </div>
            </>
          )}

          {/* Page Footer Sanity Banner */}
          <PageFooterBanner />
        </main>
      </div>

      {/* Floating Action Button (+) */}
      <FloatingActionButton
        accounts={accounts}
        activeAccountId={selectedAccountId}
        onTradeAdded={refreshData}
      />

      {/* Trade Form Modal */}
      <TradeFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        trade={editingTrade}
        accounts={accounts}
        activeAccountId={selectedAccountId}
        onSuccess={refreshData}
      />
    </div>
  );
}
