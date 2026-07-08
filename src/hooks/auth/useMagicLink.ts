import { useState, useCallback } from 'react';
import { authApi } from '../../api/auth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useMagicLink');

interface UseMagicLinkReturn {
  request: (email: string) => Promise<void>;
  isSending: boolean;
  // True after a successful (enumeration-safe) request. Because the endpoint is
  // enumeration-safe, this being true does NOT imply the email exists.
  sent: boolean;
  error: string | null;
  // Clears sent + error to re-arm the form.
  reset: () => void;
}

/**
 * Hook for the magic-link REQUEST step (login page). Asks the backend to email
 * a one-time login link. Mirrors usePasswordReset's requestReset state machine;
 * it never authenticates, so it has NO useAuth dependency.
 */
export const useMagicLink = (): UseMagicLinkReturn => {
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
      logger.info('Requesting magic link');
      await authApi.requestMagicLink(email);
      setSent(true);
      logger.info('Magic link email sent');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send magic link';
      setError(errorMessage);
      logger.error('Magic link request failed', { error: errorMessage });
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
