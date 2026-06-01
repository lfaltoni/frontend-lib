import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { envConfig } from '../../utils/env';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useRequireAuth');

export interface UseRequireAuthOptions {
  /**
   * Called when auth has RESOLVED to unauthenticated. If omitted, defaults to a
   * full-page redirect to envConfig.loginPath. Provide this to use client-side
   * navigation (e.g. Next.js router.push) instead.
   */
  onUnauthenticated?: () => void;
}

export interface UseRequireAuthReturn {
  isAuthenticated: boolean;
  /**
   * True while auth state is still being determined (optimistic seed +
   * in-flight backend revalidation). Consumers should render a loader and NOT
   * render protected content while this is true.
   */
  isLoading: boolean;
}

/**
 * Route-level auth guard hook for protected pages.
 *
 * Wraps useAuth() and triggers a single redirect (or a custom callback) once
 * authentication has RESOLVED to unauthenticated.
 *
 * Optimistic-phase safety:
 *   useAuth seeds `user` synchronously from localStorage for first paint, then
 *   revalidates against the backend on mount. During that window `user` may be
 *   non-null but unverified, OR null-but-not-yet-confirmed. We therefore gate the
 *   redirect on useAuth's `authResolved` signal, which only flips true after the
 *   mount revalidation settles. We never act on the optimistic value, so a valid
 *   user is never kicked on first render, and a not-yet-resolved user is treated
 *   as "loading", not "unauthenticated".
 *
 * Once-only:
 *   A ref guard ensures onUnauthenticated/redirect fires at most once even if the
 *   component re-renders while still unauthenticated, preventing repeated
 *   navigation.
 */
export const useRequireAuth = (
  opts?: UseRequireAuthOptions
): UseRequireAuthReturn => {
  const { isAuthenticated, authResolved } = useAuth();
  const firedRef = useRef(false);

  // While revalidation has not settled, we are "loading" regardless of the
  // optimistic value.
  const isLoading = !authResolved;

  useEffect(() => {
    // Only act once auth has definitively resolved to unauthenticated.
    if (!authResolved || isAuthenticated) return;
    if (firedRef.current) return;
    firedRef.current = true;

    logger.info('Unauthenticated on protected route; redirecting');
    if (opts?.onUnauthenticated) {
      opts.onUnauthenticated();
    } else if (typeof window !== 'undefined') {
      window.location.assign(envConfig.loginPath);
    }
  }, [authResolved, isAuthenticated, opts]);

  return { isAuthenticated, isLoading };
};
