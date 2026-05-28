/**
 * Result of a validation check.
 * `reason` is a machine-readable code (e.g. 'empty', 'no_at_sign') — present only when invalid.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
