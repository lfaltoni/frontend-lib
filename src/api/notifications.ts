// Notifications API — framework-agnostic, pure TypeScript async functions
// No React imports. Any JS/TS consumer can call these directly.

import type {
  Notification,
  NotificationListResponse,
  NotificationListParams,
  NotificationUnreadCountResponse,
  NotificationPreference,
  NotificationPreferenceList,
  MarkAllReadRequest,
  SetPreferenceRequest,
  BulkActionResponse,
} from '../types/notifications';
import { getLogger } from '../utils/logging';
import { foundationRequest } from './foundation-client';

const logger = getLogger('notifications-api');

export const notificationsApi = {
  /**
   * List notifications for the current user. Auth required.
   * Supports pagination, category filter, and unread-only filter.
   */
  getNotifications: async (
    params: NotificationListParams = {},
  ): Promise<NotificationListResponse> => {
    logger.info('Fetching notifications', { ...params });

    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.per_page) query.set('per_page', String(params.per_page));
    if (params.category) query.set('category', params.category);
    if (params.unread_only) query.set('unread_only', 'true');

    const qs = query.toString();
    const url = `/api/notifications/${qs ? `?${qs}` : ''}`;

    try {
      const response = await foundationRequest<NotificationListResponse>(url);
      logger.info('Notifications fetched', { total: response.total });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch notifications', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Get unread notification count. Auth required.
   * Optional category filter.
   */
  getUnreadCount: async (category?: string): Promise<NotificationUnreadCountResponse> => {
    logger.info('Fetching unread count', { category });

    const query = new URLSearchParams();
    if (category) query.set('category', category);

    const qs = query.toString();
    const url = `/api/notifications/unread-count${qs ? `?${qs}` : ''}`;

    try {
      const response = await foundationRequest<NotificationUnreadCountResponse>(url);
      logger.info('Unread count fetched', { count: response.unread_count });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch unread count', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Get a single notification by ID. Auth required.
   */
  getNotification: async (notificationId: string): Promise<Notification> => {
    logger.info('Fetching notification', { notificationId });

    try {
      const response = await foundationRequest<Notification>(
        `/api/notifications/${encodeURIComponent(notificationId)}`,
      );
      logger.info('Notification fetched', { notificationId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch notification', { error: errorMessage, notificationId });
      throw error;
    }
  },

  /**
   * Mark a notification as read. Auth required. Idempotent.
   */
  markAsRead: async (notificationId: string): Promise<Notification> => {
    logger.info('Marking notification as read', { notificationId });

    try {
      const response = await foundationRequest<Notification>(
        `/api/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'POST' },
      );
      logger.info('Notification marked as read', { notificationId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to mark as read', { error: errorMessage, notificationId });
      throw error;
    }
  },

  /**
   * Mark all notifications as read. Auth required.
   * Optional category filter.
   */
  markAllAsRead: async (data: MarkAllReadRequest = {}): Promise<BulkActionResponse> => {
    logger.info('Marking all as read', { category: data.category });

    try {
      const response = await foundationRequest<BulkActionResponse>(
        '/api/notifications/read-all',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      logger.info('All marked as read', { updatedCount: response.updated_count });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to mark all as read', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Delete a notification. Auth required.
   */
  deleteNotification: async (notificationId: string): Promise<void> => {
    logger.info('Deleting notification', { notificationId });

    try {
      await foundationRequest<BulkActionResponse>(
        `/api/notifications/${encodeURIComponent(notificationId)}`,
        { method: 'DELETE' },
      );
      logger.info('Notification deleted', { notificationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete notification', { error: errorMessage, notificationId });
      throw error;
    }
  },

  /**
   * Delete all read notifications. Auth required.
   */
  deleteAllRead: async (): Promise<BulkActionResponse> => {
    logger.info('Deleting all read notifications');

    try {
      const response = await foundationRequest<BulkActionResponse>(
        '/api/notifications/read',
        { method: 'DELETE' },
      );
      logger.info('Read notifications deleted', { deletedCount: response.deleted_count });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete read notifications', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Get notification preferences. Auth required.
   */
  getPreferences: async (): Promise<NotificationPreferenceList> => {
    logger.info('Fetching notification preferences');

    try {
      const response = await foundationRequest<NotificationPreferenceList>(
        '/api/notifications/preferences',
      );
      logger.info('Preferences fetched', { count: response.preferences.length });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch preferences', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Set notification preference for a category. Auth required.
   */
  setPreference: async (
    category: string,
    data: SetPreferenceRequest,
  ): Promise<NotificationPreference> => {
    logger.info('Setting preference', { category, ...data });

    try {
      const response = await foundationRequest<NotificationPreference>(
        `/api/notifications/preferences/${encodeURIComponent(category)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      );
      logger.info('Preference set', { category, inAppEnabled: response.in_app_enabled });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to set preference', { error: errorMessage, category });
      throw error;
    }
  },
};
