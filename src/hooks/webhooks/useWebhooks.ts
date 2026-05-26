import { useState, useEffect, useCallback } from 'react';
import { webhooksApi } from '../../api/webhooks';
import type {
  WebhookEndpoint,
  WebhookDelivery,
  DeliveryListResponse,
  CreateEndpointRequest,
  UpdateEndpointRequest,
  DeliveryQueryParams,
} from '../../types/webhook';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useWebhooks');

export interface UseWebhooksReturn {
  // Read state
  endpoints: WebhookEndpoint[];
  total: number;
  page: number;
  isLoading: boolean;
  error: string | null;

  // Pagination
  setPage: (page: number) => void;
  refetch: () => Promise<void>;

  // Actions
  createEndpoint: (data: CreateEndpointRequest) => Promise<WebhookEndpoint>;
  updateEndpoint: (id: string, data: UpdateEndpointRequest) => Promise<WebhookEndpoint>;
  deleteEndpoint: (id: string) => Promise<void>;
  rotateSecret: (id: string) => Promise<WebhookEndpoint>;

  // Delivery inspection
  getDeliveries: (endpointId: string, opts?: DeliveryQueryParams) => Promise<DeliveryListResponse>;
  replayDelivery: (deliveryId: string) => Promise<WebhookDelivery>;

  isSubmitting: boolean;
  clearError: () => void;
}

/**
 * Hook for managing webhook endpoints and inspecting deliveries.
 * Fetches endpoints on mount, provides CRUD actions and delivery inspection.
 */
export const useWebhooks = (perPage = 20): UseWebhooksReturn => {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ── Fetch endpoints ──────────────────────────────────────

  const fetchEndpoints = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await webhooksApi.getEndpoints({ page, perPage });
      setEndpoints(res.endpoints);
      setTotal(res.total);
      logger.info('Endpoints loaded', { total: res.total, page });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load endpoints';
      setError(msg);
      logger.error('Endpoints fetch failed', { error: msg });
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  // ── CRUD actions ─────────────────────────────────────────

  const createEndpoint = useCallback(async (data: CreateEndpointRequest): Promise<WebhookEndpoint> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const endpoint = await webhooksApi.createEndpoint(data);
      await fetchEndpoints();
      return endpoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create endpoint';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [fetchEndpoints]);

  const updateEndpoint = useCallback(async (id: string, data: UpdateEndpointRequest): Promise<WebhookEndpoint> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const endpoint = await webhooksApi.updateEndpoint(id, data);
      await fetchEndpoints();
      return endpoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update endpoint';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [fetchEndpoints]);

  const deleteEndpoint = useCallback(async (id: string): Promise<void> => {
    setIsSubmitting(true);
    setError(null);
    try {
      await webhooksApi.deleteEndpoint(id);
      await fetchEndpoints();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete endpoint';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [fetchEndpoints]);

  const rotateSecret = useCallback(async (id: string): Promise<WebhookEndpoint> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const endpoint = await webhooksApi.rotateSecret(id);
      // Update in-place so the new secret is visible
      setEndpoints((prev) =>
        prev.map((ep) => (ep.endpointId === id ? endpoint : ep)),
      );
      return endpoint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to rotate secret';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // ── Delivery inspection (on-demand) ─────────────────────

  const getDeliveries = useCallback(async (
    endpointId: string,
    opts?: DeliveryQueryParams,
  ): Promise<DeliveryListResponse> => {
    try {
      return await webhooksApi.getDeliveries(endpointId, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch deliveries';
      setError(msg);
      throw err;
    }
  }, []);

  const replayDelivery = useCallback(async (deliveryId: string): Promise<WebhookDelivery> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const delivery = await webhooksApi.replayDelivery(deliveryId);
      return delivery;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to replay delivery';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // ── Return ──────────────────────────────────────────────

  return {
    endpoints,
    total,
    page,
    isLoading,
    error,
    setPage,
    refetch: fetchEndpoints,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    rotateSecret,
    getDeliveries,
    replayDelivery,
    isSubmitting,
    clearError,
  };
};
