// Sessions API — framework-agnostic, pure TypeScript async functions.
// No React imports. Any JS/TS consumer can call these directly.
//
// Wraps foundation-sdk's /api/sessions endpoints (JWT-authed via foundationRequest).
// Mirrors foundation-sdk/foundation/sessions/api/smorest_sessions_blueprint.py.

import type {
  SessionListResponse,
  RevokeAllRequest,
  SessionMessageResponse,
} from '../types/session';
import { getLogger } from '../utils/logging';
import { foundationRequest } from './foundation-client';

const logger = getLogger('sessions-api');

export const sessionsApi = {
  /**
   * List the current user's active sessions/devices. Marks `is_current`.
   * Auth required. GET /api/sessions/
   */
  listSessions: async (): Promise<SessionListResponse> => {
    logger.info('Listing sessions');
    try {
      const response = await foundationRequest<SessionListResponse>('/api/sessions/');
      logger.info('Sessions listed', { count: response.sessions?.length ?? 0 });
      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list sessions', { error: msg });
      throw error;
    }
  },

  /**
   * Revoke a single session (log out one device). Must belong to the current
   * user. Auth required. DELETE /api/sessions/<sid>
   */
  revokeSession: async (sid: string): Promise<SessionMessageResponse> => {
    logger.info('Revoking session', { sid });
    try {
      const response = await foundationRequest<SessionMessageResponse>(
        `/api/sessions/${encodeURIComponent(sid)}`,
        { method: 'DELETE' },
      );
      logger.info('Session revoked', { sid });
      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to revoke session', { error: msg, sid });
      throw error;
    }
  },

  /**
   * Log out everywhere. By default keeps the current device
   * (`include_current: false`); pass `{ include_current: true }` to log out the
   * current device too. Auth required. POST /api/sessions/revoke-all
   */
  revokeAllSessions: async (req: RevokeAllRequest = {}): Promise<SessionMessageResponse> => {
    logger.info('Revoking all sessions', { include_current: req.include_current ?? false });
    try {
      const response = await foundationRequest<SessionMessageResponse>(
        '/api/sessions/revoke-all',
        {
          method: 'POST',
          body: JSON.stringify({ include_current: req.include_current ?? false }),
        },
      );
      logger.info('All sessions revoked');
      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to revoke all sessions', { error: msg });
      throw error;
    }
  },
};
