import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMagicLink } from '../hooks/auth/useMagicLink';
import { authApi } from '../api/auth';

vi.mock('../api/auth', () => ({
  authApi: {
    requestMagicLink: vi.fn(),
  },
}));

const requestMagicLinkMock = authApi.requestMagicLink as unknown as ReturnType<typeof vi.fn>;

describe('useMagicLink request state machine', () => {
  beforeEach(() => {
    requestMagicLinkMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: toggles isSending around request and sets sent', async () => {
    let resolveRequest: (v: unknown) => void = () => {};
    requestMagicLinkMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { result } = renderHook(() => useMagicLink());
    expect(result.current.isSending).toBe(false);
    expect(result.current.sent).toBe(false);

    let requestPromise!: Promise<void>;
    act(() => {
      requestPromise = result.current.request('user@example.com');
    });

    // In-flight
    await waitFor(() => expect(result.current.isSending).toBe(true));
    expect(result.current.sent).toBe(false);

    await act(async () => {
      resolveRequest({ success: true, message: 'sent' });
      await requestPromise;
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.sent).toBe(true);
    expect(result.current.error).toBeNull();
    expect(requestMagicLinkMock).toHaveBeenCalledWith('user@example.com');
  });

  it('failure: sets error from the thrown message, keeps sent false, and rejects', async () => {
    requestMagicLinkMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useMagicLink());

    await act(async () => {
      await expect(result.current.request('user@example.com')).rejects.toThrow('network down');
    });

    expect(result.current.error).toBe('network down');
    expect(result.current.sent).toBe(false);
    expect(result.current.isSending).toBe(false);
  });

  it('reset() clears sent and error', async () => {
    requestMagicLinkMock.mockResolvedValueOnce({ success: true, message: 'sent' });

    const { result } = renderHook(() => useMagicLink());

    await act(async () => {
      await result.current.request('user@example.com');
    });
    expect(result.current.sent).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.sent).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
