'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { AccountModal } from '@/components/accounts/account-modal';
import { TransactionModal } from '@/components/accounts/transaction-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJournalData } from '@/contexts/journal-context';
import {
  createAccount,
  deleteAccount,
} from '@/lib/actions/accounts';
import { deleteTradesBatch } from '@/lib/actions/trades';
import { createClient } from '@/lib/supabase/client';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import type { Account } from '@/types';
import {
  Edit2,
  Trash2,
  X,
  Save,
  Download,
  Upload,
  Wrench,
} from 'lucide-react';

export default function SettingsPage() {
  const canWrite = useJournalWritable();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accounts & trades from global context
  const { accounts, trades, balances, refreshData } = useJournalData();

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Tag categories
  const [setups, setSetups] = useState<string[]>([
    'Breakout',
    'Pullback',
    'Reversal',
    'Range',
    'Trend Follow',
  ]);
  const [newSetup, setNewSetup] = useState('');

  const [symbols, setSymbols] = useState<string[]>([
    'XAUUSD',
    'EURUSD',
    'GBPUSD',
    'BTCUSD',
    'US30',
  ]);
  const [newSymbol, setNewSymbol] = useState('');

  const [timeframes, setTimeframes] = useState<string[]>(['M5', 'M15', 'H1', 'H4', 'D1']);
  const [newTimeframe, setNewTimeframe] = useState('');

  const [sessions, setSessions] = useState<string[]>([
    'Asia',
    'London',
    'NewYork',
    'Overlap',
    'Sydney',
  ]);
  const [newSession, setNewSession] = useState('');

  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState('');

  // Form for new account
  const [newAccName, setNewAccName] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('10000');
  const [newAccRisk, setNewAccRisk] = useState('1.0');
  const [newAccCurrency, setNewAccCurrency] = useState('USD');
  const [accError, setAccError] = useState<string | null>(null);
  const [accSuccess, setAccSuccess] = useState<string | null>(null);

  // Modals
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [txTargetAccount, setTxTargetAccount] = useState<Account | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);

  // Status & Feedback
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (auth.user) {
        const { data: setRow } = await client
          .from('settings')
          .select('*')
          .eq('user_id', auth.user.id)
          .maybeSingle();

        if (setRow) {
          if (Array.isArray(setRow.setups) && setRow.setups.length > 0) setSetups(setRow.setups);
          if (Array.isArray(setRow.symbols) && setRow.symbols.length > 0) setSymbols(setRow.symbols);
          if (Array.isArray(setRow.timeframes) && setRow.timeframes.length > 0)
            setTimeframes(setRow.timeframes);
          if (Array.isArray(setRow.sessions) && setRow.sessions.length > 0)
            setSessions(setRow.sessions);
          if (Array.isArray(setRow.holidays) && setRow.holidays.length > 0)
            setHolidays(setRow.holidays);
          if (setRow.theme === 'light') {
            setTheme('light');
            document.documentElement.classList.remove('dark');
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  // Theme toggle
  async function handleThemeChange(target: 'dark' | 'light') {
    if (!canWrite) return;
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (auth.user) {
        const { error } = await client
          .from('settings')
          .upsert({ user_id: auth.user.id, theme: target }, { onConflict: 'user_id' });
        if (error) throw error;
        setTheme(target);
        document.documentElement.classList.toggle('dark', target === 'dark');
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không lưu được giao diện.', type: 'error' });
    }
  }

  function parseNumericInput(val: string | number): number {
    if (typeof val === 'number') return val;
    const str = String(val ?? '').trim().replace(/\s/g, '').replace(',', '.');
    return Number(str);
  }

  // Create new trading account
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccError(null);
    setAccSuccess(null);

    const name = newAccName.trim();
    if (!name) {
      setAccError('Vui lòng nhập tên tài khoản.');
      return;
    }
    if (!canWrite) {
      setAccError('Chế độ chỉ đọc: Không thể thêm tài khoản.');
      return;
    }

    const initialBalance = parseNumericInput(newAccBalance);
    const riskPct = parseNumericInput(newAccRisk);

    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      setAccError('Số dư ban đầu phải là số không âm (>= 0).');
      return;
    }

    if (!Number.isFinite(riskPct) || riskPct <= 0 || riskPct > 100) {
      setAccError('Tỷ lệ rủi ro/lệnh phải từ 0.01% đến 100%.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const result = await createAccount({
        name,
        initial_balance: initialBalance,
        risk_pct: riskPct,
        currency: newAccCurrency,
        is_active: true,
      });
      if (!result.success) throw new Error(result.error ?? 'Không thể tạo tài khoản.');

      setNewAccName('');
      setAccSuccess(`Đã thêm tài khoản "${name}" thành công!`);
      setMessage({ text: 'Thêm tài khoản thành công!', type: 'success' });
      await loadAll();
      await refreshData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Không thể tạo tài khoản.';
      setAccError(errMsg);
      setMessage({
        text: errMsg,
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Delete account
  async function handleDeleteAccount(acc: Account) {
    if (!canWrite) return;
    if (!confirm(`Bạn có chắc muốn xóa tài khoản "${acc.name}"? Toàn bộ lệnh và giao dịch sẽ bị xóa!`))
      return;
    setBusy(true);
    try {
      const result = await deleteAccount(acc.id);
      if (!result.success) throw new Error(result.error ?? 'Không thể xóa tài khoản.');
      setMessage({ text: `Đã xóa tài khoản "${acc.name}".`, type: 'success' });
      await loadAll();
      await refreshData();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Không thể xóa tài khoản.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Save all settings to DB
  async function handleSaveSettings() {
    if (!canWrite) return;
    setBusy(true);
    setMessage(null);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('Vui lòng đăng nhập.');

      const { error } = await client.from('settings').upsert(
        {
          user_id: auth.user.id,
          theme,
          setups,
          symbols,
          timeframes,
          sessions,
          holidays,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      setMessage({ text: 'Đã lưu cấu hình cài đặt thành công!', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Không thể lưu cài đặt.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Backup Data to JSON
  async function handleBackup() {
    setBusy(true);
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return;

      const tables = [
        'accounts',
        'account_transactions',
        'trades',
        'market_analyses',
        'readiness_checks',
        'playbook',
        'settings',
      ] as const;
      const backup: Record<string, unknown> = {
        version: 1,
        exported_at: new Date().toISOString(),
        user_id: auth.user.id,
      };

      for (const table of tables) {
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await client.from(table).select('*').eq('user_id', auth.user.id).order('id').range(offset, offset + 999);
          if (error) throw new Error(`Không xuất được ${table}: ${error.message}`);
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        backup[table] = rows;
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fxbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: 'Đã tải dữ liệu JSON. Ảnh trong Storage cần tải riêng.', type: 'success' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Lỗi khi sao lưu dữ liệu.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  // Hard Reset / Clear All
  async function handleClearAll() {
    if (!canWrite) return;
    if (!confirm('CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ lệnh giao dịch của bạn! Bạn có chắc chắn?'))
      return;
    setBusy(true);
    try {
      if (trades.length > 0) {
        const result = await deleteTradesBatch(trades.map((t) => t.id));
        if (!result.success) throw new Error(result.error ?? 'Không xóa được lịch sử lệnh.');
      }
      setMessage({ text: 'Đã xóa toàn bộ lịch sử lệnh giao dịch.', type: 'success' });
      await loadAll();
      await refreshData();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Lỗi khi xóa dữ liệu.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  const estimatedStorageKb = (JSON.stringify(trades).length / 1024).toFixed(1);

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6 md:p-8 max-w-4xl w-full mx-auto space-y-6">
          {/* Top Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#27292d]/60">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Cài đặt</h1>
              <p className="text-xs text-zinc-400">Khai báo tài khoản và danh mục</p>
            </div>

            <Button
              onClick={handleSaveSettings}
              disabled={busy || !canWrite}
              className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.35)] flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu cài đặt</span>
            </Button>
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

          {/* 1. Giao diện (Theme Selector) */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🎨</span>
                <span>Giao diện</span>
              </h2>
              <p className="text-[11px] text-zinc-400">Chọn giao diện hiển thị cho ứng dụng</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              {/* Dark Theme Card */}
              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                disabled={!canWrite}
                className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-[#00e676] bg-[#181a1b] shadow-[0_0_12px_rgba(0,230,118,0.2)]'
                    : 'border-[#2e3135] bg-[#141517] hover:border-zinc-500'
                }`}
              >
                <div className="w-full h-8 rounded bg-[#27292d] flex items-center justify-center px-2">
                  <div className="w-10 h-1.5 rounded-full bg-[#00e676]" />
                </div>
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <span>🌑</span>
                  <span>Giao diện Đen</span>
                </div>
              </button>

              {/* Light Theme Card */}
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                disabled={!canWrite}
                className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-[#00e676] bg-[#222426] shadow-[0_0_12px_rgba(0,230,118,0.2)]'
                    : 'border-[#2e3135] bg-[#141517] hover:border-zinc-500'
                }`}
              >
                <div className="w-full h-8 rounded bg-[#e4e4e7] flex items-center justify-center px-2">
                  <div className="w-10 h-1.5 rounded-full bg-[#00e676]" />
                </div>
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <span>☀️</span>
                  <span>Giao diện Trắng</span>
                </div>
              </button>
            </div>
          </section>

          {/* 2. Tài khoản giao dịch (Trading Accounts Management) */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>💼</span>
                <span>Tài khoản giao dịch</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Khai báo các tài khoản để theo dõi số dư và hiệu suất
              </p>
            </div>

            {/* List of existing accounts */}
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-4 rounded-xl border border-[#27292d] bg-[#202225] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{acc.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                        💱 FX (Forex)
                      </span>
                    </div>
                    <div className="text-xs text-[#00e676] font-mono font-bold">
                      {acc.currency} {(balances[acc.id] ?? acc.initial_balance).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      🛡️ Rủi ro/lệnh: {acc.risk_pct}%
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingAccount(acc);
                        setAccountModalOpen(true);
                      }}
                      disabled={!canWrite}
                      className="border-[#2e3135] bg-[#181a1b] text-xs h-7 px-2.5 text-zinc-300 hover:text-white"
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTxTargetAccount(acc);
                        setTxModalOpen(true);
                      }}
                      disabled={!canWrite}
                      className="border-[#2e3135] bg-[#181a1b] text-xs h-7 px-2.5 text-emerald-400 hover:text-emerald-300"
                    >
                      💵 Nạp/Rút
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc)}
                      disabled={!canWrite}
                      aria-label="Xóa tài khoản"
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Form + Thêm tài khoản mới */}
            <form
              onSubmit={handleCreateAccount}
              noValidate
              className="pt-3 border-t border-[#27292d] space-y-3"
            >
              <div className="text-xs font-bold text-zinc-300">+ Thêm tài khoản mới</div>

              {accError && (
                <div className="p-2.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  {accError}
                </div>
              )}
              {accSuccess && (
                <div className="p-2.5 rounded-lg text-xs font-medium bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30">
                  {accSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-zinc-400 mb-1">Tên tài khoản</label>
                  <Input
                    value={newAccName}
                    onChange={(e) => {
                      setNewAccName(e.target.value);
                      if (accError) setAccError(null);
                    }}
                    placeholder="ACC1, FTMO..."
                    className="bg-[#222426] border-[#2e3135] text-xs h-8"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Số dư đầu</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newAccBalance}
                    onChange={(e) => {
                      setNewAccBalance(e.target.value);
                      if (accError) setAccError(null);
                    }}
                    placeholder="10000"
                    className="bg-[#222426] border-[#2e3135] text-xs h-8"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Rủi ro/lệnh (%)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newAccRisk}
                    onChange={(e) => {
                      setNewAccRisk(e.target.value);
                      if (accError) setAccError(null);
                    }}
                    placeholder="0.15 hoặc 1"
                    className="bg-[#222426] border-[#2e3135] text-xs h-8"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Tiền tệ</label>
                  <select
                    value={newAccCurrency}
                    onChange={(e) => setNewAccCurrency(e.target.value)}
                    className="w-full bg-[#222426] border border-[#2e3135] text-xs rounded-md h-8 px-2 text-zinc-300"
                  >
                    <option value="USD">USD</option>
                    <option value="VND">VND</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy || !canWrite}
                className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs h-8 px-4 cursor-pointer"
              >
                {busy ? 'Đang thêm...' : 'Thêm'}
              </Button>
            </form>
          </section>

          {/* 3. Danh mục Setup */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📐</span>
                <span>Danh mục Setup</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Các setup hay dùng để chọn nhanh khi nhập lệnh
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {setups.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#222426] border border-[#2e3135] text-xs text-zinc-200"
                >
                  <span>{s}</span>
                  <button
                    type="button"
                    onClick={() => setSetups(setups.filter((x) => x !== s))}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                value={newSetup}
                onChange={(e) => setNewSetup(e.target.value)}
                placeholder="Breakout, Pullback..."
                className="bg-[#222426] border-[#2e3135] text-xs h-8"
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  if (newSetup.trim() && !setups.includes(newSetup.trim())) {
                    setSetups([...setups, newSetup.trim()]);
                    setNewSetup('');
                  }
                }}
                className="bg-[#2e3135] hover:bg-zinc-700 text-zinc-200 text-xs h-8 px-3"
              >
                + Thêm
              </Button>
            </div>
          </section>

          {/* 4. Danh mục Symbol */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📉</span>
                <span>Danh mục Symbol</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Các cặp tiền, hàng hóa, chỉ số hay giao dịch
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {symbols.map((sym) => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#222426] border border-[#2e3135] text-xs text-zinc-200"
                >
                  <span>{sym}</span>
                  <button
                    type="button"
                    onClick={() => setSymbols(symbols.filter((x) => x !== sym))}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="XAUUSD, EURUSD..."
                className="bg-[#222426] border-[#2e3135] text-xs h-8"
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  const s = newSymbol.trim().toUpperCase();
                  if (s && !symbols.includes(s)) {
                    setSymbols([...symbols, s]);
                    setNewSymbol('');
                  }
                }}
                className="bg-[#2e3135] hover:bg-zinc-700 text-zinc-200 text-xs h-8 px-3"
              >
                + Thêm
              </Button>
            </div>
          </section>

          {/* 5. Timeframe hay dùng */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>⏱️</span>
                <span>Timeframe hay dùng</span>
              </h2>
              <p className="text-[11px] text-zinc-400">Các khung thời gian phân tích chính</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {timeframes.map((tf) => (
                <span
                  key={tf}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#222426] border border-[#2e3135] text-xs text-zinc-200"
                >
                  <span>{tf}</span>
                  <button
                    type="button"
                    onClick={() => setTimeframes(timeframes.filter((x) => x !== tf))}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                value={newTimeframe}
                onChange={(e) => setNewTimeframe(e.target.value)}
                placeholder="M15, H1, H4..."
                className="bg-[#222426] border-[#2e3135] text-xs h-8"
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  const t = newTimeframe.trim().toUpperCase();
                  if (t && !timeframes.includes(t)) {
                    setTimeframes([...timeframes, t]);
                    setNewTimeframe('');
                  }
                }}
                className="bg-[#2e3135] hover:bg-zinc-700 text-zinc-200 text-xs h-8 px-3"
              >
                + Thêm
              </Button>
            </div>
          </section>

          {/* 6. Phiên giao dịch */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🌍</span>
                <span>Phiên giao dịch</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Các phiên giao dịch hay tham gia — sẽ hiển thị trong dropdown khi nhập lệnh
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {sessions.map((ses) => (
                <span
                  key={ses}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#222426] border border-[#2e3135] text-xs text-zinc-200"
                >
                  <span>{ses}</span>
                  <button
                    type="button"
                    onClick={() => setSessions(sessions.filter((x) => x !== ses))}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                value={newSession}
                onChange={(e) => setNewSession(e.target.value)}
                placeholder="Asia, London, NewYork..."
                className="bg-[#222426] border-[#2e3135] text-xs h-8"
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  const s = newSession.trim();
                  if (s && !sessions.includes(s)) {
                    setSessions([...sessions, s]);
                    setNewSession('');
                  }
                }}
                className="bg-[#2e3135] hover:bg-zinc-700 text-zinc-200 text-xs h-8 px-3"
              >
                + Thêm
              </Button>
            </div>
          </section>

          {/* 7. Ngày lễ thị trường đóng cửa */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🔴</span>
                <span>Ngày lễ thị trường đóng cửa</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Forex tự động đóng cửa Thứ 7 & Chủ nhật. Thêm các ngày lễ khác (Giáng sinh, Tết...) để bảng Phiên giao dịch hiển thị đúng.
              </p>
            </div>

            {holidays.length === 0 ? (
              <div className="text-xs text-zinc-500">Chưa có ngày lễ nào</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {holidays.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#222426] border border-[#2e3135] text-xs text-zinc-200"
                  >
                    <span>{h}</span>
                    <button
                      type="button"
                      onClick={() => setHolidays(holidays.filter((x) => x !== h))}
                      className="text-zinc-500 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="bg-[#222426] border-[#2e3135] text-xs h-8"
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  if (newHoliday && !holidays.includes(newHoliday)) {
                    setHolidays([...holidays, newHoliday]);
                    setNewHoliday('');
                  }
                }}
                className="bg-[#2e3135] hover:bg-zinc-700 text-zinc-200 text-xs h-8 px-3"
              >
                + Thêm ngày lễ
              </Button>
            </div>
          </section>

          {/* 8. Quản lý dữ liệu (Data Maintenance) */}
          <section className="p-5 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🗄️</span>
                <span>Quản lý dữ liệu</span>
              </h2>
              <p className="text-[11px] text-zinc-400">Backup và khôi phục toàn bộ dữ liệu</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBackup}
                className="border-[#2e3135] bg-[#222426] text-xs h-8 text-zinc-200 hover:text-white"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Backup
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-[#2e3135] bg-[#222426] text-xs h-8 text-zinc-200 hover:text-white"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Khôi phục
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMessage({
                    text: 'Định dạng ngày giao dịch đã ở định dạng chuẩn ISO.',
                    type: 'success',
                  })
                }
                className="border-[#2e3135] bg-[#222426] text-xs h-8 text-zinc-200 hover:text-white"
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" />
                Sửa định dạng ngày
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={busy || !canWrite}
                className="border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Xóa tất cả
              </Button>
            </div>

            <div className="text-[11px] text-zinc-500 space-y-1">
              <p>
                Nếu bộ lọc &quot;Tháng&quot; hiện ra ngày thay vì tháng (vd &quot;1-Apr&quot; thay vì &quot;04/2026&quot;), bấm &quot;Sửa định dạng ngày&quot; để chuẩn hóa lại.
              </p>
              <p className="pt-1 text-zinc-400 font-mono">
                Tổng lệnh: <strong className="text-white">{trades.length}</strong> | Dung lượng: <strong className="text-white">{estimatedStorageKb} KB</strong>
              </p>
            </div>
          </section>

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />

      {/* Account Edit Modal */}
      {editingAccount && (
        <AccountModal
          open={accountModalOpen}
          onOpenChange={setAccountModalOpen}
          account={editingAccount}
          onSuccess={() => {
            void loadAll();
            void refreshData();
          }}
        />
      )}

      {/* Transaction Modal (Deposit / Withdrawal) */}
      {txTargetAccount && (
        <TransactionModal
          open={txModalOpen}
          onOpenChange={setTxModalOpen}
          account={txTargetAccount}
          onSuccess={() => {
            void loadAll();
            void refreshData();
          }}
        />
      )}
    </div>
  );
}
