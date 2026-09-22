'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { createClient } from '@/lib/supabase/client';
import { excelAccountLabels, findExcelHeader, parseExcelRows, type ExcelRows } from '@/lib/parsers/excel';
import type { ParsedTrade, ParseResult } from '@/lib/parsers/shared';
import type { Account } from '@/types';

type Preview = { parsed: ParseResult; ready: ParsedTrade[]; duplicateCount: number };
type ExcelImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  initialAccountId?: string;
  onImported?: (count: number) => void;
};

const inputClass = 'h-10 w-full rounded-md border border-[#464a4b] bg-[#26292a] px-3 text-sm text-white outline-none focus:border-emerald-400';
const norm = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function ExcelImportModal({ open, onOpenChange, accounts, initialAccountId, onImported }: ExcelImportModalProps) {
  const writable = useJournalWritable();
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sourceRows, setSourceRows] = useState<ExcelRows | null>(null);
  const [date1904, setDate1904] = useState(false);
  const [accountLabels, setAccountLabels] = useState<string[]>([]);
  const [accountMap, setAccountMap] = useState<Record<string, string>>({});
  const [defaultAccountId, setDefaultAccountId] = useState(initialAccountId ?? '');
  const [utcOffset, setUtcOffset] = useState('7');
  const [profitMeaning, setProfitMeaning] = useState<'gross' | 'net'>('net');
  const [commissionMeaning, setCommissionMeaning] = useState<'cash_flow' | 'cost'>('cash_flow');
  const [defaultVolume, setDefaultVolume] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const clearPreview = () => { setPreview(null); setMessage(''); };

  async function loadRows(): Promise<{ rows: ExcelRows; date1904: boolean }> {
    if (sourceRows) return { rows: sourceRows, date1904 };
    let rows: ExcelRows;
    let workbookDate1904 = false;
    if (mode === 'paste') {
      if (!pasteText.trim()) throw new Error('Dán dữ liệu đã copy từ Excel trước khi xem trước.');
      if (pasteText.length > 2_000_000) throw new Error('Dữ liệu dán vượt giới hạn 2 MB.');
      const parsed = Papa.parse<string[]>(pasteText, { delimiter: '\t', skipEmptyLines: 'greedy' });
      if (parsed.errors.length) throw new Error(`Dữ liệu dán sai định dạng: ${parsed.errors[0].message}`);
      rows = parsed.data;
    } else {
      if (!file) throw new Error('Chọn file Excel trước khi xem trước.');
      if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) throw new Error('Chỉ hỗ trợ .xlsx, .xls hoặc .xlsm.');
      if (file.size > 10 * 1024 * 1024) throw new Error('File vượt giới hạn 10 MB.');
      const xlsx = await import('xlsx');
      const workbook = xlsx.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, cellFormula: false });
      if (!workbook.SheetNames.length) throw new Error('File Excel không có sheet dữ liệu.');
      setSheetNames(workbook.SheetNames);
      workbookDate1904 = !!workbook.Workbook?.WBProps?.date1904;
      const preferred = selectedSheet || workbook.SheetNames.find((name) => norm(name) === 'trade') ||
        workbook.SheetNames.find((name) => {
          const candidate = xlsx.utils.sheet_to_json<ExcelRows[number]>(workbook.Sheets[name],
            { header: 1, raw: true, defval: '', blankrows: false }).slice(0, 30);
          return findExcelHeader(candidate) >= 0;
        }) || workbook.SheetNames[0];
      setSelectedSheet(preferred);
      rows = xlsx.utils.sheet_to_json<ExcelRows[number]>(workbook.Sheets[preferred],
        { header: 1, raw: true, defval: '', blankrows: false });
    }
    if (rows.length > 5001) throw new Error('Tối đa 5.000 dòng dữ liệu mỗi lần nhập. Hãy tách file thành các phần nhỏ.');
    setSourceRows(rows);
    setDate1904(workbookDate1904);
    const labels = excelAccountLabels(rows);
    setAccountLabels(labels);
    return { rows, date1904: workbookDate1904 };
  }

  async function findDuplicates(keys: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    const client = createClient();
    for (let i = 0; i < keys.length; i += 100) {
      const { data, error } = await client.from('trades').select('mt5_key').in('mt5_key', keys.slice(i, i + 100));
      if (error) throw new Error(`Không kiểm tra được lệnh trùng: ${error.message}`);
      for (const row of data ?? []) if (row.mt5_key) existing.add(row.mt5_key);
    }
    return existing;
  }

  async function handlePreview() {
    setBusy(true); setMessage(''); setPreview(null);
    try {
      const offset = Number(utcOffset) * 60;
      if (!Number.isInteger(offset) || offset < -720 || offset > 840) throw new Error('Múi giờ phải trong khoảng UTC−12 đến UTC+14.');
      const volume = defaultVolume.trim() ? Number(defaultVolume) : undefined;
      if (volume !== undefined && (!Number.isFinite(volume) || volume <= 0)) throw new Error('Lot mặc định phải là số dương.');
      const source = await loadRows();
      const labels = excelAccountLabels(source.rows);
      const inferred = { ...accountMap };
      for (const label of labels) {
        if (!inferred[label]) inferred[label] = accounts.find((account) => norm(account.name) === norm(label))?.id ?? '';
      }
      setAccountMap(inferred);
      if (labels.some((label) => !inferred[label])) {
        throw new Error('Ánh xạ từng giá trị Account trong file tới tài khoản FxBook, rồi bấm Xem trước lại.');
      }
      if (!labels.length && !defaultAccountId) throw new Error('Chọn tài khoản đích cho file không có cột Account.');
      const parsed = parseExcelRows(source.rows, {
        defaultAccountId, accountMap: inferred, utcOffsetMinutes: offset,
        profitMeaning, commissionMeaning, defaultVolume: volume, date1904: source.date1904,
      });
      const duplicates = await findDuplicates(parsed.trades.map((item) => item.sourceId));
      const ready = parsed.trades.filter((item) => !duplicates.has(item.sourceId));
      setPreview({ parsed, ready, duplicateCount: parsed.trades.length - ready.length });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không đọc được dữ liệu Excel.');
    } finally { setBusy(false); }
  }

  async function handleImport() {
    if (!preview?.ready.length || !writable) return;
    setBusy(true); setMessage('');
    let inserted = 0; let skipped = 0;
    try {
      const client = createClient();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error('Cần đăng nhập trước khi nhập lệnh.');
      if (preview.ready.some((item) => item.trade.fee < 0)) {
        const check = await client.from('trades').select('profit_calc_mode').limit(1);
        if (check.error) throw new Error('File có phí ròng âm; cần áp dụng migration 005 trước khi nhập.');
      }
      const existing = await findDuplicates(preview.ready.map((item) => item.sourceId));
      const rows = preview.ready.filter((item) => !existing.has(item.sourceId));
      skipped += preview.ready.length - rows.length;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await client.from('trades').insert(batch.map((item) => ({ ...item.trade, user_id: auth.user.id })));
        if (!error) { inserted += batch.length; continue; }
        if (error.code !== '23505') throw new Error(`Dừng ở dòng ${batch[0].row}: ${error.message}`);
        for (const item of batch) {
          const retry = await client.from('trades').insert({ ...item.trade, user_id: auth.user.id });
          if (!retry.error) inserted++;
          else if (retry.error.code === '23505') skipped++;
          else throw new Error(`Dừng ở dòng ${item.row}: ${retry.error.message}`);
        }
      }
      setMessage(`Đã nhập ${inserted} lệnh; bỏ qua ${skipped} lệnh trùng. Lịch sử đã được cập nhật.`);
      setPreview(null);
      onImported?.(inserted);
    } catch (error) {
      setMessage(`Đã nhập ${inserted} lệnh. ${error instanceof Error ? error.message : 'Không thể nhập các dòng còn lại.'}`);
      if (inserted) onImported?.(inserted);
    } finally { setBusy(false); }
  }

  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? '—';
  const accountCurrency = (id: string) => accounts.find((account) => account.id === id)?.currency ?? '';
  const displayLocalDate = (iso: string) => {
    const shifted = new Date(new Date(iso).getTime() + Number(utcOffset) * 3_600_000);
    return shifted.toISOString().slice(0, 16).replace('T', ' ');
  };
  const netByAccount = new Map<string, number>();
  for (const item of preview?.ready ?? []) {
    const id = item.trade.account_id;
    netByAccount.set(id, (netByAccount.get(id) ?? 0) + item.trade.profit - item.trade.fee);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-[#414546] bg-[#1d2021] text-white">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><FileSpreadsheet className="size-5 text-emerald-400" />Nhập file Excel nhật ký giao dịch</DialogTitle></DialogHeader>
      <div className="rounded-lg bg-[#292d2e] p-4 text-sm text-zinc-300">
        <p>Chọn file Excel có sheet <strong>Trade</strong>, hoặc dán bảng đã copy từ Excel. Hệ thống cho xem trước rồi mới lưu.</p>
        {mode === 'paste' && <div className="mt-3 space-y-1 border-t border-[#414546] pt-3 text-xs">
          <p className="font-semibold text-zinc-200">Cách copy từ Excel:</p>
          <p>1. Mở sheet Trade, chọn ô tiêu đề <strong>Account</strong> ở hàng có Account, Day, Symbol...</p>
          <p>2. Bấm Ctrl+Shift+End, rồi Ctrl+C.</p>
          <p>3. Bấm vào ô dán bên dưới và nhấn Ctrl+V. Không dùng Ctrl+A vì có thể chọn thêm hàng ngoài bảng.</p>
        </div>}
        <p className="mt-2 text-xs text-zinc-400">Ngày dạng 01/02/2026 được hiểu là 1 tháng 2.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant={mode === 'file' ? 'default' : 'outline'} onClick={() => { setMode('file'); setSourceRows(null); setAccountLabels([]); clearPreview(); }}>Chọn file .xlsx/.xls</Button>
        <Button type="button" variant={mode === 'paste' ? 'default' : 'outline'} onClick={() => { setMode('paste'); setSourceRows(null); setAccountLabels([]); clearPreview(); }}>Dán từ Excel</Button>
      </div>
      {mode === 'file' ? <div className="space-y-2">
        <input aria-label="Chọn file Excel" type="file" accept=".xlsx,.xls,.xlsm" disabled={busy} className={`${inputClass} pt-2`}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSourceRows(null); setSheetNames([]); setSelectedSheet(''); setAccountLabels([]); clearPreview(); }} />
        {sheetNames.length > 1 && <label className="block space-y-1 text-sm">Sheet cần nhập
          <select className={inputClass} value={selectedSheet} onChange={(event) => { setSelectedSheet(event.target.value); setSourceRows(null); setAccountLabels([]); clearPreview(); }}>
            {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>}
      </div> : <textarea aria-label="Dán dữ liệu từ Excel" value={pasteText} disabled={busy}
        onChange={(event) => { setPasteText(event.target.value); setSourceRows(null); setAccountLabels([]); clearPreview(); }}
        placeholder="Account\tDay\tSymbol\tDirection\tVolume\tProfit..." rows={7}
        className="w-full rounded-lg border border-[#464a4b] bg-[#26292a] p-3 font-mono text-sm text-white outline-none focus:border-emerald-400" />}
      {accountLabels.length ? <div className="space-y-2 rounded-lg border border-[#414546] p-3 text-sm">
        <p className="font-semibold">Ánh xạ Account trong Excel</p>
        {accountLabels.map((label) => <label key={label} className="grid items-center gap-2 sm:grid-cols-2">
          <span className="truncate">{label}</span>
          <select className={inputClass} value={accountMap[label] ?? ''} onChange={(event) => { setAccountMap((prev) => ({ ...prev, [label]: event.target.value })); clearPreview(); }}>
            <option value="">-- Chọn tài khoản FxBook --</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
          </select>
        </label>)}
      </div> : <label className="block space-y-1 text-sm">Tài khoản đích nếu file không có cột Account
        <select className={inputClass} value={defaultAccountId} onChange={(event) => { setDefaultAccountId(event.target.value); clearPreview(); }}>
          <option value="">-- Chọn tài khoản --</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
        </select>
      </label>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Profit trong file là
          <select className={inputClass} value={profitMeaning} onChange={(event) => { setProfitMeaning(event.target.value as 'gross' | 'net'); clearPreview(); }}>
            <option value="net">P&L ròng (đã trừ phí)</option><option value="gross">P&L gộp (chưa trừ phí)</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">Commission/Swap trong file là
          <select className={inputClass} value={commissionMeaning} onChange={(event) => { setCommissionMeaning(event.target.value as 'cash_flow' | 'cost'); clearPreview(); }}>
            <option value="cash_flow">Dòng tiền broker (âm = chi phí)</option><option value="cost">Chi phí (dương = bị trừ)</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">Múi giờ của ngày/giờ trong Excel (UTC ± giờ)
          <input type="number" min="-12" max="14" step="0.5" className={inputClass} value={utcOffset} onChange={(event) => { setUtcOffset(event.target.value); clearPreview(); }} />
        </label>
        <label className="space-y-1 text-sm">Lot mặc định nếu file không có cột Volume/Lot
          <input type="number" min="0" step="any" className={inputClass} value={defaultVolume} placeholder="Để trống nếu file có Lot"
            onChange={(event) => { setDefaultVolume(event.target.value); clearPreview(); }} />
        </label>
      </div>
      <p className="text-xs text-amber-300">Phí dương làm giảm Net; phí âm là khoản được ghi có. Tài khoản đích phải cùng tiền tệ với số tiền trong file; hệ thống không tự quy đổi.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handlePreview} disabled={busy || accounts.length === 0}>Xem trước</Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Hủy</Button>
      </div>
      {busy && <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Đang xử lý...</p>}
      {message && <p role="status" className="rounded-md border border-[#4d5550] p-3 text-sm">{message}</p>}
      {preview && <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md bg-[#292d2e] p-3">Sẵn sàng <strong className="block text-xl text-emerald-400">{preview.ready.length}</strong></div>
          <div className="rounded-md bg-[#292d2e] p-3">Đã có trong hệ thống <strong className="block text-xl">{preview.duplicateCount}</strong></div>
          <div className="rounded-md bg-[#292d2e] p-3">Lỗi/cảnh báo <strong className="block text-xl text-amber-300">{preview.parsed.issues.length}</strong></div>
        </div>
        {[...netByAccount].map(([id, net]) => <p key={id} className="text-sm">{accountName(id)}: Net dự kiến <strong>{net.toFixed(2)} {accountCurrency(id)}</strong></p>)}
        {preview.parsed.issues.length > 0 && <div className="max-h-36 overflow-auto rounded-md border border-amber-700 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="size-4" />Dòng cần kiểm tra</p>
          {preview.parsed.issues.slice(0, 100).map((issue, index) => <p key={index}>Dòng {issue.row}: {issue.message}</p>)}
          {preview.parsed.issues.length > 100 && <p>Và {preview.parsed.issues.length - 100} cảnh báo khác.</p>}
        </div>}
        <div className="max-h-64 overflow-auto rounded-md border border-[#414546]">
          <table className="w-full min-w-[1100px] text-left text-sm"><thead className="sticky top-0 bg-[#303435]"><tr>
            {['Dòng', 'Tài khoản', 'Ngày', 'Symbol', 'L/S', 'Lot', 'Entry', 'Stop Loss', 'Take Profit', 'Giá đóng', 'P&L gộp', 'Phí', 'Net'].map((title) => <th key={title} className="whitespace-nowrap p-2">{title}</th>)}
          </tr></thead><tbody>{preview.ready.slice(0, 100).map((item) => <tr key={item.sourceId} className="border-t border-[#414546]">
            <td className="p-2">{item.row}</td><td className="p-2">{accountName(item.trade.account_id)}</td>
            <td className="whitespace-nowrap p-2">{displayLocalDate(item.trade.date)}</td><td className="p-2">{item.trade.symbol}</td>
            <td className="p-2">{item.trade.direction}</td><td className="p-2">{item.trade.volume}</td>
            <td className="p-2">{item.trade.entry_price ?? '—'}</td><td className="p-2">{item.trade.sl_price ?? '—'}</td>
            <td className="p-2">{item.trade.tp_price ?? '—'}</td><td className="p-2">{item.trade.exit_price ?? '—'}</td>
            <td className="p-2">{item.trade.profit.toFixed(2)}</td><td className="p-2">{item.trade.fee.toFixed(2)}</td>
            <td className="p-2">{(item.trade.profit - item.trade.fee).toFixed(2)}</td>
          </tr>)}</tbody></table>
        </div>
        {preview.ready.length > 100 && <p className="text-xs text-zinc-400">Chỉ hiển thị 100 dòng đầu; khi xác nhận sẽ nhập toàn bộ {preview.ready.length} dòng hợp lệ.</p>}
        {!writable && <p className="text-sm text-amber-300">Tài khoản đang ở chế độ chỉ xem; có thể xem trước nhưng không thể nhập.</p>}
        <Button type="button" onClick={handleImport} disabled={busy || !preview.ready.length || !writable} className="bg-[#00cba9] text-zinc-950 hover:bg-[#00b99b]">Xử lý & Nhập {preview.ready.length} lệnh</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}
