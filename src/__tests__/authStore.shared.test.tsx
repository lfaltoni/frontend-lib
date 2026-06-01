import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../hooks/auth/useAuth';
import { authStore } from '../api/auth-store';
import { storage } from '../utils/storage';
import { profileApi } from '../api/profile';

vi.mock('../api/profile', () => ({
  profileApi: { getProfile: vi.fn() },
}));
vi.mock('../api/auth', () => ({
  authApi: { logout: vi.fn().mockResolvedValue({ success: true }) },
}));

const getProfileMock = profileApi.getProfile as unknown as ReturnType<typeof vi.fn>;

const VALID_USER = {
  user_id: 'u1',
  email: 'a@b.c',
  first_name: 'A',
  last_name: 'B',
  registration_order: 1,
  platform_role: 'user',
};

describe('authStore shared reactive state (singleton via useSyncExternalStore)', () => {
  beforeEach(() => {
    localStorage.clear();
    getProfileMock.mockReset();
    // Default: mount revalidation stays in-flight forever so it cannot settle
    // and clobber the explicit store mutations a test is asserting on. Tests
    // that exercise revalidation override this.
    getProfileMock.mockImplementation(() => new Promise(() => {}));
    // Reset the shared store to a clean unauthenticated/unresolved baseline.
    authStore.setUser(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) two useAuth instances share state: setUser updates BOTH', () => {
    // Give a valid stored session so the in-flight (never-resolving) mount
    // revalidation does not take the no-session deauth path, and seed the
    // shared store optimistically (as the app's initial snapshot would).
    storage.setToken('good');
    storage.setUser(VALID_USER as any);

    const a = renderHook(() => useAuth());
    const b = renderHook(() => useAuth());

    expect(a.result.current.isAuthenticated).toBe(false);
    expect(b.result.current.isAuthenticated).toBe(false);

    act(() => {
      authStore.setUser(VALID_USER as any);
    });

    // Both call sites reflect the single source of truth.
    expect(a.result.current.user?.user_id).toBe('u1');
    expect(b.result.current.user?.user_id).toBe('u1');
    expect(a.result.current.isAuthenticated).toBe(true);
    expect(b.result.current.isAuthenticated).toBe(true);

    act(() => {
      authStore.deauth();
    });

    expect(a.result.current.user).toBeNull();
    expect(b.result.current.user).toBeNull();
    expect(a.result.current.isAuthenticated).toBe(false);
    expect(b.result.current.isAuthenticated).toBe(false);
  });

  it('(b) store.deauth() drives user null globally across instances', () => {
    storage.setToken('good');
    storage.setUser(VALID_USER as any);
    act(() => authStore.setUser(VALID_USER as any));
    const a = renderHook(() => useAuth());
    const b = renderHook(() => useAuth());
    expect(a.result.current.isAuthenticated).toBe(true);

    act(() => authStore.deauth());

    expect(a.result.current.user).toBeNull();
    expect(b.result.current.user).toBeNull();
  });

  it('preserves the exact public return shape', () => {
    const { result } = renderHook(() => useAuth());
    expect(Object.keys(result.current).sort()).toEqual(
      [
        'authResolved',
        'clearError',
        'error',
        'isAuthenticated',
        'isLoading',
        'login',
        'logout',
        'refreshUser',
        'user',
      ].sort()
    );
  });
});
