import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRequireAuth } from '../hooks/auth/useRequireAuth';
import { useAuth } from '../hooks/auth/useAuth';

// Mock useAuth so we can drive the exact (authResolved, isAuthenticated) state
// without going through localStorage / network revalidation.
vi.mock('../hooks/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

const useAuthMock = useAuth as unknown as ReturnType<typeof vi.fn>;

function setAuthState(state: { isAuthenticated: boolean; authResolved: boolean }) {
  useAuthMock.mockReturnValue({
    user: state.isAuthenticated ? ({ user_id: 'u1' } as any) : null,
    isLoading: false,
    error: null,
    isAuthenticated: state.isAuthenticated,
    authResolved: state.authResolved,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearError: vi.fn(),
  });
}

describe('useRequireAuth', () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthMock.mockReset();
    assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignSpy, href: 'http://localhost/account' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(r1) still-loading (not resolved) does NOT call onUnauthenticated', async () => {
    setAuthState({ isAuthenticated: false, authResolved: false });
    const onUnauthenticated = vi.fn();

    const { result } = renderHook(() => useRequireAuth({ onUnauthenticated }));

    // Premature-redirect guard: during the optimistic/revalidating phase we must
    // report loading and NOT fire.
    expect(result.current.isLoading).toBe(true);
    // give effects a chance to (incorrectly) fire
    await Promise.resolve();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('(r2) resolved + authenticated does NOT call onUnauthenticated', async () => {
    setAuthState({ isAuthenticated: true, authResolved: true });
    const onUnauthenticated = vi.fn();

    const { result } = renderHook(() => useRequireAuth({ onUnauthenticated }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    await Promise.resolve();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('(r3) resolved + unauthenticated calls onUnauthenticated', async () => {
    setAuthState({ isAuthenticated: false, authResolved: true });
    const onUnauthenticated = vi.fn();

    renderHook(() => useRequireAuth({ onUnauthenticated }));

    await waitFor(() => {
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('(r4) default (no opts) redirects via window.location.assign to loginPath', async () => {
    setAuthState({ isAuthenticated: false, authResolved: true });

    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledTimes(1);
    });
    expect(assignSpy).toHaveBeenCalledWith('/login');
  });

  it('(r5) fires at most once across re-renders', async () => {
    setAuthState({ isAuthenticated: false, authResolved: true });
    const onUnauthenticated = vi.fn();

    const { rerender } = renderHook(() => useRequireAuth({ onUnauthenticated }));

    await waitFor(() => {
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });

    // Re-render while still unauthenticated; the once-only ref guard must prevent
    // a second navigation.
    rerender();
    rerender();
    await Promise.resolve();
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('(r6) does not fire if it resolves to unauthenticated AFTER an initial loading render', async () => {
    // Simulate the real lifecycle: first render not-resolved, then resolves to
    // unauthenticated. Must fire exactly once, only after resolve.
    setAuthState({ isAuthenticated: false, authResolved: false });
    const onUnauthenticated = vi.fn();

    const { rerender } = renderHook(() => useRequireAuth({ onUnauthenticated }));
    expect(onUnauthenticated).not.toHaveBeenCalled();

    setAuthState({ isAuthenticated: false, authResolved: true });
    rerender();

    await waitFor(() => {
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });
  });
});
