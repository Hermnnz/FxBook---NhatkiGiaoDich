'use server';

import { createClient } from '@/lib/supabase/server';
import type { Trade, TradeInsert, TradeUpdate } from '@/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { calculateBrokerFee, calculateBrokerProfit, calculateBrokerRisk } from '@/lib/trade-calculation';

const nullableNumber = z.number().finite().nullable();
const nullablePrice = z.number().finite().positive().nullable();
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const calculationColumns = new Set([
  'profit_calc_mode', 'contract_size', 'tick_size', 'tick_value', 'conversion_rate',
  'fee_calc_mode', 'commission_per_lot_round_turn', 'swap_charge',
]);
const tradeSchema = z.object({
  account_id: z.uuid(),
  date: z.iso.datetime({ offset: true }),
  close_time: z.iso.datetime({ offset: true }).nullable(),
  symbol: z.string().trim().min(1).max(40),
  direction: z.enum(['buy', 'sell']),
  entry_price: nullablePrice,
  exit_price: nullablePrice,
  volume: z.number().finite().positive(),
  profit: z.number().finite(),
  fee: z.number().finite(),
  profit_calc_mode: z.enum(['manual', 'contract', 'tick']).default('manual'),
  contract_size: z.number().finite().positive().nullable().optional().default(null),
  tick_size: z.number().finite().positive().nullable().optional().default(null),
  tick_value: z.number().finite().positive().nullable().optional().default(null),
  conversion_rate: z.number().finite().positive().nullable().optional().default(null),
  fee_calc_mode: z.enum(['manual', 'per_lot']).default('manual'),
  commission_per_lot_round_turn: z.number().finite().nonnegative().nullable().optional().default(null),
  swap_charge: nullableNumber.optional().default(null),
  theoretical_profit: nullableNumber,
  risk_amount: z.number().finite().positive().nullable(),
  sl_price: nullablePrice,
  tp_price: nullablePrice,
  setup: nullableText(120),
  timeframe: nullableText(30),
  session: nullableText(30),
  tradingview_url: z.union([z.url().refine((url) => /^https?:\/\//i.test(url)), z.null()]),
  note: nullableText(10000),
  mt5_key: nullableText(200),
  incomplete: z.boolean(),
  eval_before: z.array(z.string().max(120)).max(100),
  eval_during: z.array(z.string().max(120)).max(100),
  eval_after: z.array(z.string().max(120)).max(100),
  eval_errors: z.array(z.string().max(120)).max(100),
  eval_errors_reviewed: z.boolean().optional(),
});

function validTradeTime(date: string, closeTime: string | null): boolean {
  return !closeTime || new Date(closeTime).getTime() >= new Date(date).getTime();
}

export interface TradeFilterParams {
  accountId?: string;
  symbol?: string;
  outcome?: 'all' | 'win' | 'loss' | 'breakeven';
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

export async function getTrades(filters?: TradeFilterParams): Promise<Trade[]> {
    const supabase = await createClient();
    const data = [];
    for (let from = 0; ; from += 1000) {
      let query = supabase.from('trades').select('*')
        .order('date', { ascending: false }).order('id', { ascending: false });
      if (filters?.accountId) query = query.eq('account_id', filters.accountId);
      if (filters?.symbol) query = query.ilike('symbol', `%${filters.symbol}%`);
      if (filters?.startDate) query = query.gte('date', filters.startDate);
      if (filters?.endDate) query = query.lte('date', filters.endDate);
      const page = await query.range(from, from + 999);
      if (page.error) throw new Error(`Không tải được lệnh: ${page.error.message}`);
      data.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 1000) break;
    }

  let trades: Trade[] = (data || []).map((row) => ({
    ...row,
    entry_price: row.entry_price != null ? Number(row.entry_price) : null,
    exit_price: row.exit_price != null ? Number(row.exit_price) : null,
    volume: Number(row.volume),
    profit: Number(row.profit),
    fee: Number(row.fee),
    profit_calc_mode: row.profit_calc_mode ?? 'manual',
    contract_size: row.contract_size != null ? Number(row.contract_size) : null,
    tick_size: row.tick_size != null ? Number(row.tick_size) : null,
    tick_value: row.tick_value != null ? Number(row.tick_value) : null,
    conversion_rate: row.conversion_rate != null ? Number(row.conversion_rate) : null,
    fee_calc_mode: row.fee_calc_mode ?? 'manual',
    commission_per_lot_round_turn: row.commission_per_lot_round_turn != null ? Number(row.commission_per_lot_round_turn) : null,
    swap_charge: row.swap_charge != null ? Number(row.swap_charge) : null,
    theoretical_profit: row.theoretical_profit != null ? Number(row.theoretical_profit) : null,
    risk_amount: row.risk_amount != null ? Number(row.risk_amount) : null,
    sl_price: row.sl_price != null ? Number(row.sl_price) : null,
    tp_price: row.tp_price != null ? Number(row.tp_price) : null,
    eval_before: Array.isArray(row.eval_before) ? row.eval_before : [],
    eval_during: Array.isArray(row.eval_during) ? row.eval_during : [],
    eval_after: Array.isArray(row.eval_after) ? row.eval_after : [],
    eval_errors: Array.isArray(row.eval_errors) ? row.eval_errors : [],
    eval_errors_reviewed: row.eval_errors_reviewed === true,
  }));

  // Filter by outcome client/server-side if specified
  if (filters?.outcome && filters.outcome !== 'all') {
    trades = trades.filter((t) => {
      const netP = t.profit - t.fee;
      if (filters.outcome === 'win') return netP > 0;
      if (filters.outcome === 'loss') return netP < 0;
      if (filters.outcome === 'breakeven') return netP === 0;
      return true;
    });
  }

  // Filter by search term (setup, symbol, note)
  if (filters?.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    trades = trades.filter(
      (t) =>
        t.symbol.toLowerCase().includes(term) ||
        (t.setup && t.setup.toLowerCase().includes(term)) ||
        (t.note && t.note.toLowerCase().includes(term)),
    );
  }

  return trades;
}

let hasReviewColumnCached: boolean | null = null;

export async function createTrade(tradeData: TradeInsert): Promise<{ success: boolean; data?: Trade; error?: string }> {
  const parsed = tradeSchema.safeParse(tradeData);
  if (!parsed.success || !validTradeTime(tradeData.date, tradeData.close_time)) {
    return { success: false, error: 'Thông tin lệnh không hợp lệ.' };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập.' };

  const profitInput = {
    mode: parsed.data.profit_calc_mode, direction: parsed.data.direction,
    entryPrice: parsed.data.entry_price, closePrice: parsed.data.exit_price,
    volume: parsed.data.volume, contractSize: parsed.data.contract_size,
    tickSize: parsed.data.tick_size, tickValue: parsed.data.tick_value,
    conversionRate: parsed.data.conversion_rate,
  };
  const autoProfit = calculateBrokerProfit(profitInput);
  const autoRisk = calculateBrokerRisk({ ...profitInput, stopLoss: parsed.data.sl_price });
  const autoFee = calculateBrokerFee({
    mode: parsed.data.fee_calc_mode, volume: parsed.data.volume,
    commissionPerLotRoundTurn: parsed.data.commission_per_lot_round_turn,
    swapCharge: parsed.data.swap_charge,
  });
  if ((parsed.data.profit_calc_mode !== 'manual' && autoProfit === null) ||
      (parsed.data.fee_calc_mode !== 'manual' && autoFee === null)) {
    return { success: false, error: 'Thiếu thông số broker để tính lợi nhuận hoặc phí tự động.' };
  }

  // Preserve manual entries on databases that have not applied migration 005 yet.
  // Automatic modes require 005 and deliberately include their calculation columns.
  const calculationModeEnabled = parsed.data.profit_calc_mode !== 'manual' || parsed.data.fee_calc_mode !== 'manual';
  if (parsed.data.eval_errors_reviewed && hasReviewColumnCached === null) {
    const reviewColumn = await supabase.from('trades').select('eval_errors_reviewed').limit(1);
    hasReviewColumnCached = !reviewColumn.error;
  }
  const hasReviewColumn = hasReviewColumnCached === true;
  if (calculationModeEnabled || (autoFee ?? parsed.data.fee) < 0) {
    const schemaCheck = await supabase.from('trades').select('profit_calc_mode').limit(1);
    if (schemaCheck.error) return { success: false, error: 'Cần áp dụng migration 005 trước khi dùng tính toán tự động hoặc lưu phí được ghi có.' };
  }
  const baseFields = Object.fromEntries(Object.entries(parsed.data).filter(([key]) =>
    !calculationColumns.has(key) && (key !== 'eval_errors_reviewed' || (parsed.data.eval_errors_reviewed && hasReviewColumn))));
  const calculationFields = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => calculationColumns.has(key)));
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      ...baseFields,
      ...(calculationModeEnabled ? calculationFields : {}),
      symbol: parsed.data.symbol.toUpperCase(),
      profit: autoProfit ?? parsed.data.profit,
      fee: autoFee ?? parsed.data.fee,
      risk_amount: parsed.data.profit_calc_mode === 'manual' ? parsed.data.risk_amount : autoRisk,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/history');
  revalidatePath('/');
  return { success: true, data: { ...data, volume: Number(data.volume), profit: Number(data.profit), fee: Number(data.fee) } };
}

export async function updateTrade(id: string, tradeData: TradeUpdate): Promise<{ success: boolean; data?: Trade; error?: string }> {
  const parsed = tradeSchema.partial().safeParse(tradeData);
  if (!z.uuid().safeParse(id).success || !parsed.success || Object.keys(tradeData).length === 0) {
    return { success: false, error: 'Thông tin lệnh không hợp lệ.' };
  }
  // Zod defaults also materialize in a partial schema; only write fields actually provided.
  const provided = Object.fromEntries(Object.entries(parsed.data)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(tradeData, key)));
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from('trades').select('*').eq('id', id).maybeSingle();
  if (readError) return { success: false, error: readError.message };
  if (!current) return { success: false, error: 'Lệnh không tồn tại hoặc bạn không có quyền sửa.' };
  const legacySchema = !Object.prototype.hasOwnProperty.call(current, 'profit_calc_mode');
  const legacyReview = !Object.prototype.hasOwnProperty.call(current, 'eval_errors_reviewed');
  const combined = { profit_calc_mode: 'manual', fee_calc_mode: 'manual', ...current, ...provided };
  if (combined.account_id !== current.account_id) {
    const { data: accounts, error: accountsError } = await supabase.from('accounts')
      .select('id, currency').in('id', [current.account_id, combined.account_id]);
    if (accountsError) return { success: false, error: accountsError.message };
    const oldCurrency = accounts?.find((account) => account.id === current.account_id)?.currency;
    const newCurrency = accounts?.find((account) => account.id === combined.account_id)?.currency;
    if (!oldCurrency || !newCurrency) return { success: false, error: 'Không tìm thấy tài khoản giao dịch.' };
    if (oldCurrency !== newCurrency) {
      return { success: false, error: 'Chỉ có thể chuyển lệnh giữa các tài khoản cùng tiền tệ để giữ nguyên P&L và phí.' };
    }
  }
  if (legacySchema && (combined.profit_calc_mode !== 'manual' || combined.fee_calc_mode !== 'manual')) {
    return { success: false, error: 'Cần áp dụng migration 005 trước khi dùng tính toán tự động.' };
  }
  if (legacySchema && Number(combined.fee) < 0) {
    return { success: false, error: 'Cần áp dụng migration 005 trước khi lưu phí được ghi có.' };
  }
  const profitInput = {
    mode: combined.profit_calc_mode, direction: combined.direction,
    entryPrice: combined.entry_price == null ? null : Number(combined.entry_price),
    closePrice: combined.exit_price == null ? null : Number(combined.exit_price),
    volume: Number(combined.volume),
    contractSize: combined.contract_size == null ? null : Number(combined.contract_size),
    tickSize: combined.tick_size == null ? null : Number(combined.tick_size),
    tickValue: combined.tick_value == null ? null : Number(combined.tick_value),
    conversionRate: combined.conversion_rate == null ? null : Number(combined.conversion_rate),
  };
  const autoProfit = calculateBrokerProfit(profitInput);
  const autoRisk = calculateBrokerRisk({ ...profitInput,
    stopLoss: combined.sl_price == null ? null : Number(combined.sl_price) });
  const autoFee = calculateBrokerFee({
    mode: combined.fee_calc_mode, volume: Number(combined.volume),
    commissionPerLotRoundTurn: combined.commission_per_lot_round_turn == null ? null : Number(combined.commission_per_lot_round_turn),
    swapCharge: combined.swap_charge == null ? null : Number(combined.swap_charge),
  });
  if ((combined.profit_calc_mode !== 'manual' && autoProfit === null) ||
      (combined.fee_calc_mode !== 'manual' && autoFee === null)) {
    return { success: false, error: 'Thiếu thông số broker để tính lợi nhuận hoặc phí tự động.' };
  }
  const updatePayload = {
    ...Object.fromEntries(Object.entries(provided).filter(([key]) =>
      (!legacySchema || !calculationColumns.has(key)) && (!legacyReview || key !== 'eval_errors_reviewed'))),
    ...(parsed.data.symbol && Object.prototype.hasOwnProperty.call(tradeData, 'symbol')
      ? { symbol: parsed.data.symbol.toUpperCase() } : {}),
    ...(autoProfit !== null ? { profit: autoProfit } : {}),
    ...(autoFee !== null ? { fee: autoFee } : {}),
    ...(combined.profit_calc_mode !== 'manual' ? { risk_amount: autoRisk }
      : current.profit_calc_mode !== 'manual' ? { risk_amount: null } : {}),
  };
  const { data, error } = await supabase
    .from('trades')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Lệnh không tồn tại hoặc bạn không có quyền sửa.' };

  revalidatePath('/history');
  revalidatePath('/');
  return {
    success: true,
    data: {
      ...data,
      volume: Number(data.volume),
      profit: Number(data.profit),
      fee: Number(data.fee),
    } as Trade,
  };
}

export async function deleteTrade(id: string): Promise<{ success: boolean; error?: string }> {
  if (!z.uuid().safeParse(id).success) return { success: false, error: 'ID lệnh không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('trades').delete().eq('id', id).select('id').maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Lệnh không tồn tại hoặc bạn không có quyền xóa.' };

  revalidatePath('/history');
  revalidatePath('/');
  return { success: true };
}

export async function deleteTradesBatch(ids: string[]): Promise<{ success: boolean; error?: string }> {
  if (ids.length === 0) return { success: true };
  if (ids.length > 1000 || ids.some((id) => !z.uuid().safeParse(id).success)) {
    return { success: false, error: 'Danh sách lệnh không hợp lệ.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('trades').delete().in('id', ids);

  if (error) return { success: false, error: error.message };

  revalidatePath('/history');
  revalidatePath('/');
  return { success: true };
}
