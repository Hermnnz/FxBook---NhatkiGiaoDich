'use client';

import { useEffect, useState } from 'react';
import { useJournalData } from '@/contexts/journal-context';
import {
  calcStats,
  calcMaxDrawdown,
  calcSharpeLikeRatio,
  calcExpectancy,
  calcRecoveryFactor,
  netProfit,
  sortTradesByTime,
} from '@/lib/calculations';
import { buildReportAnalytics, filterReportTrades, isReportReviewed, reportPeriodBounds, type ReportPeriod } from '@/lib/report-analytics';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { formatMoney } from '@/components/dashboard/format-money';
import { Card } from '@/components/ui/card';
import { ComparisonChart, TradeMatrix, SetupTable, ParetoCharts } from '@/components/report/report-visuals';
import { ReportReviewForm } from '@/components/report/report-review-form';
import {
  Award,
  FileText,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

export default function ReportPage() {
  const {
    accounts,
    trades,
    userEmail,
    selectedAccountId,
    setSelectedAccountId,
    refreshData,
    isRefreshing,
  } = useJournalData();

  const [periodMode, setPeriodMode] = useState<ReportPeriod>('all');

  useEffect(() => {
    const refreshOnFocus = () => { void refreshData({ silent: true }); };
    const refreshOnVisible = () => { if (document.visibilityState === 'visible') refreshOnFocus(); };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [refreshData]);

  function handleAccountSelect(id: string) {
    setSelectedAccountId(id);
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const activeAccountId = activeAccount?.id;
  const initialBalance = activeAccount?.initial_balance ?? 0;
  const currency = activeAccount?.currency ?? 'USD';

  const bounds = reportPeriodBounds(periodMode);
  const accountTotalTrades = activeAccountId ? trades.filter((trade) => trade.account_id === activeAccountId).length : 0;
  const accountTrades = activeAccountId ? filterReportTrades(trades, activeAccountId, bounds) : [];

  const chronologicalTrades = sortTradesByTime(accountTrades);
  const totalTrades = accountTrades.length;
  const isGatePassed = totalTrades >= 5;
  const analytics = buildReportAnalytics(accountTrades);
  const reviewKey = activeAccountId && bounds.cycleType && bounds.start
    ? { accountId: activeAccountId, cycleType: bounds.cycleType, periodStart: bounds.start } : null;

  // 1. PART 1: SYSTEM EDGE CALCULATIONS
  const stats = calcStats(chronologicalTrades);
  const mdd = calcMaxDrawdown(chronologicalTrades, initialBalance);
  // MT5 history may show the final moved SL rather than the original risk.
  // Only use explicit risk on non-MT5 trades for R-based metrics.
  const riskTrades = accountTrades.filter((trade) =>
    trade.risk_amount != null && trade.risk_amount > 0 && !trade.mt5_key?.startsWith('mt5_'));
  const reliableRMultiples = riskTrades.map((trade) => netProfit(trade) / trade.risk_amount!);
  const sharpe = reliableRMultiples.length >= 5 ? calcSharpeLikeRatio(reliableRMultiples) : null;
  const expectancy = calcExpectancy(accountTrades, reliableRMultiples);
  const recoveryFactor = calcRecoveryFactor(stats.totalPnl, mdd.maxDrawdownUsd);
  const payoffRatio = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 0;

  // 2. PART 2: EXECUTION QUALITY CALCULATIONS
  const executionMetrics = (() => {
    let cleanTrades = 0;
    let completeTrades = 0;
    let disciplineLoss = 0;
    let violatingNetPnl = 0;

    accountTrades.forEach((t) => {
      const hasErrors = t.eval_errors && t.eval_errors.length > 0;

      const isComplete = isReportReviewed(t);
      if (isComplete) {
        completeTrades++;
        if (!hasErrors) cleanTrades++;
      }

      if (hasErrors) {
        const np = netProfit(t);
        violatingNetPnl += np;
        if (np < 0) disciplineLoss += Math.abs(np);
      }
    });

    const disciplineRate = completeTrades > 0 ? (cleanTrades / completeTrades) * 100 : null;
    const completenessRate = totalTrades > 0 ? (completeTrades / totalTrades) * 100 : 0;
    const potentialPnl = stats.totalPnl - violatingNetPnl;

    return {
      disciplineRate: disciplineRate === null ? null : Math.round(disciplineRate * 10) / 10,
      reviewedTrades: completeTrades,
      completenessRate: Math.round(completenessRate * 10) / 10,
      disciplineLoss: Math.round(disciplineLoss * 100) / 100,
      potentialPnl: Math.round(potentialPnl * 100) / 100,
      hypotheticalDifference: Math.round(-violatingNetPnl * 100) / 100,
    };
  })();

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar userEmail={userEmail} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Top Header & Dropdown Controls matching report.png */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#27292d]/60">
            <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <FileText className="h-6 w-6 text-emerald-400" />
                <span>Báo cáo</span>
              </h1>
              <p className="text-xs text-zinc-400">
                Trả lời 2 câu hỏi: hệ thống có lợi thế không, và thực thi có vấn đề không
              </p>
            </div>

            {/* Dropdown filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountSelect(e.target.value)}
                className="bg-[#1e2022] border border-[#2d3034] text-xs rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#00e676]"
              >
                <option value="">-- Chọn tài khoản --</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              <select
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as ReportPeriod)}
                aria-label="Kỳ báo cáo"
                className="bg-[#1e2022] border border-[#2d3034] text-xs rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#00e676]"
              >
                <option value="all">Toàn bộ lịch sử</option>
                <option value="currentWeek">Tuần này</option>
                <option value="previousWeek">Tuần trước</option>
                <option value="currentMonth">Tháng này</option>
                <option value="previousMonth">Tháng trước</option>
              </select>
              <button type="button" onClick={() => { void refreshData({ silent: true }); }} disabled={isRefreshing}
                className="inline-flex items-center gap-1 rounded-lg border border-[#2d3034] bg-[#1e2022] px-3 py-2 text-xs text-zinc-200 hover:border-emerald-600 disabled:opacity-50">
                <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Làm mới
              </button>
            </div>
          </div>

          {/* Condition Box matching report.png */}
          <div className="p-4 rounded-xl border border-[#27292d] bg-[#1a1c1e] text-xs space-y-2">
            <div className="font-semibold text-zinc-200 flex items-center gap-2">
              <span>💡</span>
              <span>Để có kết quả tốt nhất, báo cáo cần đủ điều kiện sau:</span>
            </div>
            <div className="text-zinc-400 space-y-1 pl-6">
              <div className={isGatePassed ? '' : 'text-amber-400'}>— {totalTrades}/5 lệnh trong {bounds.label.toLowerCase()} ({accountTotalTrades} lệnh của tài khoản).</div>
              <div className={analytics.completeness >= 95 ? '' : 'text-amber-400'}>— {analytics.completeness.toFixed(0)}%/95% lệnh có đánh giá đủ trước, trong, sau và xác nhận mục lỗi ({analytics.reviewedCount}/{totalTrades}).</div>
              {analytics.importedUnreviewedCount > 0 && <div>— {analytics.importedUnreviewedCount} lệnh nhập từ file chưa đủ đánh giá 4 mục; ma trận và tỷ lệ kỷ luật chưa tính các lệnh này.</div>}
              {bounds.start && bounds.end && <div>— Khoảng ngày: {bounds.start} đến trước {bounds.end}, theo giờ máy của bạn.</div>}
              {totalTrades === 0 && accountTotalTrades > 0 && <div className="text-amber-300">Kỳ này chưa có lệnh; chọn “Toàn bộ lịch sử” để xem {accountTotalTrades} lệnh đã ghi.</div>}
              <div>Chỉ số vẫn hiển thị khi chưa đủ điều kiện, nhưng mẫu nhỏ hoặc đánh giá thiếu có thể gây lệch.</div>
            </div>
          </div>

          {/* Empty State when no account chosen */}
          {!activeAccount ? (
            <div className="p-16 rounded-xl border-2 border-dashed border-[#27292d] bg-[#16181a] text-center text-zinc-400 text-sm flex items-center justify-center">
              <span>👆 Chọn 1 tài khoản để bắt đầu tạo báo cáo</span>
            </div>
          ) : (
            <>
              {/* Part 1: Lợi Thế Hệ Thống (System Edge) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#00e676]" />
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Phần 1 — Hệ thống có lợi thế không?
                    </h2>
                  </div>
                  <span className="text-xs text-zinc-400">
                    Hệ thống có kỳ vọng toán học dương (+EV) không?
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ReportMetric label="Lãi trước phí" value={formatMoney(analytics.gross.wins, currency, 2, true)} note="Tổng Profit dương của lệnh" tone="green" />
                  <ReportMetric label="Lỗ trước phí" value={formatMoney(-analytics.gross.losses, currency, 2, true)} note="Tổng Profit âm của lệnh" tone="red" />
                  <ReportMetric label="Phí ròng" value={formatMoney(analytics.gross.fees, currency, 2, true)} note="Số dương là chi phí; âm là ghi có" />
                  <ReportMetric label="PF trước phí" value={analytics.grossProfitFactor === null ? '—' : Number.isFinite(analytics.grossProfitFactor) ? analytics.grossProfitFactor.toFixed(2) : '∞'} note="Lãi trước phí / |lỗ trước phí|" />
                </div>
                <ComparisonChart data={analytics.comparison} count={analytics.comparisonCount} currency={currency} />
                <TradeMatrix analytics={analytics} currency={currency} emphasize="correct" />
                <SetupTable setups={analytics.setups} currency={currency} />
                <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-xs text-zinc-300">
                  <strong className="text-emerald-300">Nhận xét hệ thống:</strong> {analytics.setups.length === 0 ? 'Chưa đủ lệnh được đánh giá và gắn setup để nhận xét theo setup.' : `Có ${analytics.setups.length} setup trong nhóm lệnh đã đánh giá và chưa ghi nhận lỗi. Dựa vào bảng R:R, số lệnh và P&L ròng để chọn setup cần xem lại.`}
                </div>
                <h3 className="pt-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Chỉ số bổ sung</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Win Rate */}
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Win Rate</div>
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {stats.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {stats.wins} thắng / {stats.losses} thua
                    </div>
                  </Card>

                  {/* Payoff Ratio */}
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Payoff Ratio</div>
                    <div className="text-xl font-bold font-mono text-[#00e676]">
                      {payoffRatio.toFixed(2)}:1
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      TB Lãi {formatMoney(stats.avgWin, currency, 0)} / TB Lỗ {formatMoney(stats.avgLoss, currency, 0)}
                    </div>
                  </Card>

                  {/* Profit Factor */}
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Profit Factor ròng</div>
                    <div className="text-xl font-bold font-mono text-purple-400">
                      {stats.grossLoss === 0 && stats.grossWin > 0 ? '∞' : stats.profitFactor.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Lệnh lãi sau phí / |lệnh lỗ sau phí|</div>
                  </Card>

                  {/* Expectancy */}
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Expectancy</div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        expectancy.expectancyUsd >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(expectancy.expectancyUsd, currency, 1, true)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Kỳ vọng trung bình / lệnh</div>
                  </Card>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Sharpe-like</div>
                    <div className="text-xl font-bold font-mono">{sharpe !== null ? sharpe.toFixed(2) : '—'}</div>
                    <div className="text-[10px] text-zinc-500">mean(R) / stddev(R), cần ≥5 lệnh có rủi ro gốc</div>
                  </Card>
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Sụt giảm lệnh đóng</div>
                    <div className="text-xl font-bold font-mono text-rose-400">{formatMoney(mdd.maxDrawdownUsd, currency, 1)}</div>
                    <div className="text-[10px] text-zinc-500">{mdd.maxDrawdownPct.toFixed(1)}% vốn ban đầu; khác drawdown equity MT5</div>
                  </Card>
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Recovery Factor</div>
                    <div className="text-xl font-bold font-mono">{recoveryFactor.toFixed(2)}</div>
                    <div className="text-[10px] text-zinc-500">Net P&L / Max Drawdown</div>
                  </Card>
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Kỳ vọng R</div>
                    <div className="text-xl font-bold font-mono">{expectancy.expectancyR === null ? '—' : `${expectancy.expectancyR.toFixed(2)}R`}</div>
                    <div className="text-[10px] text-zinc-500">{riskTrades.length}/{totalTrades} lệnh có rủi ro gốc; MT5 không suy từ SL cuối</div>
                  </Card>
                </div>
                {reviewKey ? <ReportReviewForm key={`${activeAccountId}-${periodMode}-edge`} reviewKey={{ ...reviewKey, section: 'edge' }} /> : <p className="rounded-lg border border-[#30343a] p-3 text-xs text-zinc-400">Chọn một tuần hoặc tháng để ghi tự đánh giá cho kỳ đó.</p>}
              </div>

              {/* Part 2: Năng Lực Thực Thi (Execution Quality) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Phần 2 — Thực thi có vấn đề không?
                    </h2>
                  </div>
                  <span className="text-xs text-zinc-400">
                    Trader có tuân thủ đúng quy tắc hệ thống không?
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ReportMetric label="Thực tế toàn kỳ" value={formatMoney(analytics.totalActual, currency, 2, true)} note={`Đủ ${totalTrades} lệnh sau phí`} tone={analytics.totalActual >= 0 ? 'green' : 'red'} />
                  <ReportMetric label="Lý thuyết" value={analytics.comparisonCount ? formatMoney(analytics.theoreticalTotal, currency, 2, true) : '—'} note={`${analytics.comparisonCount}/${totalTrades} lệnh có giá trị đã nhập/tính theo TP`} tone={analytics.theoreticalTotal >= 0 ? 'green' : 'red'} />
                  <ReportMetric label="Chênh lệch có dữ liệu" value={analytics.comparisonCount ? formatMoney(analytics.gap, currency, 2, true) : '—'} note={`Thực tế ${formatMoney(analytics.actualComparisonTotal, currency, 2, true)} trên cùng ${analytics.comparisonCount} lệnh`} tone={analytics.gap >= 0 ? 'green' : 'red'} />
                  <ReportMetric label="Lệnh chốt lời sớm" value={String(analytics.earlyExitCount)} note="Theo thẻ đánh giá đã ghi" tone="red" />
                </div>
                {analytics.comparisonCount === 0 && <p className="text-xs text-amber-300">Chưa có lợi nhuận lý thuyết; thẻ “Thực tế toàn kỳ” vẫn tính đủ lệnh, còn lý thuyết và chênh lệch chưa thể so sánh.</p>}
                <TradeMatrix analytics={analytics} currency={currency} emphasize="wrong" />
                <ParetoCharts pareto={analytics.pareto} />
                <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-xs text-zinc-300">
                  <strong className="text-emerald-300">Nhận xét thực thi:</strong> {analytics.reviewedCount === 0 ? 'Chưa có lệnh đánh giá đủ bốn mục.' : `Có ${analytics.matrix.wrongLoss.length + analytics.matrix.wrongWin.length}/${analytics.reviewedCount} lệnh đã đánh giá có ghi nhận lỗi. Xem Pareto để xác định thẻ nào lặp lại nhiều nhất; chênh lệch P&L chưa tự chứng minh nguyên nhân.`}
                </div>
                <h3 className="pt-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Chỉ số bổ sung</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Tỷ lệ kỷ luật</div>
                    <div className="text-xl font-bold font-mono text-[#00e676]">
                      {executionMetrics.disciplineRate === null ? '—' : `${executionMetrics.disciplineRate}%`}
                    </div>
                    <div className="text-[10px] text-zinc-500">{executionMetrics.reviewedTrades} lệnh đã đánh giá đủ 4 mục</div>
                  </Card>

                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Độ hoàn thiện</div>
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {executionMetrics.completenessRate}%
                    </div>
                    <div className="text-[10px] text-zinc-500">Ghi chép đủ 3 giai đoạn và xác nhận mục lỗi</div>
                  </Card>

                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">Lỗ ở lệnh vi phạm</div>
                    <div className="text-xl font-bold font-mono text-rose-400">
                      -{formatMoney(executionMetrics.disciplineLoss, currency, 1)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Tổng lỗ từ lệnh phá luật</div>
                  </Card>

                  <Card className="border-[#27292d] bg-[#1a1c1e] p-3.5 space-y-1">
                    <div className="text-[11px] text-zinc-400 font-bold uppercase">PnL giả định</div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        executionMetrics.potentialPnl >= 0 ? 'text-[#00e676]' : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(executionMetrics.potentialPnl, currency, 1, true)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Nếu bỏ mọi lệnh có lỗi, kể cả lệnh thắng</div>
                  </Card>
                </div>
                {reviewKey ? <ReportReviewForm key={`${activeAccountId}-${periodMode}-execution`} reviewKey={{ ...reviewKey, section: 'execution' }} /> : <p className="rounded-lg border border-[#30343a] p-3 text-xs text-zinc-400">Chọn một tuần hoặc tháng để ghi tự đánh giá cho kỳ đó.</p>}
              </div>
            </>
          )}

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />
    </div>
  );
}

function ReportMetric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'green' | 'red' }) {
  return <Card className="space-y-1 border-[#30343a] bg-[#1a1c1e] p-3.5">
    <div className="text-[11px] font-bold uppercase text-zinc-400">{label}</div>
    <div className={`font-mono text-xl font-bold ${tone === 'green' ? 'text-emerald-400' : tone === 'red' ? 'text-rose-400' : 'text-white'}`}>{value}</div>
    <div className="text-[10px] text-zinc-500">{note}</div>
  </Card>;
}
