import type { Trade } from '@/types';
import { calcTradeQuadMatrix, hasCompleteTradeEvaluation, netProfit, sortTradesByTime } from '@/lib/calculations';
import { localDateKey } from '@/lib/phase5/readiness';

export type ReportPeriod = 'all' | 'currentWeek' | 'previousWeek' | 'currentMonth' | 'previousMonth';

export function reportPeriodBounds(period: ReportPeriod, now = new Date()): {
  start: string | null; end: string | null; cycleType: 'week' | 'month' | null; label: string;
} {
  if (period === 'all') return { start: null, end: null, cycleType: null, label: 'Toàn bộ lịch sử' };
  const isWeek = period.endsWith('Week');
  const previous = period.startsWith('previous');
  let start: Date;
  let end: Date;
  if (isWeek) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (previous ? 7 : 0));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - (previous ? 1 : 0), 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  const label = ({ currentWeek: 'Tuần này', previousWeek: 'Tuần trước', currentMonth: 'Tháng này', previousMonth: 'Tháng trước' } as const)[period];
  return { start: localDateKey(start), end: localDateKey(end), cycleType: isWeek ? 'week' : 'month', label };
}

export function filterReportTrades(trades: Trade[], accountId: string, period: ReturnType<typeof reportPeriodBounds>): Trade[] {
  return trades.filter((trade) => {
    if (trade.account_id !== accountId) return false;
    if (period.start === null || period.end === null) return true;
    const time = new Date(trade.close_time || trade.date);
    if (Number.isNaN(time.getTime())) return false;
    const dateKey = localDateKey(time);
    return dateKey >= period.start && dateKey < period.end;
  });
}

export function isReportReviewed(trade: Trade): boolean {
  return hasCompleteTradeEvaluation(trade) && trade.eval_errors_reviewed === true;
}

export const REPORT_QUESTIONS = {
  edge: [
    ['edge_pf', '1. Nhìn vào Profit Factor và R:R theo Setup — bạn đánh giá hệ thống đang ở mức nào?', 'Gợi ý: PF < 1,0 = chưa có lợi thế; 1,0–1,3 = lợi thế mỏng; 1,3–2,0 = ổn; > 2,0 = vượt sắc.'],
    ['edge_setup', '2. Setup nào đang hoạt động tốt nhất? Setup nào cần xem lại hoặc tạm dừng?', 'Dựa trên số lệnh, tỷ lệ thắng và lãi ròng của từng setup.'],
    ['edge_trend', '3. So với kỳ trước, hệ thống đang đi theo hướng nào?', 'Đối chiếu kỳ trước trên bộ lọc để nhận xét xu hướng.'],
    ['edge_priority', '4. Hành động ưu tiên nhất cho kỳ tới là gì?', 'Chỉ chọn một hành động cụ thể, có thể kiểm chứng.'],
  ],
  execution: [
    ['exec_group', '1. Tỷ lệ lệnh Nhóm 3+4 đang ở mức nào? Nguyên nhân chính là gì?', 'Gợi ý: <10% = tốt; 10–30% = cần siết quy trình; >30% = nghiêm trọng.'],
    ['exec_pareto', '2. Nhìn vào 4 biểu đồ Pareto — giai đoạn nào đang có nhiều lỗi nhất?', 'Tập trung xử lý các vấn đề lặp lại nhiều nhất.'],
    ['exec_gap', '3. Khoảng cách Thực tế và Lý thuyết đang là bao nhiêu? Nguyên nhân chính bạn nghĩ là gì?', 'Lý thuyết là số bạn đã nhập cho từng lệnh; kiểm tra lại dữ liệu còn thiếu.'],
    ['exec_check', '4. Trước khi vào lệnh, bạn có thường tự hỏi “Mình có đang khách quan không?” chưa?', 'Ghi lại dấu hiệu cho thấy bạn đã hoặc chưa theo checklist.'],
    ['exec_commitment', '5. Một cam kết cụ thể cho kỳ tới để cải thiện thực thi', 'Chọn một hành vi nhỏ, đo được và thực hiện được.'],
  ],
} as const;

