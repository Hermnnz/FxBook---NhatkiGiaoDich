'use client';

import { useState, useEffect } from 'react';
import { createTrade, updateTrade } from '@/lib/actions/trades';
import { netProfit, calcTheoreticalProfit } from '@/lib/calculations';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { createClient } from '@/lib/supabase/client';
import { estimateBrokerTrade } from '@/lib/broker-estimates';
import type { Trade, Account } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, X, AlertTriangle } from 'lucide-react';

interface TradeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade?: Trade | null;
  accounts: Account[];
  activeAccountId?: string;
  onSuccess?: () => void;
}

const PRE_TAGS = [
  '✓ Đúng kế hoạch',
  '⏩ Vào quá sớm',
  '⏪ Vào quá muộn',
  '⚡ Bốc đồng',
  '🤯 FOMO',
  '📦 Sai khối lượng',
  '⏱️ Sai phiên/giờ',
  '❌ Không có setup',
];

const DURING_TAGS = [
  '✓ Tuân thủ kế hoạch',
  '🚫 Dời Stop Loss ra xa',
  '✂️ Cắt lời sớm',
  '🔄 Nhồi lệnh gồng lỗ',
  '🤗 Đóng cảm tính',
  '🎯 Dời Take Profit',
];

const POST_TAGS = [
  '😌 Điềm tĩnh',
  '🤠 Tự tin quá mức',
  '😰 Lo lắng',
  '🤬 Tức giận',
  '⚔️ Muốn trả thù',
  '🥺 Hối tiếc',
];

const ERROR_LEVEL_1 = [
  'Vào sớm chưa có nến xác nhận',
  'Sai khối lượng / Position Sizing',
  'Giao dịch sai phiên / giờ quy định',
];

const ERROR_LEVEL_2 = [
  'Dời Stop Loss chống rủi ro',
  'Chốt lời quá sớm',
  'Không chốt lời',
  'Nhồi lệnh gồng lỗ (DCA ngược)',
];

