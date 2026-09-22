'use client';

import { useState, useEffect, useRef } from 'react';
import { useJournalData } from '@/contexts/journal-context';
import type { Trade } from '@/types';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { TradeHistoryTable } from '@/components/trades/trade-history-table';
import { TradeFormModal } from '@/components/trades/trade-form-modal';
import { ImportModal } from '@/components/trades/import-modal';
import { ExcelImportModal } from '@/components/trades/excel-import-modal';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import {
  importAllDocsAction,
} from '@/lib/actions/docs-excel-import';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function HistoryPage() {
  const canWrite = useJournalWritable();
  const {
    accounts,
    trades,
    userEmail,
    selectedAccountId,
    setSelectedAccountId,
    loading,
    refreshData,
  } = useJournalData();

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const autoImportAttemptedRef = useRef(false);

  useEffect(() => {
    if (!loading && accounts.length > 0 && !autoImportAttemptedRef.current) {
      const demoAcc = accounts.find((a) => a.name.toLowerCase() === 'demo_strategy');
      const hasMt5 = trades.some((t) => t.mt5_key?.startsWith('mt5_541431473_'));
      const hasExcelInDemo = demoAcc
        ? trades.some((t) => t.account_id === demoAcc.id && t.mt5_key?.startsWith('doc_excel_row_'))
        : false;
      const hasMissingTheory = trades.some((t) => t.tp_price != null && t.entry_price != null && t.theoretical_profit == null);
      const hasMissingExcelChart = trades.some((t) => t.mt5_key?.startsWith('doc_excel_row_21') && !t.tradingview_url);

      if (!hasMt5 || !hasExcelInDemo || trades.length === 0 || hasMissingTheory || hasMissingExcelChart) {
        autoImportAttemptedRef.current = true;
        importAllDocsAction()
          .then((res) => {
            if (res.success) {
              refreshData();
            }
          })
          .catch(() => {});
      }
    }
  }, [loading, accounts, trades, selectedAccountId, refreshData]);

  function handleAccountChange(accId: string) {
    setSelectedAccountId(accId);
  }

  function handleEditTrade(trade: Trade) {
    setEditingTrade(trade);
    setFormModalOpen(true);
  }

  function handleCreateTrade() {
    setEditingTrade(null);
    setFormModalOpen(true);
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  return (
    <div className="flex min-h-screen bg-[#111214] text-zinc-100">
      <Sidebar userEmail={userEmail} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-4 md:p-6 space-y-5 flex-1 max-w-[1700px] w-full mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Lịch sử lệnh
              </h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {trades.length} lenh
              </p>
            </div>

            <Button
              onClick={handleCreateTrade}
              disabled={!canWrite || accounts.length === 0}
              className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.25)] rounded-lg transition-all"
            >
              + Thêm Lệnh
            </Button>
          </div>

          {loading && trades.length === 0 && accounts.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-[#00e676]" />
              Đang tải danh sách lệnh giao dịch...
            </div>
          ) : (
            <TradeHistoryTable
              trades={trades}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onAccountChange={handleAccountChange}
              onEditTrade={handleEditTrade}
              onRefresh={refreshData}
              onOpenImport={(type) => type === 'excel' ? setExcelModalOpen(true) : setImportModalOpen(true)}
            />
          )}

          <PageFooterBanner />
        </main>
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton
        accounts={accounts}
        activeAccountId={activeAccount?.id}
        onTradeAdded={refreshData}
      />

      {/* Trade Form Modal */}
      <TradeFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        trade={editingTrade}
        accounts={accounts}
        activeAccountId={activeAccount?.id}
        onSuccess={refreshData}
      />

      {/* Import Modal */}
      {importModalOpen && (
        <ImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          initialAccountId={activeAccount?.id}
          onImported={() => {
            void refreshData();
          }}
        />
      )}
      {excelModalOpen && (
        <ExcelImportModal
          open={excelModalOpen}
          onOpenChange={setExcelModalOpen}
          accounts={accounts}
          initialAccountId={activeAccount?.id}
          onImported={() => { void refreshData(); }}
        />
      )}
    </div>
  );
}
