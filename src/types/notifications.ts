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
}

export interface MarkAllReadRequest {
  category?: string;
}

export interface SetPreferenceRequest {
  in_app_enabled: boolean;
}

export interface BulkActionResponse {
  success: boolean;
  updated_count?: number;
  deleted_count?: number;
}
