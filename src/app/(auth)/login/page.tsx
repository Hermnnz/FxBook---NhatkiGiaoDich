'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered') === '1';
  const confirmationRequired = searchParams.get('confirm') === '1';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await login(formData);
      if (res?.error) {
        setError(res.error);
      } else if (res?.success) {
        router.replace('/');
        router.refresh();
      }
    } catch {
      setError('Không đăng nhập được. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-[#27292d] bg-[#1a1c1e] p-6 sm:p-8 shadow-2xl">
      <div className="text-center space-y-2 mb-6">
        <Image
          src="/avatar.png"
          alt="FxBook Avatar"
          width={64}
          height={64}
          className="w-16 h-16 rounded-2xl object-cover border-2 border-[#00e676]/40 shadow-[0_0_16px_rgba(0,230,118,0.3)] mx-auto"
        />
        <h1 className="text-2xl font-bold tracking-tight text-white">Đăng nhập FxBook</h1>
        <p className="text-xs text-zinc-400">
          Nhật ký giao dịch tài chính & rèn luyện kỷ luật
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(registered || confirmationRequired) && (
          <div className="p-3 text-xs rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{confirmationRequired ? 'Đăng ký thành công. Kiểm tra email để xác nhận tài khoản trước khi đăng nhập.' : 'Đăng ký thành công! Bạn có thể đăng nhập ngay bây giờ.'}</span>
          </div>
        )}

        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs text-zinc-300">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="trader@fxbook.com"
              required
              className="pl-9 bg-[#222426] border-[#2e3135] text-white text-sm focus-visible:ring-[#00e676]/50"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs text-zinc-300">Mật khẩu</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="pl-9 bg-[#222426] border-[#2e3135] text-white text-sm focus-visible:ring-[#00e676]/50"
            />
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00e676] hover:bg-[#00c853] text-zinc-950 font-bold text-sm h-10 cursor-pointer shadow-[0_0_15px_rgba(0,230,118,0.3)] transition-all"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin text-zinc-950" />}
            Đăng nhập
          </Button>
        </div>

        <div className="pt-3 text-center border-t border-[#27292d]/60">
          <p className="text-xs text-zinc-400">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="text-[#00e676] hover:underline font-semibold ml-1">
              Đăng ký ngay
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121314] px-4 py-8">
      <Suspense fallback={<div className="text-xs text-zinc-400">Đang tải...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
