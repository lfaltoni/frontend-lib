// Feature flag types — matches foundation-sdk feature_flags API response shapes

export interface FlagRule {
  rule_id: string;
  flag_id: string;
  rule_type: 'percentage' | 'plan' | 'tenant' | 'user';
  value: boolean;
  priority: number;
  percentage: number | null;
  plan_tiers: string[] | null;
  tenant_ids: string[] | null;
  user_ids: string[] | null;
  created_at: string;
}

export interface FeatureFlag {
  flag_id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  default_value: boolean;
  created_by: string | null;
  rules: FlagRule[];
  updated_at: string | null;
  created_at: string;
}

export interface FlagListResponse {
  flags: FeatureFlag[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface CreateFlagRequest {
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  default_value?: boolean;
}

export interface UpdateFlagRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  default_value?: boolean;
}

export interface CreateRuleRequest {
  rule_type: 'percentage' | 'plan' | 'tenant' | 'user';
  value?: boolean;
  priority?: number;
  percentage?: number;
  plan_tiers?: string[];
  tenant_ids?: string[];
  user_ids?: string[];
}

export interface UpdateRuleRequest {
  value?: boolean;
  priority?: number;
  percentage?: number;
  plan_tiers?: string[];
  tenant_ids?: string[];
  user_ids?: string[];
}

export interface EvaluateRequest {
  keys: string[];
  context?: { tenant_id?: string; plan_tier?: string };
}

export interface EvaluateResponse {
  flags: Record<string, boolean>;
}
