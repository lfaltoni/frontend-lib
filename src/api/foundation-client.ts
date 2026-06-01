import { getLogger } from '../utils/logging';
import { envConfig } from '../utils/env';
import { storage } from '../utils/storage';
import { authStore } from './auth-store';
import { surfaceToast } from './response-toast';

const logger = getLogger('foundation-client');

export const FOUNDATION_URL = envConfig.foundationUrl;

/**
 * Make a request to the Foundation SDK server (auth, profiles, media).
 *
 * This is separate from `apiRequest` (Bookease-Pro) because the Foundation
 * server does NOT use Flask-WTF CSRF — it has its own session management
 * via Flask-Login.
 */
export async function foundationRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${FOUNDATION_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const startTime = Date.now();

  logger.logApiRequest(method, url, options.body);

  try {
    const token = storage.getToken();
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...(options.headers as Record<string, string>),
      },
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    logger.logApiResponse(response.status, data, duration);

    if (!response.ok) {
      // Global de-auth on 401 (disabled/invalid session). The backend now
      // re-checks `active` per request, so a disabled user's JWT yields 401 on
      // any protected endpoint. We CLEAR THE STALE SESSION ONLY here.
      //
      // Redirect is intentionally NOT done in this interceptor: useRequireAuth
      // (the route-level guard) owns navigation. Having both would cause double
      // navigation — window.location.assign forces a full-page reload that fights
      // the client-side router.push the guard issues.
      //
      // Discriminator: skip the auth endpoints (path starts with /api/auth/).
      // Those legitimately 401 on bad credentials or a disabled re-login attempt;
      // blanket-handling them would wipe state on a wrong-password typo.
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        // Funnel into the single reactive auth store: it clears the stale
        // session (user + JWT) AND notifies every subscribed useAuth instance so
        // the whole app de-auths consistently.
        authStore.deauth();
      }

      surfaceToast(data);
      throw new Error(data.message || data.error || `HTTP error! status: ${response.status}`);
    }

    surfaceToast(data);
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Foundation API request failed', { error: errorMessage, duration });
    throw error;
  }
}
