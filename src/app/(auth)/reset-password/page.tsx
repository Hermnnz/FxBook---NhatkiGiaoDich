'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { resetPassword } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await resetPassword(new FormData(event.currentTarget));
      if (result?.error) {
        setError(result.error);
      } else {
        router.replace('/login?password-reset=1');
        router.refresh();
      }
    } catch {
      setError('Không thể cập nhật mật khẩu. Vui lòng yêu cầu liên kết mới.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121314] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#27292d] bg-[#1a1c1e] p-6 shadow-2xl sm:p-8">
        <div className="mb-6 space-y-2 text-center">
          <Image
            src="/avatar.png"
            alt="FxBook Avatar"
            width={64}
            height={64}
            className="mx-auto h-16 w-16 rounded-2xl border-2 border-[#00e676]/40 object-cover shadow-[0_0_16px_rgba(0,230,118,0.3)]"
          />
          <h1 className="text-2xl font-bold tracking-tight text-white">Tạo mật khẩu mới</h1>
          <p className="text-xs text-zinc-400">Mật khẩu cần có ít nhất 6 ký tự.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs text-zinc-300">Mật khẩu mới</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                placeholder="Tối thiểu 6 ký tự"
                required
                className="bg-[#222426] pl-9 text-sm text-white border-[#2e3135] focus-visible:ring-[#00e676]/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-xs text-zinc-300">Nhập lại mật khẩu mới</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={6}
                placeholder="Nhập lại mật khẩu"
                required
                className="bg-[#222426] pl-9 text-sm text-white border-[#2e3135] focus-visible:ring-[#00e676]/50"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-10 w-full bg-[#00e676] text-sm font-bold text-zinc-950 shadow-[0_0_15px_rgba(0,230,118,0.3)] hover:bg-[#00c853]"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu mật khẩu mới
          </Button>

          <div className="space-y-2 border-t border-[#27292d]/60 pt-3 text-center">
            <Link href="/forgot-password" className="text-xs font-semibold text-[#00e676] hover:underline">
              Yêu cầu liên kết mới
            </Link>
            <div>
              <Link href="/login" className="text-xs font-semibold text-[#00e676] hover:underline">
                Quay về đăng nhập
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
