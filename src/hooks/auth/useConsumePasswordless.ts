import { useState, useCallback } from 'react';
import { authApi } from '../../api/auth';
import { useAuth } from './useAuth';
import type { User } from '../../types/auth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useConsumePasswordless');

interface UseConsumePasswordlessReturn {
  consume: (token: string) => Promise<User>;
  isConsuming: boolean;
  // True once the session is established.
  consumed: boolean;
  // True when this consume CREATED a brand-new account (vs logged into an
  // existing one) — drives a first-run / onboarding branch in the consumer UI.
  isNewUser: boolean;
  // The logged-in user (also pushed into the shared authStore).
  user: User | null;
  // e.g. "This link has expired" — first-class state the callback page renders.
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for the passwordless CONSUME step (email callback page). POSTs the token
 * from the emailed link and, on success, funnels the returned user into
 * useAuth().login so every mounted useAuth flips to authenticated with no
 * full-page reload. Sibling of useConsumeMagicLink, additionally exposing
 * `isNewUser` so the callback page can route a fresh sign-up into onboarding.
 *
 * Usage (consumer-owned callback page):
 *   const { consume, isConsuming, consumed, isNewUser, error } = useConsumePasswordless();
 *   useEffect(() => { void consume(tokenFromUrl); }, []);
 */
export const useConsumePasswordless = (): UseConsumePasswordlessReturn => {
  const [isConsuming, setIsConsuming] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
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
      logger.info('Consuming passwordless link');
      const result = await authApi.consumePasswordless(token);

      // Update the shared reactive auth store: sets store + storage + markResolved,
      // flipping every mounted useAuth instance to authenticated.
      authLogin(result.user);
      setUser(result.user);
      setIsNewUser(result.is_new_user);
      setConsumed(true);
      logger.info('Passwordless login successful', {
        userId: result.user.user_id,
        isNewUser: result.is_new_user,
      });

      return result.user;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'This login link is invalid or has expired';
      setError(errorMessage);
      logger.error('Passwordless consume failed', { error: errorMessage });
      throw err;
    } finally {
      setIsConsuming(false);
    }
  }, [authLogin]);

  return {
    consume,
    isConsuming,
    consumed,
    isNewUser,
    user,
    error,
    clearError,
  };
};
