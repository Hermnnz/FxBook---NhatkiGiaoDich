/**
 * Supabase Middleware Client
 *
 * Refreshes auth tokens on every request and updates cookies.
 * Used in Next.js middleware to keep sessions alive.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  applySessionPersistence,
  REMEMBER_SESSION_COOKIE,
  shouldRememberSession,
} from '@/lib/supabase/session-persistence';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const pathname = request.nextUrl.pathname;
  const isServerAction = Boolean(request.headers.get('next-action'));
  const recoveryCode = request.nextUrl.searchParams.get('code');

  // Supabase may fall back to the configured Site URL for recovery links.
  // Route a recovery code received at the home page through our PKCE callback.
  if (pathname === '/' && recoveryCode) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = '/auth/callback';
    callbackUrl.search = '';
    callbackUrl.searchParams.set('code', recoveryCode);
    callbackUrl.searchParams.set('next', '/reset-password');
    return NextResponse.redirect(callbackUrl);
  }

  // Server actions and API routes handle authentication internally. Page and
  // RSC requests still pass through the refresh flow so sessions stay alive.
  if (isServerAction || pathname.startsWith('/api/')) {
    return NextResponse.next({ request });
  }

  if (!supabaseUrl || !supabaseKey) {
    if (request.nextUrl.pathname === '/setup') return NextResponse.next();
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = '/setup';
    setupUrl.search = '';
    return NextResponse.redirect(setupUrl);
  }

  let supabaseResponse = NextResponse.next({
    request,
  });
  const rememberSession = shouldRememberSession(
    request.cookies.get(REMEMBER_SESSION_COOKIE)?.value,
  );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(
              name,
              value,
              applySessionPersistence(options, rememberSession),
            );
          });
        },
      },
    },
  );

  // Refresh the session before checking access to application routes.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const publicRoute = pathname === '/login'
    || pathname === '/register'
    || pathname === '/forgot-password'
    || pathname === '/setup'
    || pathname.startsWith('/auth/');

  if (!user && !publicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/register to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}
