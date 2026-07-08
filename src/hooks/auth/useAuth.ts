import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { storage } from '../../utils/storage';
import { authApi } from '../../api/auth';
import { profileApi } from '../../api/profile';
import { authStore } from '../../api/auth-store';
import type { User } from '../../types/auth';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useAuth');

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  // True once the backend revalidation has settled (success, failure, or "no
  // local session"). Before this is true, `user` is only the optimistic value
  // seeded synchronously from localStorage and must NOT be trusted by auth
  // guards to mean "definitively unauthenticated". See useRequireAuth.
  authResolved: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Module-level revalidation: dedup + focus/visibility wiring.
//
// All useAuth instances share the singleton authStore, so revalidation is a
// process-wide concern, not a per-instance one. We keep a single in-flight
// promise so that N mounted useAuth instances trigger at most ONE getProfile.
// ---------------------------------------------------------------------------

let revalidatePromise: Promise<void> | null = null;
let visibilityListenersInstalled = false;

function toUser(fresh: User): User {
  return {
    user_id: fresh.user_id,
    email: fresh.email,
    first_name: fresh.first_name,
    last_name: fresh.last_name,
    registration_order: fresh.registration_order,
    platform_role: fresh.platform_role,
    // Must be copied here or it silently disappears on the first background
    // revalidation (this whitelist-copy runs on every revalidate + refreshUser).
    email_verified: fresh.email_verified,
  };
}

/**
 * Revalidate the stored session against the backend exactly once at a time.
 * Concurrent callers share the same in-flight promise.
 *
 * - No usable local session -> deauth (resolves the store as unauthenticated).
 * - getProfile 200 -> setUser(fresh) + markResolved.
 * - getProfile 401 -> the HTTP client already called authStore.deauth(); we
 *   just markResolved (deauth already cleared the user).
 */
function revalidate(): Promise<void> {
  if (revalidatePromise) return revalidatePromise;

  revalidatePromise = (async () => {
    const storedUser = storage.getUser();
    if (!storedUser || !storage.hasValidSession()) {
      authStore.deauth();
      logger.info('No valid session found');
      return;
    }

    try {
      const { user: freshUser } = await profileApi.getProfile();
      authStore.setUser(toUser(freshUser));
      authStore.markResolved();
      logger.info('User session revalidated', { userId: freshUser.user_id });
    } catch (error) {
      // 401 path: the foundation client already called authStore.deauth().
      // Any other failure: just settle as resolved without forcibly logging out.
      authStore.markResolved();
      const errorMessage = error instanceof Error ? error.message : 'Session validation failed';
      logger.info('Session revalidation failed', { error: errorMessage });
    }
  })().finally(() => {
    revalidatePromise = null;
  });

  return revalidatePromise;
}

function installVisibilityListeners(): void {
  if (visibilityListenersInstalled || typeof window === 'undefined') return;
  visibilityListenersInstalled = true;

  const onFocus = () => {
    void revalidate();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void revalidate();
  };

  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
}

/**
 * Hook for managing authentication state.
 *
 * Thin reactive wrapper over the singleton `authStore` via useSyncExternalStore.
 * Every call site observes the SAME state, so components can no longer disagree
 * about whether the user is authenticated. login/logout/refresh mutate the
 * shared store; HTTP-client 401s deauth the shared store.
 */
export const useAuth = (): UseAuthReturn => {
  const { user, authResolved } = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot
  );

  // isLoading is local action-feedback state for login/logout/refresh, matching
  // the prior public semantics (it is NOT the auth-resolution signal — that is
  // `authResolved`).
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback((userData: User) => {
    authStore.setUser(userData);
    storage.setUser(userData);
    authStore.markResolved();
    logger.info('User logged in', { userId: userData.user_id });
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      logger.info('Starting logout process');
      await authApi.logout();
      authStore.deauth();
      logger.info('User logged out successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      setError(errorMessage);
      logger.error('Logout error', { error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      logger.info('Refreshing user data');
      const { user: freshUser, profile_data } = await profileApi.getProfile();

      if (freshUser) {
        const updatedUser = toUser(freshUser);
        authStore.setUser(updatedUser);
        storage.setUser(updatedUser);
        authStore.markResolved();
        logger.info('User data refreshed', { userId: updatedUser.user_id, profile_data });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh user';
      setError(errorMessage);
      logger.error('Refresh user error', { error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mount-time revalidation (deduped across all instances) + focus/visibility
  // listeners (installed once, client-only). A disabled user with a stale
  // session yields 401 -> the foundation client deauths the shared store, so
  // every mounted useAuth flips to unauthenticated together.
  useEffect(() => {
    void revalidate();
    installVisibilityListeners();
  }, []);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    authResolved,
    login,
    logout,
    refreshUser,
    clearError,
  };
};
