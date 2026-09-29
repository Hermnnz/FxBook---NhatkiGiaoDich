export const REMEMBER_SESSION_COOKIE = 'fxbook-remember-session';
export const REMEMBER_SESSION_MAX_AGE = 400 * 24 * 60 * 60;

type CookieOptions = {
  expires?: Date;
  maxAge?: number;
};

export function shouldRememberSession(preference?: string) {
  return preference !== '0';
}

export function applySessionPersistence<T extends CookieOptions>(
  options: T,
  rememberSession: boolean,
): T {
  if (rememberSession || options.maxAge === 0) {
    return options;
  }

  const sessionCookieOptions = { ...options };
  delete sessionCookieOptions.expires;
  delete sessionCookieOptions.maxAge;
  return sessionCookieOptions;
}
