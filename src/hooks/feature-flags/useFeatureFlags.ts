import { useState, useEffect, useCallback } from 'react';
import { featureFlagsApi } from '../../api/featureFlags';
import type {
  FeatureFlag,
  FlagRule,
  CreateFlagRequest,
  UpdateFlagRequest,
  CreateRuleRequest,
  UpdateRuleRequest,
} from '../../types/featureFlag';
import { getLogger } from '../../utils/logging';

const logger = getLogger('useFeatureFlags');

// ============================================================================
// useFeatureFlags — Admin management hook
// ============================================================================

export interface UseFeatureFlagsReturn {
  flags: FeatureFlag[];
  total: number;
  page: number;
  hasNext: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  createFlag: (data: CreateFlagRequest) => Promise<FeatureFlag>;
  updateFlag: (flagId: string, data: UpdateFlagRequest) => Promise<FeatureFlag>;
  deleteFlag: (flagId: string) => Promise<void>;
  toggleFlag: (flagId: string) => Promise<FeatureFlag>;
  addRule: (flagId: string, data: CreateRuleRequest) => Promise<FlagRule>;
  updateRule: (ruleId: string, data: UpdateRuleRequest) => Promise<FlagRule>;
  deleteRule: (ruleId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setPage: (page: number) => void;
}

/**
 * Hook for admin management of feature flags.
 * Fetches flag list on mount, provides CRUD + rule management actions.
 */
export function useFeatureFlags(perPage = 25): UseFeatureFlagsReturn {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchFlags = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await featureFlagsApi.listFlags(page, perPage);
      setFlags(result.flags);
      setTotal(result.total);
      setHasNext(result.has_next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load flags';
      logger.error('Failed to fetch flags', { error: msg });
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const createFlag = useCallback(async (data: CreateFlagRequest): Promise<FeatureFlag> => {
    const flag = await featureFlagsApi.createFlag(data);
    await fetchFlags();
    return flag;
  }, [fetchFlags]);

  const updateFlag = useCallback(async (flagId: string, data: UpdateFlagRequest): Promise<FeatureFlag> => {
    const flag = await featureFlagsApi.updateFlag(flagId, data);
    await fetchFlags();
    return flag;
  }, [fetchFlags]);

  const deleteFlag = useCallback(async (flagId: string): Promise<void> => {
    await featureFlagsApi.deleteFlag(flagId);
    await fetchFlags();
  }, [fetchFlags]);

  const toggleFlag = useCallback(async (flagId: string): Promise<FeatureFlag> => {
    const flag = await featureFlagsApi.toggleFlag(flagId);
    await fetchFlags();
    return flag;
  }, [fetchFlags]);

  const addRule = useCallback(async (flagId: string, data: CreateRuleRequest): Promise<FlagRule> => {
    const rule = await featureFlagsApi.addRule(flagId, data);
    await fetchFlags();
    return rule;
  }, [fetchFlags]);

  const updateRule = useCallback(async (ruleId: string, data: UpdateRuleRequest): Promise<FlagRule> => {
    const rule = await featureFlagsApi.updateRule(ruleId, data);
    await fetchFlags();
    return rule;
  }, [fetchFlags]);

  const deleteRule = useCallback(async (ruleId: string): Promise<void> => {
    await featureFlagsApi.deleteRule(ruleId);
    await fetchFlags();
  }, [fetchFlags]);

  return {
    flags,
    total,
    page,
    hasNext,
    isLoading,
    error,
    clearError,
    createFlag,
    updateFlag,
    deleteFlag,
    toggleFlag,
    addRule,
    updateRule,
    deleteRule,
    refresh: fetchFlags,
    setPage,
  };
}

// ============================================================================
// useFeatureFlagEvaluation — consumer evaluation hook
// ============================================================================

export interface UseFeatureFlagEvaluationReturn {
  flags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isEnabled: (key: string) => boolean;
}

/**
 * Hook for evaluating feature flags in consumer components.
 * Fetches flag values on mount. `isEnabled(key)` returns false for unknown keys.
 */
export function useFeatureFlagEvaluation(
  keys: string[],
  context?: { tenant_id?: string; plan_tier?: string },
): UseFeatureFlagEvaluationReturn {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluation = useCallback(async () => {
    if (keys.length === 0) {
      setFlags({});
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await featureFlagsApi.evaluate(keys, context);
      setFlags(result.flags);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to evaluate flags';
      logger.error('Failed to evaluate flags', { error: msg, keys });
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [JSON.stringify(keys), JSON.stringify(context)]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  const isEnabled = useCallback(
    (key: string): boolean => flags[key] ?? false,
    [flags],
  );

  return {
    flags,
    isLoading,
    error,
    refresh: fetchEvaluation,
    isEnabled,
  };
}
