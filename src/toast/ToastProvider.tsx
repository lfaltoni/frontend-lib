import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { getLogger } from '../utils/logging';
import type { Toast, ToastType, ToastTier, ToastOptions, UseToastReturn } from './types';

const logger = getLogger('toast');

// ── Tier configuration (matches Bookease-pro exactly) ──────────

const TIERS: Record<ToastTier, { duration: number; dismissable: boolean; hoverPause: boolean }> = {
  critical:  { duration: 15000, dismissable: true,  hoverPause: true  },
  standard:  { duration: 8000,  dismissable: true,  hoverPause: true  },
  transient: { duration: 5000,  dismissable: false, hoverPause: false },
};

const TYPE_TIER_MAP: Record<ToastType, { tier: ToastTier; duration?: number }> = {
  error:   { tier: 'critical'                  },
  success: { tier: 'standard'                  },
  warning: { tier: 'standard', duration: 10000 },
  info:    { tier: 'transient'                 },
};

// ── Toast ID counter ───────────────────────────────────────────

let nextId = 0;

// ── Context ────────────────────────────────────────────────────

export const ToastContext = createContext<UseToastReturn | null>(null);

// ── Module-level ref for non-component access ──────────────────

let toastActions: UseToastReturn | null = null;

export function showToast(message: string, options?: ToastOptions): void {
  toastActions?.show(message, options);
}

export function showToastSuccess(message: string, options?: Omit<ToastOptions, 'type'>): void {
  toastActions?.success(message, options);
}

export function showToastError(message: string, options?: Omit<ToastOptions, 'type'>): void {
  toastActions?.error(message, options);
}

export function showToastWarning(message: string, options?: Omit<ToastOptions, 'type'>): void {
  toastActions?.warning(message, options);
}

export function showToastInfo(message: string, options?: Omit<ToastOptions, 'type'>): void {
  toastActions?.info(message, options);
}

// ── CSS injection ──────────────────────────────────────────────

const STYLE_ID = 'fsdk-toast-styles';

const TOAST_CSS = `
.fsdk-toast-container {
  position: fixed;
  top: var(--fsdk-toast-top, 1rem);
  right: var(--fsdk-toast-right, 1rem);
  z-index: var(--fsdk-toast-z-index, 10001);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: var(--fsdk-toast-max-width, 400px);
  pointer-events: none;
}
.fsdk-toast-item {
  pointer-events: auto;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: var(--fsdk-toast-radius, 8px);
  padding: 1rem 1.25rem;
  color: #111827;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transform: translateX(110%);
  transition: transform 0.3s ease, opacity 0.3s ease;
  opacity: 0;
  position: relative;
  font-family: var(--fsdk-toast-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: var(--fsdk-toast-font-size, 0.9rem);
  font-weight: 500;
  line-height: 1.4;
}
.fsdk-toast-item.fsdk-toast-visible {
  transform: translateX(0);
  opacity: 1;
}
.fsdk-toast-item.fsdk-toast-success {
  border-left: 4px solid var(--fsdk-toast-success-color, #16a34a);
  background: #f0fdf4;
  color: var(--fsdk-toast-success-color, #16a34a);
}
.fsdk-toast-item.fsdk-toast-error {
  border-left: 4px solid var(--fsdk-toast-error-color, #dc2626);
  background: #fef2f2;
  color: var(--fsdk-toast-error-color, #dc2626);
}
.fsdk-toast-item.fsdk-toast-warning {
  border-left: 4px solid var(--fsdk-toast-warning-color, #d97706);
  background: #fffbeb;
  color: var(--fsdk-toast-warning-color, #d97706);
}
.fsdk-toast-item.fsdk-toast-info {
  border-left: 4px solid var(--fsdk-toast-info-color, #3b82f6);
  background: #eff6ff;
  color: var(--fsdk-toast-info-color, #3b82f6);
}
.fsdk-toast-item .fsdk-toast-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.fsdk-toast-item .fsdk-toast-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
  opacity: 0.5;
  padding: 0;
  width: 22px;
  height: 22px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
  border-radius: 4px;
  flex-shrink: 0;
}
.fsdk-toast-item .fsdk-toast-close:hover {
  opacity: 1;
}
.fsdk-toast-item.fsdk-toast-has-close {
  padding-right: 2.5rem;
}
.fsdk-toast-item.fsdk-toast-has-close .fsdk-toast-close {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}
@media (max-width: 480px) {
  .fsdk-toast-container {
    right: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
}
`;

function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TOAST_CSS;
  document.head.appendChild(style);
}

// ── ToastItem (internal) ───────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const remainingRef = useRef(toast.duration);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 350);
  }, [onDismiss, toast.id]);

  const scheduleDismiss = useCallback(() => {
    startTimeRef.current = Date.now();
    timeoutRef.current = setTimeout(dismiss, remainingRef.current);
  }, [dismiss]);

  // Animate in + start auto-dismiss
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    scheduleDismiss();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [scheduleDismiss]);

  const handleMouseEnter = useCallback(() => {
    if (!toast.hoverPause) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(500, remainingRef.current - elapsed);
  }, [toast.hoverPause]);

  const handleMouseLeave = useCallback(() => {
    if (!toast.hoverPause) return;
    scheduleDismiss();
  }, [toast.hoverPause, scheduleDismiss]);

  const className = [
    'fsdk-toast-item',
    `fsdk-toast-${toast.type}`,
    visible ? 'fsdk-toast-visible' : '',
    toast.dismissable ? 'fsdk-toast-has-close' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
    >
      <span className="fsdk-toast-text">{toast.message}</span>
      {toast.dismissable && (
        <button
          className="fsdk-toast-close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
}

// ── ToastProvider ──────────────────────────────────────────────

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (!message) return;

    const type = options?.type || 'info';
    const mapping = TYPE_TIER_MAP[type];
    const tierConfig = TIERS[mapping.tier];

    const toast: Toast = {
      id: String(++nextId),
      message,
      type,
      tier: mapping.tier,
      duration: options?.duration ?? mapping.duration ?? tierConfig.duration,
      dismissable: options?.dismissable ?? tierConfig.dismissable,
      hoverPause: tierConfig.hoverPause,
    };

    logger.debug('Toast shown', { id: toast.id, type, duration: toast.duration });
    setToasts((prev) => [...prev, toast]);
  }, []);

  const success = useCallback((message: string, options?: Omit<ToastOptions, 'type'>) => {
    show(message, { ...options, type: 'success' });
  }, [show]);

  const error = useCallback((message: string, options?: Omit<ToastOptions, 'type'>) => {
    show(message, { ...options, type: 'error' });
  }, [show]);

  const warning = useCallback((message: string, options?: Omit<ToastOptions, 'type'>) => {
    show(message, { ...options, type: 'warning' });
  }, [show]);

  const info = useCallback((message: string, options?: Omit<ToastOptions, 'type'>) => {
    show(message, { ...options, type: 'info' });
  }, [show]);

  const actions: UseToastReturn = { show, success, error, warning, info };

  // Populate module-level ref for non-component access
  useEffect(() => {
    toastActions = actions;
    return () => {
      toastActions = null;
    };
  });

  // Inject CSS on mount
  useEffect(() => {
    injectStyles();
  }, []);

  const canPortal = typeof document !== 'undefined';

  return (
    <ToastContext.Provider value={actions}>
      {children}
      {canPortal &&
        createPortal(
          <div className="fsdk-toast-container">
            {toasts.map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
