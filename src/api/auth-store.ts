import { storage } from '../utils/storage';
import { getLogger } from '../utils/logging';
import type { User } from '../types/auth';

const logger = getLogger('auth-store');

/**
 * Module-level subscribable auth store (singleton).
 *
 * This is the single reactive source of truth for auth state across the app.
 * It is exposed to React via `useSyncExternalStore` (see useAuth), NOT a React
 * Context provider, so every call site observes the same state with no provider
 * wiring.
 *
 * CRITICAL: this module MUST NOT import the HTTP clients (client.ts /
 * foundation-client.ts) or profileApi. The clients import THIS module to funnel
 * 401s into `deauth()`; importing them back would create a circular dependency.
 * The store only touches `storage`, its own state, and its subscribers. Backend
 * revalidation (getProfile) lives in the hook layer, not here.
 */

export interface AuthSnapshot {
  /** Current user, or null if unauthenticated. */
  user: User | null;
  /**
   * True once auth state has been definitively settled (backend revalidation
   * succeeded, failed, or there was no local session). Before this, `user` is
   * only the optimistic value seeded from localStorage and must NOT be trusted
   * by guards to mean "definitively unauthenticated".
   */
  authResolved: boolean;
}

type Listener = () => void;

// Stable, SSR-safe snapshot: always the same object identity so
// useSyncExternalStore's getServerSnapshot never triggers an infinite loop.
const SERVER_SNAPSHOT: AuthSnapshot = Object.freeze({
  user: null,
  authResolved: false,
});

// Synchronously seed the initial client snapshot from localStorage so the very
// first render already knows the optimistic auth state (prevents guard flicker).
function readInitialUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = storage.getUser();
    return stored?.user_id ? stored : null;
  } catch {
    return null;
  }
}

let snapshot: AuthSnapshot = Object.freeze({
  user: readInitialUser(),
  authResolved: false,
});

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: AuthSnapshot): void {
  // Only replace + notify on a real change so useSyncExternalStore stays stable.
  if (next.user === snapshot.user && next.authResolved === snapshot.authResolved) {
    return;
  }
  snapshot = Object.freeze(next);
  emit();
}

export const authStore = {
  /** Current client snapshot (stable identity until a real change). */
  getSnapshot(): AuthSnapshot {
    return snapshot;
  },

  /** SSR snapshot: constant unauthenticated/unresolved state. */
  getServerSnapshot(): AuthSnapshot {
    return SERVER_SNAPSHOT;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Authenticate / refresh the current user. Does not touch authResolved. */
  setUser(user: User | null): void {
    setSnapshot({ user, authResolved: snapshot.authResolved });
  },

  /**
   * Force a logout: clear the stored user + JWT, set user null, mark resolved,
   * and notify subscribers. Called by both HTTP clients on a 401 for protected
   * endpoints, and by the hook's logout().
   */
  deauth(): void {
    try {
      storage.clearUser();
      storage.clearToken();
    } catch {
      // storage helpers already swallow their own errors; guard defensively.
    }
    logger.info('De-authenticated (cleared session)');
    setSnapshot({ user: null, authResolved: true });
  },

  /** Mark auth state as definitively resolved (revalidation settled). */
  markResolved(): void {
    if (snapshot.authResolved) return;
    setSnapshot({ user: snapshot.user, authResolved: true });
  },
};
