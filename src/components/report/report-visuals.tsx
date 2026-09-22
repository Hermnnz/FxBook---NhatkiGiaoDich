'use client';

import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import type { Trade } from '@/types';
import { buildReportAnalytics } from '@/lib/report-analytics';
import { netProfit } from '@/lib/calculations';
import { formatMoney } from '@/components/dashboard/format-money';

type Analytics = ReturnType<typeof buildReportAnalytics>;
const panel = 'rounded-xl border border-[#30343a] bg-[#1a1c1e] p-4';

export function ComparisonChart({ data, count, currency }: { data: Analytics['comparison']; count: number; currency: string }) {
  return <section className={panel}>
    <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Lợi nhuận thực tế vs lý thuyết</h3>
    <p className="mt-1 text-xs text-zinc-500">Lũy kế trên cùng {count} lệnh có lợi nhuận lý thuyết đã lưu; thực tế là P&L sau phí. TP của lệnh MT5 có thể đã được điều chỉnh.</p>
    {count === 0 ? <Empty message="Chưa có lệnh nào được nhập lợi nhuận lý thuyết." /> :
      <div className="mt-4 h-64 w-full"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#34383d" strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} />
          <YAxis stroke="#a1a1aa" fontSize={11} width={62} tickFormatter={(value: number) => formatMoney(value, currency, 0)} />
          <Tooltip contentStyle={{ background: '#202326', border: '1px solid #444', borderRadius: 8 }} formatter={(value, name) => [formatMoney(Number(value), currency, 2, true), name === 'actual' ? 'Thực tế' : 'Lý thuyết']} />
          <Legend formatter={(value) => value === 'actual' ? 'Thực tế' : 'Lý thuyết'} />
          <Line type="linear" dataKey="actual" stroke="#e7af43" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="linear" dataKey="theoretical" stroke="#ed6d8e" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer></div>}
  </section>;
}

const quadrants = [
  ['correctWin', 'Loại 1 — Đã xác nhận không lỗi, thắng', 'border-emerald-700/70 bg-emerald-950/30', 'Đánh giá đủ 4 mục, xác nhận không mắc lỗi và có lãi.'],
  ['correctLoss', 'Loại 2 — Đã xác nhận không lỗi, thua', 'border-sky-700/70 bg-sky-950/20', 'Đánh giá đủ 4 mục, xác nhận không mắc lỗi nhưng lỗ.'],
  ['wrongLoss', 'Loại 3 — Có lỗi, thua', 'border-rose-700/70 bg-rose-950/25', 'Ưu tiên xem lại lỗi thực thi lặp lại.'],
  ['wrongWin', 'Loại 4 — Có lỗi, thắng', 'border-amber-700/70 bg-amber-950/20', 'Lệnh có lãi nhưng vẫn có lỗi được ghi nhận.'],
] as const;

export function TradeMatrix({ analytics, currency, emphasize }: { analytics: Analytics; currency: string; emphasize: 'correct' | 'wrong' }) {
  const classified = Object.values(analytics.matrix).reduce((sum, rows) => sum + rows.length, 0);
  return <section className="space-y-3">
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Ma trận 4 nhóm lệnh</h3>
      <p className="mt-1 text-xs text-zinc-500">{classified} lệnh được phân nhóm. {analytics.reviewedCount === 0 ? 'Cần ghi đánh giá trước, trong, sau lệnh và xác nhận mục lỗi.' : 'Xác nhận không mắc lỗi dựa trên tự đánh giá; hãy đối chiếu lại với kế hoạch.'}</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {quadrants.map(([key, title, colors, note]) => {
        const rows: Trade[] = analytics.matrix[key];
        const total = rows.reduce((sum, row) => sum + netProfit(row), 0);
        const important = emphasize === 'correct' ? key.startsWith('correct') : key.startsWith('wrong');
        return <div key={key} className={`rounded-xl border p-4 ${colors} ${important ? '' : 'opacity-75'}`}>
          <h4 className="text-xs font-bold uppercase text-zinc-200">{title}</h4>
          <div className="mt-2 text-xl font-bold text-white">{rows.length} <span className="text-xs font-normal text-zinc-400">lệnh ({classified ? (rows.length / classified * 100).toFixed(0) : 0}%)</span></div>
          <div className={`mt-1 font-mono text-sm font-semibold ${total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(total, currency, 2, true)}</div>
          <p className="mt-2 text-xs text-zinc-400">{note}</p>
        </div>;
      })}
    </div>
  </section>;
}

export function SetupTable({ setups, currency }: { setups: Analytics['setups']; currency: string }) {
  return <section className={panel}>
    <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">R:R theo setup — lệnh đã đánh giá, chưa ghi nhận lỗi</h3>
    <p className="mt-1 text-xs text-zinc-500">R:R kế hoạch = |Take Profit − Entry| / |Entry − Stoploss|, chỉ tính lệnh đủ giá.</p>
    {setups.length === 0 ? <Empty message="Chưa có lệnh đủ điều kiện để tổng hợp theo setup." /> : <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="border-b border-[#34383d] text-zinc-400"><tr><th className="py-2">Setup</th><th>Số lệnh</th><th>Thắng</th><th>R:R kế hoạch TB</th><th className="text-right">P&L ròng</th></tr></thead>
        <tbody>{setups.map((row) => <tr key={row.name} className="border-b border-[#292c30] last:border-0"><td className="py-3 font-semibold text-zinc-200">{row.name}</td><td>{row.count}</td><td>{row.wins}</td><td>{row.rrCount ? `${(row.rrTotal / row.rrCount).toFixed(2)}:1 (${row.rrCount})` : '—'}</td><td className={`text-right font-mono ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(row.net, currency, 2, true)}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

export function ParetoCharts({ pareto }: { pareto: Analytics['pareto'] }) {
  const panels = [['before', 'Vào lệnh (trước)'], ['during', 'Trong lệnh'], ['after', 'Sau lệnh'], ['errors', 'Lỗi mắc phải']] as const;
  return <section className="space-y-3">
    <div><h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">4 biểu đồ Pareto — vấn đề nổi cộm mỗi giai đoạn</h3>
      <p className="mt-1 text-xs text-zinc-500">Số lần thẻ được ghi nhận. Các thẻ tích cực không tính là vấn đề; một lệnh có thể có nhiều thẻ.</p></div>
    <div className="grid gap-3 lg:grid-cols-2">{panels.map(([key, title]) => <div key={key} className={panel}>
      <h4 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h4>
      {pareto[key].length === 0 ? <Empty message="Chưa ghi nhận vấn đề ở giai đoạn này." /> :
        <div style={{ height: Math.max(180, pareto[key].length * 38) }}><ResponsiveContainer width="100%" height="100%">
          <BarChart data={pareto[key]} layout="vertical" margin={{ left: 4, right: 14, top: 4, bottom: 4 }}>
            <CartesianGrid stroke="#34383d" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke="#a1a1aa" fontSize={11} />
            <YAxis dataKey="name" type="category" width={135} stroke="#a1a1aa" fontSize={10} tickFormatter={(v: string) => v.length > 22 ? `${v.slice(0, 20)}…` : v} />
            <Tooltip contentStyle={{ background: '#202326', border: '1px solid #444', borderRadius: 8 }} />
            <Bar dataKey="count" name="Số lần" fill={key === 'errors' ? '#f59e0b' : '#f43f5e'} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer></div>}
    </div>)}</div>
  </section>;
}

function Empty({ message }: { message: string }) { return <div className="flex min-h-28 items-center justify-center text-center text-xs text-zinc-500">{message}</div>; }
