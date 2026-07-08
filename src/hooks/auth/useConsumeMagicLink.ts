import { useState, useCallback } from 'react';
import { authApi } from '../../api/auth';
import { useAuth } from './useAuth';
import type { User } from '../../types/auth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useConsumeMagicLink');

interface UseConsumeMagicLinkReturn {
  consume: (token: string) => Promise<User>;
  isConsuming: boolean;
  // True once the session is established.
  consumed: boolean;
  // The logged-in user (also pushed into the shared authStore).
  user: User | null;
  // e.g. "This link has expired" — first-class state the callback page renders.
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for the magic-link CONSUME step (email callback page). POSTs the token
 * from the emailed link and, on success, funnels the returned user into
 * useAuth().login so every mounted useAuth flips to authenticated with no
 * full-page reload. Exact precedent: useGoogleLogin.
 *
 * Usage (consumer-owned callback page):
 *   const { consume, isConsuming, consumed, error } = useConsumeMagicLink();
 *   useEffect(() => { void consume(tokenFromUrl); }, []);
 */
export const useConsumeMagicLink = (): UseConsumeMagicLinkReturn => {
  const [isConsuming, setIsConsuming] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { login: authLogin } = useAuth();

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const consume = useCallback(async (token: string): Promise<User> => {
    setIsConsuming(true);
    setError(null);

    try {
      logger.info('Consuming magic link');
      const consumedUser = await authApi.consumeMagicLink(token);

      // Update the shared reactive auth store: sets store + storage + markResolved,
      // flipping every mounted useAuth instance to authenticated.
      authLogin(consumedUser);
      setUser(consumedUser);
      setConsumed(true);
      logger.info('Magic link login successful', { userId: consumedUser.user_id });

      return consumedUser;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'This login link is invalid or has expired';
      setError(errorMessage);
      logger.error('Magic link consume failed', { error: errorMessage });
      throw err;
    } finally {
      setIsConsuming(false);
    }
  }, [authLogin]);

  return {
    consume,
    isConsuming,
    consumed,
    user,
    error,
    clearError,
  };
};
