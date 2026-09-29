/**
 * Public self-service registration is closed by default.
 * Set NEXT_PUBLIC_ENABLE_REGISTRATION=true and redeploy to reopen it.
 */
export const REGISTRATION_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_REGISTRATION === 'true';
