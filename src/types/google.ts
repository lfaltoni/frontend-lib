// Minimal ambient typings for Google Identity Services (GIS).
//
// We deliberately model only the surface `useGoogleSignIn` touches
// (`google.accounts.id.{initialize,renderButton,prompt}`) instead of pulling in
// `@types/google.accounts` as a devDep. `GsiButtonOptions` and
// `CredentialResponse` are exported so consumers can type their renderButton
// options and callbacks.

/** Payload delivered to the GIS callback after a successful sign-in. */
export interface CredentialResponse {
  /** The JWT ID token to forward to the backend (`/api/auth/google`). */
  credential: string;
  select_by?: string;
  clientId?: string;
}

/** Options accepted by `google.accounts.id.renderButton`. */
export interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string | number;
  locale?: string;
}

interface GsiIdConfiguration {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  [key: string]: unknown;
}

export interface GoogleAccountsId {
  initialize: (config: GsiIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options?: GsiButtonOptions) => void;
  prompt: () => void;
  cancel: () => void;
  disableAutoSelect: () => void;
}

export interface GoogleAccounts {
  id: GoogleAccountsId;
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts;
    };
  }
}
