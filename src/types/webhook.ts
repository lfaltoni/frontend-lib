// Webhook types — matches foundation-sdk webhooks API response shapes

export interface WebhookEndpoint {
  endpointId: string;
  url: string;
  description: string | null;
  secret: string; // Only present on create/rotate responses
  isActive: boolean;
  eventTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  deliveryId: string;
  eventId: string;
  endpointId: string;
  status: 'pending' | 'success' | 'failed' | 'exhausted';
  responseStatus: number | null;
  responseBody: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EndpointListResponse {
  success: boolean;
  endpoints: WebhookEndpoint[];
  total: number;
  page: number;
  perPage: number;
  hasNext: boolean;
}

export interface DeliveryListResponse {
  success: boolean;
  deliveries: WebhookDelivery[];
  total: number;
  page: number;
  perPage: number;
  hasNext: boolean;
}

export interface CreateEndpointRequest {
  url: string;
  eventTypes: string[];
  description?: string;
}

export interface UpdateEndpointRequest {
  url?: string;
  eventTypes?: string[];
  description?: string | null;
  isActive?: boolean;
}

export interface DeliveryQueryParams {
  status?: 'pending' | 'success' | 'failed' | 'exhausted';
  page?: number;
  perPage?: number;
}
