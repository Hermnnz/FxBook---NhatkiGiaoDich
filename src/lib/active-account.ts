const STORAGE_KEY = 'fxbook_active_account_id';

/**
 * Gets the persisted active account ID from browser localStorage.
 */
export function getStoredActiveAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persists the selected active account ID to browser localStorage.
 */
export function setStoredActiveAccountId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}
