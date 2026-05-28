// Reads _toast from API response bodies and surfaces via showToast.
// Called from apiRequest and foundationRequest after JSON is parsed.
// No-ops if ToastProvider is not mounted (showToast handles that).

import { showToast } from '../toast';
import type { ToastType } from '../toast';

const VALID_TYPES = new Set<string>(['success', 'error', 'warning', 'info']);

/**
 * If the response body contains a `_toast` field, show it.
 * Does NOT strip `_toast` from the data — consumers can still access it.
 */
export function surfaceToast(data: unknown): void {
  if (!data || typeof data !== 'object') return;

  const toast = (data as Record<string, unknown>)._toast;
  if (!toast || typeof toast !== 'object') return;

  const { message, type } = toast as Record<string, unknown>;
  if (typeof message !== 'string' || !message) return;

  const toastType = typeof type === 'string' && VALID_TYPES.has(type)
    ? (type as ToastType)
    : 'info';

  showToast(message, { type: toastType });
}
