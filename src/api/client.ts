import { getLogger } from '../utils/logging';
import { envConfig } from '../utils/env';
import { storage } from '../utils/storage';
import { surfaceToast } from './response-toast';

const logger = getLogger('api-client');

// ---------------------------------------------------------------------------
// Structured API error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status code */
  status: number;
  /** Machine-readable error code from the backend (e.g. 'no_availability') */
  code: string | null;
  /** Full response body — may contain extra fields like remainingSpots */
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = (data.error as string) || null;
    this.data = data;
  }
}

/**
 * Extract a human-readable message from a Flask-Smorest 422 response.
 * These look like: { errors: { json: { fieldName: ["error msg"] } } }
 */
function extractValidationMessage(data: Record<string, unknown>): string {
  const errors = data.errors as Record<string, Record<string, string[]>> | undefined;
  if (!errors?.json) return 'Invalid input';

  const fields = errors.json;
  const messages: string[] = [];
  for (const [field, fieldErrors] of Object.entries(fields)) {
    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    messages.push(`${label}: ${fieldErrors.join(', ')}`);
  }
  return messages.join('. ') || 'Invalid input';
}

export const API_BASE_URL = envConfig.apiUrl;

// ---------------------------------------------------------------------------
// CSRF token management
// ---------------------------------------------------------------------------
// The backend uses Flask-WTF CSRF protection with session cookies.
// For cross-origin SPA requests, we fetch the token from a dedicated
// endpoint and include it in the X-CSRFToken header on mutating requests.
// The token is session-bound, so we cache it in memory and only re-fetch
// if the server rejects it (e.g. after session expiry).
// ---------------------------------------------------------------------------

let _csrfToken: string | null = null;
let _csrfFetchPromise: Promise<string> | null = null;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/v1/csrf-token`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch CSRF token: ${res.status}`);
  }
  const data = await res.json();
  return data.csrfToken;
}

async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;

  // Deduplicate concurrent fetches
  if (!_csrfFetchPromise) {
    _csrfFetchPromise = fetchCsrfToken().then((token) => {
      _csrfToken = token;
      _csrfFetchPromise = null;
      return token;
    }).catch((err) => {
      _csrfFetchPromise = null;
      throw err;
    });
  }
  return _csrfFetchPromise;
}

function invalidateCsrfToken(): void {
  _csrfToken = null;
  _csrfFetchPromise = null;
}

function isCsrfError(status: number, data: Record<string, unknown>): boolean {
  return status === 400 && String(data.type || '').includes('CSRF');
}

// ---------------------------------------------------------------------------
// Core API request
// ---------------------------------------------------------------------------

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const credentials = options.credentials ?? 'include';
  const needsCsrf = MUTATING_METHODS.has(method);

  const token = storage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(options.headers as Record<string, string>),
  };

  // Attach CSRF token for mutating requests that send credentials
  if (needsCsrf && credentials === 'include') {
    headers['X-CSRFToken'] = await getCsrfToken();
  }

  const startTime = Date.now();
  const url = `${API_BASE_URL}${endpoint}`;

  logger.logApiRequest(method, url, options.body);

  const doFetch = async (): Promise<T> => {
    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials,
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    logger.logApiResponse(response.status, data, duration);

    if (!response.ok) {
      // If CSRF token was rejected, refresh and retry once
      if (needsCsrf && isCsrfError(response.status, data)) {
        invalidateCsrfToken();
        headers['X-CSRFToken'] = await getCsrfToken();

        const retryResponse = await fetch(url, {
          ...options,
          method,
          headers,
          credentials,
        });
        const retryData = await retryResponse.json();

        if (!retryResponse.ok) {
          surfaceToast(retryData);
          const msg = retryData.message || retryData.error || `HTTP error! status: ${retryResponse.status}`;
          throw new ApiError(msg, retryResponse.status, retryData);
        }
        surfaceToast(retryData);
        return retryData;
      }

      // 422: Flask-Smorest validation errors have { errors: { json: { field: [...] } } }
      const message = response.status === 422 && data.errors
        ? extractValidationMessage(data)
        : data.message || data.error || `HTTP error! status: ${response.status}`;

      surfaceToast(data);
      throw new ApiError(message, response.status, data);
    }

    surfaceToast(data);
    return data;
  };

  try {
    return await doFetch();
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('API request failed', { error: errorMessage, duration });
    throw error;
  }
}
