'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { TradeFormModal } from '@/components/trades/trade-form-modal';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import type { Account } from '@/types';

interface FloatingActionButtonProps {
  accounts: Account[];
  activeAccountId?: string;
  onTradeAdded?: () => void;
}

export function FloatingActionButton({
  accounts,
  activeAccountId,
  onTradeAdded,
}: FloatingActionButtonProps) {
  const [open, setOpen] = useState(false);
  const canWrite = useJournalWritable();
  if (!canWrite) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Thêm lệnh nhanh"
        title="Ghi chép lệnh mới (+)"
        className="fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-[#00e676] text-zinc-950 font-bold shadow-[0_4px_24px_rgba(0,230,118,0.45)] transition-all hover:scale-110 hover:shadow-[0_6px_28px_rgba(0,230,118,0.6)] active:scale-95 cursor-pointer"
      >
        <Plus className="h-6 w-6 stroke-[2.8]" />
      </button>

      <TradeFormModal
        open={open}
        onOpenChange={setOpen}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSuccess={() => {
          onTradeAdded?.();
        }}
      />
    </>
  );
}