const ERROR_LEVEL_3 = [
  'Trả thù thị trường sau lệnh thua',
  'Giao dịch vô kỷ luật vì buồn chán',
  'Bị ám ảnh kết quả ngắn hạn',
];

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TradeFormModal({
  open,
  onOpenChange,
  trade,
  accounts,
  activeAccountId,
  onSuccess,
}: TradeFormModalProps) {
  const isEditing = !!trade;
  const writable = useJournalWritable();

  // Basic Form States (Always visible - matching images/them.png)
  const [accountId, setAccountId] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayString());
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [exitPrice, setExitPrice] = useState<string>('');
  const [volume, setVolume] = useState<string>('0.01');
  const [playbookSetups, setPlaybookSetups] = useState<string[]>([]);

  // Expandable Section State (Collapsible accordion - matching images/them_2.png and them_3.png)
  const [expanded, setExpanded] = useState<boolean>(false);
  const [theoreticalProfit, setTheoreticalProfit] = useState<string>('');
  const [session, setSession] = useState<string>('');
  const [setup, setSetup] = useState<string>('');
  const [timeframe, setTimeframe] = useState<string>('');
  const [tradingviewUrl, setTradingviewUrl] = useState<string>('');

  // Evaluation & Psychology Tags
  const [evalBefore, setEvalBefore] = useState<string[]>([]);
  const [evalDuring, setEvalDuring] = useState<string[]>([]);
  const [evalAfter, setEvalAfter] = useState<string[]>([]);
  const [evalErrors, setEvalErrors] = useState<string[]>([]);
  const [noErrorSelected, setNoErrorSelected] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let active = true;
    createClient().from('playbook').select('title').eq('type', 'setup').eq('is_active', true)
      .order('sort_order').then(({ data }) => {
        if (active) setPlaybookSetups([...new Set((data ?? []).map((row) => row.title))]);
      });
    return () => { active = false; };
  }, [open]);

  // Initialize or populate form
  useEffect(() => {
    if (trade) {
      // Synchronize the persistent dialog when the selected trade changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccountId(trade.account_id || '');
      setDate(trade.date ? trade.date.slice(0, 10) : getTodayString());
      setSymbol(trade.symbol || 'XAUUSD');
      setDirection(trade.direction || 'buy');
      setEntryPrice(trade.entry_price != null ? String(trade.entry_price) : '');
      setSlPrice(trade.sl_price != null ? String(trade.sl_price) : '');
      setTpPrice(trade.tp_price != null ? String(trade.tp_price) : '');
      setExitPrice(trade.exit_price != null ? String(trade.exit_price) : '');
      setVolume(String(trade.volume || '0.01'));
      setTheoreticalProfit(trade.theoretical_profit != null ? String(trade.theoretical_profit) : '');
      setSession(trade.session || '');
      setSetup(trade.setup || '');
      setTimeframe(trade.timeframe || '');
      setTradingviewUrl(trade.tradingview_url || '');
      setNote(trade.note || '');
      setEvalBefore(trade.eval_before ?? []);
      setEvalDuring(trade.eval_during ?? []);
      setEvalAfter(trade.eval_after ?? []);
      const errors = trade.eval_errors || [];
      setEvalErrors(errors);
      setNoErrorSelected(errors.length === 0 && trade.eval_errors_reviewed === true);
      setExpanded(true); // Open details if editing
    } else {
      const defaultAcc = activeAccountId && activeAccountId !== 'all' ? activeAccountId : accounts[0]?.id || '';
      setAccountId(defaultAcc);
      setDate(getTodayString());
      setSymbol('XAUUSD');
      setDirection('buy');
      setEntryPrice('');
      setSlPrice('');
      setTpPrice('');
      setExitPrice('');
      setVolume('0.01');
      setTheoreticalProfit('');
      setSession('');
      setSetup('');
      setTimeframe('');
      setTradingviewUrl('');
      setNote('');
      setEvalBefore([]);
      setEvalDuring([]);
      setEvalAfter([]);
      setEvalErrors([]);
      setNoErrorSelected(false);
      setExpanded(false);
    }
  }, [trade, activeAccountId, accounts, open]);

  // Realtime calculated Net Profit
  const optionalNumber = (value: string) => {
    if (!value) return null;
    const clean = String(value).replace(',', '.').trim();
    return clean === '' || Number.isNaN(Number(clean)) ? null : Number(clean);
  };
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const parsedEntry = optionalNumber(entryPrice);
  const parsedSl = optionalNumber(slPrice);
  const parsedTp = optionalNumber(tpPrice);
  const parsedClose = optionalNumber(exitPrice);

  const slDirectionError = parsedEntry !== null && parsedSl !== null && (
    direction === 'buy' ? parsedSl >= parsedEntry : parsedSl <= parsedEntry
  );

  const tpDirectionError = parsedEntry !== null && parsedTp !== null && (
    direction === 'buy' ? parsedTp <= parsedEntry : parsedTp >= parsedEntry
  );

  const priceAnomalyError = parsedEntry !== null && (
    (parsedSl !== null && (parsedEntry > parsedSl * 2.5 || parsedSl > parsedEntry * 2.5)) ||
    (parsedClose !== null && (parsedEntry > parsedClose * 2.5 || parsedClose > parsedEntry * 2.5))
  );

  const hasPriceLogicError = slDirectionError || priceAnomalyError;

  const automaticEstimate = estimateBrokerTrade({
    accountName: selectedAccount?.name ?? '',
    accountCurrency: selectedAccount?.currency ?? '',
    symbol,
    direction,
    entryPrice: parsedEntry,
    closePrice: parsedClose,
    stopLoss: parsedSl,
    volume: optionalNumber(volume),
    tradeDate: date,
  });
  // Imported trades already contain the broker's exact commission and swap.
  // Legacy trades from an unsupported profile also keep their stored values.
  const preserveStoredBrokerValues = !!trade && (!!trade.mt5_key || !automaticEstimate.supported);
  const effectiveProfit = preserveStoredBrokerValues ? trade.profit : automaticEstimate.grossProfit;
  const effectiveFee = preserveStoredBrokerValues ? trade.fee : automaticEstimate.fee;
  const netAvailable = !hasPriceLogicError && effectiveProfit !== null && effectiveFee !== null &&
    Number.isFinite(effectiveProfit) && Number.isFinite(effectiveFee);
  const currentNet = netProfit({ profit: effectiveProfit ?? 0, fee: effectiveFee ?? 0 });
  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? 'tiền tệ tài khoản';
  const autoCalculatedTheoretical = calcTheoreticalProfit({
    symbol,
    direction,
    entryPrice: parsedEntry,
    tpPrice: parsedTp,
    volume: optionalNumber(volume),
    fee: effectiveFee ?? 0,
  });

  function toggleTag(list: string[], setList: (l: string[]) => void, tag: string) {
    if (list.includes(tag)) {
      setList(list.filter((t) => t !== tag));
    } else {
      setList([...list, tag]);
    }
  }

  function toggleErrorTag(tag: string) {
    setNoErrorSelected(false);
    if (evalErrors.includes(tag)) {
      const updated = evalErrors.filter((t) => t !== tag);
      setEvalErrors(updated);
      if (updated.length === 0) setNoErrorSelected(true);
    } else {
      setEvalErrors([...evalErrors, tag]);
    }
  }

  function handleSelectNoError() {
    setNoErrorSelected(true);
    setEvalErrors([]);
  }

  async function saveTradeData(keepOpen: boolean) {
    setError(null);
    setLoading(true);

    if (!writable) {
      setError('Tài khoản đã hết hạn dùng thử. Bạn chỉ có thể xem dữ liệu.');
      setLoading(false);
      return;
    }

    if (!accountId) {
      setError('Vui lòng tạo và chọn tài khoản giao dịch trước khi lưu lệnh.');
      setLoading(false);
      return;
    }

    if (!symbol.trim()) {
      setError('Vui lòng nhập cặp giao dịch (Symbol).');
      setLoading(false);
      return;
    }
    if (!entryPrice || !slPrice || !exitPrice) {
      setError('Cần Entry, Stop Loss và Close Price. Take Profit có thể để trống.');
      setLoading(false);
      return;
    }
    const entry = Number(entryPrice);
    const stop = Number(slPrice);
    const target = tpPrice === '' ? null : Number(tpPrice);
    if ((direction === 'buy' && stop >= entry) || (direction === 'sell' && stop <= entry)) {
      setError(direction === 'buy'
        ? 'Lệnh Buy cần Stop Loss thấp hơn Entry.'
        : 'Lệnh Sell cần Stop Loss cao hơn Entry.');
      setLoading(false);
      return;
    }
    if (target !== null && ((direction === 'buy' && target <= entry) || (direction === 'sell' && target >= entry))) {
      setError(direction === 'buy'
        ? 'Take Profit của lệnh Buy cần cao hơn Entry.'
        : 'Take Profit của lệnh Sell cần thấp hơn Entry.');
      setLoading(false);
      return;
    }
    if (!preserveStoredBrokerValues && !automaticEstimate.supported) {
      setError('Tài khoản này chưa có cấu hình tính tự động. Hiện hệ thống hỗ trợ FTMO (USD) với XAUUSD.');
      setLoading(false);
      return;
    }

    const numericEntries = [volume, entryPrice, slPrice, tpPrice, exitPrice, theoreticalProfit]
      .filter((value) => value !== '');
    if (!date || Number.isNaN(new Date(`${date}T12:00:00`).getTime()) || Number(volume) <= 0 ||
        numericEntries.some((value) => !Number.isFinite(Number(value))) ||
        [entryPrice, slPrice, tpPrice, exitPrice].filter((value) => value !== '').some((value) => Number(value) <= 0) ||
        effectiveProfit === null || effectiveFee === null) {
      setError('Kiểm tra ngày, Entry, Stop Loss, Close Price và Volume để hệ thống tự tính lãi/lỗ và phí.');
      setLoading(false);
      return;
    }
    if (tradingviewUrl.trim() && !/^https?:\/\//i.test(tradingviewUrl.trim())) {
      setError('Link biểu đồ phải bắt đầu bằng http:// hoặc https://.');
      setLoading(false);
      return;
    }

    const editedSameDate = !!trade && trade.date.slice(0, 10) === date;
    const tradeDate = editedSameDate ? trade.date : new Date(`${date}T12:00:00`).toISOString();
    const tradeCloseTime = editedSameDate ? trade.close_time : tradeDate;

    const tradePayload = {
      account_id: accountId,
      date: tradeDate,
      close_time: tradeCloseTime,
      symbol: symbol.trim().toUpperCase(),
      direction,
      volume: Number(volume),
      entry_price: optionalNumber(entryPrice),
      exit_price: optionalNumber(exitPrice),
      sl_price: optionalNumber(slPrice),
      tp_price: optionalNumber(tpPrice),
      profit: effectiveProfit ?? 0,
      fee: effectiveFee ?? 0,
      // Values have already been calculated by the broker profile. Keep legacy
      // calculation columns in manual mode so this also works before migration 005.
      profit_calc_mode: 'manual' as const,
      contract_size: null,
      tick_size: null,
      tick_value: null,
      conversion_rate: null,
      fee_calc_mode: 'manual' as const,
      commission_per_lot_round_turn: null,
      swap_charge: null,
      theoretical_profit: theoreticalProfit.trim() !== ''
        ? parseFloat(theoreticalProfit)
        : (autoCalculatedTheoretical != null && Number.isFinite(autoCalculatedTheoretical) ? autoCalculatedTheoretical : null),
      risk_amount: preserveStoredBrokerValues ? trade.risk_amount : automaticEstimate.riskAmount,
      setup: setup.trim() || null,
      timeframe: timeframe || null,
      session: session || null,
      tradingview_url: tradingviewUrl.trim() || null,
      note: note.trim() || null,
      mt5_key: trade?.mt5_key || null,
      incomplete: !entryPrice || !slPrice || !exitPrice || !evalBefore.length || !evalDuring.length || !evalAfter.length || (!noErrorSelected && !evalErrors.length),
      eval_before: evalBefore,
      eval_during: evalDuring,
      eval_after: evalAfter,
      eval_errors: evalErrors,
      eval_errors_reviewed: noErrorSelected || evalErrors.length > 0,
    };

    try {
      if (isEditing && trade) {
        const res = await updateTrade(trade.id, tradePayload);
        if (!res.success) {
          setError(res.error || 'Cập nhật lệnh thất bại.');
          setLoading(false);
          return;
        }
      } else {
        const res = await createTrade(tradePayload);
        if (!res.success) {
          setError(res.error || 'Thêm lệnh thất bại.');
          setLoading(false);
          return;
        }
      }

      onSuccess?.();

      if (keepOpen) {
        // Reset inputs de nhap lenh tiep theo
        setEntryPrice('');
        setSlPrice('');
        setTpPrice('');
        setExitPrice('');
        setTheoreticalProfit('');
        setTradingviewUrl('');
        setNote('');
        setEvalBefore([]);
        setEvalDuring([]);
        setEvalAfter([]);
        setEvalErrors([]);
        setNoErrorSelected(false);
        setLoading(false);
      } else {
        onOpenChange(false);
        setLoading(false);
      }
    } catch {
      setError('Đã xảy ra lỗi khi lưu lệnh.');
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-[#181a1b] border-[#27292d] text-zinc-200 p-0 shadow-2xl">
        {/* Header matching images/them.png */}
        <DialogHeader className="p-5 pb-4 border-b border-[#27292d] flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold text-white">
            {isEditing ? 'Chỉnh sửa lệnh' : 'Thêm lệnh mới'}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer rounded-lg p-1 hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveTradeData(false);
          }}
          className="p-5 space-y-4"
        >
          {error && (
            <div className="p-3 text-xs rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
              {error}
            </div>
          )}
          {!writable && <p className="text-xs text-amber-400">Chế độ chỉ đọc: thời gian dùng thử đã hết hoặc chưa tải được quyền ghi.</p>}

          {/* ROW 1: Tài khoản & Ngày */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Tài khoản *</Label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#222426] border border-[#2e3135] text-white text-xs focus:outline-none focus:border-[#00e676]"
              >
                {accounts.length === 0 ? (
                  <option value="">Tạo tài khoản trong mục Tài khoản trước</option>
                ) : (
                  <>
                    <option value="">-- Chọn tài khoản --</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-300">Ngày *</Label>
                <div className="text-xs text-zinc-400 space-x-1">
                  <button
                    type="button"
                    onClick={() => setDate(getTodayString())}
                    className="text-[#00e676] hover:underline cursor-pointer font-medium"
                  >
                    Hôm nay
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setDate(getYesterdayString())}
                    className="text-[#00e676] hover:underline cursor-pointer font-medium"
                  >
                    Hôm qua
                  </button>
                </div>
              </div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs focus-visible:ring-[#00e676]/50"
              />
            </div>
          </div>

          {/* ROW 2: Symbol & Long/Short */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Symbol *</Label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="XAUUSD..."
                required
                className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs font-mono focus-visible:ring-[#00e676]/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Long/Short</Label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'buy' | 'sell')}
                className="w-full h-10 px-3 rounded-lg bg-[#222426] border border-[#2e3135] text-white text-xs focus:outline-none focus:border-[#00e676]"
              >
                <option value="buy">Buy (Long)</option>
                <option value="sell">Sell (Short)</option>
              </select>
            </div>
          </div>

          {/* ROW 3: Entry & Stop Loss */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Entry (Giá vào) *</Label>
              <Input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className={`h-10 bg-[#222426] border text-white text-xs font-mono focus-visible:ring-[#00e676]/50 ${
                  priceAnomalyError ? 'border-rose-500/70 focus-visible:ring-rose-500/50' : 'border-[#2e3135]'
                }`}
              />
              {priceAnomalyError && (
                <p className="text-[11px] text-rose-400 font-medium">
                  ⚠️ Giá vào {entryPrice} lệch bất thường so với SL/Close. Kiểm tra lại số chữ số.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Stop Loss *</Label>
              <Input
                type="number"
                step="any"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="0.00"
                className={`h-10 bg-[#222426] border text-white text-xs font-mono focus-visible:ring-[#00e676]/50 ${
                  slDirectionError ? 'border-rose-500/70 focus-visible:ring-rose-500/50' : 'border-[#2e3135]'
                }`}
              />
              {slDirectionError && (
                <p className="text-[11px] text-rose-400 font-medium">
                  ⚠️ Lệnh {direction === 'sell' ? 'Sell cần Stop Loss cao hơn Entry' : 'Buy cần Stop Loss thấp hơn Entry'} ({entryPrice})
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Take Profit (tùy chọn)</Label>
              <Input
                type="number"
                step="any"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="0.00"
                className={`h-10 bg-[#222426] border text-white text-xs font-mono focus-visible:ring-[#00e676]/50 ${
                  tpDirectionError ? 'border-rose-500/70 focus-visible:ring-rose-500/50' : 'border-[#2e3135]'
                }`}
              />
              {tpDirectionError && (
                <p className="text-[11px] text-rose-400 font-medium">
                  ⚠️ Lệnh {direction === 'sell' ? 'Sell cần Take Profit thấp hơn Entry' : 'Buy cần Take Profit cao hơn Entry'} ({entryPrice})
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Close Price (Giá đóng) *</Label>
              <Input
                type="number"
                step="any"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="0.00"
                className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs font-mono focus-visible:ring-[#00e676]/50"
              />
            </div>
          </div>

          {/* ROW 4: Volume */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Volume (Lot)</Label>
              <Input
                type="number"
                step="any"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="0.01"
                required
                className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs font-mono focus-visible:ring-[#00e676]/50"
              />
            </div>
          </div>

          {/* Giá trị tài chính do hệ thống tính, người dùng không phải nhập phí. */}
          <div className="rounded-xl border border-[#2e3135] bg-[#202224] p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-200">Hệ thống tự tính</div>
              <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                hasPriceLogicError ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {hasPriceLogicError ? 'Phát hiện giá không hợp lệ' : preserveStoredBrokerValues ? 'Số liệu thực tế từ broker' : automaticEstimate.profileLabel ?? 'Chưa nhận diện'}
              </div>
            </div>

            {/* Warning banner if prices are contradictory or abnormal */}
            {(hasPriceLogicError || automaticEstimate.warning) && (
              <div className="rounded-lg bg-rose-500/15 border border-rose-500/30 p-2.5 text-xs text-rose-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Phát hiện bất thường về giá</span>
                </div>
                {slDirectionError && (
                  <p>
                    Lệnh <strong>{direction === 'sell' ? 'Sell (Short)' : 'Buy (Long)'}</strong> yêu cầu Stop Loss ({slPrice}) phải {direction === 'sell' ? 'cao hơn' : 'thấp hơn'} Entry ({entryPrice}).
                  </p>
                )}
                {priceAnomalyError && (
                  <p>
                    Giá vào (<strong>{entryPrice}</strong>) chênh lệch quá lớn so với SL (<strong>{slPrice}</strong>) / Close (<strong>{exitPrice}</strong>). Vui lòng kiểm tra lại bạn có gõ thừa số không (ví dụ gõ nhầm 42293 thay vì 4293).
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-[#181a1b] px-3 py-2.5">
                <div className="text-[10px] text-zinc-500">Lãi/lỗ gộp</div>
                <div className="font-mono text-sm font-bold text-zinc-100">
                  {hasPriceLogicError ? (
                    <span className="text-rose-400 text-xs font-sans">Giá chưa hợp lệ</span>
                  ) : effectiveProfit == null ? (
                    '—'
                  ) : (
                    `${effectiveProfit >= 0 ? '+' : ''}${effectiveProfit.toFixed(2)} ${accountCurrency}`
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-[#181a1b] px-3 py-2.5">
                <div className="text-[10px] text-zinc-500">Phí broker</div>
                <div className="font-mono text-sm font-bold text-amber-300">
                  {effectiveFee == null ? '—' : `${effectiveFee.toFixed(2)} ${accountCurrency}`}
                </div>
              </div>
              <div className="rounded-lg bg-[#181a1b] px-3 py-2.5">
                <div className="text-[10px] text-zinc-500">Rủi ro tại Stop Loss</div>
                <div className="font-mono text-sm font-bold text-zinc-100">
                  {hasPriceLogicError ? (
                    <span className="text-rose-400 text-xs font-sans">Giá chưa hợp lệ</span>
                  ) : (preserveStoredBrokerValues ? trade.risk_amount : automaticEstimate.riskAmount) == null ? (
                    '—'
                  ) : (
                    `${(preserveStoredBrokerValues ? trade.risk_amount! : automaticEstimate.riskAmount!).toFixed(2)} ${accountCurrency}`
                  )}
                </div>
              </div>
            </div>
            <p className={`text-[11px] ${hasPriceLogicError ? 'text-rose-400 font-medium' : automaticEstimate.supported || preserveStoredBrokerValues ? 'text-zinc-400' : 'text-amber-400'}`}>
              {hasPriceLogicError
                ? 'Hãy sửa lại giá Entry hoặc Stop Loss cho đúng quy tắc khớp lệnh trước khi lưu.'
                : preserveStoredBrokerValues
                ? 'Lệnh nhập từ MT5 giữ nguyên lãi/lỗ, commission và swap do broker cung cấp.'
                : automaticEstimate.note}
            </p>
          </div>

          {/* NET PROFIT CARD - matching images/them.png */}
          <div className="rounded-xl bg-[#222426] border border-[#2e3135] py-3 px-4 text-center space-y-0.5">
            <div className="text-xs text-zinc-400">Lãi/Lỗ ròng (Net)</div>
            <div
              className={`text-2xl font-black tracking-tight ${
                hasPriceLogicError ? 'text-amber-400 text-sm py-1' : currentNet >= 0 ? 'text-[#00e676]' : 'text-rose-400'
              }`}
            >
              {hasPriceLogicError ? (
                'Vui lòng kiểm tra lại giá Entry / SL'
              ) : !netAvailable ? (
                'Chưa đủ thông số'
              ) : currentNet >= 0 ? (
                `+${currentNet.toFixed(2)} ${accountCurrency}`
              ) : (
                `-${Math.abs(currentNet).toFixed(2)} ${accountCurrency}`
              )}
            </div>
          </div>

          {/* ACCORDION TOGGLE - matching media_1789640787475.png */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-bold text-[#00e676] hover:underline cursor-pointer select-none"
            >
              <span>{expanded ? '▼' : '▶'}</span>
              <span>Thêm chi tiết chiến lược & tâm lý (tùy chọn)</span>
            </button>
          </div>

          {/* EXPANDABLE SECTION - matching images/them_2.png & them_3.png */}
          {expanded && (
            <div className="space-y-5 pt-2 border-t border-[#27292d]/80 animate-in fade-in-50 duration-200">
              {/* Row: Profit lý thuyết & Phiên giao dịch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-300">Profit lý thuyết ({accountCurrency})</Label>
                    {autoCalculatedTheoretical != null && (
                      <button
                        type="button"
                        onClick={() => setTheoreticalProfit(String(autoCalculatedTheoretical))}
                        className="text-[10px] text-[#00e676] hover:underline cursor-pointer font-medium"
                        title="Bấm để tự động điền giá trị theo TP"
                      >
                        ⚡ Tự tính: {autoCalculatedTheoretical > 0 ? `+${autoCalculatedTheoretical}` : autoCalculatedTheoretical} {accountCurrency}
                      </button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="any"
                    value={theoreticalProfit}
                    onChange={(e) => setTheoreticalProfit(e.target.value)}
                    placeholder={autoCalculatedTheoretical != null ? String(autoCalculatedTheoretical) : "0.00"}
                    className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs font-mono focus-visible:ring-[#00e676]/50"
                  />
                  <p className="text-[10px] text-zinc-500">P&L ròng giả định sau phí nếu làm đúng kế hoạch; dùng để so sánh trong Báo cáo.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Phiên giao dịch</Label>
                  <select
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#222426] border border-[#2e3135] text-white text-xs focus:outline-none focus:border-[#00e676]"
                  >
                    <option value="">-- Chọn phiên --</option>
                    <option value="Asia">Asia (Châu Á / Tokyo)</option>
                    <option value="London">London (Châu Âu)</option>
                    <option value="New York">New York (Mỹ)</option>
                    <option value="Sydney">Sydney (Úc)</option>
                    <option value="Overlap">Overlap (Giao phiên London - NY)</option>
                  </select>
                </div>
              </div>

              {/* Row: Setup & Timeframe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Setup</Label>
                  <Input value={setup} onChange={(e) => setSetup(e.target.value)} list="trade-playbook-setups"
                    placeholder="Chọn từ Playbook hoặc nhập setup khác"
                    className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs focus-visible:ring-[#00e676]/50" />
                  <datalist id="trade-playbook-setups">
                    {playbookSetups.map((title) => <option key={title} value={title} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Timeframe</Label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#222426] border border-[#2e3135] text-white text-xs focus:outline-none focus:border-[#00e676]"
                  >
                    <option value="">--</option>
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="M30">M30</option>
                    <option value="H1">H1</option>
                    <option value="H4">H4</option>
                    <option value="D1">D1</option>
                    <option value="W1">W1</option>
                  </select>
                </div>
              </div>

              {/* Row: Link TradingView */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">Link TradingView</Label>
                <Input
                  value={tradingviewUrl}
                  onChange={(e) => setTradingviewUrl(e.target.value)}
                  placeholder="https://www.tradingview.com/x/..."
                  className="h-10 bg-[#222426] border-[#2e3135] text-white text-xs font-mono focus-visible:ring-[#00e676]/50"
                />
              </div>

              {/* SECTION: TRƯỚC LỆNH — VÀO LỆNH */}
              <div className="pt-2 border-t border-[#27292d] space-y-2.5">
                <div className="text-xs font-bold text-[#00e676] flex items-center gap-1.5">
                  <span>📋</span>
                  <span>TRƯỚC LỆNH — VÀO LỆNH</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRE_TAGS.map((t) => {
                    const active = evalBefore.includes(t);
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => toggleTag(evalBefore, setEvalBefore, t)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                          active
                            ? 'bg-[#00e676]/20 border-[#00e676] text-[#00e676] font-medium'
                            : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: TRONG LỆNH — QUẢN LÝ */}
              <div className="pt-2 border-t border-[#27292d] space-y-2.5">
                <div className="text-xs font-bold text-[#00e676] flex items-center gap-1.5">
                  <span>⚙️</span>
                  <span>TRONG LỆNH — QUẢN LÝ</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DURING_TAGS.map((t) => {
                    const active = evalDuring.includes(t);
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => toggleTag(evalDuring, setEvalDuring, t)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                          active
                            ? 'bg-[#00e676]/20 border-[#00e676] text-[#00e676] font-medium'
                            : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: SAU LỆNH — TÂM LÝ */}
              <div className="pt-2 border-t border-[#27292d] space-y-2.5">
                <div className="text-xs font-bold text-[#00e676] flex items-center gap-1.5">
                  <span>🔚</span>
                  <span>SAU LỆNH — TÂM LÝ</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {POST_TAGS.map((t) => {
                    const active = evalAfter.includes(t);
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => toggleTag(evalAfter, setEvalAfter, t)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                          active
                            ? 'bg-[#00e676]/20 border-[#00e676] text-[#00e676] font-medium'
                            : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: LỖI MẮC PHẢI - matching them_2.png & them_3.png */}
              <div className="pt-2 border-t border-[#27292d] space-y-3">
                <div className="text-xs font-bold text-[#00e676] flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>LỖI MẮC PHẢI (CHỌN TẤT CẢ LỖI XẢY RA)</span>
                </div>

                {/* Khong mac loi nao */}
                <div>
                  <button
                    type="button"
                    onClick={handleSelectNoError}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                      noErrorSelected
                        ? 'bg-[#00e676]/20 border-[#00e676] text-[#00e676] font-semibold'
                        : 'bg-[#222426] border-[#2f3237] text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    ✓ Không mắc lỗi nào
                  </button>
                </div>

                {/* Muc 1 - Loi Ky thuat / He thong */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <span>🔵</span>
                    <span>Mức 1 — Lỗi Kỹ thuật / Hệ thống</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ERROR_LEVEL_1.map((t) => {
                      const active = evalErrors.includes(t);
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => toggleErrorTag(t)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                            active
                              ? 'bg-blue-500/20 border-blue-400 text-blue-300 font-medium'
                              : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Muc 2 - Loi Quan ly Lenh */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span>🟡</span>
                    <span>Mức 2 — Lỗi Quản lý Lệnh</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ERROR_LEVEL_2.map((t) => {
                      const active = evalErrors.includes(t);
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => toggleErrorTag(t)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                            active
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-medium'
                              : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Muc 3 - Loi Tam ly Cot loi */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                    <span>🔴</span>
                    <span>Mức 3 — Lỗi Tâm lý Cốt lõi</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ERROR_LEVEL_3.map((t) => {
                      const active = evalErrors.includes(t);
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => toggleErrorTag(t)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none ${
                            active
                              ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-medium'
                              : 'bg-[#222426] border-[#2f3237] text-zinc-300 hover:border-zinc-500'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ghi chu / Bai hoc */}
              <div className="space-y-1.5 pt-2 border-t border-[#27292d]">
                <Label className="text-xs text-zinc-400">Ghi chú / Bài học</Label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Bài học rút ra, điều cần ghi nhớ..."
                  rows={3}
                  className="w-full p-3 rounded-xl bg-[#222426] border border-[#2e3135] text-white text-xs focus:outline-none focus:border-[#00e676] resize-none"
                />
              </div>
            </div>
          )}

          {/* ACTION BUTTONS - matching images/them.png */}
          <div className="pt-4 border-t border-[#27292d] flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-[#2a2c30] hover:bg-[#33363b] border-transparent text-zinc-300 text-xs px-4 h-9 cursor-pointer"
            >
              Hủy
            </Button>

            {!isEditing && (
              <Button
                type="button"
                disabled={loading || !writable}
                onClick={() => void saveTradeData(true)}
                className="bg-[#222428] hover:bg-[#2b2e33] border border-[#3b3e45] text-zinc-200 font-semibold text-xs px-4 h-9 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>Lưu & nhập tiếp</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={loading || !writable}
              className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-5 h-9 flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(0,230,118,0.3)] transition-all"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
              ) : (
                <Save className="w-3.5 h-3.5 text-zinc-950" />
              )}
              <span>Lưu lệnh</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
