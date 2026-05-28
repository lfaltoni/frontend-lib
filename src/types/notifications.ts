// Notification types — matches foundation-sdk notifications API response shapes

export interface Notification {
  notification_id: string;
  user_id: string;
  category: string;
  title: string;
  body: string | null;
  action_url: string | null;
  context_type: string | null;
  context_id: string | null;
  sender_id: string | null;
  read_at: string | null;
  extra_data: Record<string, unknown> | null;
  notification_type: string | null;
  severity: string | null;
  action_required: boolean | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export interface NotificationPreference {
  preference_id: string;
  category: string;
  in_app_enabled: boolean;
  push_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceList {
  preferences: NotificationPreference[];
}

export interface NotificationListParams {
  page?: number;
  per_page?: number;
  category?: string;
  unread_only?: boolean;
  notification_type?: string;
  severity?: string;
  action_required?: boolean;
}

export interface MarkAllReadRequest {
  category?: string;
}

export interface SetPreferenceRequest {
  in_app_enabled: boolean;
  push_enabled?: boolean;
}

export interface BulkActionResponse {
  success: boolean;
  updated_count?: number;
  deleted_count?: number;
}

// ── Push notification types ────────────────────────────────────

export interface PushSubscription {
  subscription_id: string;
  user_id: string;
  endpoint: string;
  is_active: boolean;
  user_agent: string | null;
  created_at: string;
  last_used: string | null;
}

export interface PushSubscriptionListResponse {
  subscriptions: PushSubscription[];
}

export interface SubscribePushRequest {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent?: string;
}

export interface UnsubscribePushRequest {
  endpoint?: string;
  subscription_id?: string;
}

export interface VapidPublicKeyResponse {
  public_key: string;
}

export interface SetPushPreferenceRequest {
  push_enabled: boolean;
}
