'use server';

import { createClient } from '@/lib/supabase/server';
import type { Account, Trade, AccountTransaction } from '@/types';

export interface JournalBundle {
  user: {
    id: string;
    email?: string;
  } | null;
  accounts: Account[];
  trades: Trade[];
  transactions: AccountTransaction[];
}

/**
 * Fetch all essential journal data in a single consolidated call.
 * All Supabase queries run concurrently in parallel on the server.
 */
export async function getJournalBundle(): Promise<JournalBundle> {
  const supabase = await createClient();

  async function loadAllTrades() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const page = await supabase.from('trades').select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + 999);
      if (page.error) throw new Error(`Không tải được lệnh: ${page.error.message}`);
      rows.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 1000) return rows;
    }
  }

  const [authRes, accountsRes, tradeRows, txsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('accounts').select('*').order('created_at', { ascending: true }),
    loadAllTrades(),
    supabase.from('account_transactions').select('*').order('date', { ascending: false }).order('id', { ascending: false }),
  ]);

  if (authRes.error) throw new Error(`Không xác thực được tài khoản: ${authRes.error.message}`);
  if (accountsRes.error) throw new Error(`Không tải được tài khoản giao dịch: ${accountsRes.error.message}`);
  if (txsRes.error) throw new Error(`Không tải được nạp/rút: ${txsRes.error.message}`);

  const user = authRes.data?.user
    ? { id: authRes.data.user.id, email: authRes.data.user.email }
    : null;

  const accounts: Account[] = (accountsRes.data || []).map((row) => ({
    ...row,
    initial_balance: Number(row.initial_balance),
    risk_pct: Number(row.risk_pct),
  }));

  const trades: Trade[] = tradeRows.map((row) => ({
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

  const transactions: AccountTransaction[] = (txsRes.data || []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));

  return { user, accounts, trades, transactions };
}
