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

// NOTE: this lives in its own file so the module-level revalidation dedup
// promise in useAuth starts fresh (vitest isolates modules per file).
describe('useAuth mount revalidation: dedup + optimistic safety', () => {
  beforeEach(() => {
    localStorage.clear();
    getProfileMock.mockReset();
    storage.setToken('good');
    storage.setUser(VALID_USER as any);
    authStore.setUser(VALID_USER as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(d) revalidation is deduped: ONE getProfile for N mounted consumers', async () => {
    let resolveProfile!: (v: any) => void;
    getProfileMock.mockImplementation(
      () => new Promise((res) => { resolveProfile = res; })
    );

    // Mount three consumers "simultaneously".
    renderHook(() => useAuth());
    renderHook(() => useAuth());
    renderHook(() => useAuth());

    await waitFor(() => {
      expect(getProfileMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveProfile({ user: VALID_USER, profile_data: {}, slug: null });
    });

    // Still exactly one despite three consumers.
    expect(getProfileMock).toHaveBeenCalledTimes(1);
  });

  it('(e) valid user is NOT kicked during the optimistic phase', async () => {
    getProfileMock.mockResolvedValueOnce({ user: VALID_USER, profile_data: {}, slug: null });

    const { result } = renderHook(() => useAuth());

    // Optimistic: authenticated immediately, before revalidation settles.
    expect(result.current.isAuthenticated).toBe(true);

    await waitFor(() => {
      expect(result.current.authResolved).toBe(true);
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.user_id).toBe('u1');
  });
});
