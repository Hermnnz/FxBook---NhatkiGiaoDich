'use client';

import { useState } from 'react';
import { createAccount, updateAccount } from '@/lib/actions/accounts';
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
import { Loader2 } from 'lucide-react';

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
  onSuccess?: () => void;
}

function parseNumeric(val: unknown): number {
  if (typeof val === 'number') return val;
  const str = String(val ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return Number(str);
}

export function AccountModal({ open, onOpenChange, account, onSuccess }: AccountModalProps) {
  const writable = useJournalWritable();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!account;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string)?.trim();
    const initialBalance = parseNumeric(formData.get('initial_balance'));
    const riskPct = parseNumeric(formData.get('risk_pct'));
    const currency = (formData.get('currency') as string)?.trim() || 'USD';

    if (!name || !Number.isFinite(initialBalance) || initialBalance < 0 ||
        !Number.isFinite(riskPct) || riskPct <= 0 || riskPct > 100 || !/^[A-Za-z]{3}$/.test(currency)) {
      setError('Kiểm tra lại tên, số vốn, rủi ro và mã tiền tệ (3 chữ cái).');
      setLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const res = await updateAccount(account.id, {
          name,
          initial_balance: initialBalance,
          risk_pct: riskPct,
          currency,
        });
        if (!res.success) {
          setError(res.error || 'Cập nhật thất bại.');
          setLoading(false);
          return;
        }
      } else {
        const res = await createAccount({
          name,
          initial_balance: initialBalance,
          risk_pct: riskPct,
          currency,
          is_active: true,
        });
        if (!res.success) {
          setError(res.error || 'Tạo tài khoản thất bại.');
          setLoading(false);
          return;
        }
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
          <DialogTitle>{isEditing ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản giao dịch'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Cập nhật thông tin cấu hình tài khoản.'
              : 'Tạo tài khoản mới để bắt đầu theo dõi nhật ký lệnh.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && (
            <div className="p-3 text-sm rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Tên tài khoản</Label>
            <Input
              id="name"
              name="name"
              placeholder="VD: MT5 Real, Prop Firm Funded..."
              defaultValue={account?.name || ''}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initial_balance">Số vốn ban đầu ($)</Label>
              <Input
                id="initial_balance"
                name="initial_balance"
                type="text"
                inputMode="decimal"
                placeholder="10000"
                defaultValue={account?.initial_balance ?? 10000}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk_pct">Mức rủi ro 1R (%)</Label>
              <Input
                id="risk_pct"
                name="risk_pct"
                type="text"
                inputMode="decimal"
                placeholder="1.0"
                defaultValue={account?.risk_pct ?? 1.0}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Đơn vị tiền tệ</Label>
            <Input
              id="currency"
              name="currency"
              placeholder="USD"
              defaultValue={account?.currency || 'USD'}
              required
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
              {isEditing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
