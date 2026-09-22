/**
 * Supabase Browser Client
 *
 * Used in Client Components (hooks, event handlers, etc.)
 * Creates a singleton instance for the browser.
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

  return createBrowserClient(
    supabaseUrl,
    supabaseKey,
  );
}
