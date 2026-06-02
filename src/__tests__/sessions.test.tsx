import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { sessionsApi } from '../api/sessions';
import { useSessions } from '../hooks/sessions/useSessions';
import { foundationRequest } from '../api/foundation-client';
import type { Session, SessionListResponse } from '../types/session';

// Mock the HTTP layer so tests don't touch the network.
vi.mock('../api/foundation-client', () => ({
  foundationRequest: vi.fn(),
}));

const requestMock = foundationRequest as unknown as ReturnType<typeof vi.fn>;

const sampleSession: Session = {
  sid: 's1',
  device: 'Macintosh',
  browser: 'Chrome',
  os: 'macOS',
  ip_address: '1.2.3.4',
  location: 'Dubai',
  created_at: '2026-06-01T10:00:00',
  last_seen_at: '2026-06-02T09:00:00',
  is_current: true,
};

const listResponse: SessionListResponse = {
  success: true,
  sessions: [sampleSession],
};

describe('sessionsApi', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listSessions calls GET /api/sessions/ and returns the list', async () => {
    requestMock.mockResolvedValueOnce(listResponse);

    const res = await sessionsApi.listSessions();

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/');
    expect(res.sessions).toHaveLength(1);
    expect(res.sessions[0].sid).toBe('s1');
    expect(res.sessions[0].is_current).toBe(true);
  });

  it('revokeSession calls DELETE /api/sessions/<sid> (url-encoded)', async () => {
    requestMock.mockResolvedValueOnce({ success: true, message: 'Session revoked' });

    const res = await sessionsApi.revokeSession('a/b');

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/a%2Fb', { method: 'DELETE' });
    expect(res.message).toBe('Session revoked');
  });

  it('revokeAllSessions POSTs revoke-all with include_current defaulting to false', async () => {
    requestMock.mockResolvedValueOnce({ success: true, message: 'Signed out everywhere else' });

    await sessionsApi.revokeAllSessions();

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/revoke-all', {
      method: 'POST',
      body: JSON.stringify({ include_current: false }),
    });
  });

  it('revokeAllSessions forwards include_current: true', async () => {
    requestMock.mockResolvedValueOnce({ success: true, message: 'Signed out everywhere' });

    await sessionsApi.revokeAllSessions({ include_current: true });

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/revoke-all', {
      method: 'POST',
      body: JSON.stringify({ include_current: true }),
    });
  });

  it('propagates errors from the HTTP layer', async () => {
    requestMock.mockRejectedValueOnce(new Error('HTTP error! status: 500'));
    await expect(sessionsApi.listSessions()).rejects.toThrow('500');
  });
});

describe('useSessions', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-fetches sessions on mount', async () => {
    requestMock.mockResolvedValueOnce(listResponse);

    const { result } = renderHook(() => useSessions());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error on a failed fetch and does not throw out of the hook', async () => {
    requestMock.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useSessions());

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessions).toHaveLength(0);
  });

  it('refetches after revoke', async () => {
    // initial list
    requestMock.mockResolvedValueOnce(listResponse);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // revoke response, then refresh response (empty)
    requestMock.mockResolvedValueOnce({ success: true, message: 'Session revoked' });
    requestMock.mockResolvedValueOnce({ success: true, sessions: [] });

    await act(async () => {
      await result.current.revoke('s1');
    });

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/s1', { method: 'DELETE' });
    await waitFor(() => expect(result.current.sessions).toHaveLength(0));
  });

  it('refetches after revokeAll', async () => {
    requestMock.mockResolvedValueOnce(listResponse);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    requestMock.mockResolvedValueOnce({ success: true, message: 'Signed out everywhere else' });
    requestMock.mockResolvedValueOnce({ success: true, sessions: [sampleSession] });

    await act(async () => {
      await result.current.revokeAll();
    });

    expect(requestMock).toHaveBeenCalledWith('/api/sessions/revoke-all', {
      method: 'POST',
      body: JSON.stringify({ include_current: false }),
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
  });

  it('clearError resets the error state', async () => {
    requestMock.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.error).toBe('nope'));

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
