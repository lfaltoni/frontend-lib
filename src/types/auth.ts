// Authentication and User types for foundation-sdk frontend

export interface User {
  user_id: string;
  email: string;
  // Optional: a name-less registration serializes these as null/absent
  // (backend `UserResponseSchema` names are `allow_none`). Strings when present.
  first_name?: string;
  last_name?: string;
  username?: string;
  slug?: string | null;
  registration_order?: number;
  first_login_at?: string | null;
  last_seen_at?: string | null;
  platform_role?: string | null;
  // Derived server-side from `confirmed_at is not None`. Optional so the lib
  // stays backwards-compatible with a backend that has not shipped it yet:
  // `undefined` ⇒ unknown ⇒ "don't nag" (see useEmailVerification).
  email_verified?: boolean;
}

export interface PublicProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  username: string;
  slug: string | null;
  profile_data: Record<string, any>;
}

import type { ResponseEnvelope } from './api';

export interface AuthResponse extends ResponseEnvelope {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  // Optional: names are no longer required at registration. Omitted keys are
  // simply not sent (register() JSON.stringifies this object verbatim).
  first_name?: string;
  last_name?: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}
