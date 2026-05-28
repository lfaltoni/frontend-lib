export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastTier = 'critical' | 'standard' | 'transient';

export interface ToastOptions {
  type?: ToastType;
  /** Override tier default duration (ms) */
  duration?: number;
  /** Override tier default dismissable behavior */
  dismissable?: boolean;
}

/** Internal toast state */
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  tier: ToastTier;
  duration: number;
  dismissable: boolean;
  hoverPause: boolean;
}

export interface UseToastReturn {
  show: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  error: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  warning: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
  info: (message: string, options?: Omit<ToastOptions, 'type'>) => void;
}
