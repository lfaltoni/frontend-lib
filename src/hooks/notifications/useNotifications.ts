import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi } from '../../api/notifications';
import type {
  Notification,
  NotificationPreference,
  NotificationPreferenceList,
} from '../../types/notifications';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useNotifications');

// ============================================================================
// useNotifications — paginated notification list with actions
// ============================================================================

export interface UseNotificationsReturn {
  notifications: Notification[];
  total: number;
  page: number;
  hasNext: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  setPage: (page: number) => void;
  refetch: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAsUnread: (notificationId: string) => Promise<void>;
  markAllAsRead: (category?: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;
}

export const useNotifications = (perPage = 20): UseNotificationsReturn => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await notificationsApi.getNotifications({ page, per_page: perPage });
      setNotifications(res.notifications);
      setTotal(res.total);
      setHasNext(res.has_next);
      logger.info('Notifications loaded', { total: res.total, page });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load notifications';
      setError(msg);
      logger.error('Notifications fetch failed', { error: msg });
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string): Promise<void> => {
    try {
      const updated = await notificationsApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notificationId ? updated : n)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark as read';
      setError(msg);
    }
  }, []);

  const markAsUnread = useCallback(async (notificationId: string): Promise<void> => {
    try {
      const updated = await notificationsApi.markAsUnread(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notificationId ? updated : n)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark as unread';
      setError(msg);
    }
  }, []);

  const markAllAsRead = useCallback(async (category?: string): Promise<void> => {
    try {
      await notificationsApi.markAllAsRead({ category });
      await fetchNotifications();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark all as read';
      setError(msg);
    }
  }, [fetchNotifications]);

  const deleteNotification = useCallback(async (notificationId: string): Promise<void> => {
    try {
      await notificationsApi.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n.notification_id !== notificationId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete notification';
      setError(msg);
    }
  }, []);

  const deleteAllRead = useCallback(async (): Promise<void> => {
    try {
      await notificationsApi.deleteAllRead();
      await fetchNotifications();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete read notifications';
      setError(msg);
    }
  }, [fetchNotifications]);

  return {
    notifications,
    total,
    page,
    hasNext,
    isLoading,
    error,
    clearError,
    setPage,
    refetch: fetchNotifications,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    deleteAllRead,
  };
};

// ============================================================================
// useNotificationCount — global unread badge with polling
// ============================================================================

export interface UseNotificationCountReturn {
  unreadCount: number;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export const useNotificationCount = (pollIntervalMs = 30000): UseNotificationCountReturn => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      setUnreadCount(res.unread_count);
    } catch (err) {
      logger.error('Failed to fetch unread count', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();

    if (pollIntervalMs > 0) {
      intervalRef.current = setInterval(fetchCount, pollIntervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchCount, pollIntervalMs]);

  return { unreadCount, isLoading, refetch: fetchCount };
};

// ============================================================================
// useNotificationPreferences — preference management
// ============================================================================

export interface UseNotificationPreferencesReturn {
  preferences: NotificationPreference[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  setPreference: (category: string, inAppEnabled: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

export const useNotificationPreferences = (): UseNotificationPreferencesReturn => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchPreferences = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await notificationsApi.getPreferences();
      setPreferences(res.preferences);
      logger.info('Preferences loaded', { count: res.preferences.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load preferences';
      setError(msg);
      logger.error('Preferences fetch failed', { error: msg });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const setPreference = useCallback(async (category: string, inAppEnabled: boolean): Promise<void> => {
    setError(null);
    try {
      const updated = await notificationsApi.setPreference(category, { in_app_enabled: inAppEnabled });
      setPreferences((prev) =>
        prev.map((p) => (p.category === category ? updated : p)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update preference';
      setError(msg);
      throw err;
    }
  }, []);

  return {
    preferences,
    isLoading,
    error,
    clearError,
    setPreference,
    refetch: fetchPreferences,
  };
};
