'use server';

import {
  createClient,
  saveRememberSessionPreference,
} from '@/lib/supabase/server';
import { REGISTRATION_ENABLED } from '@/lib/features';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

async function getAppOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configuredSiteUrl) return configuredSiteUrl;

  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  if (origin) return origin;

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return host ? `${protocol}://${host}` : 'https://fxbook-herman.vercel.app';
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const rememberSession = formData.get('remember') === 'on';

  if (!email || !password) {
    return { error: 'Vui lòng nhập đầy đủ email và mật khẩu.' };
  }

  const supabase = await createClient({ rememberSession });

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message || 'Đăng nhập không thành công.' };
  }

  await saveRememberSessionPreference(rememberSession);

  return { success: true };
}

export async function signup(formData: FormData) {
  if (!REGISTRATION_ENABLED) {
    return { error: 'Chức năng đăng ký đang tạm đóng.' };
  }

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!email || !password) {
    return { error: 'Vui lòng nhập đầy đủ email và mật khẩu.' };
  }

  if (password.length < 6) {
    return { error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Mật khẩu xác nhận không khớp.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message || 'Đăng ký không thành công.' };
  }

  return { success: true, emailConfirmationRequired: !data.session };
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return { error: 'Vui lòng nhập email đăng nhập.' };
  }

  const supabase = await createClient();
  const origin = await getAppOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error('[auth:password-reset-request] Supabase rejected the request', {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
    });

    if (error.name === 'AuthRetryableFetchError' || /fetch failed/i.test(error.message)) {
      return {
        error: 'Không kết nối được máy chủ tài khoản Supabase. Hãy kiểm tra trạng thái dự án Supabase.',
      };
    }

    if (error.status === 429) {
      return { error: 'Bạn đã yêu cầu quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.' };
    }

    return { error: 'Supabase chưa thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.' };
  }

  // Keep the response generic so the form does not reveal whether an email exists.
  return { success: true };
}

export async function resetPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < 6) {
    return { error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Xác nhận mật khẩu mới không khớp.' };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    return { error: 'Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu liên kết mới.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message || 'Không thể cập nhật mật khẩu.' };
  }

  await supabase.auth.signOut({ scope: 'local' });
  return { success: true };
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
