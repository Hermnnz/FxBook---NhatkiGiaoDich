'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { getJournalBundle } from '@/lib/actions/journal';
import { getStoredActiveAccountId, setStoredActiveAccountId } from '@/lib/active-account';
import { calcCurrentBalance } from '@/lib/calculations';
import type { Account, Trade, AccountTransaction } from '@/types';

interface JournalContextType {
  accounts: Account[];
  trades: Trade[];
  transactions: AccountTransaction[];
  userEmail: string | null;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  balances: Record<string, number>;
  loading: boolean;
  isRefreshing: boolean;
  refreshData: (options?: { silent?: boolean }) => Promise<void>;
  addTradeLocally: (trade: Trade) => void;
  updateTradeLocally: (trade: Trade) => void;
  deleteTradeLocally: (tradeId: string) => void;
  deleteTradesLocally: (tradeIds: string[]) => void;
  addAccountLocally: (account: Account) => void;
  updateAccountLocally: (account: Account) => void;
  deleteAccountLocally: (accountId: string) => void;
  addTransactionLocally: (tx: AccountTransaction) => void;
}

const CACHE_KEY = 'fxbook_journal_snapshot_v1';

interface JournalCacheSnapshot {
  accounts: Account[];
  trades: Trade[];
  transactions: AccountTransaction[];
  userEmail: string | null;
  selectedAccountId?: string;
  timestamp: number;
}

