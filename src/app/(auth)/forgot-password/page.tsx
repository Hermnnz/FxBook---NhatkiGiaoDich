'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { requestPasswordReset } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const invalidLink = searchParams.get('error') === 'invalid-link';
  const [error, setError] = useState<string | null>(
    invalidLink ? 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.' : null,
  );
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await requestPasswordReset(new FormData(event.currentTarget));
      if (result?.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    } catch {
      setError('Chưa gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.');
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
          <h1 className="text-2xl font-bold tracking-tight text-white">Quên mật khẩu</h1>
          <p className="text-xs leading-5 text-zinc-400">
            Nhập email đăng nhập để nhận liên kết tạo mật khẩu mới.
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-4 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra cả thư rác.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSent(false)}
              className="w-full border-[#363a40] bg-[#222426] text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              Gửi lại email
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-xs font-semibold text-[#00e676] hover:underline">
                Quay lại đăng nhập
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-zinc-300">Email đăng nhập</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Nhập email của bạn"
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
              Gửi liên kết đặt lại mật khẩu
            </Button>

            <div className="border-t border-[#27292d]/60 pt-3 text-center">
              <Link href="/login" className="text-xs font-semibold text-[#00e676] hover:underline">
                Quay lại đăng nhập
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#121314]" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
