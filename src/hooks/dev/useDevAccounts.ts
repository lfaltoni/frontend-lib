import { useState, useEffect, useCallback } from 'react';
import { devApi } from '../../api/dev';
import type { DevAccount } from '../../types/dev';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useDevAccounts');

interface UseDevAccountsReturn {
  accounts: DevAccount[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  refetch: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for fetching the list of dev quick-login accounts.
 *
 * Auto-fetches once on mount. `enabled` lets the consumer defer the fetch until
 * the panel is actually shown (and the dev API has been initialized) — fsdk-ts
 * itself never decides whether dev mode is on.
 */
export const useDevAccounts = (enabled = true): UseDevAccountsReturn => {
  const [accounts, setAccounts] = useState<DevAccount[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await devApi.getAccounts();
      setAccounts(res.accounts ?? []);
      logger.info('Dev accounts loaded', { count: res.accounts?.length ?? 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dev accounts';
      setError(msg);
      logger.error('Dev accounts fetch failed', { error: msg });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void fetchAccounts();
    }
  }, [enabled, fetchAccounts]);

  const isEmpty = !isLoading && accounts.length === 0;

  return {
    accounts,
    isLoading,
    error,
    isEmpty,
    refetch: fetchAccounts,
    clearError,
  };
};
