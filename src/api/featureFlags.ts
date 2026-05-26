// Feature Flags API — framework-agnostic, pure TypeScript async functions
// No React imports. Any JS/TS consumer can call these directly.

import type {
  FeatureFlag,
  FlagListResponse,
  FlagRule,
  CreateFlagRequest,
  UpdateFlagRequest,
  CreateRuleRequest,
  UpdateRuleRequest,
  EvaluateResponse,
} from '../types/featureFlag';
import { getLogger } from '../utils/logging';
import { foundationRequest } from './foundation-client';

const logger = getLogger('feature-flags-api');

export const featureFlagsApi = {
  /**
   * List all feature flags (paginated). Admin only.
   */
  listFlags: async (page = 1, perPage = 25): Promise<FlagListResponse> => {
    logger.info('Fetching flags', { page, perPage });

    try {
      const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      const response = await foundationRequest<FlagListResponse>(
        `/api/feature-flags/?${query.toString()}`,
      );
      logger.info('Flags fetched', { total: response.total });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch flags', { error: errorMessage });
      throw error;
    }
  },

  /**
   * Create a feature flag. Admin only.
   */
  createFlag: async (data: CreateFlagRequest): Promise<FeatureFlag> => {
    logger.info('Creating flag', { key: data.key });

    try {
      const response = await foundationRequest<FeatureFlag>('/api/feature-flags/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      logger.info('Flag created', { flagId: response.flag_id, key: response.key });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create flag', { error: errorMessage, key: data.key });
      throw error;
    }
  },

  /**
   * Get a feature flag by ID. Admin only.
   */
  getFlag: async (flagId: string): Promise<FeatureFlag> => {
    logger.info('Fetching flag', { flagId });

    try {
      const response = await foundationRequest<FeatureFlag>(
        `/api/feature-flags/${encodeURIComponent(flagId)}`,
      );
      logger.info('Flag fetched', { flagId, key: response.key });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch flag', { error: errorMessage, flagId });
      throw error;
    }
  },

  /**
   * Update a feature flag. Admin only.
   */
  updateFlag: async (flagId: string, data: UpdateFlagRequest): Promise<FeatureFlag> => {
    logger.info('Updating flag', { flagId });

    try {
      const response = await foundationRequest<FeatureFlag>(
        `/api/feature-flags/${encodeURIComponent(flagId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      );
      logger.info('Flag updated', { flagId, key: response.key });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update flag', { error: errorMessage, flagId });
      throw error;
    }
  },

  /**
   * Delete a feature flag. Admin only.
   */
  deleteFlag: async (flagId: string): Promise<void> => {
    logger.info('Deleting flag', { flagId });

    try {
      await foundationRequest<{ success: boolean }>(
        `/api/feature-flags/${encodeURIComponent(flagId)}`,
        { method: 'DELETE' },
      );
      logger.info('Flag deleted', { flagId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete flag', { error: errorMessage, flagId });
      throw error;
    }
  },

  /**
   * Toggle a flag's enabled state. Admin only.
   */
  toggleFlag: async (flagId: string): Promise<FeatureFlag> => {
    logger.info('Toggling flag', { flagId });

    try {
      const response = await foundationRequest<FeatureFlag>(
        `/api/feature-flags/${encodeURIComponent(flagId)}/toggle`,
        { method: 'POST' },
      );
      logger.info('Flag toggled', { flagId, enabled: response.enabled });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to toggle flag', { error: errorMessage, flagId });
      throw error;
    }
  },

  /**
   * Add a rule to a flag. Admin only.
   */
  addRule: async (flagId: string, data: CreateRuleRequest): Promise<FlagRule> => {
    logger.info('Adding rule', { flagId, ruleType: data.rule_type });

    try {
      const response = await foundationRequest<FlagRule>(
        `/api/feature-flags/${encodeURIComponent(flagId)}/rules`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      logger.info('Rule added', { flagId, ruleId: response.rule_id });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to add rule', { error: errorMessage, flagId });
      throw error;
    }
  },

  /**
   * Update a rule. Admin only.
   */
  updateRule: async (ruleId: string, data: UpdateRuleRequest): Promise<FlagRule> => {
    logger.info('Updating rule', { ruleId });

    try {
      const response = await foundationRequest<FlagRule>(
        `/api/feature-flags/rules/${encodeURIComponent(ruleId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      );
      logger.info('Rule updated', { ruleId });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update rule', { error: errorMessage, ruleId });
      throw error;
    }
  },

  /**
   * Delete a rule. Admin only.
   */
  deleteRule: async (ruleId: string): Promise<void> => {
    logger.info('Deleting rule', { ruleId });

    try {
      await foundationRequest<{ success: boolean }>(
        `/api/feature-flags/rules/${encodeURIComponent(ruleId)}`,
        { method: 'DELETE' },
      );
      logger.info('Rule deleted', { ruleId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete rule', { error: errorMessage, ruleId });
      throw error;
    }
  },

  /**
   * Evaluate one or more flags for the current user. Auth required.
   */
  evaluate: async (
    keys: string[],
    context?: { tenant_id?: string; plan_tier?: string },
  ): Promise<EvaluateResponse> => {
    logger.info('Evaluating flags', { keys, context });

    try {
      const response = await foundationRequest<EvaluateResponse>(
        '/api/feature-flags/evaluate',
        {
          method: 'POST',
          body: JSON.stringify({ keys, context }),
        },
      );
      logger.info('Flags evaluated', { keys, results: response.flags });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to evaluate flags', { error: errorMessage, keys });
      throw error;
    }
  },
};