export function buildReportAnalytics(trades: Trade[]) {
  const sorted = sortTradesByTime(trades);
  const totalActual = trades.reduce((sum, trade) => sum + netProfit(trade), 0);
  const gross = trades.reduce((acc, trade) => {
    if (trade.profit > 0) acc.wins += trade.profit;
    else if (trade.profit < 0) acc.losses += -trade.profit;
    acc.fees += trade.fee;
    return acc;
  }, { wins: 0, losses: 0, fees: 0 });
  const grossProfitFactor = gross.losses > 0 ? gross.wins / gross.losses : gross.wins > 0 ? Infinity : null;
  const reviewed = trades.filter(isReportReviewed);
  const matrix = calcTradeQuadMatrix(reviewed);
  let actual = 0;
  let theoretical = 0;
  const comparison = [{ label: '#0', actual: 0, theoretical: 0 }];
  for (const trade of sorted) {
    if (trade.theoretical_profit === null || !Number.isFinite(trade.theoretical_profit)) continue;
    actual += netProfit(trade);
    theoretical += trade.theoretical_profit;
    comparison.push({ label: `#${comparison.length}`, actual, theoretical });
  }

  const positiveTags = {
    before: /^(đúng kế hoạch|đúng checklist)$/i,
    during: /^tuân thủ kế hoạch$/i,
    after: /^(điềm tĩnh|bình tĩnh)$/i,
    errors: /^$/,
  };
  const pareto = (field: 'eval_before' | 'eval_during' | 'eval_after' | 'eval_errors', positive: RegExp) => {
    const counts = new Map<string, number>();
    for (const trade of trades) for (const raw of trade[field] ?? []) {
      const tag = raw.replace(/^[^\p{L}\p{N}]+/u, '').trim();
      if (!tag || positive.test(tag)) continue;
      // Imported free-text reviews are reflections, not problem tags.
      if (field === 'eval_after' && !/^(tự tin quá mức|lo lắng|tức giận|muốn trả thù|hối tiếc)$/i.test(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi')).slice(0, 8);
  };

  const setupMap = new Map<string, { name: string; count: number; wins: number; net: number; rrTotal: number; rrCount: number }>();
  for (const trade of reviewed.filter((t) => t.eval_errors.length === 0)) {
    const name = trade.setup?.trim() || 'Chưa đặt setup';
    const row = setupMap.get(name) ?? { name, count: 0, wins: 0, net: 0, rrTotal: 0, rrCount: 0 };
    row.count++;
    const pnl = netProfit(trade);
    if (pnl > 0) row.wins++;
    row.net += pnl;
    if (trade.entry_price !== null && trade.sl_price !== null && trade.tp_price !== null) {
      const risk = Math.abs(trade.entry_price - trade.sl_price);
      const reward = Math.abs(trade.tp_price - trade.entry_price);
      const validDirection = trade.direction === 'buy'
        ? trade.sl_price < trade.entry_price && trade.tp_price > trade.entry_price
        : trade.sl_price > trade.entry_price && trade.tp_price < trade.entry_price;
      if (risk > 0 && reward > 0 && validDirection) { row.rrTotal += reward / risk; row.rrCount++; }
    }
    setupMap.set(name, row);
  }
  return {
    totalActual,
    gross,
    grossProfitFactor,
    reviewedCount: reviewed.length,
    unreviewedCount: trades.length - reviewed.length,
    importedUnreviewedCount: trades.filter((trade) => trade.mt5_key && !isReportReviewed(trade)).length,
    completeness: trades.length ? reviewed.length / trades.length * 100 : 0,
    matrix,
    comparison,
    comparisonCount: comparison.length - 1,
    actualComparisonTotal: actual,
    theoreticalTotal: theoretical,
    gap: actual - theoretical,
    earlyExitCount: trades.filter((t) => [...(t.eval_during ?? []), ...(t.eval_errors ?? [])].some((tag) => /cắt lời sớm|chốt lời quá sớm/i.test(tag))).length,
    pareto: {
      before: pareto('eval_before', positiveTags.before),
      during: pareto('eval_during', positiveTags.during),
      after: pareto('eval_after', positiveTags.after),
      errors: pareto('eval_errors', positiveTags.errors),
    },
    setups: [...setupMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi')),
  };
}
