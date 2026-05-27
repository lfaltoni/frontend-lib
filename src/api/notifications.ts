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
  PushSubscription,
  PushSubscriptionListResponse,
  SubscribePushRequest,
  UnsubscribePushRequest,
  VapidPublicKeyResponse,
  SetPushPreferenceRequest,
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
    if (params.notification_type) query.set('notification_type', params.notification_type);
    if (params.severity) query.set('severity', params.severity);
    if (params.action_required !== undefined) query.set('action_required', String(params.action_required));

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
  getUnreadCount: async (
    params?: string | { category?: string; notification_type?: string },
  ): Promise<NotificationUnreadCountResponse> => {
    const opts = typeof params === 'string' ? { category: params } : (params ?? {});
    logger.info('Fetching unread count', { ...opts });

    const query = new URLSearchParams();
    if (opts.category) query.set('category', opts.category);
    if (opts.notification_type) query.set('notification_type', opts.notification_type);

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
   * Mark a notification as unread. Auth required. Idempotent.
   */
  markAsUnread: async (notificationId: string): Promise<Notification> => {
    logger.info('Marking notification as unread', { notificationId });

    try {
      const response = await foundationRequest<Notification>(
        `/api/notifications/${encodeURIComponent(notificationId)}/unread`,
        { method: 'POST' },
      );
      logger.info('Notification marked as unread', { notificationId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to mark as unread', { error: errorMessage, notificationId });
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

  // ── Push notification methods ──────────────────────────────

  /**
   * Get VAPID public key for PushManager.subscribe(). No auth required.
   */
  getVapidPublicKey: async (): Promise<VapidPublicKeyResponse> => {
    logger.info('Fetching VAPID public key');

    try {
      const response = await foundationRequest<VapidPublicKeyResponse>(
        '/api/notifications/push/vapid-key',
      );
      logger.info('VAPID public key fetched');
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch VAPID public key', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Register a push subscription. Auth required.
   */
  subscribePush: async (data: SubscribePushRequest): Promise<PushSubscription> => {
    logger.info('Registering push subscription');

    try {
      const response = await foundationRequest<PushSubscription>(
        '/api/notifications/push/subscribe',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      logger.info('Push subscription registered', { subscriptionId: response.subscription_id });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to register push subscription', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Deactivate a push subscription. Auth required.
   */
  unsubscribePush: async (data: UnsubscribePushRequest): Promise<void> => {
    logger.info('Deactivating push subscription');

    try {
      await foundationRequest<void>(
        '/api/notifications/push/unsubscribe',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      logger.info('Push subscription deactivated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to deactivate push subscription', { error: errorMessage });
      throw error;
    }
  },

  /**
   * List user's push subscriptions. Auth required.
   */
  getPushSubscriptions: async (): Promise<PushSubscriptionListResponse> => {
    logger.info('Fetching push subscriptions');

    try {
      const response = await foundationRequest<PushSubscriptionListResponse>(
        '/api/notifications/push/subscriptions',
      );
      logger.info('Push subscriptions fetched', { count: response.subscriptions.length });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch push subscriptions', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Set push_enabled preference for a category. Auth required.
   */
  setPushPreference: async (
    category: string,
    data: SetPushPreferenceRequest,
  ): Promise<NotificationPreference> => {
    logger.info('Setting push preference', { category, ...data });

    try {
      const response = await foundationRequest<NotificationPreference>(
        `/api/notifications/push/preferences/${encodeURIComponent(category)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      );
      logger.info('Push preference set', { category, pushEnabled: response.push_enabled });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to set push preference', { error: errorMessage, category });
      throw error;
    }
  },
};
