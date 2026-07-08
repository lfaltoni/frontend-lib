import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authApi } from '../api/auth';
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

function lastFetchCall() {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls[mock.mock.calls.length - 1];
}

describe('authApi.requestMagicLink', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { email } to /api/auth/magic/request and returns the message envelope', async () => {
    mockFetchOnce(200, { success: true, message: 'If that email exists, a link was sent.' });

    const result = await authApi.requestMagicLink('user@example.com');

    const [url, init] = lastFetchCall();
    expect(String(url)).toContain('/api/auth/magic/request');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'user@example.com' });
    expect(result).toEqual({ success: true, message: 'If that email exists, a link was sent.' });
  });

  it('resolves generically for an unknown email (enumeration-safe)', async () => {
    // Backend returns the same generic success whether or not the account exists.
    mockFetchOnce(200, { success: true, message: 'If that email exists, a link was sent.' });

    await expect(authApi.requestMagicLink('nobody@nowhere.com')).resolves.toEqual({
      success: true,
      message: 'If that email exists, a link was sent.',
    });
  });
});

describe('authApi.consumeMagicLink', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { token }, returns response.user, and stores the JWT when present', async () => {
    mockFetchOnce(200, {
      success: true,
      user: { user_id: 'u1', email: 'a@b.c' },
      token: 'jwt-abc',
      is_first_login: false,
    });

    const user = await authApi.consumeMagicLink('opaque-token');

    const [url, init] = lastFetchCall();
    expect(String(url)).toContain('/api/auth/magic/consume');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: 'opaque-token' });
    expect(user).toEqual({ user_id: 'u1', email: 'a@b.c' });
    expect(storage.getToken()).toBe('jwt-abc');
  });

  it('throws the missing-user guard when response.user is absent', async () => {
    mockFetchOnce(200, { success: true });

    await expect(authApi.consumeMagicLink('opaque-token')).rejects.toThrow(/user data missing/);
  });

  it('(401 on consume) rejects but does NOT clear an existing session (/api/auth/ skip)', async () => {
    // Seed an existing logged-in session.
    storage.setToken('existing-jwt');
    storage.setUser({ user_id: 'u1', email: 'a@b.c' } as any);

    mockFetchOnce(401, { error: 'This link has expired' });

    await expect(authApi.consumeMagicLink('expired-token')).rejects.toThrow();

    // The /api/auth/ discriminator in foundation-client must skip deauth so an
    // expired/used token does not wipe the current session.
    expect(localStorage.getItem('auth_token')).toBe('existing-jwt');
    expect(localStorage.getItem('user')).not.toBeNull();
  });
});
