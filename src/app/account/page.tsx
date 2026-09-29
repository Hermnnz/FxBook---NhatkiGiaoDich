'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { PageFooterBanner } from '@/components/layout/page-footer-banner';
import { FloatingActionButton } from '@/components/trades/floating-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJournalData } from '@/contexts/journal-context';
import { createClient } from '@/lib/supabase/client';
import { getSubscriptionStatus, type Subscription, type SubscriptionStatus } from '@/lib/phase5/subscription';

export default function AccountPage() {
  const router = useRouter();
  const { accounts } = useJournalData();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const client = createClient();
        const { data: auth } = await client.auth.getUser();

        if (!alive) return;

        if (auth.user) {
          setEmail(auth.user.email ?? '');
          const { data: subscription } = await client
            .from('subscriptions')
            .select('*')
            .eq('user_id', auth.user.id)
            .maybeSingle();

          if (alive && subscription) {
            setStatus(getSubscriptionStatus(subscription as Subscription));
          }
        }
      } catch {
        // ignore load errors
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword) {
      setMessage({ text: 'Vui lòng nhập mật khẩu hiện tại.', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'Mật khẩu mới phải có ít nhất 6 ký tự.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Xác nhận mật khẩu mới không khớp.', type: 'error' });
      return;
    }

    setBusy(true);
    try {
      const client = createClient();
      const { error: signInErr } = await client.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInErr) {
        setMessage({ text: 'Mật khẩu hiện tại không chính xác.', type: 'error' });
        setBusy(false);
        return;
      }

      const { error: updateErr } = await client.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setMessage({ text: updateErr.message, type: 'error' });
      } else {
        setMessage({ text: 'Đổi mật khẩu thành công!', type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Có lỗi xảy ra khi đổi mật khẩu.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const client = createClient();
      await client.auth.signOut();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  }

  return (
    <div className="flex min-h-screen bg-[#141517] text-zinc-100">
      <Sidebar userEmail={email} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-6 md:p-8 max-w-4xl w-full mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">Tài khoản</h1>
            <p className="text-xs text-zinc-400">Thông tin đăng nhập và đổi mật khẩu</p>
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

          {/* Section 1: Thông tin đăng nhập & Hồ sơ */}
          <section className="p-6 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#00e676]/40 bg-zinc-900 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/avatar.png"
                  alt="Nguyễn Đức Anh"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Nguyễn Đức Anh
                </h2>
                <p className="text-xs text-zinc-400">{email || 'Chưa xác định email'} · FxBook Journal</p>
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-[#27292d]">
              <label className="text-xs text-zinc-400">Email đang sử dụng để đăng nhập</label>
              <Input
                type="email"
                value={email || 'Chưa đăng nhập'}
                readOnly
                disabled
                className="bg-[#222426] border-[#2e3135] text-zinc-300 font-mono text-sm max-w-lg cursor-not-allowed"
              />
            </div>
          </section>

          {/* Section 2: Thời hạn sử dụng */}
          <section className="p-6 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>⏳</span>
                <span>Thời hạn sử dụng</span>
              </h2>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold text-[#00e676]">
                {status ? (
                  status.state === 'trial' ? `Còn ${status.daysLeft} ngày` : status.state === 'active' ? 'Gói đã kích hoạt' : 'Đã hết hạn · chỉ đọc'
                ) : (
                  'Chưa có thông tin thời hạn'
                )}
              </div>
              <div className="text-xs text-zinc-400">
                {status?.endsAt
                  ? `Hết hạn vào ${new Date(status.endsAt).toLocaleDateString('vi-VN')}`
                  : 'Kiểm tra migration 002/003 trên Supabase.'}
              </div>
            </div>

            <Button
              type="button"
              onClick={() => window.open('https://t.me/phamduydinh', '_blank')}
              className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-5 py-2 cursor-pointer shadow-[0_0_12px_rgba(0,230,118,0.25)]"
            >
              Gia hạn ngay
            </Button>
          </section>

          {/* Section 3: Đổi mật khẩu */}
          <section className="p-6 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🔑</span>
                <span>Đổi mật khẩu</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Mật khẩu mới sẽ dùng để bảo vệ toàn bộ dữ liệu nhật ký của bạn
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3 max-w-lg">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mật khẩu hiện tại</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#222426] border-[#2e3135] text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mật khẩu mới</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#222426] border-[#2e3135] text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Xác nhận mật khẩu mới</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#222426] border-[#2e3135] text-white text-sm"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-xs px-5 py-2 cursor-pointer shadow-[0_0_12px_rgba(0,230,118,0.25)]"
              >
                {busy ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
              </Button>
            </form>
          </section>

          {/* Section 4: Đăng xuất */}
          <section className="p-6 rounded-xl border border-[#27292d] bg-[#1a1c1e] space-y-3 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>🚪</span>
                <span>Đăng xuất</span>
              </h2>
              <p className="text-xs text-zinc-400">Đăng xuất khỏi thiết bị này</p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleLogout}
              className="border-[#363a40] bg-[#222426] text-zinc-200 hover:text-white hover:bg-zinc-800 text-xs px-5 cursor-pointer"
            >
              Đăng xuất
            </Button>
          </section>

          <PageFooterBanner />
        </main>
      </div>

      <FloatingActionButton accounts={accounts} />
    </div>
  );
}
