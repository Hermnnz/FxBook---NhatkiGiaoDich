import { describe, expect, it } from 'vitest';
import {
  applySessionPersistence,
  shouldRememberSession,
} from '@/lib/supabase/session-persistence';

describe('session persistence', () => {
  it('remembers sessions by default and when explicitly enabled', () => {
    expect(shouldRememberSession()).toBe(true);
    expect(shouldRememberSession('1')).toBe(true);
  });

  it('uses a browser-session cookie when remembering is disabled', () => {
    const expires = new Date('2030-01-01T00:00:00.000Z');
    const options = applySessionPersistence(
      { path: '/', sameSite: 'lax' as const, maxAge: 3600, expires },
      false,
    );

    expect(shouldRememberSession('0')).toBe(false);
    expect(options).toEqual({ path: '/', sameSite: 'lax' });
  });

  it('keeps removal cookies immediate even for a browser-session login', () => {
    const options = { path: '/', maxAge: 0 };

    expect(applySessionPersistence(options, false)).toBe(options);
  });
});
