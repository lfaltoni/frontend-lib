import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { foundationRequest } from '../api/foundation-client';
import { storage } from '../utils/storage';

// Mock the toast surface so tests don't depend on toast wiring.
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

describe('foundationRequest 401 auto-logout', () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    storage.setToken('stale-token');
    storage.setUser({ user_id: 'u1', email: 'a@b.c' } as any);

    globalThis.fetch = vi.fn() as any;

    // Stub window.location.assign so we can observe redirects.
    assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignSpy, href: 'http://localhost/dashboard' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) 401 on a NON-auth endpoint clears storage but does NOT redirect', async () => {
    mockFetchOnce(401, { error: 'disabled' });

    await expect(foundationRequest('/api/users/profile')).rejects.toThrow();

    // De-auth: storage is cleared so no stale logged-in shell renders.
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    // Redirect is now owned by useRequireAuth, NOT this interceptor. The
    // interceptor must not navigate (would cause a full-page reload fighting
    // the guard's client-side router.push).
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('(b) 401 on /api/auth/login does NOT clear storage and does NOT redirect', async () => {
    mockFetchOnce(401, { error: 'bad credentials' });

    await expect(
      foundationRequest('/api/auth/login', { method: 'POST', body: '{}' })
    ).rejects.toThrow();

    // Footgun guard: a wrong-password typo must not wipe the session or loop-redirect.
    expect(localStorage.getItem('auth_token')).toBe('stale-token');
    expect(localStorage.getItem('user')).not.toBeNull();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('(c) a 2xx response leaves storage intact and does not redirect', async () => {
    mockFetchOnce(200, { success: true, user: { user_id: 'u1' } });

    await foundationRequest('/api/users/profile');

    expect(localStorage.getItem('auth_token')).toBe('stale-token');
    expect(localStorage.getItem('user')).not.toBeNull();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
