import { useState, useEffect, useCallback, useRef } from 'react';
import { useGoogleLogin } from './useGoogleLogin';
import { getEnvConfig } from '../../utils/env';
import { getLogger } from '../../utils/logging';
import type { CredentialResponse, GsiButtonOptions } from '../../types/google';

const logger = getLogger('useGoogleSignIn');

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Module-level singleton so the GIS <script> is injected at most once across all
// hook instances (mirrors the visibility-listener install guard in useAuth).
let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser environment'));
  }
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null; // allow a later retry
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

interface UseGoogleSignInReturn {
  // getEnvConfig().googleClientId is set (the consumer opted into Google).
  // When false, all methods no-op.
  available: boolean;
  // GIS script loaded + initialize() called; safe to call renderButton/prompt.
  isReady: boolean;
  renderButton: (el: HTMLElement | null, options?: GsiButtonOptions) => void;
  prompt: () => void;
  // Credential-exchange (googleLogin) in flight, from useGoogleLogin.
  isLoading: boolean;
  error: string | null;
}

/**
 * Batteries-included headless Google sign-in primitive.
 *
 * Loads the Google Identity Services (GIS) script once, initializes it with the
 * configured `googleClientId`, and funnels the returned credential into the
 * existing `useGoogleLogin` → `authApi.googleLogin` path. The consumer owns the
 * button DOM node and calls `renderButton(ref)`; no product UI ships here.
 *
 * Gated on `getEnvConfig().googleClientId`: with no client id, `available` is
 * false and the consumer hides its button.
 */
export const useGoogleSignIn = (): UseGoogleSignInReturn => {
  const { googleLogin, isLoading, error: loginError } = useGoogleLogin();
  const [isReady, setIsReady] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const googleClientId = getEnvConfig().googleClientId;
  const available = !!googleClientId;

  // Keep the latest googleLogin in a ref so the GIS callback (registered once)
  // always calls the current closure without re-initializing on every render.
  const googleLoginRef = useRef(googleLogin);
  useEffect(() => {
    googleLoginRef.current = googleLogin;
  }, [googleLogin]);

  useEffect(() => {
    if (!available || typeof window === 'undefined') return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        if (cancelled) return;
        const id = window.google?.accounts?.id;
        if (!id) throw new Error('Google Identity Services unavailable after load');
        id.initialize({
          client_id: googleClientId as string,
          callback: (response: CredentialResponse) => {
            if (!response?.credential) {
              logger.error('Google credential missing from GIS callback');
              return;
            }
            void googleLoginRef.current(response.credential).catch(() => {
              // error surfaced via useGoogleLogin().error
            });
          },
        });
        setIsReady(true);
        logger.info('Google Identity Services initialized');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to initialize Google sign-in';
        setScriptError(message);
        logger.error('Google sign-in init failed', { error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [available, googleClientId]);

  const renderButton = useCallback(
    (el: HTMLElement | null, options?: GsiButtonOptions): void => {
      if (!el) return;
      const id = typeof window !== 'undefined' ? window.google?.accounts?.id : undefined;
      if (!id) {
        logger.info('renderButton called before Google Identity Services was ready');
        return;
      }
      id.renderButton(el, options);
    },
    []
  );

  const prompt = useCallback((): void => {
    const id = typeof window !== 'undefined' ? window.google?.accounts?.id : undefined;
    if (!id) {
      logger.info('prompt called before Google Identity Services was ready');
      return;
    }
    id.prompt();
  }, []);

  return {
    available,
    isReady,
    renderButton,
    prompt,
    isLoading,
    error: loginError ?? scriptError,
  };
};
