import { useState, useCallback } from 'react';
import { devApi } from '../../api/dev';
import { useAuth } from '../auth/useAuth';
import type { DevQuickLoginResponse } from '../../types/dev';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useDevLogin');

interface UseDevLoginOptions {
  /**
   * Optional router-aware navigation. If provided, it is used instead of the
   * default full-page `window.location.assign` — keeps the hook router-agnostic
   * (e.g. pass `(to) => router.push(to)` for Next.js client navigation).
   */
  navigate?: (to: string) => void;
}

interface UseDevLoginReturn {
  login: (email: string) => Promise<DevQuickLoginResponse>;
  isLoggingIn: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for performing a dev quick-login.
 *
 * On a successful quick-login it refreshes the SHARED auth store (via
 * useAuth().refreshUser()) so every useAuth() call site across the app reacts,
 * then navigates to the consumer-returned `redirect`. Navigation is
 * router-agnostic: a `navigate` callback if injected, otherwise a full-page
 * `window.location.assign`.
 */
export const useDevLogin = (options: UseDevLoginOptions = {}): UseDevLoginReturn => {
  const { navigate } = options;
  const { refreshUser } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const login = useCallback(
    async (email: string): Promise<DevQuickLoginResponse> => {
      setIsLoggingIn(true);
      setError(null);
      try {
        const res = await devApi.quickLogin(email);

        if (!res.ok) {
          const msg = res.error || 'Quick login failed';
          setError(msg);
          logger.error('Quick login rejected', { error: msg });
          return res;
        }

        // Refresh the shared auth store so the whole app reacts to the new
        // session (refreshUser re-reads the backend session via profileApi and
        // calls authStore.setUser + markResolved).
        await refreshUser();
        logger.info('Quick login succeeded; auth store refreshed');

        const target = res.redirect;
        if (target) {
          if (navigate) {
            navigate(target);
          } else if (typeof window !== 'undefined') {
            window.location.assign(target);
          }
        }

        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Quick login failed';
        setError(msg);
        logger.error('Quick login error', { error: msg });
        throw err;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [refreshUser, navigate],
  );

  return { login, isLoggingIn, error, clearError };
};
