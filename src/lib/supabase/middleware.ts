/**
 * Supabase Middleware Client
 *
 * Refreshes auth tokens on every request and updates cookies.
 * Used in Next.js middleware to keep sessions alive.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const pathname = request.nextUrl.pathname;
  const isServerAction = Boolean(request.headers.get('next-action'));
  const isRsc = request.headers.get('rsc') === '1' || Boolean(request.headers.get('next-router-prefetch'));

  // Fast-path: Server actions, internal RSC navigations, and API routes handle authentication internally.
  // Bypassing the 500-800ms remote Supabase cloud call makes page navigation and actions instantaneous (0-5ms).
  if (isServerAction || isRsc || pathname.startsWith('/api/')) {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session before checking access to application routes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicRoute = pathname === '/login' || pathname === '/register' || pathname === '/setup' || pathname.startsWith('/auth/');

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
