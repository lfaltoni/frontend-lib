import { useState, useCallback } from 'react';
import { authApi } from '../../api/auth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useEmailSignIn');

interface UseEmailSignInReturn {
  request: (email: string) => Promise<void>;
  isSending: boolean;
  // True after a successful (enumeration-safe) request. Because the endpoint is
  // enumeration-safe, this being true does NOT imply the email exists — and for
  // the passwordless flow a NEW email is equally valid (it becomes a sign-up).
  sent: boolean;
  error: string | null;
  // Clears sent + error to re-arm the form.
  reset: () => void;
}

/**
 * Hook for the passwordless REQUEST step (identifier-first sign-in / sign-up
 * page). Asks the backend to email a one-time link that, when consumed, either
 * logs into an existing account OR creates a brand-new one for an unknown email.
 * Sibling of useMagicLink pointed at authApi.requestPasswordless; it never
 * authenticates, so it has NO useAuth dependency.
 */
export const useEmailSignIn = (): UseEmailSignInReturn => {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSent(false);
    setError(null);
  }, []);

  const request = useCallback(async (email: string): Promise<void> => {
    setIsSending(true);
    setError(null);
    setSent(false);

    try {
      logger.info('Requesting passwordless sign-in link');
      await authApi.requestPasswordless(email);
      setSent(true);
      logger.info('Passwordless sign-in email sent');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send sign-in link';
      setError(errorMessage);
      logger.error('Passwordless request failed', { error: errorMessage });
      throw err;
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    request,
    isSending,
    sent,
    error,
    reset,
  };
};
