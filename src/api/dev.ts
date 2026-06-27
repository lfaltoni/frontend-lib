/**
 * Dev quick-login API module — init-time configuration pattern.
 *
 * This is product-AGNOSTIC: it contains no app models, no hardcoded host, and
 * no product-specific strings. The consumer injects an HTTP request function
 * and a URL prefix once at startup (mirroring initBillingApi), and implements +
 * gates the endpoints server-side.
 *
 * Contract (consumer-provided):
 *   GET  <prefix>accounts     -> { accounts: { name, email, role }[] }
 *   POST <prefix>quick-login  -> { ok, redirect?, error? }   (body: { email })
 *
 * Usage:
 *   import { initDevApi, devApi } from 'fsdk-ts';
 *   // At startup (dev only — the consumer owns the dev/prod gate):
 *   initDevApi(apiRequest, '/__dev/');
 *   // In components/hooks:
 *   const { accounts } = await devApi.getAccounts();
 */

import { getLogger } from '../utils/logging';
import type {
  DevAccountsResponse,
  DevQuickLoginResponse,
  DevApi,
} from '../types/dev';

const logger = getLogger('dev-api');

// Module-level state — configured once by the consumer.
type RequestFn = <T>(url: string, opts?: RequestInit) => Promise<T>;
let _requestFn: RequestFn | null = null;
let _urlPrefix = '/dev/';

function normalizePrefix(prefix: string): string {
  return prefix.endsWith('/') ? prefix : prefix + '/';
}

/**
 * Initialize the dev API module. Call once at app startup, in dev mode only.
 *
 * @param requestFn - The consumer's HTTP request function (e.g. apiRequest)
 * @param urlPrefix - URL prefix for the dev endpoints (e.g. '/__dev/')
 */
export function initDevApi(requestFn: RequestFn, urlPrefix = '/dev/'): void {
  _requestFn = requestFn;
  _urlPrefix = normalizePrefix(urlPrefix);
  logger.info('Dev API initialized', { urlPrefix: _urlPrefix });
}

function getRequestFn(): RequestFn {
  if (!_requestFn) {
    throw new Error(
      'Dev API not initialized. Call initDevApi(requestFn, urlPrefix) at app startup.'
    );
  }
  return _requestFn;
}

/** Build a DevApi bound to a given request function + prefix. */
function makeDevApi(requestFn: RequestFn, urlPrefix: string): DevApi {
  const prefix = normalizePrefix(urlPrefix);
  return {
    getAccounts: async (): Promise<DevAccountsResponse> => {
      logger.info('Fetching dev accounts');
      try {
        const response = await requestFn<DevAccountsResponse>(`${prefix}accounts`);
        logger.info('Dev accounts fetched', { count: response.accounts?.length ?? 0 });
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch dev accounts', { error: errorMessage });
        throw error;
      }
    },

    quickLogin: async (email: string): Promise<DevQuickLoginResponse> => {
      logger.info('Quick login requested');
      try {
        const response = await requestFn<DevQuickLoginResponse>(`${prefix}quick-login`, {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        logger.info('Quick login responded', { ok: response.ok });
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Quick login failed', { error: errorMessage });
        throw error;
      }
    },
  };
}

/** Module-level dev API — uses the configured request function + prefix. */
export const devApi: DevApi = {
  getAccounts: () => makeDevApi(getRequestFn(), _urlPrefix).getAccounts(),
  quickLogin: (email: string) => makeDevApi(getRequestFn(), _urlPrefix).quickLogin(email),
};

/**
 * Factory for consumers who prefer an explicit instance over module-level state.
 *
 * Usage:
 *   const myDevApi = createDevApi(apiRequest, '/__dev/');
 */
export function createDevApi(requestFn: RequestFn, urlPrefix = '/dev/'): DevApi {
  return makeDevApi(requestFn, urlPrefix);
}
