import { useState, useEffect, useCallback } from 'react';
import { sessionsApi } from '../../api/sessions';
import type { Session, RevokeAllRequest } from '../../types/session';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useSessions');

interface UseSessionsReturn {
  // State
  sessions: Session[];
  isLoading: boolean;
  error: string | null;

  // Actions
  clearError: () => void;
  refresh: () => Promise<void>;
  revoke: (sid: string) => Promise<void>;
  revokeAll: (req?: RevokeAllRequest) => Promise<void>;
}

/**
 * Hook for listing and managing the current user's active sessions/devices.
 * Auto-fetches on mount; refetches after revoke / revokeAll.
 */
export const useSessions = (): UseSessionsReturn => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await sessionsApi.listSessions();
      setSessions(res.sessions);
      logger.info('Sessions loaded', { count: res.sessions.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(msg);
      logger.error('Sessions fetch failed', { error: msg });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const revoke = useCallback(async (sid: string): Promise<void> => {
    setError(null);
    try {
      await sessionsApi.revokeSession(sid);
      await refresh();
      logger.info('Session revoked', { sid });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke session';
      setError(msg);
      logger.error('Session revoke failed', { error: msg, sid });
      throw err;
    }
  }, [refresh]);

  const revokeAll = useCallback(async (req: RevokeAllRequest = {}): Promise<void> => {
    setError(null);
    try {
      await sessionsApi.revokeAllSessions(req);
      await refresh();
      logger.info('All sessions revoked', { include_current: req.include_current ?? false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke sessions';
      setError(msg);
      logger.error('Revoke-all failed', { error: msg });
      throw err;
    }
  }, [refresh]);

  return {
    sessions,
    isLoading,
    error,
    clearError,
    refresh,
    revoke,
    revokeAll,
  };
};
