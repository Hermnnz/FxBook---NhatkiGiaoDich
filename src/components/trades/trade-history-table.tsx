'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Trade, Account } from '@/types';
import { netProfit, calcRMultiple } from '@/lib/calculations';
import { formatMoney } from '@/components/dashboard/format-money';
import { serializeTradesCsv } from '@/lib/parsers/csv';
import { deleteTrade } from '@/lib/actions/trades';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  ExternalLink,
  Search,
  Trash2,
  Upload,
  Download,
  BarChart3,
  FileSpreadsheet,
  Check,
} from 'lucide-react';

interface TradeHistoryTableProps {
  trades: Trade[];
  accounts: Account[];
  selectedAccountId?: string;
  onAccountChange?: (accountId: string) => void;
  onEditTrade: (trade: Trade) => void;
  onRefresh: () => void;
  onOpenImport?: (type: 'csv' | 'mt5' | 'excel') => void;
}

const ITEMS_PER_PAGE = 20;

// Reusable Full-Width Controlled Filter Dropdown
function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string; hint?: string }[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : label;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full h-11 px-4 rounded-lg bg-[#18191c] border border-[#26282c] hover:border-[#3a3d44] flex items-center justify-between text-sm text-zinc-300 transition-colors cursor-pointer select-none"
      >
        <span className="truncate font-medium">{displayLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-64 overflow-y-auto rounded-lg bg-[#18191c] border border-[#2a2d33] shadow-2xl py-1">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#00e676]/10 text-[#00e676] font-semibold'
                    : 'text-zinc-300 hover:bg-[#222429] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#00e676]" />}
                  <span className={isSelected ? 'font-semibold' : ''}>{option.label}</span>
                </div>
                {option.hint && <span className="text-[11px] text-zinc-500 font-mono">{option.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Mailbox icon matching History.png empty state
function MailboxEmptyIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stand */}
      <rect x="30" y="44" width="4" height="16" rx="1.5" fill="#3a3d44" />
      <rect x="25" y="58" width="14" height="3" rx="1.5" fill="#2c2f35" />
      {/* Mailbox body */}
      <path
        d="M18 20C18 15.5817 21.5817 12 26 12H42C46.4183 12 50 15.5817 50 20V44H18V20Z"
        fill="#2563eb"
      />
      {/* Side shadow */}
      <path
        d="M18 20C18 15.5817 21.5817 12 26 12H34V44H18V20Z"
        fill="#1d4ed8"
      />
      {/* Inner door shadow */}
      <ellipse cx="24" cy="27" rx="5" ry="11" fill="#1e3a8a" />
      {/* Envelope peek */}
      <rect x="21" y="23" width="15" height="11" rx="1.5" fill="#f8fafc" />
      <path d="M21 24L28.5 30L36 24" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
      {/* Red flag */}
      <rect x="47" y="14" width="2.5" height="15" rx="1" fill="#ef4444" />
      <rect x="47" y="14" width="10" height="7" rx="1" fill="#ef4444" />
    </svg>
  );
}

export function TradeHistoryTable({
  trades,
  accounts,
  selectedAccountId,
  onAccountChange,
  onEditTrade,
  onRefresh,
  onOpenImport,
}: TradeHistoryTableProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'win' | 'loss' | 'breakeven'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState('');
  const writable = useJournalWritable();

  // Account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  // Options for Account filter
  const accountOptions = useMemo(() => {
    const list: { label: string; value: string; hint?: string }[] = [{ label: 'Tất cả tài khoản', value: 'all' }];
    accounts.forEach((acc) => {
      list.push({
        label: acc.name,
        value: acc.id,
        hint: acc.currency,
      });
    });
    return list;
  }, [accounts]);

  // Options for Month filter dynamically derived from trades
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    trades.forEach((t) => {
      if (t.date) {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.add(ym);
        }
      }
    });

    // Ensure current month is visible
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    months.add(currentYm);

    const sorted = Array.from(months).sort((a, b) => b.localeCompare(a));
    const list = [{ label: 'Tất cả tháng', value: 'all' }];
    sorted.forEach((ym) => {
      const [y, m] = ym.split('-');
      list.push({
        label: `Tháng ${m}/${y}`,
        value: ym,
      });
    });
    return list;
  }, [trades]);

  // Options for Symbol filter
  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    // Default common symbols
    ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'BTCUSD', 'ETHUSD', 'US30', 'NAS100'].forEach(
      (s) => set.add(s)
    );
    trades.forEach((t) => {
      if (t.symbol) set.add(t.symbol.toUpperCase());
    });

    const list = [{ label: 'Tất cả symbol', value: 'all' }];
    Array.from(set)
      .sort()
      .forEach((s) => {
        list.push({ label: s, value: s });
      });
    return list;
  }, [trades]);

  // Options for Outcome filter
  const outcomeOptions = [
    { label: 'Tất cả kết quả', value: 'all' },
    { label: 'Thắng (Win)', value: 'win' },
    { label: 'Thua (Loss)', value: 'loss' },
    { label: 'Hòa vốn (BE)', value: 'breakeven' },
  ];

  // Filtering
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      // 1. Account
      if (selectedAccountId && selectedAccountId !== 'all' && trade.account_id !== selectedAccountId) {
        return false;
      }

      // 2. Month
      if (selectedMonth && selectedMonth !== 'all') {
        const d = new Date(trade.date);
        if (!isNaN(d.getTime())) {
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (ym !== selectedMonth) return false;
        }
      }

      // 3. Symbol
      if (selectedSymbol && selectedSymbol !== 'all') {
        if (trade.symbol.toUpperCase() !== selectedSymbol.toUpperCase()) return false;
      }

      // 4. Outcome
      const np = netProfit(trade);
      if (outcomeFilter === 'win' && np <= 0) return false;
      if (outcomeFilter === 'loss' && np >= 0) return false;
      if (outcomeFilter === 'breakeven' && np !== 0) return false;

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const accName = accountMap.get(trade.account_id)?.name?.toLowerCase() || '';
        const matchSymbol = trade.symbol.toLowerCase().includes(q);
        const matchSetup = trade.setup?.toLowerCase().includes(q);
        const matchNote = trade.note?.toLowerCase().includes(q);
        const matchDirection = trade.direction.toLowerCase().includes(q);
        const matchAcc = accName.includes(q);
        if (!matchSymbol && !matchSetup && !matchNote && !matchDirection && !matchAcc) {
          return false;
        }
      }

      return true;
    });
  }, [trades, selectedAccountId, selectedMonth, selectedSymbol, outcomeFilter, searchQuery, accountMap]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const paginatedTrades = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredTrades.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTrades, page]);

  // Delete trade handler
  async function handleDeleteOne(id: string) {
    if (!writable) return;
    if (!confirm('Bạn có chắc chắn muốn xóa lệnh này khỏi nhật ký?')) return;
    setDeleteError('');
    setDeleting(true);
    try {
      const result = await deleteTrade(id);
      if (!result.success) {
        setDeleteError(result.error ?? 'Không xóa được lệnh.');
        return;
      }
      onRefresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Không xóa được lệnh.');
    } finally {
      setDeleting(false);
    }
  }

  // Export CSV
  function handleExportCsv() {
    if (filteredTrades.length === 0) {
      alert('Không có dữ liệu lệnh để xuất.');
      return;
    }
    if (new Set(filteredTrades.map((trade) => trade.account_id)).size > 1) {
      alert('Hãy lọc một tài khoản trước khi xuất CSV để có thể nhập lại đúng tài khoản.');
      return;
    }

    const csvContent = serializeTradesCsv(filteredTrades);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lich_su_lenh_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Active label for account
  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountValue = activeAccount ? activeAccount.id : (selectedAccountId === 'all' ? 'all' : (accounts[0]?.id || 'all'));

  return (
    <div className="space-y-4">
      {deleteError && (
        <p role="alert" className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-400">
          {deleteError}
        </p>
      )}

      {/* 4 STACKED FULL-WIDTH FILTERS MATCHING History.png */}
      <div className="space-y-2.5">
        {/* 1. Account Filter */}
        <FilterDropdown
          label="Tất cả tài khoản"
          value={accountValue}
          options={accountOptions}
          onChange={(val) => {
            setCurrentPage(1);
            onAccountChange?.(val);
          }}
        />

        {/* 2. Month Filter */}
        <FilterDropdown
          label="Tất cả tháng"
          value={selectedMonth}
          options={monthOptions}
          onChange={(val) => {
            setCurrentPage(1);
            setSelectedMonth(val);
          }}
        />

        {/* 3. Symbol Filter */}
        <FilterDropdown
          label="Tất cả symbol"
          value={selectedSymbol}
          options={symbolOptions}
          onChange={(val) => {
            setCurrentPage(1);
            setSelectedSymbol(val);
          }}
        />

        {/* 4. Outcome Filter */}
        <FilterDropdown
          label="Thắng/Thua"
          value={outcomeFilter}
          options={outcomeOptions}
          onChange={(val) => {
            setCurrentPage(1);
            setOutcomeFilter(val as 'all' | 'win' | 'loss' | 'breakeven');
          }}
        />
      </div>

      {/* TOOLBAR ROW: SEARCH & 4 ACTION BUTTONS */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {/* Search input */}
        <div className="relative w-56 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm kiếm..."
            className="h-9 w-full bg-[#18191c] border border-[#26282c] hover:border-[#32353b] focus:border-zinc-500 rounded-lg pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors"
          />
        </div>

        {/* Button 1: Xuất CSV */}
        <button
          type="button"
          onClick={handleExportCsv}
          className="h-9 px-3.5 rounded-lg bg-[#18191c] hover:bg-[#202227] border border-[#26282c] hover:border-[#32353b] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-rose-400" />
          <span>Xuất CSV</span>
        </button>

        {/* Button 2: Nhập CSV */}
        <button
          type="button"
          onClick={() => onOpenImport?.('csv')}
          disabled={!writable || accounts.length === 0}
          className="h-9 px-3.5 rounded-lg bg-[#18191c] hover:bg-[#202227] border border-[#26282c] hover:border-[#32353b] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Nhập CSV</span>
        </button>

        {/* Button 3: Nhập MT5 */}
        <button
          type="button"
          onClick={() => onOpenImport?.('mt5')}
          disabled={!writable || accounts.length === 0}
          className="h-9 px-3.5 rounded-lg bg-[#18191c] hover:bg-[#202227] border border-[#26282c] hover:border-[#32353b] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Nhập MT5</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenImport?.('excel')}
          disabled={!writable || accounts.length === 0}
          className="h-9 px-3.5 rounded-lg bg-[#18191c] hover:bg-[#202227] border border-[#26282c] hover:border-[#32353b] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
          <span>Nhập file Excel</span>
        </button>
      </div>

      {/* TABLE CONTAINER MATCHING History.png */}
      <div className="rounded-xl border border-[#27292d] bg-[#18191c] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#27292d] bg-[#161719] text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
                <th className="py-3.5 px-3 min-w-[120px]">TÀI KHOẢN</th>
                <th className="py-3.5 px-3 min-w-[130px]">TIME</th>
                <th className="py-3.5 px-3 min-w-[90px]">SYMBOL</th>
                <th className="py-3.5 px-3 text-center min-w-[80px]">VỊ THẾ</th>
                <th className="py-3.5 px-3 text-right min-w-[110px]">KHỐI LƯỢNG (LOT)</th>
                <th className="py-3.5 px-3 text-center min-w-[85px]">PHIÊN</th>
                <th className="py-3.5 px-3 text-right min-w-[95px]">GIÁ VÀO</th>
                <th className="py-3.5 px-3 text-right min-w-[95px]">CẮT LỖ</th>
                <th className="py-3.5 px-3 text-right min-w-[95px]">CHỐT LỜI</th>
                <th className="py-3.5 px-3 text-right min-w-[95px]">GIÁ ĐÓNG</th>
                <th className="py-3.5 px-3 text-right min-w-[110px]">LỢI NHUẬN</th>
                <th className="py-3.5 px-3 text-center min-w-[85px]">TỶ LỆ R</th>
                <th className="py-3.5 px-3 text-center min-w-[80px]">CHART</th>
                <th className="py-3.5 px-3 text-center min-w-[80px]">THAO TÁC</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#27292d]/50">
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
                      <MailboxEmptyIcon />
                      <h3 className="text-sm font-semibold text-zinc-200 mt-3">Chưa có lệnh nào trong lịch sử</h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        Chưa tìm thấy lệnh giao dịch nào phù hợp với bộ lọc hiện tại.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((trade) => {
                  const np = netProfit(trade);
                  const isWin = np > 0;
                  const isLoss = np < 0;
                  const acc = accountMap.get(trade.account_id);
                  const rMultiple = acc ? calcRMultiple(trade, acc) : null;

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-[#1f2126]/60 transition-colors text-xs text-zinc-300"
                    >
                      {/* 1. TÀI KHOẢN */}
                      <td className="py-3 px-3 font-medium text-zinc-200 whitespace-nowrap">
                        <span className="truncate block max-w-[130px]" title={acc?.name || 'Tài khoản'}>
                          {acc?.name || 'Tài khoản'}
                        </span>
                      </td>

                      {/* 2. TIME */}
                      <td className="py-3 px-3 font-mono text-zinc-400 whitespace-nowrap">
                        {new Date(trade.date).toLocaleDateString('vi-VN')}
                        <span className="text-zinc-500 ml-1.5 text-[11px]">
                          {new Date(trade.date).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* 3. SYMBOL */}
                      <td className="py-3 px-3 font-mono font-bold text-zinc-100 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onEditTrade(trade)}
                          className="hover:text-[#00e676] hover:underline transition-colors text-left font-mono font-bold cursor-pointer"
                          title="Bấm để xem chi tiết lệnh và chiến lược"
                        >
                          {trade.symbol}
                        </button>
                      </td>

                      {/* 4. VỊ THẾ */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {trade.direction === 'buy' ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30">
                            BUY
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            SELL
                          </span>
                        )}
                      </td>

                      {/* 5. KHỐI LƯỢNG (LOT) */}
                      <td className="py-3 px-3 text-right font-mono text-zinc-200 whitespace-nowrap">
                        {Number(trade.volume).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>

                      {/* 6. PHIÊN */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {trade.session ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                            {trade.session}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* 7. GIÁ VÀO */}
                      <td className="py-3 px-3 text-right font-mono text-zinc-300 whitespace-nowrap">
                        {trade.entry_price != null ? trade.entry_price.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
                      </td>

                      {/* 8. CẮT LỖ */}
                      <td className="py-3 px-3 text-right font-mono text-rose-400/90 whitespace-nowrap">
                        {trade.sl_price != null ? trade.sl_price.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
                      </td>

                      {/* 9. CHỐT LỜI */}
                      <td className="py-3 px-3 text-right font-mono text-emerald-400/90 whitespace-nowrap">
                        {trade.tp_price != null ? trade.tp_price.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
                      </td>

                      {/* 10. GIÁ ĐÓNG */}
                      <td className="py-3 px-3 text-right font-mono text-zinc-300 whitespace-nowrap">
                        {trade.exit_price != null ? trade.exit_price.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
                      </td>

                      {/* 11. LỢI NHUẬN */}
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          title={`Lãi gộp: ${formatMoney(trade.profit, acc?.currency ?? 'USD')} · Phí: ${formatMoney(trade.fee, acc?.currency ?? 'USD')}`}
                          className={isWin ? 'text-[#00e676]' : isLoss ? 'text-rose-400' : 'text-zinc-400'}
                        >
                          {formatMoney(np, acc?.currency ?? 'USD', 2, true)}
                        </span>
                      </td>

                      {/* 12. TỶ LỆ R */}
                      <td className="py-3 px-3 text-center font-mono font-semibold whitespace-nowrap">
                        {rMultiple != null ? (
                          <span className={rMultiple > 0 ? 'text-[#00e676]' : rMultiple < 0 ? 'text-rose-400' : 'text-zinc-400'}>
                            {rMultiple > 0 ? `+${rMultiple.toFixed(2)}R` : `${rMultiple.toFixed(2)}R`}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* 13. CHART */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {trade.tradingview_url ? (
                          <a
                            href={trade.tradingview_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 hover:text-sky-300 transition-colors cursor-pointer"
                            title="Mở biểu đồ TradingView"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View</span>
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* 14. THAO TÁC */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditTrade(trade)}
                            disabled={!writable || deleting}
                            className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                            title="Xem chi tiết & chỉnh sửa lệnh"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOne(trade.id)}
                            disabled={!writable || deleting}
                            className="p-1 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-40"
                            title="Xóa lệnh"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER - CENTERED */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 py-3.5 border-t border-[#27292d] bg-[#161719]">
            <div className="flex items-center gap-2.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8.5 px-3 bg-[#18191c] border-[#26282c] text-zinc-300 hover:bg-[#222429] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                onClick={() => setCurrentPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Trang trước</span>
              </Button>

              <div className="px-3.5 py-1.5 rounded-lg bg-[#18191c] border border-[#26282c] text-xs font-medium text-zinc-300 select-none">
                <span>Trang <span className="font-bold text-white">{page}</span> / {totalPages}</span>
                <span className="text-zinc-500 ml-1.5">({filteredTrades.length} lệnh)</span>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-8.5 px-3 bg-[#18191c] border-[#26282c] text-zinc-300 hover:bg-[#222429] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >
                <span className="text-xs font-medium">Trang sau</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
