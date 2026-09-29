/**
 * Supabase Server Client
 *
 * Used in Server Components, Server Actions, Route Handlers.
 * Creates a new instance per request using cookie-based auth.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  applySessionPersistence,
  REMEMBER_SESSION_COOKIE,
  REMEMBER_SESSION_MAX_AGE,
  shouldRememberSession,
} from '@/lib/supabase/session-persistence';

type CreateClientOptions = {
  rememberSession?: boolean;
};

export async function createClient(options: CreateClientOptions = {}) {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
  const rememberSession = options.rememberSession
    ?? shouldRememberSession(cookieStore.get(REMEMBER_SESSION_COOKIE)?.value);

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              cookieStore.set(
                name,
                value,
                applySessionPersistence(cookieOptions, rememberSession),
              );
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}

export async function saveRememberSessionPreference(rememberSession: boolean) {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    ...(rememberSession ? { maxAge: REMEMBER_SESSION_MAX_AGE } : {}),
  };

  cookieStore.set(
    REMEMBER_SESSION_COOKIE,
    rememberSession ? '1' : '0',
    cookieOptions,
  );
}
