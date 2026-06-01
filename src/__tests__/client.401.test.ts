import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiRequest } from '../api/client';
import { authStore } from '../api/auth-store';
import { storage } from '../utils/storage';

vi.mock('../api/response-toast', () => ({
  surfaceToast: vi.fn(),
}));

function mockFetchOnce(status: number, body: unknown) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('apiRequest (:5000) 401 -> authStore.deauth', () => {
  beforeEach(() => {
    localStorage.clear();
    storage.setToken('stale-token');
    storage.setUser({ user_id: 'u1', email: 'a@b.c' } as any);
    authStore.setUser({ user_id: 'u1', email: 'a@b.c' } as any);
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(b) 401 on a NON-auth endpoint deauths the shared store + clears storage', async () => {
    expect(authStore.getSnapshot().user).not.toBeNull();
    mockFetchOnce(401, { error: 'unauthorized' });

    await expect(apiRequest('/api/v1/bookings')).rejects.toThrow();

    // Shared store de-authed -> user null globally.
    expect(authStore.getSnapshot().user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('(c) 401 on /api/auth/* does NOT deauth (footgun guard)', async () => {
    mockFetchOnce(401, { error: 'bad credentials' });

    await expect(
      apiRequest('/api/auth/login', { method: 'POST', body: '{}' })
    ).rejects.toThrow();

    // Wrong-password typo must not wipe an existing session.
    expect(authStore.getSnapshot().user).not.toBeNull();
    expect(localStorage.getItem('auth_token')).toBe('stale-token');
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  it('a non-401 error (422) does NOT deauth', async () => {
    mockFetchOnce(422, { errors: { json: { email: ['required'] } } });

    await expect(apiRequest('/api/v1/bookings', { method: 'POST', body: '{}' })).rejects.toThrow();

    expect(authStore.getSnapshot().user).not.toBeNull();
  });
});
