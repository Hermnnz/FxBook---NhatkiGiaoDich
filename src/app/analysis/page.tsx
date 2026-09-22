'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { calculatePositionSize, type SizeInput } from '@/lib/phase5/position-size';
import { localDateKey } from '@/lib/phase5/readiness';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { formatMoney } from '@/components/dashboard/format-money';
import type { MarketAnalysis } from '@/types';
import { ExternalLink, RefreshCw, Save, Trash2 } from 'lucide-react';

import { useJournalData } from '@/contexts/journal-context';

type Analysis = MarketAnalysis & { bias: 'bullish' | 'bearish' | 'neutral' | 'waiting' };

const BIAS_OPTIONS = [
  { value: 'bullish', label: '📈 Tăng' },
  { value: 'bearish', label: '📉 Giảm' },
  { value: 'neutral', label: '➡️ Đi ngang' },
  { value: 'waiting', label: '⏳ Chờ xác nhận' },
];

export default function AnalysisPage() {
  const canWrite = useJournalWritable();
  const { accounts, balances, selectedAccountId } = useJournalData();
  const [accountId, setAccountId] = useState(selectedAccountId || '');

  // Position Size Calculator states
  const [instrument, setInstrument] = useState<SizeInput['instrument']>('forex');
  const [direction, setDirection] = useState<SizeInput['direction']>('buy');
  const [riskPercent, setRiskPercent] = useState<string | null>(null);
  const [calcSymbol, setCalcSymbol] = useState('XAUUSD');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [tickSize, setTickSize] = useState('');
  const [tickValue, setTickValue] = useState('');
  const [lotStep, setLotStep] = useState('');
  const [minSize, setMinSize] = useState('');

  // New Analysis Form states
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [bias, setBias] = useState<Analysis['bias']>('waiting');
  const [date, setDate] = useState(localDateKey);
  const [chart, setChart] = useState('');
  const [notes, setNotes] = useState('');

  // Analysis List & Filters
  const [rows, setRows] = useState<Analysis[]>([]);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [filterBias, setFilterBias] = useState('all');
  const [filterTf, setFilterTf] = useState('all');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const client = createClient();
      const loaded: Analysis[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.from('market_analyses').select('*')
          .order('date', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        loaded.push(...((data ?? []) as Analysis[]));
        if ((data ?? []).length < 1000) break;
      }
      setRows(loaded);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không tải được phân tích.', type: 'error' });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const effectiveAccountId = accountId || selectedAccountId || accounts[0]?.id || '';
  const activeAcc = accounts.find((a) => a.id === effectiveAccountId);
  const activeBal = activeAcc ? (balances[activeAcc.id] ?? Number(activeAcc.initial_balance)) : 0;
  const effectiveRiskPercent = Number(riskPercent ?? activeAcc?.risk_pct ?? 0);
  const riskAmount = (activeBal * effectiveRiskPercent) / 100;

  // Position size calculation
  const calculation = useMemo(() => {
    if (!activeAcc || !entry || !stop) return null;
    try {
      return calculatePositionSize({
        balance: activeBal,
        riskPercent: effectiveRiskPercent,
        entry: parseFloat(entry),
        stop: parseFloat(stop),
        target: target ? parseFloat(target) : undefined,
        instrument,
        direction,
        tickSize: instrument === 'stock' ? undefined : Number(tickSize),
        tickValue: instrument === 'stock' ? undefined : Number(tickValue),
        lotStep: lotStep ? Number(lotStep) : undefined,
        minSize: minSize ? Number(minSize) : undefined,
      });
    } catch (error) {
      return error instanceof Error ? error.message : 'Không tính được';
    }
  }, [activeAcc, activeBal, effectiveRiskPercent, entry, stop, target, instrument, direction, tickSize, tickValue, lotStep, minSize]);

  // Swap Long / Short
  function handleSwapDirection() {
    setDirection((d) => (d === 'buy' ? 'sell' : 'buy'));
  }

  // Save new analysis
  async function handleSaveAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) {
      setMessage({ text: 'Tài khoản đang ở chế độ chỉ đọc.', type: 'error' });
      return;
    }
    if (!symbol.trim()) {
      setMessage({ text: 'Vui lòng nhập mã Symbol.', type: 'error' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      const { error } = await client.from('market_analyses').insert({
        user_id: auth.user.id,
        account_id: effectiveAccountId || null,
        date,
        symbol: symbol.trim().toUpperCase(),
        timeframe: timeframe || null,
        bias,
        direction: bias === 'bullish' ? 'buy' : bias === 'bearish' ? 'sell' : null,
        tradingview_url: chart.trim() || null,
        notes: notes.trim() || null,
        status: 'pending',
      });

      if (error) throw error;

      setMessage({ text: 'Đã lưu kịch bản phân tích thành công!', type: 'success' });
      setSymbol('');
      setChart('');
      setNotes('');
      await load();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Không thể lưu phân tích.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Delete analysis
  async function handleDeleteAnalysis(id: string) {
    if (!canWrite) return;
    if (!confirm('Xóa kịch bản phân tích này?')) return;
    try {
      const { error } = await createClient().from('market_analyses').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không xóa được phân tích.', type: 'error' });
    }
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (searchSymbol.trim() && !r.symbol.toLowerCase().includes(searchSymbol.trim().toLowerCase())) {
        return false;
      }
      if (filterBias !== 'all' && r.bias !== filterBias) return false;
      if (filterTf !== 'all' && r.timeframe !== filterTf) return false;
      return true;
    });
  }, [rows, searchSymbol, filterBias, filterTf]);

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Phân tích thị trường
            </h1>
            <p className="text-xs text-zinc-400">
              Ghi chép & lưu lịch sử phân tích theo ngày / symbol
            </p>
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                message.type === 'success'
                  ? 'bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 1. Tiện ích: Máy tính Lot / Số cổ phiếu */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="text-xs font-bold text-[#00e676] uppercase tracking-wider flex items-center gap-1.5">
              <span>🧮</span>
              <span>TÍNH LOT / SỐ CỔ PHIẾU GIAO DỊCH</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
              {/* Loại tài sản */}
              <div className="col-span-2">
                <label className="block text-[10px] text-zinc-400 mb-1">Loại tài sản</label>
                <select
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value as SizeInput['instrument'])}
                  className="w-full bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                >
                  <option value="forex">Forex / Vàng / Khác (Lot)</option>
                  <option value="stock">Cổ phiếu (CP)</option>
                  <option value="futures">Phái sinh VN (HĐ)</option>
                </select>
              </div>

              {/* Tài khoản */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Tài khoản</label>
                <select
                  value={effectiveAccountId}
                  onChange={(e) => { setAccountId(e.target.value); setRiskPercent(null); }}
                  className="w-full bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Số dư */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Số dư</label>
                <Input
                  readOnly
                  disabled
                  value={formatMoney(activeBal, activeAcc?.currency ?? 'USD')}
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono text-zinc-300"
                />
              </div>

              {/* Rủi ro/lệnh */}
              <div className="col-span-2">
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Rủi ro/lệnh (%)
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    value={riskPercent ?? activeAcc?.risk_pct ?? ''}
                    onChange={(e) => setRiskPercent(e.target.value)}
                    className="bg-[#222426] border-[#2e3135] text-xs h-8 w-16"
                  />
                  <span className="text-[10px] text-zinc-400">%</span>
                  <div className="p-1.5 px-2 rounded bg-[#222426] border border-[#2e3135] text-[10px] font-mono text-[#ff4757]">
                    {formatMoney(riskAmount, activeAcc?.currency ?? 'USD')}
                  </div>
                </div>
              </div>

              {/* Symbol */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Symbol</label>
                <Input
                  value={calcSymbol}
                  onChange={(e) => setCalcSymbol(e.target.value.toUpperCase())}
                  placeholder="XAUUSD"
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono"
                />
              </div>

              {/* Entry */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Giá Entry</label>
                <Input
                  type="number"
                  step="any"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
              {/* Swap Button */}
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSwapDirection}
                  className="w-full border-[#2e3135] bg-[#222426] text-xs h-8 flex items-center justify-center gap-1 text-zinc-300 hover:text-white"
                >
                  <RefreshCw className="w-3 h-3 text-[#00e676]" />
                  <span>{direction === 'buy' ? 'Long' : 'Short'}</span>
                </Button>
              </div>

              {/* SL */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Giá Stop Loss</label>
                <Input
                  type="number"
                  step="any"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono"
                />
              </div>

              {/* TP */}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Giá Take Profit</label>
                <Input
                  type="number"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono"
                />
              </div>

              {instrument !== 'stock' && <>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Tick Size *</label>
                  <Input type="number" min="0" step="any" value={tickSize} onChange={(e) => setTickSize(e.target.value)} placeholder="Theo broker" className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Tick Value *</label>
                  <Input type="number" min="0" step="any" value={tickValue} onChange={(e) => setTickValue(e.target.value)} placeholder={activeAcc?.currency ?? 'Tiền tài khoản'} className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono" />
                </div>
              </>}
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Bước khối lượng</label>
                <Input type="number" min="0" step="any" value={lotStep} onChange={(e) => setLotStep(e.target.value)} placeholder={instrument === 'forex' ? '0.01' : '1'} className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono" />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Khối lượng tối thiểu</label>
                <Input type="number" min="0" step="any" value={minSize} onChange={(e) => setMinSize(e.target.value)} placeholder={instrument === 'forex' ? '0.01' : '1'} className="bg-[#222426] border-[#2e3135] text-xs h-8 font-mono" />
              </div>

              {/* Output Result */}
              {calculation && typeof calculation !== 'string' && (
                <div className="col-span-4 p-2 rounded-lg bg-[#202924] border border-[#00e676]/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-zinc-400">Khối lượng: </span>
                    <strong className="text-sm font-bold text-[#00e676]">
                      {calculation.size} {instrument === 'forex' ? 'lot' : instrument === 'stock' ? 'CP' : 'hợp đồng'}
                    </strong>
                  </div>
                  <div className="text-[11px] text-zinc-300 font-mono">
                    R:R {calculation.rewardRisk?.toFixed(2) ?? '—'}
                  </div>
                </div>
              )}
            </div>

            {typeof calculation === 'string' && <p role="status" className="text-xs text-amber-400">{calculation}</p>}

            <div className="text-[11px] text-zinc-500">
              Chọn tài khoản, nhập % rủi ro, Entry và SL để tính khối lượng. Forex/vàng cần Tick Size và Tick Value theo broker, bằng tiền tệ tài khoản. Với cổ phiếu, giá niêm yết phải cùng tiền tệ tài khoản. Rủi ro dự kiến chưa gồm phí và trượt giá.
            </div>
          </section>

          {/* 2. Form: + Thêm phân tích mới */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="text-xs font-bold text-zinc-200">+ Thêm phân tích mới</div>

            <form onSubmit={handleSaveAnalysis} className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Symbol *</label>
                  <Input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="XAUUSD..."
                    className="bg-[#222426] border-[#2e3135] text-xs h-8"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Timeframe</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                  >
                    <option value="">--</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="H4">H4</option>
                    <option value="D1">D1</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Bias / Hướng</label>
                  <select
                    value={bias}
                    onChange={(e) => setBias(e.target.value as Analysis['bias'])}
                    className="w-full bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                  >
                    <option value="waiting">-- Chọn --</option>
                    {BIAS_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-zinc-400">Ngày</label>
                    <button
                      type="button"
                      onClick={() => setDate(localDateKey())}
                      className="text-[10px] text-[#00e676] hover:underline cursor-pointer"
                    >
                      Hôm nay
                    </button>
                  </div>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-[#222426] border-[#2e3135] text-xs h-8"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Link TradingView (snapshot)
                </label>
                <Input
                  type="url"
                  value={chart}
                  onChange={(e) => setChart(e.target.value)}
                  placeholder="https://www.tradingview.com/x/AbCdEfGh/"
                  className="bg-[#222426] border-[#2e3135] text-xs h-8"
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Phân tích / Ghi chú</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nhận định xu hướng, các mức giá quan trọng, kịch bản giao dịch, điều kiện vào lệnh..."
                  rows={3}
                  className="w-full rounded-md border border-[#2e3135] bg-[#222426] p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-[#00e676]"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || !canWrite}
                className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.35)] flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu phân tích</span>
              </Button>
            </form>
          </section>

          {/* 3. Bộ lọc & Danh sách nhật ký phân tích */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  placeholder="Lọc Symbol..."
                  className="bg-[#222426] border-[#2e3135] text-xs h-8 w-36"
                />
                <select
                  value={filterBias}
                  onChange={(e) => setFilterBias(e.target.value)}
                  className="bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                >
                  <option value="all">Tất cả bias</option>
                  {BIAS_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filterTf}
                  onChange={(e) => setFilterTf(e.target.value)}
                  className="bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-200"
                >
                  <option value="all">Tất cả TF</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="H1">H1</option>
                  <option value="H4">H4</option>
                  <option value="D1">D1</option>
                </select>
              </div>

              <div className="text-xs text-zinc-500 font-mono">
                {filteredRows.length} phân tích
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#27292d] bg-[#1a1c1e] text-center text-xs text-zinc-400">
                Chưa có phân tích nào. Paste link TradingView và bấm Lưu phân tích.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredRows.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{r.symbol}</span>
                        <span className="text-xs text-[#00e676] font-medium">
                          {BIAS_OPTIONS.find((b) => b.value === r.bias)?.label ?? r.bias}
                        </span>
                        {r.timeframe && (
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {r.timeframe}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnalysis(r.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[11px] text-zinc-500 font-mono">{r.date}</div>

                    {r.notes && (
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {r.notes}
                      </p>
                    )}

                    {r.tradingview_url && (
                      <a
                        href={r.tradingview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#00e676] hover:underline"
                      >
                        <span>Xem chart trên TradingView</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />
    </div>
  );
}
