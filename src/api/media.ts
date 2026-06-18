import type { MediaItem, MediaUploadResponse } from '../types/media';
import { getEnvConfig } from '../utils/env';
import { getLogger } from '../utils/logging';

const logger = getLogger('media-api');

async function mediaRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getEnvConfig().foundationUrl}${endpoint}`;
  const startTime = Date.now();

  logger.logApiRequest(options.method || 'GET', url, options.body);

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    logger.logApiResponse(response.status, data, duration);

    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Media API request failed', { error: errorMessage, duration });
    throw error;
  }
}

export const mediaApi = {
  uploadMedia: async (
    entityType: string,
    entityId: string,
    file: File,
    associationType: string = 'gallery'
  ): Promise<MediaUploadResponse> => {
    logger.info('Uploading media', { entityType, entityId, associationType });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);
    formData.append('association_type', associationType);

    return mediaRequest<MediaUploadResponse>('/api/media/upload', {
      method: 'POST',
      body: formData,
      // Do not set Content-Type — browser sets multipart boundary automatically
    });
  },

  getGallery: async (entityType: string, entityId: string): Promise<MediaItem[]> => {
    logger.info('Fetching gallery', { entityType, entityId });

    return mediaRequest<MediaItem[]>(
      `/api/media/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
    );
  },

  deleteMedia: async (mediaId: number): Promise<void> => {
    logger.info('Deleting media', { mediaId });

    await mediaRequest<{ success: boolean }>(`/api/media/${mediaId}`, {
      method: 'DELETE',
    });
  },

  reorderMedia: async (
    entityType: string,
    entityId: string,
    orderedIds: number[]
  ): Promise<void> => {
    logger.info('Reordering media', { entityType, entityId, count: orderedIds.length });

    await mediaRequest<{ success: boolean }>(
      `/api/media/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/reorder`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }
    );
  },

  setPrimary: async (mediaId: number): Promise<void> => {
    logger.info('Setting primary media', { mediaId });

    await mediaRequest<{ success: boolean }>(`/api/media/${mediaId}/primary`, {
      method: 'PUT',
    });
  },
};
