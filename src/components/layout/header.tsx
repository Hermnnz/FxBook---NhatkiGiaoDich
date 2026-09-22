'use client';

import { useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileUp, PlusCircle, Wallet } from 'lucide-react';
import { TradeFormModal } from '@/components/trades/trade-form-modal';
import { ImportModal } from '@/components/trades/import-modal';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import { formatMoney } from '@/components/dashboard/format-money';

interface HeaderProps {
  accounts: Account[];
  activeAccountId?: string;
  activeAccountBalance?: number;
  onAccountSelect?: (id: string) => void;
  onTradeAdded?: () => void;
}

export function Header({
  accounts,
  activeAccountId,
  activeAccountBalance,
  onAccountSelect,
  onTradeAdded,
}: HeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const canWrite = useJournalWritable();

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  return (
    <header className="min-h-16 border-b border-border bg-card/40 backdrop-blur px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10">
      {/* Active Account Switcher & Dynamic Balance */}
      <div className="flex items-center gap-4">
        {accounts.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="w-36 sm:w-48">
              <Select
                value={activeAccount?.id || ''}
                onValueChange={(val) => onAccountSelect?.(val || '')}
              >
                <SelectTrigger className="h-9 bg-background/60 font-medium">
                  <SelectValue placeholder="Chọn tài khoản" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Balance Badge */}
            {activeAccountBalance !== undefined && (
              <Badge
                variant="outline"
                className="h-9 px-2 sm:px-3 font-mono font-bold text-xs sm:text-sm bg-background/80 border-border flex items-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5 text-primary" />
                <span>
                  {formatMoney(activeAccountBalance, activeAccount?.currency ?? 'USD')}
                </span>
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Chưa có tài khoản giao dịch nào.</span>
        )}
      </div>

      {/* Action: Add Trade & Import MT5 / CSV */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setImportModalOpen(true)}
          disabled={accounts.length === 0 || !canWrite}
          className="shadow-sm text-xs sm:text-sm"
        >
          <FileUp className="w-4 h-4 mr-1.5" />
          Nhập MT5 / CSV
        </Button>
        <Button
          onClick={() => setModalOpen(true)}
          disabled={accounts.length === 0 || !canWrite}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm text-xs sm:text-sm"
        >
          <PlusCircle className="w-4 h-4 mr-1.5" />
          + Thêm Lệnh
        </Button>
      </div>

      {/* Trade Form Modal */}
      <TradeFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        accounts={accounts}
        activeAccountId={activeAccount?.id}
        onSuccess={() => {
          onTradeAdded?.();
        }}
      />

      {/* MT5 / CSV Import Modal */}
      {importModalOpen && (
        <ImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          initialAccountId={activeAccount?.id}
          onImported={() => {
            onTradeAdded?.();
          }}
        />
      )}
    </header>
  );
}
