// Webhooks API — framework-agnostic, pure TypeScript async functions
// No React imports. Any JS/TS consumer can call these directly.

import type {
  WebhookEndpoint,
  WebhookDelivery,
  EndpointListResponse,
  DeliveryListResponse,
  CreateEndpointRequest,
  UpdateEndpointRequest,
  DeliveryQueryParams,
} from '../types/webhook';
import { getLogger } from '../utils/logging';
import { foundationRequest } from './foundation-client';

const logger = getLogger('webhooks-api');

export const webhooksApi = {
  /**
   * Create a new webhook endpoint. Auth required.
   */
  createEndpoint: async (data: CreateEndpointRequest): Promise<WebhookEndpoint> => {
    logger.info('Creating webhook endpoint', { url: data.url });

    try {
      const response = await foundationRequest<WebhookEndpoint>(
        '/api/webhooks/endpoints',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      logger.info('Webhook endpoint created', { endpointId: response.endpointId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create webhook endpoint', { error: errorMessage });
      throw error;
    }
  },

  /**
   * List the current user's webhook endpoints. Auth required.
   */
  getEndpoints: async (params: { page?: number; perPage?: number } = {}): Promise<EndpointListResponse> => {
    logger.info('Fetching webhook endpoints', params);

    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.perPage) query.set('per_page', String(params.perPage));

    const qs = query.toString();
    const url = `/api/webhooks/endpoints${qs ? `?${qs}` : ''}`;

    try {
      const response = await foundationRequest<EndpointListResponse>(url);
      logger.info('Webhook endpoints fetched', { total: response.total });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch webhook endpoints', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Get a webhook endpoint by ID. Auth required.
   */
  getEndpoint: async (endpointId: string): Promise<WebhookEndpoint> => {
    logger.info('Fetching webhook endpoint', { endpointId });

    try {
      const response = await foundationRequest<WebhookEndpoint>(
        `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
      );
      logger.info('Webhook endpoint fetched', { endpointId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch webhook endpoint', { error: errorMessage, endpointId });
      throw error;
    }
  },

  /**
   * Update a webhook endpoint. Auth required.
   */
  updateEndpoint: async (endpointId: string, data: UpdateEndpointRequest): Promise<WebhookEndpoint> => {
    logger.info('Updating webhook endpoint', { endpointId });

    try {
      const response = await foundationRequest<WebhookEndpoint>(
        `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      );
      logger.info('Webhook endpoint updated', { endpointId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update webhook endpoint', { error: errorMessage, endpointId });
      throw error;
    }
  },

  /**
   * Delete a webhook endpoint. Auth required.
   */
  deleteEndpoint: async (endpointId: string): Promise<void> => {
    logger.info('Deleting webhook endpoint', { endpointId });

    try {
      await foundationRequest<{ success: boolean }>(
        `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
        { method: 'DELETE' },
      );
      logger.info('Webhook endpoint deleted', { endpointId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete webhook endpoint', { error: errorMessage, endpointId });
      throw error;
    }
  },

  /**
   * Rotate the signing secret for a webhook endpoint. Auth required.
   */
  rotateSecret: async (endpointId: string): Promise<WebhookEndpoint> => {
    logger.info('Rotating webhook secret', { endpointId });

    try {
      const response = await foundationRequest<WebhookEndpoint>(
        `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
        { method: 'POST' },
      );
      logger.info('Webhook secret rotated', { endpointId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to rotate webhook secret', { error: errorMessage, endpointId });
      throw error;
    }
  },

  /**
   * List delivery attempts for a webhook endpoint. Auth required.
   * Supports optional status filter and pagination.
   */
  getDeliveries: async (
    endpointId: string,
    params: DeliveryQueryParams = {},
  ): Promise<DeliveryListResponse> => {
    logger.info('Fetching webhook deliveries', { endpointId, ...params });

    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.perPage) query.set('per_page', String(params.perPage));

    const qs = query.toString();
    const url = `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}/deliveries${qs ? `?${qs}` : ''}`;

    try {
      const response = await foundationRequest<DeliveryListResponse>(url);
      logger.info('Webhook deliveries fetched', { endpointId, total: response.total });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch webhook deliveries', { error: errorMessage, endpointId });
      throw error;
    }
  },

  /**
   * Get a single delivery attempt with full details. Auth required.
   */
  getDelivery: async (deliveryId: string): Promise<WebhookDelivery> => {
    logger.info('Fetching webhook delivery', { deliveryId });

    try {
      const response = await foundationRequest<WebhookDelivery>(
        `/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}`,
      );
      logger.info('Webhook delivery fetched', { deliveryId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch webhook delivery', { error: errorMessage, deliveryId });
      throw error;
    }
  },

  /**
   * Replay a failed or exhausted delivery. Auth required.
   */
  replayDelivery: async (deliveryId: string): Promise<WebhookDelivery> => {
    logger.info('Replaying webhook delivery', { deliveryId });

    try {
      const response = await foundationRequest<WebhookDelivery>(
        `/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}/replay`,
        { method: 'POST' },
      );
      logger.info('Webhook delivery replayed', { deliveryId, status: response.status });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to replay webhook delivery', { error: errorMessage, deliveryId });
      throw error;
    }
  },
};
