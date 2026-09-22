'use client';

import { useMemo } from 'react';
import { calcTradeQuadMatrix, hasCompleteTradeEvaluation, netProfit } from '@/lib/calculations';
import { formatMoney } from '@/components/dashboard/format-money';
import type { Trade } from '@/types';

interface PsychologyScorecardProps {
  trades: Trade[];
  currency?: string;
}

export function PsychologyScorecard({ trades, currency = 'USD' }: PsychologyScorecardProps) {
  // 1. 4-Quadrant Matrix
  const matrix = useMemo(() => {
    return calcTradeQuadMatrix(trades);
  }, [trades]);

  const totalTrades = trades.length;
  const reviewedTrades = useMemo(() => trades.filter(hasCompleteTradeEvaluation), [trades]);
  const reviewedCount = reviewedTrades.length;

  // Calculate P&L for each quadrant
  const quadPnL = useMemo(() => {
    const sumPnl = (list: Trade[]) => list.reduce((s, t) => s + netProfit(t), 0);
    return {
      cw: sumPnl(matrix.correctWin),
      cl: sumPnl(matrix.correctLoss),
      ww: sumPnl(matrix.wrongWin),
      wl: sumPnl(matrix.wrongLoss),
      total: sumPnl(trades),
    };
  }, [matrix, trades]);

  // Execution Score details (Before 30, During 40, After 30)
  const execDetails = useMemo(() => {
    if (reviewedCount === 0) {
      return {
        overall: null,
        beforeScore: null,
        beforePct: null,
        duringScore: null,
        duringPct: null,
        afterScore: null,
        afterPct: null,
      };
    }

    let beforeSum = 0;
    let duringSum = 0;
    let afterSum = 0;

    reviewedTrades.forEach((t) => {
      // Before: max 30
      const hasPlan = t.eval_before?.includes('✓ Đúng kế hoạch');
      const hasErrorsBefore = t.eval_before?.some((tag) => tag !== '✓ Đúng kế hoạch');
      beforeSum += hasPlan ? 30 : hasErrorsBefore ? 10 : 20;

      // During: max 40
      const followedPlan = t.eval_during?.includes('✓ Tuân thủ kế hoạch');
      const hasErrorsDuring = t.eval_during?.some((tag) => tag !== '✓ Tuân thủ kế hoạch');
      duringSum += followedPlan ? 40 : hasErrorsDuring ? 15 : 25;

      // After: max 30
      const calm = t.eval_after?.includes('😌 Điềm tĩnh');
      const badEmotions = t.eval_after?.some((tag) => ['🤬 Tức giận', '⚔️ Muốn trả thù', '🤯 FOMO'].includes(tag));
      afterSum += calm ? 30 : badEmotions ? 10 : 20;
    });

    const avgBefore = Math.round(beforeSum / reviewedCount);
    const avgDuring = Math.round(duringSum / reviewedCount);
    const avgAfter = Math.round(afterSum / reviewedCount);
    const overall = Math.min(100, Math.round(avgBefore + avgDuring + avgAfter));

    return {
      overall,
      beforeScore: avgBefore,
      beforePct: `${Math.round((avgBefore / 30) * 100)}%`,
      duringScore: avgDuring,
      duringPct: `${Math.round((avgDuring / 40) * 100)}%`,
      afterScore: avgAfter,
      afterPct: `${Math.round((avgAfter / 30) * 100)}%`,
    };
  }, [reviewedTrades, reviewedCount]);

  // Discipline Errors Ranking
  const errorRanking = useMemo(() => {
    const map = new Map<string, { count: number; totalLoss: number }>();

    trades.forEach((t) => {
      if (t.eval_errors && t.eval_errors.length > 0) {
        const np = netProfit(t);
        t.eval_errors.forEach((err) => {
          const cur = map.get(err) || { count: 0, totalLoss: 0 };
          cur.count += 1;
          if (np < 0) cur.totalLoss += Math.abs(np);
          map.set(err, cur);
        });
      }
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalLoss: Math.round(data.totalLoss * 100) / 100,
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss || b.count - a.count);
  }, [trades]);

  const cwPct = reviewedCount > 0 ? Math.round((matrix.correctWin.length / reviewedCount) * 100) : 0;
  const clPct = reviewedCount > 0 ? Math.round((matrix.correctLoss.length / reviewedCount) * 100) : 0;
  const wlPct = reviewedCount > 0 ? Math.round((matrix.wrongLoss.length / reviewedCount) * 100) : 0;
  const wwPct = reviewedCount > 0 ? Math.round((matrix.wrongWin.length / reviewedCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* COLUMN 1: ĐIỂM THỰC THI TỔNG THỂ (Col span 3) */}
      <div className="lg:col-span-3 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-1">
            ĐIỂM THỰC THI TỔNG THỂ
          </div>
          <div className="text-[11px] text-zinc-500 pb-3 border-b border-[#26282c]/40">
            {execDetails.overall !== null ? `Dựa trên ${reviewedCount}/${totalTrades} lệnh đã đánh giá` : 'Chưa có lệnh đánh giá đủ 3 giai đoạn.'}
          </div>

          {/* Big Score Display */}
          <div className="pt-6 pb-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold font-mono text-zinc-300">
                {execDetails.overall !== null ? execDetails.overall : '—'}
              </span>
              <span className="text-base font-medium text-zinc-500 font-mono">/100</span>
            </div>
            {/* Green progress indicator line matching Dashboard_5.png */}
            <div className="w-8 h-1 bg-[#00e676] rounded-full mt-2" />
          </div>

          {/* CHI TIẾT ĐIỂM */}
          <div className="pt-6">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-3">
              CHI TIẾT ĐIỂM
            </div>

            <div className="w-full text-xs">
              <div className="grid grid-cols-4 pb-2 text-[10px] text-zinc-500 font-semibold border-b border-[#26282c]/40">
                <span>GIAI ĐOẠN</span>
                <span className="text-center">ĐIỂM</span>
                <span className="text-center">TỐI ĐA</span>
                <span className="text-right">TỶ LỆ</span>
              </div>

              <div className="divide-y divide-[#26282c]/40">
                <div className="grid grid-cols-4 py-2.5 items-center font-mono">
                  <span className="text-zinc-300 font-sans text-[11px]">Trước lệnh</span>
                  <span className="text-center text-zinc-400">{execDetails.beforeScore ?? '—'}</span>
                  <span className="text-center text-zinc-500">30</span>
                  <span className="text-right text-zinc-400">{execDetails.beforePct ?? '—'}</span>
                </div>
                <div className="grid grid-cols-4 py-2.5 items-center font-mono">
                  <span className="text-zinc-300 font-sans text-[11px]">Trong lệnh</span>
                  <span className="text-center text-zinc-400">{execDetails.duringScore ?? '—'}</span>
                  <span className="text-center text-zinc-500">40</span>
                  <span className="text-right text-zinc-400">{execDetails.duringPct ?? '—'}</span>
                </div>
                <div className="grid grid-cols-4 py-2.5 items-center font-mono">
                  <span className="text-zinc-300 font-sans text-[11px]">Sau lệnh</span>
                  <span className="text-center text-zinc-400">{execDetails.afterScore ?? '—'}</span>
                  <span className="text-center text-zinc-500">30</span>
                  <span className="text-right text-zinc-400">{execDetails.afterPct ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 2: MA TRẬN 4 NHÓM LỆNH (Col span 6) */}
      <div className="lg:col-span-6 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-1">
            MA TRẬN 4 NHÓM LỆNH
          </div>
          <div className="text-[11px] text-zinc-400 pb-3 border-b border-[#26282c]/40">
            {reviewedCount} lệnh đã đánh giá · {totalTrades - reviewedCount} lệnh chưa đánh giá đủ
          </div>

          {/* 2x2 Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {/* LOẠI 1 — THEO KẾ HOẠCH, THẮNG */}
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-[#13231d]/60 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">
                  LOẠI 1 — CHƯA GHI NHẬN LỖI, THẮNG
                </div>
                <div className="text-sm font-bold font-mono text-white mt-1">
                  {matrix.correctWin.length} <span className="text-xs text-zinc-400 font-sans">lệnh ({cwPct}%)</span>
                </div>
                <div className="text-xs font-bold font-mono text-[#00e676]">
                  {formatMoney(quadPnL.cw, currency, 0, true)}
                </div>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed pt-1 border-t border-emerald-500/20">
                Lệnh đã đánh giá, không ghi nhận lỗi kỷ luật và có lãi.
              </p>
            </div>

            {/* LOẠI 2 — THEO KẾ HOẠCH, THUA */}
            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-[#142131]/60 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wide">
                  LOẠI 2 — CHƯA GHI NHẬN LỖI, THUA
                </div>
                <div className="text-sm font-bold font-mono text-white mt-1">
                  {matrix.correctLoss.length} <span className="text-xs text-zinc-400 font-sans">lệnh ({clPct}%)</span>
                </div>
                <div className="text-xs font-bold font-mono text-blue-400">
                  {formatMoney(quadPnL.cl, currency, 0, true)}
                </div>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed pt-1 border-t border-blue-500/20">
                Lệnh đã đánh giá, không ghi nhận lỗi kỷ luật nhưng vẫn lỗ.
              </p>
            </div>

            {/* LOẠI 3 — BỐC ĐỒNG/TRẢ THÙ, THUA */}
            <div className="p-3.5 rounded-xl border border-[#26282c] bg-[#1a1c1e]/60 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                  LOẠI 3 — CÓ LỖI KỶ LUẬT, THUA
                </div>
                <div className="text-sm font-bold font-mono text-zinc-200 mt-1">
                  {matrix.wrongLoss.length} <span className="text-xs text-zinc-500 font-sans">lệnh ({wlPct}%)</span>
                </div>
                <div className="text-xs font-bold font-mono text-zinc-400">
                  {formatMoney(quadPnL.wl, currency, 0, true)}
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1 border-t border-[#26282c]">
                Lệnh có lỗi kỷ luật được ghi nhận và bị lỗ.
              </p>
            </div>

            {/* LOẠI 4 — BỐC ĐỒNG/TRẢ THÙ, NHƯNG THẮNG */}
            <div className="p-3.5 rounded-xl border border-[#26282c] bg-[#1a1c1e]/60 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                  LOẠI 4 — CÓ LỖI KỶ LUẬT, THẮNG
                </div>
                <div className="text-sm font-bold font-mono text-zinc-200 mt-1">
                  {matrix.wrongWin.length} <span className="text-xs text-zinc-500 font-sans">lệnh ({wwPct}%)</span>
                </div>
                <div className="text-xs font-bold font-mono text-zinc-400">
                  {formatMoney(quadPnL.ww, currency, 0, true)}
                </div>
              </div>
              <p className="text-[11px] text-amber-400/90 leading-relaxed pt-1 border-t border-[#26282c]">
                Lệnh có lỗi kỷ luật được ghi nhận nhưng vẫn có lãi. Hãy xem lại lỗi trước khi lặp lại cách giao dịch này.
              </p>
            </div>
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#26282c]/60 text-xs">
          <span className="text-zinc-400">Tổng tất cả lệnh:</span>
          <span
            className={`font-mono font-bold ${
              quadPnL.total >= 0 ? 'text-[#00e676]' : 'text-rose-400'
            }`}
          >
            {formatMoney(quadPnL.total, currency, 0, true)}
          </span>
        </div>
      </div>

      {/* COLUMN 3: LỖI HAY GẶP NHẤT (Col span 3) */}
      <div className="lg:col-span-3 border border-[#26282c] bg-[#18191c] text-zinc-100 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider pb-3 border-b border-[#26282c]/40">
            LỖI HAY GẶP NHẤT
          </div>

          <div className="pt-2">
            {errorRanking.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-8 text-center">
                Chưa ghi nhận lỗi kỷ luật nào
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {errorRanking.map((err) => (
                  <div key={err.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-200 font-medium truncate max-w-[140px]">
                        {err.name}
                      </span>
                      <span className="text-rose-400 font-mono text-[11px]">
                        -{formatMoney(err.totalLoss, currency, 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{
                            width: `${Math.min(100, (err.count / totalTrades) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {err.count} lần
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
