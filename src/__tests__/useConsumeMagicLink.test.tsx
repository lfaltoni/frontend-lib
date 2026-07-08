import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConsumeMagicLink } from '../hooks/auth/useConsumeMagicLink';
import { useAuth } from '../hooks/auth/useAuth';
import { authApi } from '../api/auth';
import { profileApi } from '../api/profile';

// useAuth revalidates via profileApi.getProfile on mount; stub it to avoid network.
vi.mock('../api/profile', () => ({
  profileApi: {
    getProfile: vi.fn(),
  },
}));

vi.mock('../api/auth', () => ({
  authApi: {
    consumeMagicLink: vi.fn(),
    logout: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const consumeMagicLinkMock = authApi.consumeMagicLink as unknown as ReturnType<typeof vi.fn>;
const getProfileMock = profileApi.getProfile as unknown as ReturnType<typeof vi.fn>;

// Co-mount consume + a plain useAuth to prove the shared store flips.
function useConsumeAndAuth() {
  return { consume: useConsumeMagicLink(), auth: useAuth() };
}

describe('useConsumeMagicLink shared-store update', () => {
  beforeEach(() => {
    localStorage.clear();
    consumeMagicLinkMock.mockReset();
    getProfileMock.mockReset();
    // No stored session -> mount revalidation deauths and settles as resolved.
    getProfileMock.mockRejectedValue(new Error('HTTP error! status: 401'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: consume resolves the user, sets consumed/user, and flips a co-mounted useAuth', async () => {
    const user = { user_id: 'u1', email: 'a@b.c' };
    consumeMagicLinkMock.mockResolvedValueOnce(user);

    const { result } = renderHook(() => useConsumeAndAuth());

    // Start unauthenticated.
    await waitFor(() => expect(result.current.auth.authResolved).toBe(true));
    expect(result.current.auth.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.consume.consume('opaque-token');
    });

    expect(result.current.consume.consumed).toBe(true);
    expect(result.current.consume.user).toEqual(user);
    expect(result.current.consume.error).toBeNull();

    // The shared authStore flipped: the co-mounted useAuth is now authenticated.
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.user?.user_id).toBe('u1');
  });

  it('failure (expired token): sets error, leaves consumed false, and does not authenticate', async () => {
    consumeMagicLinkMock.mockRejectedValueOnce(new Error('This link has expired'));

    const { result } = renderHook(() => useConsumeAndAuth());

    await waitFor(() => expect(result.current.auth.authResolved).toBe(true));

    await act(async () => {
      await expect(result.current.consume.consume('expired-token')).rejects.toThrow('This link has expired');
    });

    expect(result.current.consume.error).toBe('This link has expired');
    expect(result.current.consume.consumed).toBe(false);
    expect(result.current.consume.user).toBeNull();
    // The existing (unauthenticated) session is untouched — not authed, not corrupted.
    expect(result.current.auth.isAuthenticated).toBe(false);
  });
});
