import { getLogger } from '../utils/logging';
import { envConfig } from '../utils/env';
import { storage } from '../utils/storage';
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
