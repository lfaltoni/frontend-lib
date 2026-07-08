import { useState, useCallback } from 'react';
import { authApi } from '../../api/auth';
import { useAuth } from './useAuth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useEmailVerification');

interface UseEmailVerificationReturn {
  // From useAuth().user?.email_verified. `undefined` ⇒ unknown (backend has not
  // surfaced it yet); treated as "don't nag".
  emailVerified: boolean | undefined;
  // True only when a user is present, email_verified === false, and the banner
  // has not been dismissed this session.
  needsVerification: boolean;
  resend: () => Promise<void>;
  isResending: boolean;
  // True after a successful resend (show a "sent!" confirmation). Cleared on the
  // next resend attempt.
  resent: boolean;
  error: string | null;
  // Consumer's "X" on the banner — in-memory, per mount. fsdk-ts does not
  // persist it (the consumer may).
  dismiss: () => void;
}

/**
 * Headless state for a non-blocking "confirm your email" UX.
 *
 * Derives verification status from the shared `useAuth` user (so it stays in
 * sync with background revalidation) and owns only the resend action + a
 * session-local dismiss flag. No banner UI — the consumer renders the markup
 * and calls `resend`/`dismiss`.
 */
export const useEmailVerification = (): UseEmailVerificationReturn => {
  const { user } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const emailVerified = user?.email_verified;
  const needsVerification = !!user && emailVerified === false && !dismissed;

  const dismiss = useCallback(() => setDismissed(true), []);

  const resend = useCallback(async (): Promise<void> => {
    setIsResending(true);
    setError(null);
    setResent(false);

    try {
      await authApi.resendVerification();
      setResent(true);
      logger.info('Verification email resent');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resend verification email';
      setError(errorMessage);
      logger.error('Resend verification failed', { error: errorMessage });
      throw err;
    } finally {
      setIsResending(false);
    }
  }, []);

  return {
    emailVerified,
    needsVerification,
    resend,
    isResending,
    resent,
    error,
    dismiss,
  };
};
