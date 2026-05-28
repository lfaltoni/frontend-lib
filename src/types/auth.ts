// Authentication and User types for foundation-sdk frontend

export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  username?: string;
  slug?: string | null;
  registration_order?: number;
  first_login_at?: string | null;
  last_seen_at?: string | null;
  platform_role?: string | null;
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
  first_name: string;
  last_name: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}
