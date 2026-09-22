'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, Loader2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { parseCsv, CSV_TEMPLATE } from '@/lib/parsers/csv';
import { decodeMt5File, parseMt5Html } from '@/lib/parsers/mt5';
import type { ParseResult, ParsedTrade } from '@/lib/parsers/shared';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type AccountOption = { id: string; name: string; currency: string };
type Preview = { parsed: ParseResult; ready: ParsedTrade[]; duplicateCount: number };
export type ImportModalProps = { open: boolean; onOpenChange: (open: boolean) => void; initialAccountId?: string; onImported?: (count: number) => void };

const inputClass = 'h-10 w-full rounded-md border border-[#464a4b] bg-[#26292a] px-3 text-sm text-white outline-none focus:border-emerald-400';

function downloadTemplate() {
  const blob = new Blob(['\uFEFF', CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'fxbook-import-template.csv'; link.click();
  URL.revokeObjectURL(url);
}

function totals(rows: ParsedTrade[]) {
  return rows.reduce((sum, row) => {
    const net = row.trade.profit - row.trade.fee;
    if (net >= 0) sum.win += net; else sum.loss += Math.abs(net);
    sum.fee += row.trade.fee;
    return sum;
  }, { win: 0, loss: 0, fee: 0 });
}

const displayPrice = (price: number | null) => price === null ? '—' : price.toLocaleString('en-US', { maximumFractionDigits: 8 });

export function ImportModal({ open, onOpenChange, initialAccountId, onImported }: ImportModalProps) {
  const writable = useJournalWritable();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [utcOffset, setUtcOffset] = useState('0');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let alive = true;
    createClient().from('accounts').select('id,name,currency').order('name').then(({ data, error }) => {
      if (!alive) return;
      if (error) setMessage(`Không tải được tài khoản: ${error.message}`);
      else setAccounts((data ?? []) as AccountOption[]);
    });
    return () => { alive = false; };
  }, [open]);

  const isMt5 = !!file && /\.html?$/i.test(file.name);
  const sums = useMemo(() => totals(preview?.ready ?? []), [preview]);
  const resetPreview = () => { setPreview(null); setMessage(''); };
  const selectFile = (selected: File | null) => { setFile(selected); resetPreview(); };

  async function findDuplicates(keys: string[]): Promise<Set<string>> {
    const duplicateKeys = new Set<string>();
    const client = createClient();
    for (let i = 0; i < keys.length; i += 100) {
      const { data, error } = await client.from('trades').select('mt5_key').in('mt5_key', keys.slice(i, i + 100));
      if (error) throw new Error(`Không kiểm tra được lệnh trùng: ${error.message}`);
      for (const item of data ?? []) if (item.mt5_key) duplicateKeys.add(item.mt5_key);
    }
    return duplicateKeys;
  }

  async function handlePreview() {
    if (!file || !accountId) { setMessage('Chọn tài khoản đích và file trước khi xem trước.'); return; }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) { setMessage('Chưa cấu hình Supabase trong .env.local.'); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage('File vượt giới hạn 10 MB.'); return; }
    if (!/\.(html?|csv)$/i.test(file.name)) { setMessage('Chỉ hỗ trợ file .html, .htm hoặc .csv.'); return; }
    setBusy(true); setMessage(''); setPreview(null);
    try {
      const content = decodeMt5File(await file.arrayBuffer());
      const parsed = isMt5
        ? parseMt5Html(content, { accountId, accountNumber: accountNumber.trim(), brokerUtcOffsetMinutes: Math.round(Number(utcOffset) * 60) })
        : parseCsv(content, accountId);
      const keys = parsed.trades.map((item) => item.sourceId);
      const duplicates = await findDuplicates(keys);
      const seen = new Set<string>();
      let duplicateCount = 0;
      const ready = parsed.trades.filter((item) => {
        if (duplicates.has(item.sourceId) || seen.has(item.sourceId)) { duplicateCount++; return false; }
        seen.add(item.sourceId); return true;
      });
      setPreview({ parsed, ready, duplicateCount });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không đọc được file.');
    } finally { setBusy(false); }
  }

  async function handleImport() {
    if (!preview?.ready.length) return;
    if (!writable) { setMessage('Tài khoản hiện ở chế độ chỉ xem; không thể nhập lệnh.'); return; }
    setBusy(true); setMessage('');
    let inserted = 0; let skipped = 0;
    try {
      const client = createClient();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error('Cần đăng nhập trước khi nhập lệnh.');
      if (preview.ready.some((item) => item.trade.fee < 0)) {
        const schemaCheck = await client.from('trades').select('profit_calc_mode').limit(1);
        if (schemaCheck.error) throw new Error('File có khoản phí ròng âm (broker ghi có). Cần áp dụng migration 005 trước khi nhập.');
      }
      // Recheck just before writing; the database unique index also protects concurrent imports.
      const existing = await findDuplicates(preview.ready.map((item) => item.sourceId));
      const rows = preview.ready.filter((item) => !existing.has(item.sourceId));
      skipped += preview.ready.length - rows.length;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const payload = batch.map((item) => ({ ...item.trade, user_id: auth.user.id }));
        const { error } = await client.from('trades').insert(payload);
        if (!error) { inserted += batch.length; continue; }
        if (error.code !== '23505') throw new Error(`Đã nhập ${inserted} lệnh; dừng ở dòng ${batch[0].row}: ${error.message}`);
        // Another import may have inserted a key after the preview. Retry only this batch row by row.
        for (const item of batch) {
          const retry = await client.from('trades').insert({ ...item.trade, user_id: auth.user.id });
          if (!retry.error) { inserted++; continue; }
          if (retry.error.code === '23505') { skipped++; continue; }
          throw new Error(`Đã nhập ${inserted} lệnh; dừng ở dòng ${item.row}: ${retry.error.message}`);
        }
      }
      setMessage(`Đã nhập ${inserted} lệnh; bỏ qua ${skipped} lệnh trùng. Lịch sử đã được cập nhật.`);
      onImported?.(inserted);
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không nhập được dữ liệu.');
      if (inserted) onImported?.(inserted);
    } finally { setBusy(false); }
  }

  const selectedCurrency = accounts.find((account) => account.id === accountId)?.currency ?? '';

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-[#414546] bg-[#1d2021] text-white">
      <DialogHeader><DialogTitle className="text-xl">Nhập báo cáo MT5 hoặc CSV</DialogTitle></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">Tài khoản đích
          <select className={inputClass} value={accountId} disabled={busy} onChange={(event) => { setAccountId(event.target.value); resetPreview(); }}>
            <option value="">-- Chọn tài khoản --</option>
            {accounts.map((account) => <option value={account.id} key={account.id}>{account.name} ({account.currency})</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">File HTML MT5 hoặc CSV
          <input aria-label="Chọn file nhập" className={`${inputClass} pt-2`} type="file" disabled={busy} accept=".html,.htm,.csv,text/html,text/csv" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        </label>
        {isMt5 && <>
          <label className="space-y-1 text-sm">Số tài khoản MT5
            <input className={inputClass} inputMode="numeric" disabled={busy} value={accountNumber} onChange={(event) => { setAccountNumber(event.target.value); resetPreview(); }} placeholder="Ví dụ: 12345678" />
          </label>
          <label className="space-y-1 text-sm">Múi giờ server MT5 (UTC ± giờ)
            <input className={inputClass} type="number" disabled={busy} min="-12" max="14" step="0.5" value={utcOffset} onChange={(event) => { setUtcOffset(event.target.value); resetPreview(); }} />
          </label>
        </>}
      </div>
      <div className="rounded-md border border-dashed border-[#66716c] p-5 text-center text-sm text-[#bac4c0]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) selectFile(event.dataTransfer.files?.[0] ?? null); }}>
        Kéo thả file HTML MT5 hoặc CSV vào đây {file && <span className="block font-semibold text-white">Đã chọn: {file.name}</span>}
      </div>
      {isMt5 && <p className="text-sm text-amber-300">Hãy kiểm tra múi giờ server trong MT5. Giờ đóng lệnh và các thống kê theo ngày phụ thuộc vào giá trị này.</p>}
      {selectedCurrency && <p className="text-sm text-amber-300">Tài khoản đích dùng {selectedCurrency}. Trước khi xác nhận, hãy kiểm tra các số tiền trong file cũng dùng {selectedCurrency}; hệ thống không quy đổi tiền tệ.</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handlePreview} disabled={busy || !file || !accountId}><FileUp className="mr-2 size-4" />Xem trước</Button>
        <Button type="button" variant="outline" onClick={downloadTemplate}><Download className="mr-2 size-4" />Tải mẫu CSV</Button>
      </div>
      {busy && <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Đang xử lý...</p>}
      {message && <p role="status" className="rounded-md border border-[#4d5550] p-3 text-sm">{message}</p>}
      {preview && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-md bg-[#292d2e] p-3">Hợp lệ để nhập <strong className="block text-xl text-emerald-400">{preview.ready.length}</strong></div>
          <div className="rounded-md bg-[#292d2e] p-3">Trùng <strong className="block text-xl">{preview.duplicateCount}</strong></div>
          <div className="rounded-md bg-[#292d2e] p-3">Dòng lỗi/cảnh báo <strong className="block text-xl text-amber-300">{preview.parsed.issues.length}</strong></div>
          <div className="rounded-md bg-[#292d2e] p-3">Phí ròng dự kiến <strong className="block text-xl">{sums.fee.toFixed(2)} {selectedCurrency}</strong></div>
        </div>
        <p className="text-xs text-[#bac4c0]">Phí dương là chi phí; phí âm là khoản được cộng. P&L ròng = P&L gộp − phí ròng.</p>
        <p className="text-sm">Tổng lãi ròng: <strong className="text-emerald-400">+{sums.win.toFixed(2)}</strong> · Tổng lỗ ròng: <strong className="text-rose-400">-{sums.loss.toFixed(2)}</strong> {selectedCurrency}</p>
        {preview.parsed.reportedBalance !== undefined && <p className="text-sm text-amber-300">Số dư trong báo cáo MT5: {preview.parsed.reportedBalance.toFixed(2)}. Cần đối chiếu với số dư đầu, nạp/rút và phạm vi ngày của tài khoản FxBook trước khi kết luận khớp.</p>}
        {preview.parsed.issues.length > 0 && <div className="max-h-32 overflow-auto rounded-md border border-amber-700 p-3 text-sm"><p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="size-4" />Dòng cần kiểm tra</p>{preview.parsed.issues.map((issue, index) => <p key={index}>Dòng {issue.row}: {issue.message}</p>)}</div>}
        <div className="max-h-64 overflow-auto rounded-md border border-[#414546]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="sticky top-0 bg-[#303435]"><tr>
              {['Dòng', 'Giờ đóng', 'Symbol', 'Chiều', 'Lot', 'Giá vào', 'Stop Loss', 'Take Profit', 'Giá đóng', 'P&L gộp', 'Phí ròng', 'P&L ròng'].map((title) => <th className="whitespace-nowrap p-2" key={title}>{title}</th>)}
            </tr></thead>
            <tbody>{preview.ready.map((item) => <tr className="border-t border-[#414546]" key={item.sourceId}>
              <td className="p-2">{item.row}</td>
              <td className="whitespace-nowrap p-2">{item.trade.close_time?.slice(0, 16) ?? '—'}</td>
              <td className="p-2">{item.trade.symbol}</td>
              <td className="p-2">{item.trade.direction}</td>
              <td className="p-2">{item.trade.volume}</td>
              <td className="p-2">{displayPrice(item.trade.entry_price)}</td>
              <td className="p-2">{displayPrice(item.trade.sl_price)}</td>
              <td className="p-2">{displayPrice(item.trade.tp_price)}</td>
              <td className="p-2">{displayPrice(item.trade.exit_price)}</td>
              <td className="p-2">{item.trade.profit.toFixed(2)}</td>
              <td className="p-2">{item.trade.fee.toFixed(2)}</td>
              <td className="p-2">{(item.trade.profit - item.trade.fee).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!writable && <p className="text-sm text-amber-300">Tài khoản hiện ở chế độ chỉ xem; bạn vẫn có thể xem trước file.</p>}
        <Button onClick={handleImport} disabled={busy || !preview.ready.length || !writable}>Xác nhận nhập {preview.ready.length} lệnh</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}
