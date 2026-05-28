// Email and phone validation/normalization utilities
// Mirrors foundation-sdk backend logic exactly:
//   - foundation/email/validation.py (validate_email_format, normalize_email)
//   - foundation/phone_verification/service.py (_normalize_phone)

import type { ValidationResult } from '../types/validation';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{1,14}$/;

/**
 * Validate email format. Mirrors foundation-sdk `validate_email_format()`.
 *
 * Reason codes: 'empty', 'no_at_sign', 'invalid_local', 'invalid_domain'
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || !email.trim()) {
    return { valid: false, reason: 'empty' };
  }

  const trimmed = email.trim();

  // Must have exactly one '@'
  const atCount = trimmed.split('@').length - 1;
  if (atCount !== 1) {
    return { valid: false, reason: 'no_at_sign' };
  }

  const atIndex = trimmed.lastIndexOf('@');
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (!local) {
    return { valid: false, reason: 'invalid_local' };
  }

  if (!domain || !domain.includes('.')) {
    return { valid: false, reason: 'invalid_domain' };
  }

  // Check domain labels are non-empty (catches "user@.com" or "user@foo..com")
  const labels = domain.split('.');
  if (labels.some((label) => label === '')) {
    return { valid: false, reason: 'invalid_domain' };
  }

  // Final regex sanity check
  if (!EMAIL_RE.test(trimmed)) {
    return { valid: false, reason: 'invalid_domain' };
  }

  return { valid: true };
}

/**
 * Normalize an email address: strip whitespace, lowercase.
 * Mirrors foundation-sdk `normalize_email()`.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate phone number in E.164 format.
 * Strips formatting characters before checking, same as foundation-sdk `_normalize_phone()`.
 *
 * Reason codes: 'empty', 'invalid_format'
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone || !phone.trim()) {
    return { valid: false, reason: 'empty' };
  }

  let cleaned = phone.replace(/[\s\-()]+/g, '');

  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  if (!E164_RE.test(cleaned)) {
    return { valid: false, reason: 'invalid_format' };
  }

  return { valid: true };
}

/**
 * Normalize a phone number: strip formatting characters, ensure leading '+'.
 * Does NOT validate — call `validatePhone()` first if validation is needed.
 * Mirrors the normalization portion of foundation-sdk `_normalize_phone()`.
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]+/g, '');

  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}
