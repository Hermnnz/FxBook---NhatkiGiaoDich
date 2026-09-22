'use client';

import { useState } from 'react';
import { deleteAccount } from '@/lib/actions/accounts';
import { useJournalData } from '@/contexts/journal-context';
import { useJournalWritable } from '@/lib/phase5/use-journal-writable';
import type { Account } from '@/types';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AccountModal } from '@/components/accounts/account-modal';
import { TransactionModal } from '@/components/accounts/transaction-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Edit2,
  Loader2,
  Plus,
  PlusCircle,
  Trash2,
  Wallet,
} from 'lucide-react';

export default function AccountsPage() {
  const writable = useJournalWritable();
  const {
    accounts,
    transactions: allTransactions,
    userEmail,
    selectedAccountId,
    setSelectedAccountId,
    balances,
    loading,
    refreshData,
  } = useJournalData();

  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txTargetAccount, setTxTargetAccount] = useState<Account | null>(null);

  const transactions = allTransactions.filter((tx) => tx.account_id === selectedAccountId);

  function handleSelectAccount(id: string) {
    setSelectedAccountId(id);
  }

  async function handleDeleteAccount(id: string, name: string) {
    if (!writable) return;
    if (!confirm(`Bạn có chắc muốn xóa tài khoản "${name}"? Toàn bộ lịch sử lệnh liên quan sẽ bị xóa.`)) {
      return;
    }
    const result = await deleteAccount(id);
    if (!result.success) {
      setError(result.error || 'Không xóa được tài khoản.');
      return;
    }
    await refreshData();
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const activeBalance = activeAccount ? (balances[activeAccount.id] ?? activeAccount.initial_balance) : 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar userEmail={userEmail} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          accounts={accounts}
          activeAccountId={selectedAccountId}
          activeAccountBalance={activeBalance}
          onAccountSelect={handleSelectAccount}
          onTradeAdded={refreshData}
        />

        <main className="p-6 space-y-6 flex-1 overflow-y-auto">
          {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Quản Lý Tài Khoản & Dòng Tiền</h1>
              <p className="text-sm text-muted-foreground">
                Cấu hình số vốn ban đầu, mức rủi ro 1R và ghi chép dòng tiền nạp/rút vốn.
              </p>
            </div>

            <Button
              disabled={!writable}
              onClick={() => {
                setEditingAccount(null);
                setAccountModalOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Thêm tài khoản mới
            </Button>
          </div>

          {loading && accounts.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Đang tải danh sách tài khoản...
            </div>
          ) : accounts.length === 0 ? (
            <Card className="border-border bg-card text-center py-12">
              <CardContent className="space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Wallet className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Chưa có tài khoản giao dịch nào</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Tạo tài khoản đầu tiên để bắt đầu ghi chép lệnh và tính toán số dư động.
                  </p>
                </div>
                <Button
                  disabled={!writable}
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountModalOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Tạo tài khoản ngay
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Account Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((acc) => {
                  const dynamicBal = balances[acc.id] ?? acc.initial_balance;
                  const pnlDiff = dynamicBal - acc.initial_balance;
                  const isSelected = acc.id === selectedAccountId;

                  return (
                    <Card
                      key={acc.id}
                      className={`border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary/60 bg-card shadow-md ring-1 ring-primary/30'
                          : 'border-border bg-card/60 hover:border-border/80'
                      }`}
                      onClick={() => handleSelectAccount(acc.id)}
                    >
                      <CardHeader className="pb-2 flex flex-row items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {acc.name}
                            {isSelected && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                Đang chọn
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Rủi ro: {acc.risk_pct}% / lệnh ({((acc.initial_balance * acc.risk_pct) / 100).toFixed(0)} {acc.currency} 1R)
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            disabled={!writable}
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingAccount(acc);
                              setAccountModalOpen(true);
                            }}
                            title="Sửa tài khoản"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            disabled={!writable}
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteAccount(acc.id, acc.name)}
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Số dư hiện tại (Dynamic)</div>
                          <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                            {dynamicBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">{acc.currency}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
                          <span className="text-muted-foreground">Vốn ban đầu:</span>
                          <span className="font-mono font-medium">
                            {acc.initial_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {acc.currency}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Thay đổi số dư (gồm nạp/rút):</span>
                          <span
                            className={`font-mono font-bold ${
                              pnlDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pnlDiff >= 0 ? `+${pnlDiff.toFixed(2)}` : `-${Math.abs(pnlDiff).toFixed(2)}`} {acc.currency}
                          </span>
                        </div>

                        <Button
                          disabled={!writable}
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTxTargetAccount(acc);
                            setTxModalOpen(true);
                          }}
                        >
                          <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-primary" />
                          Nạp / Rút vốn
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Transactions History for Selected Account */}
              {activeAccount && (
                <Card className="border-border bg-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle className="text-base">
                        Lịch sử dòng tiền (Nạp / Rút) — {activeAccount.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Các khoản nạp thêm hoặc rút lợi nhuận của tài khoản này
                      </CardDescription>
                    </div>

                    <Button
                      disabled={!writable}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTxTargetAccount(activeAccount);
                        setTxModalOpen(true);
                      }}
                      className="text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Ghi nhận Nạp / Rút
                    </Button>
                  </CardHeader>

                  <CardContent>
                    {transactions.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        Chưa có giao dịch nạp hoặc rút tiền nào cho tài khoản này.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead>Ngày thực hiện</TableHead>
                            <TableHead>Loại giao dịch</TableHead>
                            <TableHead className="text-right">Số tiền</TableHead>
                            <TableHead>Ghi chú</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((tx) => (
                            <TableRow key={tx.id} className="border-border">
                              <TableCell className="font-mono text-xs">
                                {new Date(tx.date).toLocaleDateString('vi-VN')}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-2 py-0.5 ${
                                    tx.type === 'deposit'
                                      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                                      : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                                  }`}
                                >
                                  {tx.type === 'deposit' ? (
                                    <ArrowDownCircle className="w-3 h-3 mr-1 inline" />
                                  ) : (
                                    <ArrowUpCircle className="w-3 h-3 mr-1 inline" />
                                  )}
                                  {tx.type === 'deposit' ? 'Nạp vốn' : 'Rút vốn'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                <span className={tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400'}>
                                  {tx.type === 'deposit' ? '+' : '-'}{tx.amount.toFixed(2)} {activeAccount.currency}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {tx.note || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>

      {/* Account Modal (Create / Edit) */}
      <AccountModal
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
        account={editingAccount}
        onSuccess={refreshData}
      />

      {/* Transaction Modal (Deposit / Withdrawal) */}
      {txTargetAccount && (
        <TransactionModal
          open={txModalOpen}
          onOpenChange={setTxModalOpen}
          account={txTargetAccount}
          onSuccess={refreshData}
        />
      )}
    </div>
  );
}
