import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../hooks/auth/useAuth';
import { storage } from '../utils/storage';
import { profileApi } from '../api/profile';

vi.mock('../api/profile', () => ({
  profileApi: {
    getProfile: vi.fn(),
  },
}));

// authApi.logout is only used by logout(); stub to avoid network.
vi.mock('../api/auth', () => ({
  authApi: { logout: vi.fn().mockResolvedValue({ success: true }) },
}));

const getProfileMock = profileApi.getProfile as unknown as ReturnType<typeof vi.fn>;

describe('useAuth mount revalidation', () => {
  beforeEach(() => {
    localStorage.clear();
    getProfileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(d1) disabled user (profile 401) is logged out on mount', async () => {
    storage.setToken('stale');
    storage.setUser({ user_id: 'u1', email: 'a@b.c' } as any);
    getProfileMock.mockRejectedValueOnce(new Error('HTTP error! status: 401'));

    const { result } = renderHook(() => useAuth());

    // First render is optimistically authenticated (no flicker for valid users),
    // but after revalidation fails the user must be cleared.
    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('(d2) valid user (profile 200) stays logged in on mount', async () => {
    storage.setToken('good');
    storage.setUser({ user_id: 'u1', email: 'a@b.c' } as any);
    getProfileMock.mockResolvedValueOnce({
      user: {
        user_id: 'u1',
        email: 'a@b.c',
        first_name: 'A',
        last_name: 'B',
        registration_order: 1,
        platform_role: 'user',
      },
      profile_data: {},
      slug: null,
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(getProfileMock).toHaveBeenCalledTimes(1);
    });
    // No spurious logout for a valid user.
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.user_id).toBe('u1');
    expect(result.current.isAuthenticated).toBe(true);
  });
});
