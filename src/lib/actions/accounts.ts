'use server';

import { createClient } from '@/lib/supabase/server';
import { calcCurrentBalance } from '@/lib/calculations';
import type { Account, AccountInsert, AccountUpdate, AccountTransaction, AccountTransactionInsert } from '@/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  initial_balance: z.number().finite().nonnegative(),
  risk_pct: z.number().finite().positive().max(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  is_active: z.boolean(),
});

const transactionSchema = z.object({
  account_id: z.uuid(),
  type: z.enum(['deposit', 'withdrawal']),
  amount: z.number().finite().positive(),
  note: z.string().trim().max(1000).nullable(),
  date: z.iso.date(),
});

export async function getAccounts(): Promise<Account[]> {
    const supabase = await createClient();
    const data = [];
    for (let from = 0; ; from += 1000) {
      const page = await supabase.from('accounts').select('*')
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(from, from + 999);
      if (page.error) throw new Error(`Không tải được tài khoản: ${page.error.message}`);
      data.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 1000) break;
    }

    return data.map((row) => ({
      ...row,
      initial_balance: Number(row.initial_balance),
      risk_pct: Number(row.risk_pct),
    }));
}

export async function createAccount(accountData: AccountInsert): Promise<{ success: boolean; data?: Account; error?: string }> {
  const parsed = accountSchema.safeParse(accountData);
  if (!parsed.success) return { success: false, error: 'Thông tin tài khoản không hợp lệ.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập.' };

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || error.message.includes('uq_accounts_user_id_name') || error.message.toLowerCase().includes('duplicate')) {
      return { success: false, error: `Tài khoản "${parsed.data.name}" đã tồn tại. Vui lòng đặt tên khác.` };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/accounts');
  revalidatePath('/');
  return {
    success: true,
    data: {
      ...data,
      initial_balance: Number(data.initial_balance),
      risk_pct: Number(data.risk_pct),
    },
  };
}

export async function updateAccount(id: string, accountData: AccountUpdate): Promise<{ success: boolean; error?: string }> {
  const parsed = accountSchema.partial().safeParse(accountData);
  if (!z.uuid().safeParse(id).success || !parsed.success || Object.keys(parsed.data).length === 0) {
    return { success: false, error: 'Thông tin tài khoản không hợp lệ.' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('accounts')
    .update(parsed.data)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505' || error.message.includes('uq_accounts_user_id_name') || error.message.toLowerCase().includes('duplicate')) {
      return { success: false, error: 'Tên tài khoản này đã tồn tại. Vui lòng chọn tên khác.' };
    }
    return { success: false, error: error.message };
  }
  if (!data) return { success: false, error: 'Tài khoản không tồn tại hoặc bạn không có quyền sửa.' };

  revalidatePath('/accounts');
  revalidatePath('/');
  return { success: true };
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  if (!z.uuid().safeParse(id).success) return { success: false, error: 'ID tài khoản không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('accounts').delete().eq('id', id).select('id').maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Tài khoản không tồn tại hoặc bạn không có quyền xóa.' };

  revalidatePath('/accounts');
  revalidatePath('/');
  return { success: true };
}

export async function getAccountTransactions(accountId: string): Promise<AccountTransaction[]> {
    const supabase = await createClient();
    const data = [];
    for (let from = 0; ; from += 1000) {
      const page = await supabase.from('account_transactions').select('*')
        .eq('account_id', accountId).order('date', { ascending: false })
        .order('id', { ascending: false }).range(from, from + 999);
      if (page.error) throw new Error(`Không tải được dòng tiền: ${page.error.message}`);
      data.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 1000) break;
    }

    return (data || []).map((row) => ({
      ...row,
      amount: Number(row.amount),
    }));
}

export async function getAllAccountTransactions(): Promise<AccountTransaction[]> {
    const supabase = await createClient();
    const data = [];
    for (let from = 0; ; from += 1000) {
      const page = await supabase.from('account_transactions').select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false }).range(from, from + 999);
      if (page.error) throw new Error(`Không tải được dòng tiền: ${page.error.message}`);
      data.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 1000) break;
    }

    return (data || []).map((row) => ({
      ...row,
      amount: Number(row.amount),
    }));
}

export async function createTransaction(txData: AccountTransactionInsert): Promise<{ success: boolean; error?: string }> {
  const parsed = transactionSchema.safeParse(txData);
  if (!parsed.success) return { success: false, error: 'Thông tin nạp/rút không hợp lệ.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập.' };

  const { error } = await supabase
    .from('account_transactions')
    .insert({
      user_id: user.id,
      ...parsed.data,
    });

  if (error) return { success: false, error: error.message };

  revalidatePath('/accounts');
  revalidatePath('/');
  return { success: true };
}

/**
 * Calculates current dynamic balance for an account:
 * Initial Balance + Sum(Deposits - Withdrawals) + Sum(Net Profit)
 */
export async function getAccountDynamicBalance(accountId: string): Promise<number> {
  const supabase = await createClient();

  const [accRes, transactions, trades] = await Promise.all([
    supabase.from('accounts').select('initial_balance').eq('id', accountId).single(),
    (async () => {
      const rows: { type: 'deposit' | 'withdrawal'; amount: number }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('account_transactions')
          .select('type, amount').eq('account_id', accountId).order('id').range(from, from + 999);
        if (error) throw new Error(`Không tải được dòng tiền: ${error.message}`);
        rows.push(...(data ?? []).map((row) => ({ type: row.type as 'deposit' | 'withdrawal', amount: Number(row.amount) })));
        if ((data?.length ?? 0) < 1000) break;
      }
      return rows;
    })(),
    (async () => {
      const rows: { profit: number; fee: number }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('trades')
          .select('profit, fee').eq('account_id', accountId).order('id').range(from, from + 999);
        if (error) throw new Error(`Không tải được lệnh: ${error.message}`);
        rows.push(...(data ?? []).map((row) => ({ profit: Number(row.profit), fee: Number(row.fee) })));
        if ((data?.length ?? 0) < 1000) break;
      }
      return rows;
    })(),
  ]);

  if (accRes.error) throw new Error(`Không tải được tài khoản: ${accRes.error.message}`);
  if (!accRes.data) throw new Error('Tài khoản không tồn tại.');

  const initialBalance = Number(accRes.data.initial_balance);

  return calcCurrentBalance(initialBalance, transactions, trades);
}
