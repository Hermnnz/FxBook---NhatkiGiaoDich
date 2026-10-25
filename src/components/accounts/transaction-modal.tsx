'use client';

import { useState } from 'react';
import { createTransaction } from '@/lib/actions/accounts';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import type { Account } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  onSuccess?: () => void;
}

export function TransactionModal({ open, onOpenChange, account, onSuccess }: TransactionModalProps) {
  const writable = useJournalWritable();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txType, setTxType] = useState<'deposit' | 'withdrawal'>('deposit');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string);
    const note = (formData.get('note') as string)?.trim();
    const date = (formData.get('date') as string) || new Date().toLocaleDateString('en-CA');

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Số tiền phải lớn hơn 0.');
      setLoading(false);
      return;
    }

    try {
      const res = await createTransaction({
        account_id: account.id,
        type: txType,
        amount,
        note: note || null,
        date,
      });

      if (!res.success) {
        setError(res.error || 'Thực hiện giao dịch thất bại.');
        setLoading(false);
        return;
      }

      onOpenChange(false);
      onSuccess?.();
    } catch {
      setError('Đã xảy ra lỗi hệ thống.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {txType === 'deposit' ? (
              <ArrowDownCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <ArrowUpCircle className="w-5 h-5 text-rose-400" />
            )}
            Nạp / Rút vốn — {account.name}
          </DialogTitle>
          <DialogDescription>
            Ghi nhận dòng tiền nạp thêm hoặc rút lợi nhuận để tự động điều chỉnh số dư tài khoản.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Loại giao dịch</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={txType === 'deposit' ? 'default' : 'outline'}
                className={txType === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                onClick={() => setTxType('deposit')}
              >
                <ArrowDownCircle className="w-4 h-4 mr-2" />
                Nạp vốn (Deposit)
              </Button>
              <Button
                type="button"
                variant={txType === 'withdrawal' ? 'default' : 'outline'}
                className={txType === 'withdrawal' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
                onClick={() => setTxType('withdrawal')}
              >
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Rút vốn (Withdraw)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền ({account.currency})</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="any"
              min="0.01"
              placeholder="500.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Ngày thực hiện</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={new Date().toLocaleDateString('en-CA')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú (Tùy chọn)</Label>
            <Input
              id="note"
              name="note"
              placeholder="VD: Rút lãi tuần 2, Nạp thêm vốn..."
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={loading || !writable}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận {txType === 'deposit' ? 'Nạp tiền' : 'Rút tiền'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