function readCache(): JournalCacheSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JournalCacheSnapshot;
    if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.trades)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCache(data: JournalCacheSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

const JournalContext = createContext<JournalContextType | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const cached = useMemo(() => readCache(), []);

  const [accounts, setAccounts] = useState<Account[]>(() => cached?.accounts ?? []);
  const [trades, setTrades] = useState<Trade[]>(() => cached?.trades ?? []);
  const [transactions, setTransactions] = useState<AccountTransaction[]>(() => cached?.transactions ?? []);
  const [userEmail, setUserEmail] = useState<string | null>(() => cached?.userEmail ?? null);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string>(() => {
    return cached?.selectedAccountId || getStoredActiveAccountId() || '';
  });

  const [loading, setLoading] = useState<boolean>(() => !cached || cached.accounts.length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightFetchRef = useRef<Promise<void> | null>(null);
  const selectedAccountRef = useRef(selectedAccountId);

  // Synchronously compute balances for all accounts in 0ms (no server roundtrips)
  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      const accTxs = transactions.filter((tx) => tx.account_id === acc.id);
      const accTrades = trades.filter((t) => t.account_id === acc.id);
      map[acc.id] = calcCurrentBalance(acc.initial_balance, accTxs, accTrades);
    }
    return map;
  }, [accounts, transactions, trades]);

  const setSelectedAccountId = useCallback((id: string) => {
    selectedAccountRef.current = id;
    setSelectedAccountIdState(id);
    setStoredActiveAccountId(id);
  }, []);

  const runRefresh = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    if (!options?.silent) {
      setLoading(true);
    }
    setIsRefreshing(true);

    const fetchPromise = (async () => {
      try {
        const bundle = await getJournalBundle();
        if (!bundle.user) throw new Error('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');

        if (!isMountedRef.current) return;

        const { user, accounts: accs, trades: allTrades, transactions: allTxs } = bundle;

        setUserEmail(user.email ?? null);
        setAccounts(accs);
        setTrades(allTrades);
        setTransactions(allTxs);
        setLoadError(null);

        // Ensure active account is valid
        const stored = selectedAccountRef.current || getStoredActiveAccountId();
        let nextActiveId = '';
        if (stored && (stored === 'all' || accs.some((a) => a.id === stored))) {
          nextActiveId = stored;
        } else if (accs.length > 0) {
          nextActiveId = accs[0].id;
        }

        selectedAccountRef.current = nextActiveId;
        setSelectedAccountIdState(nextActiveId);
        setStoredActiveAccountId(nextActiveId);

        writeCache({
          accounts: accs,
          trades: allTrades,
          transactions: allTxs,
          userEmail: user.email ?? null,
          selectedAccountId: nextActiveId,
          timestamp: Date.now(),
        });
      } catch (error) {
        if (isMountedRef.current) setLoadError(error instanceof Error ? error.message : 'Không tải được dữ liệu nhật ký.');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
        inFlightFetchRef.current = null;
      }
    })();

    inFlightFetchRef.current = fetchPromise;
    return fetchPromise;
  }, []);

  const refreshData = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    if (inFlightFetchRef.current) {
      // A mutation may finish while an older read is running. Fetch once again
      // after it settles instead of preserving the stale snapshot.
      const olderFetch = inFlightFetchRef.current;
      await olderFetch;
      if (inFlightFetchRef.current && inFlightFetchRef.current !== olderFetch) {
        return inFlightFetchRef.current;
      }
    }
    return runRefresh(options);
  }, [runRefresh]);

  // Background silent revalidation (0ms UI latency)
  useEffect(() => {
    isMountedRef.current = true;
    const hasCachedData = Boolean(cached && cached.accounts.length > 0);
    const timer = window.setTimeout(() => {
      void refreshData({ silent: hasCachedData });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      isMountedRef.current = false;
    };
  }, [refreshData, cached]);

  // Local mutations update only the current authenticated provider instance.
  const addTradeLocally = useCallback((trade: Trade) => {
    setTrades((prev) => [trade, ...prev.filter((t) => t.id !== trade.id)]);
  }, []);

  const updateTradeLocally = useCallback((trade: Trade) => {
    setTrades((prev) => prev.map((t) => (t.id === trade.id ? trade : t)));
  }, []);

  const deleteTradeLocally = useCallback((tradeId: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== tradeId));
  }, []);

  const deleteTradesLocally = useCallback((tradeIds: string[]) => {
    const set = new Set(tradeIds);
    setTrades((prev) => prev.filter((t) => !set.has(t.id)));
  }, []);

  const addAccountLocally = useCallback((account: Account) => {
    setAccounts((prev) => [...prev, account]);
  }, []);

  const updateAccountLocally = useCallback((account: Account) => {
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? account : a)));
  }, []);

  const deleteAccountLocally = useCallback((accountId: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
  }, []);

  const addTransactionLocally = useCallback((tx: AccountTransaction) => {
    setTransactions((prev) => [tx, ...prev]);
  }, []);

  const value = useMemo<JournalContextType>(
    () => ({
      accounts,
      trades,
      transactions,
      userEmail,
      selectedAccountId,
      setSelectedAccountId,
      balances,
      loading,
      isRefreshing,
      refreshData,
      addTradeLocally,
      updateTradeLocally,
      deleteTradeLocally,
      deleteTradesLocally,
      addAccountLocally,
      updateAccountLocally,
      deleteAccountLocally,
      addTransactionLocally,
    }),
    [
      accounts,
      trades,
      transactions,
      userEmail,
      selectedAccountId,
      setSelectedAccountId,
      balances,
      loading,
      isRefreshing,
      refreshData,
      addTradeLocally,
      updateTradeLocally,
      deleteTradeLocally,
      deleteTradesLocally,
      addAccountLocally,
      updateAccountLocally,
      deleteAccountLocally,
      addTransactionLocally,
    ]
  );

  return (
    <JournalContext.Provider value={value}>
      {loadError && (
        <div
          role="alert"
          className="fixed left-1/2 top-3 z-[100] w-[min(92vw,36rem)] -translate-x-1/2 rounded-lg border border-rose-500/50 bg-[#321b20] p-3 text-sm text-white shadow-xl"
        >
          {loadError}{' '}
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => {
              void refreshData();
            }}
          >
            Thử lại
          </button>
        </div>
      )}
      {children}
    </JournalContext.Provider>
  );
}

export function useJournalData(): JournalContextType {
  const ctx = useContext(JournalContext);
  if (!ctx) {
    throw new Error('useJournalData must be used within a JournalProvider');
  }
  return ctx;
}
